import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {SPACES} from '../assets/gallery/world.js';

// Every campus module is built here, in world.js order, with Node stubs (as the school test does),
// and its colliders are read from what build() returns. Two are left out on purpose:
// environment (sky and light only, and it needs the PBR sky) and npcs (the actors' own boxes).
// Not covered: the hall's benches and lectern (room.js, props.js), which need a renderer.
const SKIP=new Set(['environment','npcs']);
const noop=()=>{};
const canvas2d=new Proxy({measureText:()=>({width:10}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),createPattern:()=>({}),
  getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
function stubs(){
  const saved={document:globalThis.document,Path2D:globalThis.Path2D,FontFace:globalThis.FontFace,fetch:globalThis.fetch,warn:console.warn};
  globalThis.document={createElement:()=>({width:0,height:0,style:{},getContext:()=>canvas2d,addEventListener:noop,setAttribute:noop,append:noop}),
    head:{append:noop},body:{append:noop},fonts:{add:noop,load:async()=>[],ready:Promise.resolve()}};
  globalThis.Path2D=class{constructor(){return new Proxy(this,{get:(o,k)=>k in o?o[k]:noop});}};
  globalThis.FontFace=class{load(){return Promise.resolve(this);}};
  globalThis.fetch=async()=>{throw Error('offline test');};console.warn=noop;
  return ()=>{for(const k of ['document','Path2D','FontFace','fetch'])if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];console.warn=saved.warn;};
}
async function campusColliders(){
  const restore=stubs(),colliders=[],built=[];
  try{
    for(const name of SPACES){
      if(SKIP.has(name))continue;
      const {build}=await import(`../assets/gallery/spaces/${name}.js`);
      const out=await build({THREE,scene:new THREE.Scene(),quality:'low',reducedMotion:true,renderer:{capabilities:{getMaxAnisotropy:()=>1,isWebGL2:true}},
        M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},audio:null,ui:{toast:noop},yieldBuild:async()=>{},startup:{moved:false},events:new EventTarget()});
      for(const c of out?.colliders||[])colliders.push({module:name,...c});
      built.push(name);
    }
  }finally{restore();}
  return {colliders,built};
}
async function slotTable(){
  const {build}=await import('../assets/gallery/spaces/npcs.js');
  const mod=build({THREE,scene:new THREE.Scene(),startup:{moved:true},quality:'low',audio:{muted:true},M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},yieldBuild:async()=>{}});
  // Far from every home: the slot table is built, no actor is streamed in.
  mod.update(.016,{camera:{position:{x:1e4,y:1.62,z:1e4}},time:0});
  for(let i=0;i<400&&mod.actorSlots.length<14;i++)await new Promise(r=>setTimeout(r,5));
  const slots=mod.actorSlots.map(s=>({...s,home:s.home.slice()}));mod.dispose();return slots;
}
// Tall for this purpose: rises 0.9 m or more above the slot's floor and starts below head height,
// the same band combat.js counts as standing between two fighters.
const tall=(c,floor)=>(c.maxY??Infinity)-Math.max(c.minY??-Infinity,floor)>=.9&&(c.minY??-Infinity)<floor+1.8;
const inside=(x,z,c)=>x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ;

test('no NPC slot centre or wander point lies inside a campus collider 0.9 m or taller',async()=>{
  // One after the other: the campus stubs are globals the NPC module must not see.
  const slots=await slotTable(),{colliders,built}=await campusColliders();
  assert.deepEqual(built,SPACES.filter(n=>!SKIP.has(n)),'every covered module builds');
  assert.ok(built.includes('parterre')&&built.includes('pool'));
  assert.ok(colliders.some(c=>c.module==='parterre'&&c.minX===5.4&&c.maxX===10.1&&c.minZ===20.9&&c.maxZ===35.1),'the east bed is read');
  assert.ok(colliders.some(c=>c.module==='pool'&&c.minX===-3.9&&c.maxX===3.9),'the pool is read');
  assert.equal(slots.length,14);
  const problems=[];
  for(const s of slots){
    const floor=s.station?.35:0,r=s.station?0:s.legacy.r,points=[[s.home[0],s.home[1],'home']];
    // The wander points, as npcs.js assemble() lays them out around the home.
    const count=r>1?4:2;for(let k=0;k<count;k++){const a=k/count*Math.PI*2+s.index;points.push([s.home[0]+Math.cos(a)*r,s.home[1]+Math.sin(a)*r*(count===2?.6:1),'wander '+k]);}
    for(const [x,z,what] of points)for(const c of colliders)if(tall(c,floor)&&inside(x,z,c))problems.push(`${s.id} ${what} (${x.toFixed(2)}, ${z.toFixed(2)}) inside ${c.module} [${c.minX}..${c.maxX}]x[${c.minZ}..${c.maxZ}] y ${c.minY}..${c.maxY}`);
  }
  assert.deepEqual(problems,[]);
});

test('the bull stands clear of the parterre and the pool, where the visitor can reach it',async()=>{
  const slots=await slotTable(),bull=slots.find(s=>s.id==='bull');
  assert.ok(bull&&!bull.station);
  const [x,z]=bull.home;
  for(const box of [[5.4,10.1,20.9,35.1],[-10.1,-5.4,20.9,35.1],[-3.9,3.9,23.6,38.4]]){
    const dx=Math.max(box[0]-x,0,x-box[1]),dz=Math.max(box[2]-z,0,z-box[3]);
    assert.ok(Math.hypot(dx,dz)>=bull.legacy.r+.5,`bull home ${x},${z} too close to ${box}`);
  }
});
