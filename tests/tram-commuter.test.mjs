// Authored for Claude. Not executed by the author.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build } from '../assets/gallery/spaces/tram-ride.js';
function harness(reducedMotion=false){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(86,1.97,29);
  let fights=0;const messages=[];
  scene.userData.combatAPI={startScripted(){fights++;return true;},getScriptedResult(){return {sequence:0,completed:false};},getVisitorStatus(){return {fell:false};}};
  const module=build({THREE,scene,reducedMotion,M:{get:()=>new THREE.MeshStandardMaterial(),boxUV(){}},audio:{muted:false},ui:{toast:t=>messages.push(t)}});
  const frame={camera,time:0};module.update(0,frame);
  const actor=id=>({S:{name:id},x:1,z:2,baseY:0,zone:1,fixed:false,pts:[1,2,3,4],root:new THREE.Group(),col:{},colW:.3,colH:1.8});
  const actors=[actor('tortoise'),actor('raccoon'),actor('cat'),actor('walrus')];
  function tick(){frame.time+=.05;module.update(.05,frame);if(module.tram.carrier.riding)camera.position.set(module.tram.x,1.97,module.tram.z);}
  function trip(){assert.equal(module.tram.depart(),true);for(let i=0;i<500&&module.tram.phase!=='docked';i++)tick();assert.equal(module.tram.phase,'docked');}
  return{module,scene,camera,actors,tick,trip,messages,get fights(){return fights;}};
}
test('three stations loop without any surreal destination',()=>{
  const h=harness();h.module.tram.initializePassengers(h.actors,true);
  for(const station of ['mercado','marginal','campus']){h.trip();assert.equal(h.module.tram.station,station);}
  assert.equal(h.module.tram.getStation('feira'),null);assert.equal(h.fights,3);assert.ok(h.messages.includes('Por motivos de porrada, vamos acelerar.'));
  assert.notEqual(h.scene.userData.lastTramEvent.type,'trip-return');h.module.dispose();
});
test('late loading never teleports existing actors',()=>{
  const h=harness();h.module.tram.initializePassengers(h.actors,false);
  assert.deepEqual(h.actors.map(n=>[n.x,n.z]),[[1,2],[1,2],[1,2],[1,2]]);h.trip();assert.equal(h.fights,0);h.module.dispose();
});
test('initial assignment is reversible and uses the same actors',()=>{
  const h=harness();h.module.tram.initializePassengers(h.actors,true);
  assert.ok(h.actors.every(n=>h.module.tram.hasPassenger(n)));h.trip();h.module.dispose();
  for(const n of h.actors){assert.equal(n.x,1);assert.equal(n.z,2);assert.equal(n.fixed,false);assert.deepEqual(n.pts,[1,2,3,4]);}
});
test('reduced motion transports but adds no impulse or camera motion',()=>{
  const h=harness(true);h.module.tram.initializePassengers(h.actors,true);h.trip();
  assert.equal(h.scene.userData.tramImpulse.sequence,0);assert.deepEqual(h.scene.userData.tramView,{fov:0,roll:0});assert.equal(h.fights,1);h.module.dispose();
});
test('four of five fights accelerate and each impulse is bounded',()=>{
  const h=harness();h.module.tram.initializePassengers(h.actors,true);
  for(let i=0;i<5;i++){h.trip();const p=h.scene.userData.tramImpulse;assert.ok(Math.hypot(p.x,p.z)<=1);assert.ok(p.duration<=.3);}
  assert.equal(h.fights,5);assert.equal(h.scene.userData.tramImpulse.sequence,4);h.module.dispose();
});

test('leaving during closing cancels departure and reopens at the same station',()=>{
 const h=harness();assert.equal(h.module.tram.depart(),true);h.camera.position.set(83,1.97,29);
 for(let i=0;i<80;i++)h.tick();assert.equal(h.module.tram.phase,'docked');assert.equal(h.module.tram.station,'campus');assert.equal(h.module.tram.doorsOpen,true);assert.equal(h.module.tram.carrier.riding,false);h.module.dispose();
});
test('carrier admission reads visitor controls rather than a cinematic camera',()=>{
 const h=harness();h.module.tram.bindControls({readPosition(out){out.x=86;out.y=1.97;out.z=29;}});h.camera.position.set(200,10,200);
 assert.equal(h.module.tram.depart(),true);for(let i=0;i<30;i++)h.tick();assert.equal(h.module.tram.carrier.riding,true);h.module.dispose();
});
test('disembark updates root and waypoints at the current platform',()=>{
 const h=harness();h.module.tram.initializePassengers(h.actors,true);h.trip();const n=h.actors[0];assert.equal(h.module.tram.leave(n),true);
 assert.equal(n.root.position.x,n.x);assert.equal(n.root.position.z,n.z);assert.ok(Math.abs(n.pts[0]-n.x)<.01);assert.ok(n.col.minY===.35);assert.ok(n.x< h.module.tram.x-1.6);h.module.dispose();
});
