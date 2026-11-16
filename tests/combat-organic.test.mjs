import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {sampleCombatMotion,crossedContact,stepSpring,stepGuardHold,solveFootPlant} from '../assets/gallery/combat-motion.js';
import {buildCharacter} from '../assets/gallery/npc-models.js';
import {createCombat,MOVES} from '../assets/gallery/combat.js';
const M={boxUV};
test('all sixteen moves have anticipation, a short strike and exactly one contact crossing',()=>{
 for(const move of MOVES){const out={};sampleCombatMotion(move,move.windup*.3,out);assert.ok(out.drive<0);
  sampleCombatMotion(move,move.windup,out);assert.equal(out.drive,1);assert.equal(out.phase,2);
  sampleCombatMotion(move,move.duration,out);assert.ok(Math.abs(out.drive)<1e-6);
  let count=0,landed=false,previous=0;for(let t=.017;t<move.duration+.05;t+=.017){if(crossedContact(previous,t,move,landed)){count++;landed=true;}previous=t;}assert.equal(count,1);
 }
});
test('guard requires 700 ms continuous intention and never repeats until released',()=>{
 const hold={elapsed:0,fired:false};for(let i=0;i<6;i++)assert.equal(stepGuardHold(hold,.1,true,true),false);
 assert.equal(stepGuardHold(hold,.1,true,true),true);assert.equal(stepGuardHold(hold,.1,true,true),false);
 stepGuardHold(hold,.1,false,true);for(let i=0;i<4;i++)stepGuardHold(hold,.1,true,true);stepGuardHold(hold,.1,true,false);assert.equal(hold.elapsed,0);
});
test('spring settles and flat-ground two-link foot solution preserves sole angle',()=>{
 const spring={x:0,v:3};let peak=0;for(let i=0;i<240;i++){const value=stepSpring(spring,0,1/60);assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}assert.ok(peak>0);assert.ok(Math.abs(spring.x)<.0001);
 const out={};solveFootPlant(.40,.34,0,out);assert.ok(Math.abs(out.knee)<1e-6);
 solveFootPlant(.40,.34,.1,out);assert.ok(out.knee>0);assert.ok(Math.abs(out.hip+out.knee+out.ankle)<1e-6);
});
test('all cast models retain one mesh and normalized blended weights below 15k triangles',()=>{
 const cast=JSON.parse(fs.readFileSync(new URL('../assets/data/npc-cast.json',import.meta.url),'utf8'));let maximum=0;
 for(const c of cast.characters)for(const quality of ['low','high']){
  const rig=buildCharacter(THREE,M,{...c.model,quality});maximum=Math.max(maximum,rig.triangles);assert.ok(rig.triangles<=15000,c.id+':'+rig.triangles);
  assert.equal(rig.mesh.geometry.userData.skinClothBoxes,0,c.id);
  let meshes=0;rig.mesh.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,1);
  for(const key of ['neck','hair','belly','shoulders','elbows','wrists','knees','ankles','cheeks'])assert.ok(rig.bones[key],key);
  const w=rig.mesh.geometry.attributes.skinWeight,ids=rig.mesh.geometry.attributes.skinIndex;let blended=0;
  for(let i=0;i<w.count;i++){const sum=w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i);assert.ok(Math.abs(sum-1)<1e-6);if(w.getY(i)>0&&w.getY(i)<1)blended++;assert.ok(ids.getX(i)<rig.mesh.skeleton.bones.length);assert.ok(ids.getY(i)<rig.mesh.skeleton.bones.length);}
  assert.ok(blended>100,c.id);rig.dispose();
 }console.log('Organic cast maximum triangles:',maximum);
});
function driver(lazy=false){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.62,0);camera.lookAt(0,1.62,-10);
 const actors=[];for(let i=0;i<7;i++){const rig=buildCharacter(THREE,M,{quality:'low'}),root=new THREE.Group();root.add(rig.mesh);scene.add(root);const x=i===0?0:8+i,z=i===0?-1.3:0;actors.push({S:{name:'actor'+i},rig,root,body:rig.bones.body,head:rig.bones.head,arms:rig.bones.arms,legs:rig.bones.legs,x,z,baseY:0,yaw:0,colW:.35,colH:2,sillyT:-1,windT:0,pestT:0,hatState:0,hit:new THREE.Object3D(),col:{minX:x-.35,maxX:x+.35,minZ:z-.35,maxZ:z+.35,minY:0,maxY:2}});}
 const position=new THREE.Vector3(0,1.62,0),controls={floor:0,readPosition(out){Object.assign(out,position);},combatMove(dx,dz){position.x+=dx;position.z+=dz;},releaseCombatKeys(){}};
 let messages=0,slaps=0;const ctx={THREE,scene,M,quality:'low',audio:{muted:true},ui:{toast(){messages++;}}};
 const published=lazy?[]:actors,listeners=new Set();
 const combat=createCombat(ctx,{camera,controls,world:{regions:[{minX:-30,maxX:30,minZ:-30,maxZ:30,y:0}],colliders:actors.map(a=>a.col)},npcModule:{combatActors:published,onActorReady(fn){listeners.add(fn);return ()=>listeners.delete(fn);},findActor:o=>published.find(a=>a.hit===o)},onSlap(){slaps++;}});
 return {combat,actors,camera,scene,listeners,publish(){for(const n of actors){published.push(n);for(const fn of listeners)fn(n);}},get messages(){return messages;},get slaps(){return slaps;}};
}
test('an ordinary engage/click never enlists visitor or changes first-person camera',()=>{
 const d=driver(),before=d.camera.matrixWorld.clone();assert.equal(d.combat.engage(d.actors[0].hit),false);d.combat.update(.016);d.combat.renderCamera();assert.equal(d.combat.state.active,false);assert.deepEqual(d.camera.matrixWorld.elements,before.elements);d.combat.dispose();
});
test('explicit guard enters without automatic attack; contact once, no combat text, restore camera',()=>{
 const d=driver();assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);for(let i=0;i<12;i++)d.combat.update(.016);assert.equal(d.slaps,0);
 d.combat.attack(0);for(let i=0;i<30;i++)d.combat.update(.016);assert.equal(d.slaps,1);assert.equal(d.messages,0);
 const before=d.camera.position.clone();d.combat.renderCamera();d.combat.restoreCamera();assert.deepEqual(d.camera.position.toArray(),before.toArray());
 d.combat.end('exit');assert.equal(d.combat.state.active,false);assert.ok(d.actors[0].rig.bones.knees.every(b=>b.rotation.x===0));d.combat.dispose();
});
test('an ambient NPC fight never enlists visitor or changes their camera',()=>{
 const d=driver();d.actors[1].x=1;d.actors[1].z=-1.3;const before=d.camera.position.clone();
 assert.equal(d.combat.startScripted('actor0','actor1',{duration:2}),true);
 d.combat.update(.016);d.combat.renderCamera();assert.equal(d.combat.state.kind,'scripted');assert.deepEqual(d.camera.position.toArray(),before.toArray());
 assert.equal(d.combat.engage(d.actors[0].hit),false);assert.equal(d.combat.state.kind,'scripted');
 assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);assert.equal(d.combat.state.kind,'visitor');d.combat.dispose();
});

test('late NPC registration supports guard entry and unsubscribes on disposal',()=>{
 const d=driver(true);assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),false);
 d.publish();assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);d.combat.update(.016);d.combat.end('exit');d.combat.dispose();assert.equal(d.listeners.size,0);
});
