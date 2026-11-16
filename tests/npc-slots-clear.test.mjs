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
  const restore=stubs(),colliders=[],regions=[],built=[],outputs=new Map();
  try{
    for(const name of SPACES){
      if(SKIP.has(name))continue;
      const {build}=await import(`../assets/gallery/spaces/${name}.js`);
      const out=await build({THREE,scene:new THREE.Scene(),quality:'low',reducedMotion:true,renderer:{capabilities:{getMaxAnisotropy:()=>1,isWebGL2:true}},
        M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},audio:null,ui:{toast:noop},yieldBuild:async()=>{},startup:{moved:false},events:new EventTarget()});
      for(const c of out?.colliders||[])colliders.push({module:name,...c});
      for(const r of out?.regions||[])regions.push({module:name,...r});
      built.push(name);outputs.set(name,out);
    }
  }finally{restore();}
  return {colliders,regions,built,outputs};
}
// 14 -> 18 slots: four were added for the influencers (three on the market apron, one on the campus stop).
const SLOTS=18;
async function slotTable(){
  const {build}=await import('../assets/gallery/spaces/npcs.js');
  const mod=build({THREE,scene:new THREE.Scene(),startup:{moved:true},quality:'low',audio:{muted:true},M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},yieldBuild:async()=>{}});
  // Far from every home: the slot table is built, no actor is streamed in.
  mod.update(.016,{camera:{position:{x:1e4,y:1.62,z:1e4}},time:0});
  for(let i=0;i<400&&mod.actorSlots.length<SLOTS;i++)await new Promise(r=>setTimeout(r,5));
  const slots=mod.actorSlots.map(s=>({...s,home:s.home.slice()}));mod.dispose();return slots;
}
// The wander points, as npcs.js assemble() lays them out around the home.
function wander(s){
  const r=s.station?0:s.legacy.r,points=[[s.home[0],s.home[1],'home']];
  const count=r>1?4:2;for(let k=0;k<count;k++){const a=k/count*Math.PI*2+s.index;points.push([s.home[0]+Math.cos(a)*r,s.home[1]+Math.sin(a)*r*(count===2?.6:1),'wander '+k]);}
  return points;
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
  assert.equal(slots.length,SLOTS);
  const problems=[];
  for(const s of slots){
    // The floor belongs to the slot: 0.35 m at the station berths, the market and the platform.
    const floor=s.floor||0,points=wander(s);
    for(const [x,z,what] of points)for(const c of colliders)if(tall(c,floor)&&inside(x,z,c))problems.push(`${s.id} ${what} (${x.toFixed(2)}, ${z.toFixed(2)}) inside ${c.module} [${c.minX}..${c.maxX}]x[${c.minZ}..${c.maxZ}] y ${c.minY}..${c.maxY}`);
  }
  assert.deepEqual(problems,[]);
});

test('the influencers live at the market and the campus stop: on that floor, inside their bounds, their rounds a body clear of every stall',async()=>{
  const slots=await slotTable(),{colliders,regions,outputs}=await campusColliders();
  const places={tremoco_vegan:'mercado',coach_madrugada:'mercado',apanhados:'mercado',tia_stories:'metro'};
  // A departing tram takes on board anyone idle within 2 m of a stop's boarding point (tram-ride.js).
  const tram=outputs.get('tram-ride')?.tram,boarding=['campus','mercado'].map(id=>tram?.getStation(id));
  assert.ok(boarding.every(s=>Number.isFinite(s?.boardX)&&Number.isFinite(s?.boardZ)),'the boarding points are read');
  const area={mercado:{minX:92,maxX:112,minZ:20,maxZ:44},metro:{minX:81.08,maxX:84.58,minZ:14,maxZ:44}};
  assert.ok(regions.some(r=>r.module==='mercado'&&r.minX===92&&r.maxX===112&&r.y===.35),'the market apron is read');
  const problems=[];
  for(const [id,place] of Object.entries(places)){
    const s=slots.find(s=>s.id===id);assert.ok(s,id);
    assert.ok(s.index>=14&&!s.station,id+' has a slot of its own, not a station berth');
    assert.equal(s.floor,.35,id+' stands on the 0.35 m floor');
    const a=area[place],b=s.bounds,points=wander(s);
    assert.ok(Array.isArray(b)&&b[0]>=a.minX&&b[1]<=a.maxX&&b[2]>=a.minZ&&b[3]<=a.maxZ,id+' bounds stay on its floor');
    for(const s of boarding){const dx=Math.max(b[0]-s.boardX,0,s.boardX-b[1]),dz=Math.max(b[2]-s.boardZ,0,s.boardZ-b[3]);
      assert.ok(Math.hypot(dx,dz)>2,`${id} can never stand where the tram at ${s.id} takes people on board`);}
    for(const [x,z,what] of points){
      if(!(x>b[0]&&x<b[1]&&z>b[2]&&z<b[3]))problems.push(`${id} ${what} outside its bounds`);
      // every point stands on a region at the slot's height (the market apron or the platform)
      if(!regions.some(r=>Math.abs((r.y||0)-.35)<1e-6&&x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ))problems.push(`${id} ${what} (${x.toFixed(2)}, ${z.toFixed(2)}) is not on a 0.35 m floor`);
    }
    // The straight walk between consecutive points keeps a body (0.35 m) off every tall collider.
    const ring=points.slice(1);
    for(let k=0;k<ring.length;k++){const p=ring[k],q=ring[(k+1)%ring.length];
      for(let t=0;t<=1.0001;t+=.05){const x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t;
        for(const c of colliders)if(tall(c,.35)&&x>c.minX-.35&&x<c.maxX+.35&&z>c.minZ-.35&&z<c.maxZ+.35)problems.push(`${id} walk ${k} at (${x.toFixed(2)}, ${z.toFixed(2)}) brushes ${c.module} [${c.minX}..${c.maxX}]x[${c.minZ}..${c.maxZ}]`);}}
  }
  assert.deepEqual([...new Set(problems)],[]);
  // Three of them share the market, near enough to be overheard together (scenes need 12 m from the visitor).
  const market=['tremoco_vegan','coach_madrugada','apanhados'].map(id=>slots.find(s=>s.id===id).home);
  for(const p of market)for(const q of market)assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<14);
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
