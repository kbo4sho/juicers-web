import {
  BackSide, BufferGeometry, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, MeshStandardMaterial, MeshPhongMaterial, OrthographicCamera,
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
const TILE = 192;
const CELL = 3.4;

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
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.024, 1.0);
    }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.075, 0.018, 0.055, 1.0); }`,
  });

  constructor() {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(COLUMNS * TILE, COLUMNS * TILE, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.camera.position.z = 20;
    this.materials.add(this.outline);
    this.scene.add(new HemisphereLight(0xfff3d0, 0x543559, 1.8));
    const key = new DirectionalLight(0xffeed1, 2.5);
    key.position.set(-8, 10, 15);
    this.scene.add(key);
    const rim = new DirectionalLight(0x9cffe5, 1.1);
    rim.position.set(8, 3, -6);
    this.scene.add(rim);
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
          const material = new MeshPhongMaterial({ color: original.color, shininess: 65, specular: 0x685743 });
          this.materials.add(material);
          mesh.material = material;
          originals.forEach((entry) => entry.dispose());
          if (!mesh.name.endsWith("-peel") && !mesh.name.endsWith("-seed")) {
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
      instance.object.rotation.set(0.18, -0.35 + turn, this.reducedMotion.matches ? -0.12 : -item.rotation * 0.22);
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
