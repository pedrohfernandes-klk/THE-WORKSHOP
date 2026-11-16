import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const root=process.env.TRIM_ROOT||'.';
const source=fs.readFileSync(path.join(root,'assets/gallery/spaces/school.js'),'utf8');
test('school allocates only useful screens and no material downloads',async()=>{
 let canvases=0;const texts=[];
 const noop=()=>{};
 const context=new Proxy({scale:noop,measureText:()=>({width:10}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),fillText:t=>texts.push(t)}, {get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
 const old=globalThis.document;
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');canvases++;return {width:0,height:0,getContext:()=>context};}};
 try {
 const build=(await import(pathToFileURL(path.resolve(root,'assets/gallery/spaces/school.js')))).build;
 const result=await build({quality:'medium',M:{get(){throw Error('PBR download requested');},boxUV:noop},yieldBuild:async()=>{}});
 assert.equal(canvases,3);assert.equal(result.regions.length,6);
 assert.ok(result.pickables.filter(p=>p.userData.action?.url==='assets/apps/blocks.html').length===4);
 const textures=new Set();result.group.traverse(o=>{for(const m of [o.material].flat()){if(!m)continue;assert.equal(m.normalMap??null,null);if(m.map)textures.add(m.map);}});
 assert.equal(textures.size,3);for(const t of textures){assert.ok(Math.max(t.image.width,t.image.height)<=256);assert.equal(t.generateMipmaps,false);}
 assert.ok(!texts.some(t=>/EPI|ETIC|Horários|Lusíadas|Portugal/.test(t)));
 if(process.env.SCHOOL_BASE){
 const before=(await import(pathToFileURL(path.resolve(process.env.SCHOOL_BASE)))).build;
 const prior=await before({quality:'medium',M:{get:(_kind,opts)=>new THREE.MeshStandardMaterial(opts),boxUV:noop},yieldBuild:async()=>{}});
 assert.deepEqual(result.regions,prior.regions);assert.deepEqual(result.colliders,prior.colliders);assert.deepEqual(result.seats,prior.seats);
 const actions=r=>r.pickables.map(p=>({action:p.userData.action,matrix:Array.from(p.matrix.elements),position:Array.from(p.geometry.attributes.position.array)}));
 assert.deepEqual(actions(result),actions(prior));
 const vertices=r=>{let count=0;r.group.traverse(o=>{if(o.geometry)count+=o.geometry.attributes.position.count*(o.isInstancedMesh?o.count:1);});return count;};
 assert.equal(vertices(result),vertices(prior));
 }
 }finally{globalThis.document=old;}
});
test('school has no decorative painters, remote fonts or M.get',()=>{
 assert.doesNotMatch(source,/M\.get\(|photoPaint|photoCanvasTex|FontFace|paintboards|rnd\(/);
});
test('HDR upgrade is high only and overcast upgrade remains lazy',()=>{
 const src=fs.readFileSync(path.join(root,'assets/gallery/materials.js'),'utf8');
 assert.match(src,/tier !== 'high' \|\| full/);
 assert.match(src,/background: hdr, environment, get sharp\(\) \{ return sharpened\(\); \}/);
});

test('grass density cuts keep ground geometry and movement contract unchanged',async()=>{
 const {build}=await import(pathToFileURL(path.resolve(root,'assets/gallery/spaces/grass.js')));
 const counts={},grounds=[];const material=new THREE.MeshStandardMaterial();
 for(const quality of ['high','medium','low']){
  const out=build({THREE,quality,M:{get:()=>material},reducedMotion:false});
  const blades=out.group.getObjectByName('grass-blades'),base=out.group.getObjectByName('grass-base');
  counts[quality]=blades.geometry.instanceCount*5+base.geometry.index.count/3;
  grounds.push(base.geometry.index.count);assert.deepEqual(out.regions,[]);assert.deepEqual(out.colliders,[]);
  const geometry=blades.geometry;out.update(.016,{camera:{position:new THREE.Vector3()}});assert.equal(blades.geometry,geometry);
 }
 assert.equal(grounds[0],grounds[1]);assert.equal(grounds[1],grounds[2]);
 assert.ok(counts.medium<counts.high*.3);assert.ok(counts.low<counts.high*.13);
 console.log('Density-only triangles:',counts);
});
