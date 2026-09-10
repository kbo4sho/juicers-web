import {
  BackSide, BufferGeometry, Color, Group,
  Material, Mesh, MeshStandardMaterial, OrthographicCamera,
  Scene, ShaderMaterial, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FRUITS, type FruitKind } from "./model";

export type FruitMeshItem = {
  id: number;
  type: "fruit" | "power";
  kind: string;
  x: number;
  y: number;
  radius: number;
  rotation: number;
};

// A small GPU atlas is composited into the existing 2D canvas in item order.
// No second input surface, game clock, collision system, or per-fruit WebGL context.
const COLUMNS = 4;
const CAPACITY = 16;
// 160 px tiles cover gameplay fruit sizes without a phone-sized framebuffer tax.
const TILE = 160;
const CELL = 3.4;

// Texture-free diner glaze: soft color bands, a broad cream reflection and a
// small wet glint. View-space lighting stays readable while each fruit tumbles.
// One shader across the set, with quieter leaves/seeds; no physical clearcoat,
// environment maps, shadow maps or extra highlight draw calls on phone GPUs.
function juicyMaterial(color: Color, garnish: boolean) {
  return new ShaderMaterial({
    uniforms: { fruitColor: { value: color.clone() }, gloss: { value: garnish ? 0.22 : 1 } },
    vertexShader: `
      varying vec3 fruitNormal;
      void main() {
        fruitNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 fruitColor;
      uniform float gloss;
      varying vec3 fruitNormal;
      void main() {
        vec3 n = normalize(fruitNormal);
        float light = dot(n, normalize(vec3(-0.55, 0.75, 1.0)));
        float band = smoothstep(-0.45, 0.65, light);
        vec3 shade = mix(vec3(0.62, 0.34, 0.52), vec3(1.12, 1.04, 0.94), band);
        vec3 color = fruitColor * shade;
        float rim = pow(1.0 - max(n.z, 0.0), 3.0) * smoothstep(-0.2, 0.9, n.x);
        color = mix(color, vec3(0.55, 1.0, 0.72), rim * 0.28);
        // Elongated softbox reflection instead of a tiny plastic-looking point light.
        vec2 reflection = (n.xy - vec2(-0.38, 0.43)) * vec2(1.0, 0.62);
        float sheen = 1.0 - smoothstep(0.09, 0.22, length(reflection));
        float glint = 1.0 - smoothstep(0.025, 0.085, length(n.xy - vec2(-0.12, 0.62)));
        float front = smoothstep(0.25, 0.7, n.z);
        color = mix(color, vec3(1.0, 0.95, 0.72), sheen * front * gloss * 0.88);
        color = mix(color, vec3(1.0, 0.99, 0.91), glint * front * gloss * 0.94);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class FruitMeshRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(0, COLUMNS * CELL, 0, -COLUMNS * CELL, 0.1, 50);
  private templates = new Map<FruitKind, Group>();
  private instances = new Map<number, { kind: FruitKind; object: Group }>();
  private slots = new Map<number, number>();
  private geometries = new Set<BufferGeometry>();
  private materials = new Set<Material>();
  private disposed = false;
  private lost = false;
  private loaded = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private abort = new AbortController();
  private outline = new ShaderMaterial({
    side: BackSide,
    vertexShader: `void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.018, 1.0);
    }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.20, 0.055, 0.12, 1.0); }`,
  });

  constructor() {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(COLUMNS * TILE, COLUMNS * TILE, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.camera.position.z = 20;
    this.materials.add(this.outline);

  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    // Stay on sprites for this session. Restoring GPU state must never pause a pour.
    this.lost = true;
    this.slots.clear();
  };

  async load() {
    const loader = new GLTFLoader();
    await Promise.all(FRUITS.map(async (kind) => {
      try {
        const url = `${import.meta.env.BASE_URL}fruits/3d/${kind}.glb`;
        const response = await fetch(url, { signal: this.abort.signal });
        if (!response.ok) throw new Error(`Fruit mesh HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (this.disposed) return;
        const gltf = await loader.parseAsync(data, "");
        const meshes: Mesh[] = [];
        gltf.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
        for (const mesh of meshes) {
          const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          if (this.disposed) {
            mesh.geometry.dispose();
            originals.forEach((material) => material.dispose());
            continue;
          }
          this.geometries.add(mesh.geometry);
          const original = originals[0] as MeshStandardMaterial;
          const material = juicyMaterial(original.color, /leaf|stem|seed|pith|groove/.test(original.name));
          this.materials.add(material);
          mesh.material = material;
          originals.forEach((entry) => entry.dispose());
          if (!/-(peel|seed|pith|pulp|pulpLight)$/.test(mesh.name)) {
            const outline = new Mesh(mesh.geometry, this.outline);
            outline.name = `${mesh.name}-ink`;
            mesh.add(outline);
          }
        }
        if (!this.disposed) this.templates.set(kind, gltf.scene);
      } catch (error) {
        if (!this.disposed) console.warn(`Using illustrated ${kind} fallback.`, error);
      }
    }));
    this.loaded = true;
  }

  get status() {
    if (this.lost || this.disposed) return "fallback";
    if (!this.loaded) return "loading";
    return this.templates.size === FRUITS.length ? "ready" : this.templates.size ? "partial" : "fallback";
  }

  render(items: readonly FruitMeshItem[], now: number) {
    this.slots.clear();
    if (this.disposed || this.lost) return;
    const active = new Set<number>();
    for (const item of items) {
      if (item.type !== "fruit" || this.slots.size >= CAPACITY) continue;
      const kind = item.kind as FruitKind;
      const template = this.templates.get(kind);
      if (!template) continue;
      let instance = this.instances.get(item.id);
      if (instance && instance.kind !== kind) {
        this.scene.remove(instance.object);
        this.instances.delete(item.id);
        instance = undefined;
      }
      if (!instance) {
        instance = { kind, object: template.clone(true) };
        this.instances.set(item.id, instance);
        this.scene.add(instance.object);
      }
      active.add(item.id);
      const slot = this.slots.size;
      this.slots.set(item.id, slot);
      instance.object.position.set((slot % COLUMNS + 0.5) * CELL, -(Math.floor(slot / COLUMNS) + 0.5) * CELL, 0);
      // Keep cut faces/crowns readable; a gentle depth tumble makes volume visible.
      const turn = this.reducedMotion.matches ? 0 : Math.sin(now * 0.0008 + item.id * 1.7) * 0.5;
      instance.object.rotation.set(0.12, -0.25 + turn * 0.65, this.reducedMotion.matches ? -0.12 : -item.rotation * 0.22);
      const bounce = this.reducedMotion.matches ? 0 : Math.sin(now * 0.003 + item.id * 1.7) * 0.035;
      instance.object.scale.set(1 - bounce * 0.5, 1 + bounce, 1 - bounce * 0.5);
    }
    for (const [id, instance] of this.instances) {
      if (!active.has(id)) {
        this.scene.remove(instance.object);
        this.instances.delete(id);
      }
    }
    if (this.slots.size) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (error) {
        this.lost = true;
        this.slots.clear();
        console.warn("Using illustrated fruit fallback.", error);
      }
    }
  }

  draw(context: CanvasRenderingContext2D, item: FruitMeshItem, width: number): boolean {
    const slot = this.slots.get(item.id);
    if (slot === undefined || this.lost || this.disposed) return false;
    const size = item.radius * 3.8;
    context.drawImage(this.renderer.domElement,
      (slot % COLUMNS) * TILE, Math.floor(slot / COLUMNS) * TILE, TILE, TILE,
      item.x * width - size / 2, item.y - size / 2, size, size);
    return true;
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.instances.clear();
    this.templates.clear();
    this.slots.clear();
    this.scene.clear();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
