// Original Juicers geometry. Run with `npm run assets:fruits` (Node 22+).
import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// GLTFExporter needs only this browser API when exporting texture-free GLBs.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); });
  }
};
const output = new URL('../public/fruits/3d/', import.meta.url);
await mkdir(output, { recursive: true });
const palette = {
  orange: '#ff9224', lime: '#a1dc38', berry: '#ee3885', melon: '#ff6474',
  pineapple: '#ffd34c', leaf: '#4ead48', leafLight: '#8cce50', stem: '#75432b',
  rind: '#32b79e', pith: '#e2f4aa', seed: '#492336', groove: '#d89428', peel: '#e9761d',
};
const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0 });
  material.name = name;
  return [name, material];
}));
let parts;
function add(geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  geometry.deleteAttribute('uv');
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
  geometry.applyMatrix4(matrix);
  (parts[color] ??= []).push(geometry);
}
function oval(color, position, scale, rotation = [0, 0, 0], detail = 16) {
  add(new THREE.SphereGeometry(1, detail, detail <= 12 ? 8 : 12), color, position, scale, rotation);
}
function leaf(position, scale, rotation, color = 'leaf') {
  // A folded, pointed solid leaf with a raised center ridge, readable from both sides.
  const geometry = new THREE.BufferGeometry();
  const vertices = [[0,0,0],[-0.48,0.48,0],[0,1,0],[0.48,0.48,0],[0,0.48,0.22],[0,0.48,-0.09]];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex([0,4,1,1,4,2,2,4,3,3,4,0,1,5,0,2,5,1,3,5,2,0,5,3]);
  geometry.computeVertexNormals();
  add(geometry, color, position, scale, rotation);
}
function stem(y) {
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 8), 'stem', [0, y, 0], [1,1,1], [0,0,-0.2]);
}
const makers = {
  orange() {
    oval('orange', [0,-0.06,0], [0.87,0.83,0.85], [0,0,0], 24);
    stem(0.82);
    leaf([0,0.76,0], [0.7,0.72,0.8], [0.1,0.4,-1.05]);
    for (let i = 0; i < 16; i++) {
      const y = -0.54 + (i % 4) * 0.27;
      const a = i * 2.4;
      const r = Math.sqrt(1 - ((y + 0.06) / 0.83) ** 2);
      oval('peel', [0.873*r*Math.sin(a), y, 0.853*r*Math.cos(a)], [0.027,0.024,0.027], [0,0,0], 6);
    }
  },
  lime() {
    const body = new THREE.SphereGeometry(1, 24, 16);
    const p = body.attributes.position;
    for (let i=0; i<p.count; i++) {
      const y=p.getY(i);
      p.setXYZ(i,p.getX(i)*0.72,y*(0.88+0.1*Math.abs(y)**8),p.getZ(i)*0.7);
    }
    body.computeVertexNormals();
    add(body, 'lime', [0,-0.04,0], [1,1,1], [0,0,-0.58]);
    leaf([0.46,0.69,0], [0.48,0.5,0.7], [0,0,-0.8]);
  },
  berry() {
    oval('berry', [0,0,0], [0.51,0.7,0.5]);
    for (let row=0; row<4; row++) {
      const radius = [0.27,0.49,0.55,0.42][row];
      const count = [5,8,9,7][row];
      for (let i=0; i<count; i++) {
        const angle=(i/count)*Math.PI*2+row*0.35;
        oval('berry',[Math.cos(angle)*radius,-0.65+row*0.38,Math.sin(angle)*radius],
          [0.28,0.29,0.28], [0,0,0], 12);
      }
    }
    stem(0.89);
    for (let i=0;i<5;i++) leaf([0,0.66,0],[0.55,0.65,0.6],[0.65,i*Math.PI*2/5,0.95],i%2?'leafLight':'leaf');
  },
  melon() {
    function slice(radius, depth, color) {
      const shape = new THREE.Shape();
      shape.moveTo(-radius,0.4);
      shape.lineTo(radius,0.4);
      shape.absarc(0,0.4,radius,0,Math.PI,true);
      shape.closePath();
      add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,steps:1,
        bevelSize:0.035,bevelThickness:0.035,curveSegments:16}),color,[0,0.1,-depth/2]);
    }
    slice(1.03,0.48,'rind');
    slice(0.93,0.5,'pith');
    slice(0.82,0.53,'melon');
    for (const side of [-1,1]) for (let i=0;i<7;i++) {
      const angle=0.32+(i/6)*(Math.PI-0.64);
      oval('seed',[Math.cos(angle)*0.59,0.48-Math.sin(angle)*0.6,side*0.31],
        [0.038,0.085,0.025],[0,0,Math.PI/2-angle],8);
    }
  },
  pineapple() {
    oval('groove',[0,-0.26,0],[0.65,0.79,0.65]);
    // Raised diamond scales; golden panels share one mesh/material after merging.
    for (let row=0;row<6;row++) {
      const y=-0.86+row*0.24;
      const ring=Math.sqrt(1-((y+0.26)/0.85)**2)*0.64;
      for(let i=0;i<10;i++) {
        const a=i*Math.PI/5+(row%2)*Math.PI/10;
        add(new THREE.OctahedronGeometry(1), 'pineapple', [Math.sin(a)*ring,y,Math.cos(a)*ring],
          [0.205,0.22,0.115],[0,a,0]);
      }
    }
    for(let i=0;i<7;i++) leaf([0,0.39,0],[0.47,0.98+(i%2)*0.17,0.7],
      [0.3+(i%3)*0.25,i*Math.PI*2/7,0.3],i%2?'leafLight':'leaf');
    leaf([0,0.45,0],[0.38,1.02,0.65],[0,0,0]);
  },
};
const manifest=[];
for (const [kind,make] of Object.entries(makers)) {
  parts={}; make();
  const scene=new THREE.Scene();
  scene.name=`Juicers ${kind}`;
  let triangles=0;
  for (const [color,geometries] of Object.entries(parts)) {
    const geometry=mergeGeometries(geometries);
    geometry.normalizeNormals();
    triangles+=(geometry.index?.count ?? geometry.attributes.position.count)/3;
    const mesh=new THREE.Mesh(geometry,materials[color]);
    mesh.name=`${kind}-${color}`;
    scene.add(mesh);
  }
  const glb=await new GLTFExporter().parseAsync(scene,{binary:true});
  await writeFile(new URL(`${kind}.glb`,output),Buffer.from(glb));
  manifest.push({kind,bytes:glb.byteLength,triangles,materials:scene.children.length});
}
await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
console.table(manifest);
