// Original Juicers geometry. Run with `npm run assets:fruits` (Node 22+).
import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
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
  orange: '#ff791d', lime: '#5fc72c', berry: '#f52c79', melon: '#ff405e',
  pineapple: '#ffc132', leaf: '#269e50', leafLight: '#80ce43', stem: '#75432b',
  rind: '#21ad75', pith: '#fff3c4', pulp: '#b5ed39', pulpLight: '#d0f65b', seed: '#492336', groove: '#d89428', peel: '#e9761d',
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
  (parts[color] ??= []).push(geometry.index ? geometry.toNonIndexed() : geometry);
}
function oval(color, position, scale, rotation = [0, 0, 0], detail = 16) {
  add(new THREE.SphereGeometry(1, detail, detail <= 12 ? 8 : 12), color, position, scale, rotation);
}
function leaf(position, scale, rotation, color = 'leaf') {
  // A curved, pillowy leaf with pointed ends and a softly raised center.
  const shape = new THREE.Shape();
  shape.moveTo(0,0);
  shape.quadraticCurveTo(-0.62,0.45,0,1);
  shape.quadraticCurveTo(0.62,0.55,0,0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth:0.045, bevelEnabled:true,
    bevelSize:0.025, bevelThickness:0.025, bevelSegments:1, steps:1, curveSegments:6 });
  const p = geometry.attributes.position;
  for (let i=0;i<p.count;i++) p.setZ(i,p.getZ(i)+Math.sin(p.getY(i)*Math.PI)*0.16);
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
    leaf([0,0.76,0], [0.85,0.88,0.8], [0.25,-0.2,-0.95]);
  },
  lime() {
    // A plump cut lime: bright pith and eight separated juicy segments make the
    // ingredient instantly readable at phone size, with a green rounded back.
    add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI), 'lime', [0,-0.04,0],
      [0.84,0.88,0.72], [0,Math.PI,0]);
    add(new THREE.CylinderGeometry(0.84,0.84,0.06,32), 'lime', [0,-0.04,0],
      [1,1,1.05], [Math.PI/2,0,0]);
    add(new THREE.CylinderGeometry(0.77,0.77,0.055,32), 'pith', [0,-0.04,0.01],
      [1,1,1.05], [Math.PI/2,0,0]);
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4+0.055, b=(i+1)*Math.PI/4-0.055;
      const shape=new THREE.Shape();
      shape.moveTo(Math.cos(a)*0.09,Math.sin(a)*0.09);
      shape.lineTo(Math.cos(a)*0.66,Math.sin(a)*0.66);
      shape.absarc(0,0,0.66,a,b,false);
      shape.lineTo(Math.cos(b)*0.09,Math.sin(b)*0.09);
      shape.closePath();
      add(new THREE.ExtrudeGeometry(shape,{depth:0.055,bevelEnabled:true,bevelSegments:2,
        steps:1,bevelSize:0.026,bevelThickness:0.025,curveSegments:5}),i%2?'pulpLight':'pulp',
        [0,-0.04,0.045],[1,1.05,1]);
      const mid=(a+b)/2;
      oval(i%2?'pulp':'pulpLight',[Math.cos(mid)*0.43,Math.sin(mid)*0.45-0.04,0.115],
        [0.045,0.14,0.026],[0,0,mid-Math.PI/2],8);
    }
    leaf([0,0.78,-0.03], [0.65,0.61,0.7], [0.9,0.1,-0.95]);
  },
  berry() {
    oval('berry', [0,0,0], [0.51,0.7,0.5]);
    for (let row=0; row<4; row++) {
      const radius = [0.27,0.49,0.55,0.42][row];
      const count = [5,8,9,7][row];
      for (let i=0; i<count; i++) {
        const angle=(i/count)*Math.PI*2+row*0.35;
        oval('berry',[Math.cos(angle)*radius,-0.65+row*0.38,Math.sin(angle)*radius],
          [0.30,0.31,0.30], [0,0,0], 12);
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
      add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,
        bevelSize:0.055,bevelThickness:0.055,curveSegments:16}),color,[0,0.1,-depth/2]);
    }
    slice(1.03,0.48,'rind');
    slice(0.93,0.5,'pith');
    slice(0.82,0.53,'melon');
    for (const side of [-1,1]) for (let i=0;i<7;i++) {
      const angle=0.32+(i/6)*(Math.PI-0.64);
      oval('seed',[Math.cos(angle)*0.59,0.48-Math.sin(angle)*0.6,side*0.34],
        [0.038,0.085,0.025],[0,0,Math.PI/2-angle],8);
    }
  },
  pineapple() {
    oval('groove',[0,-0.26,0],[0.65,0.79,0.65]);
    // Rounded lozenges replace spiky facets; all golden panels remain one mesh.
    const diamond=new THREE.Shape();
    diamond.moveTo(0,0.18); diamond.lineTo(0.16,0); diamond.lineTo(0,-0.18);
    diamond.lineTo(-0.16,0); diamond.closePath();
    for (let row=0;row<6;row++) {
      const y=-0.86+row*0.24;
      const ring=Math.sqrt(1-((y+0.26)/0.85)**2)*0.64;
      for(let i=0;i<10;i++) {
        const a=i*Math.PI/5+(row%2)*Math.PI/10;
        add(new THREE.ExtrudeGeometry(diamond,{depth:0.035,bevelEnabled:true,bevelSegments:2,
          bevelSize:0.04,bevelThickness:0.045,steps:1}), 'pineapple',
          [Math.sin(a)*ring,y,Math.cos(a)*ring],[1,1,1],[0,a,0]);
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
    const geometry=mergeVertices(mergeGeometries(geometries));
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
