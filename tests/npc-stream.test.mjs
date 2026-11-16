import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {createActorStream} from '../assets/gallery/npc-stream.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('stream gates movement and proximity and never duplicates complete actors',async()=>{
 const startup={moved:false};let fetches=0;const live=[],f={camera:{position:{x:0,z:0}},time:1};
 const stream=createActorStream({startup,yieldBuild:async()=>{}},{slots:[{id:'a',home:[50,0]}],fetchCast:async()=>{fetches++;return{};},assemble:async()=>({root:{},rig:{}}),commit:n=>{assert.ok(n.root&&n.rig);live.push(n);}});
 stream.update(f);await tick();assert.equal(fetches,0);startup.moved=true;stream.update(f);await tick();assert.equal(fetches,0);
 f.camera.position.x=20;stream.update(f);await tick();assert.equal(fetches,1);assert.equal(live.length,1);
 for(let i=0;i<20;i++)stream.update(f);await tick();assert.equal(live.length,1);stream.dispose();
});
test('departing during fetch postpones publication; return reuses fetched data',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let commits=0,fetches=0;
 const f={camera:{position:{x:0,z:0}},time:1};
 const stream=createActorStream({startup:{moved:true},yieldBuild:async()=>{}},{slots:[{id:'a',home:[0,0]}],fetchCast:()=>{fetches++;return pending;},assemble:async()=>({complete:true}),commit:()=>commits++});
 stream.update(f);await tick();f.camera.position.x=50;resolve({});await tick();assert.equal(commits,0);
 f.camera.position.x=0;stream.update(f);await tick();assert.equal(commits,1);assert.equal(fetches,1);
});
test('dispose prevents in-flight publication',async()=>{
 let resolve;const promise=new Promise(r=>resolve=r);let commits=0;
 const stream=createActorStream({yieldBuild:async()=>{}},{slots:[{id:'a',home:[0,0]}],fetchCast:()=>promise,assemble:async()=>({}),commit:()=>commits++});
 stream.update({camera:{position:{x:0,z:0}},time:1});await tick();stream.dispose();resolve({});await tick();assert.equal(commits,0);
});
test('real NPC module accepts empty/live rosters and late station actors under quiet',async()=>{
 const previous=globalThis.fetch,requests=[],errors=[];
 globalThis.fetch=async url=>{const path=new URL(url).pathname;requests.push(path);if(!path.includes('/cast/'))return{ok:false};const id=path.split('/').pop();return{ok:true,text:async()=>fs.readFileSync(new URL('../assets/data/cast/'+id,import.meta.url),'utf8')};};
 let resolveMove;const startup={moved:false,whenMoved:new Promise(r=>resolveMove=r)};
 const scene=new THREE.Scene();scene.userData.questQuiet=true;
 const ctx={THREE,scene,startup,quality:'low',audio:{muted:true},M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},yieldBuild:async()=>{},onActorError:(id,e)=>errors.push([id,e.message])};
 let module;
 try{
 const {build}=await import('../assets/gallery/spaces/npcs.js');const pending=build(ctx);pending.setStatues(true);await tick();assert.equal(scene.userData.npcStatues,true);assert.equal(requests.length,0);
 startup.moved=true;resolveMove();module=await pending;assert.equal(module.actors.length,0);assert.equal(module.colliders.length,14);assert.equal(requests.length,0);
 const identity=module.combatActors,ready=[];module.onActorReady(n=>{assert.ok(n.rig&&n.root&&n.hit&&n.col);ready.push(n);});
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.62,20);
 for(let i=0;i<90;i++){module.update(.016,{camera,time:i/60,level:0});await new Promise(r=>setTimeout(r,2));}
 assert.deepEqual(errors,[]);assert.ok(ready.length>0);assert.equal(module.combatActors,identity);assert.ok(!requests.some(p=>/npc-cast.json/.test(p)));assert.ok(!requests.some(p=>/cast\/(cat|raccoon|tortoise|walrus)\.json/.test(p)));
 assert.equal(module.pickables.length,module.actors.length*2);
 camera.position.set(84,1.97,29);
 for(let i=0;i<160;i++){module.update(.016,{camera,time:2+i/60,level:0});await new Promise(r=>setTimeout(r,2));}
 assert.deepEqual(errors,[]);for(const id of ['cat','raccoon','tortoise','walrus']){const n=module.actors.find(n=>n.S.name===id);assert.ok(n,id);assert.ok(n.x>81&&n.x<85);assert.equal(n.baseY,.35);}
 assert.equal(scene.userData.npcStatues,true);assert.ok(module.statueAudio.suspended);assert.ok(module.actors.length<=14);assert.equal(new Set(module.actors.map(n=>n.S.name)).size,module.actors.length);
 }finally{module?.dispose();globalThis.fetch=previous;}
});

test('dormant shell creates no canvas and retries failed initialization only after three seconds',async()=>{
 const {build}=await import('../assets/gallery/spaces/npcs.js');const previous=globalThis.document,oldWarn=console.warn;let groups=0,errors=0;
 const fakeThree={...THREE,Group:class extends THREE.Group{constructor(){super();if(++groups===2)throw Error('Transient initial build');}}};
 globalThis.document={createElement(){throw Error('Canvas before locomotion');}};const scene=new THREE.Scene(),startup={moved:false};let mod;
 try {mod=build({THREE:fakeThree,scene,startup,quality:'low',audio:{muted:true},onActorError:()=>errors++,M:{get:()=>new THREE.MeshStandardMaterial(),boxUV}});
 assert.equal(mod.then,undefined);assert.equal(mod.actors.length,0);assert.equal(mod.colliders.length,14);assert.equal(mod.actors,mod.combatActors);
 const f={camera:{position:{x:1000,y:1.62,z:1000}},time:0};for(let i=0;i<4;i++)mod.update(.016,f);
 await tick();assert.equal(mod.actorSlots.length,0);assert.equal(groups,1);
 globalThis.document=previous;console.warn=()=>{};startup.moved=true;mod.setStatues(true);mod.update(.016,f);
 for(let i=0;i<80&&errors===0;i++)await new Promise(r=>setTimeout(r,2));assert.equal(errors,1);
 f.time=2.99;for(let i=0;i<10;i++)mod.update(.016,f);await tick();assert.equal(groups,2);assert.equal(errors,1);
 f.time=3.01;mod.update(.016,f);for(let i=0;i<100&&!mod.stream;i++)await new Promise(r=>setTimeout(r,2));
 assert.ok(mod.stream);assert.equal(errors,1);assert.equal(mod.actorSlots.length,14);assert.equal(scene.userData.npcStatues,true);assert.ok(mod.statueAudio.suspended);
 }finally{mod?.dispose();globalThis.document=previous;console.warn=oldWarn;}
});
