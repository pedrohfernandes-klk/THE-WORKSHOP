import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {sampleCombatMotion,stepGuardCharge,WIND_UP,GUARD_HOLD} from '../assets/gallery/combat-motion.js';
import {buildCharacter} from '../assets/gallery/npc-models.js';
import {createCombat,chooseMove,MOVES} from '../assets/gallery/combat.js';
import {moveInWorld} from '../assets/gallery/collision.js';
const M={boxUV};
const seeded=(seed=1)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

// Just enough DOM for the combat HUD: elements, styles, attributes, window key listeners.
function fakeDom(){
  const listeners=new Map();
  const element=tag=>({tag,children:[],attributes:{},hidden:false,parentNode:null,textContent:'',className:'',
    style:{props:{},setProperty(k,v){this.props[k]=v;}},setAttribute(k,v){this.attributes[k]=String(v);},
    append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}},
    addEventListener(type,fn){(this.on??={})[type]=fn;},remove(){this.removed=true;},click(){this.on?.click?.();}});
  const body=element('body'),win={
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    removeEventListener(type,fn){const list=listeners.get(type)||[],i=list.indexOf(fn);if(i>=0)list.splice(i,1);},
    dispatch(type,init){const e={repeat:false,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,target:null,preventDefault(){},stopImmediatePropagation(){},...init,type};for(const fn of [...(listeners.get(type)||[])])fn(e);}};
  return {document:{createElement:element,head:element('head'),body},window:win,body};
}
function driver({dom=false,opponent=[0,-1.3],fixed=false,collide=false,obstacles=[],reducedMotion=false,random=seeded(),name='actor0'}={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.62,0);camera.lookAt(opponent[0],1.62,opponent[1]);
  const actors=[];for(let i=0;i<7;i++){const rig=buildCharacter(THREE,M,{quality:'low'}),root=new THREE.Group();root.add(rig.mesh);scene.add(root);const x=i===0?opponent[0]:8+i,z=i===0?opponent[1]:0;
    actors.push({S:{name:i===0?name:'actor'+i},rig,root,body:rig.bones.body,head:rig.bones.head,arms:rig.bones.arms,legs:rig.bones.legs,x,z,baseY:0,yaw:0,colW:.35,colH:2,sillyT:-1,windT:0,pestT:0,hatState:0,fixed:i===0&&fixed,hit:new THREE.Object3D(),col:{minX:x-.35,maxX:x+.35,minZ:z-.35,maxZ:z+.35,minY:0,maxY:2}});}
  const world={regions:[{minX:-30,maxX:30,minZ:-30,maxZ:30,y:0}],colliders:[...actors.map(a=>a.col),...obstacles]};
  const position=new THREE.Vector3(0,1.62,0),active=[],out={x:0,z:0,floor:0,step:0,region:null};
  // With `collide`, the half-step goes through the same collision as the real controls.combatMove.
  const controls={floor:0,readPosition(o){Object.assign(o,position);},releaseCombatKeys(){},
    combatMove(dx,dz){if(collide){moveInWorld(position.x,position.z,0,dx,dz,.35,world.regions,world.colliders,active,out);position.x=out.x;position.z=out.z;}else{position.x+=dx;position.z+=dz;}}};
  const toasts=[],ctx={THREE,scene,M,quality:'low',audio:{muted:true},reducedMotion,ui:{toast(text){toasts.push(text);}}};
  const fake=dom?fakeDom():null,saved={document:globalThis.document,window:globalThis.window};
  if(fake){globalThis.document=fake.document;globalThis.window=fake.window;}
  let combat;try{combat=createCombat(ctx,{camera,controls,world,random,npcModule:{combatActors:actors,findActor:o=>actors.find(a=>a.hit===o)}});}
  finally{if(fake){globalThis.document=saved.document;globalThis.window=saved.window;}}
  const key=(type,code='KeyQ',init={})=>fake.window.dispatch(type,{code,...init});
  const charge=fake?.body.children.find(e=>e.className==='combat-charge');
  const shoot=()=>{combat.renderCamera();const p=camera.position.clone();combat.restoreCamera();return p;};
  const fightButton=fake?.body.children.find(e=>e.className==='combat-hud')?.children[1];
  return {combat,actors,camera,position,world,toasts,key,charge,fightButton,shoot,scene};
}
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const nags=d=>d.toasts.filter(t=>t==='Chega mais perto do trombil.').length;

test('guard charge counts real time up to 0.1 s a frame and survives a one-frame flicker',()=>{
  // 1 fps: seven frames, not the fourteen the 0.05 s animation step needed.
  let s={elapsed:0,fired:false,lapse:0},frames=0;while(!stepGuardCharge(s,1,true,true)&&frames<50)frames++;assert.equal(frames+1,7);
  // A 5 s stall counts 0.1 s: it never fires the guard by itself.
  s={elapsed:0,fired:false,lapse:0};assert.equal(stepGuardCharge(s,5,true,true),false);assert.ok(near(s.elapsed,.1));
  // One ineligible frame (any frame rate) keeps the charge; it does not add time.
  s={elapsed:0,fired:false,lapse:0};for(let i=0;i<5;i++)stepGuardCharge(s,.1,true,true);
  assert.equal(stepGuardCharge(s,.1,true,false),false);assert.ok(near(s.elapsed,.5));
  assert.equal(stepGuardCharge(s,.1,true,true),false);assert.equal(stepGuardCharge(s,.1,true,true),true);
  // Up to 0.15 s lost is tolerated; more starts the count again.
  s={elapsed:0,fired:false,lapse:0};for(let i=0;i<4;i++)stepGuardCharge(s,.1,true,true);
  for(let i=0;i<9;i++)stepGuardCharge(s,1/60,true,false);assert.ok(near(s.elapsed,.4));
  stepGuardCharge(s,1/60,true,false);assert.equal(s.elapsed,0);assert.ok(s.lapse>.15);
  // Letting go resets at once, and a fired guard never repeats while held, flicker or not.
  s={elapsed:0,fired:false,lapse:0};for(let i=0;i<4;i++)stepGuardCharge(s,.1,true,true);stepGuardCharge(s,.1,false,true);assert.equal(s.elapsed,0);
  for(let i=0;i<7;i++)stepGuardCharge(s,.1,true,true);assert.equal(s.fired,true);
  stepGuardCharge(s,.05,true,false);for(let i=0;i<20;i++)assert.equal(stepGuardCharge(s,.1,true,true),false);
  assert.equal(GUARD_HOLD,.7);
});

test('holding Q starts the guard after 0.7 s at 10 fps and at 1 fps, through a one-frame flicker',()=>{
  for(const dt of [.1,1]){
    const d=driver({dom:true});d.key('keydown');
    for(let i=0;i<6;i++){d.combat.update(dt);assert.equal(d.combat.state.active,false,`${dt}: frame ${i}`);}
    d.combat.update(dt);assert.equal(d.combat.state.active,true,`${dt}: seventh frame`);assert.equal(d.combat.state.kind,'visitor');
    d.key('keyup');d.combat.dispose();
  }
  const d=driver({dom:true});d.key('keydown');for(let i=0;i<5;i++)d.combat.update(.1);
  d.actors[0].busy=true;d.combat.update(.1);d.actors[0].busy=false;
  d.combat.update(.1);assert.equal(d.combat.state.active,false);d.combat.update(.1);assert.equal(d.combat.state.active,true);
  assert.equal(nags(d),0);d.key('keyup');d.combat.dispose();
});

test('the charge ring fills near the crosshair only while the guard is held',()=>{
  const d=driver({dom:true});assert.ok(d.charge,'one charge element');assert.equal(d.charge.hidden,true);assert.equal(d.charge.attributes['aria-hidden'],'true');
  d.key('keydown');d.combat.update(.1);d.combat.update(.1);d.combat.update(.1);
  assert.equal(d.charge.hidden,false);const value=Number(d.charge.style.props['--charge']);assert.ok(value>.35&&value<.5,String(value));
  d.key('keyup');assert.equal(d.charge.hidden,true);d.combat.update(.1);assert.equal(d.charge.hidden,true);
  // Letting go resets at once: a release and a press inside one frame start from zero.
  d.key('keydown');for(let i=0;i<5;i++)d.combat.update(.1);d.key('keyup');d.key('keydown');
  for(let i=0;i<6;i++){d.combat.update(.1);assert.equal(d.combat.state.active,false);}d.key('keyup');
  d.key('keydown');for(let i=0;i<6;i++)d.combat.update(.1);assert.ok(Number(d.charge.style.props['--charge'])>.8);
  d.combat.update(.1);assert.equal(d.combat.state.active,true);assert.equal(d.charge.hidden,true,'hidden once the fight starts');
  d.combat.dispose();assert.equal(d.charge.removed,true);
});

test('Q with nobody in reach says so once per press, at most once every two seconds',()=>{
  const d=driver({dom:true,opponent:[0,-3]});
  d.key('keydown');d.combat.update(.1);assert.equal(nags(d),0,'one frame without a target is still within the grace');
  d.combat.update(.1);assert.equal(nags(d),1);
  d.key('keydown',undefined,{repeat:true});for(let i=0;i<5;i++)d.combat.update(.1);assert.equal(nags(d),1,'held key repeats say nothing');
  d.key('keyup');d.key('keydown');for(let i=0;i<3;i++)d.combat.update(.1);d.key('keyup');assert.equal(nags(d),1,'a second press within 2 s is throttled');
  for(let i=0;i<20;i++)d.combat.update(.1);
  d.key('keydown');d.key('keyup');assert.equal(nags(d),2,'a quick tap counts as a press');
  assert.equal(d.combat.state.active,false);d.combat.dispose();
  // The touch button (the same guard without a keyboard) says the same when nobody is near,
  // and starts the fight when somebody is.
  const t=driver({dom:true,opponent:[0,-3]});assert.equal(t.fightButton.attributes['aria-label'],'Entrar em guarda (manter Q)');
  t.fightButton.click();assert.equal(nags(t),1);assert.equal(t.combat.state.active,false);t.combat.dispose();
  const n=driver({dom:true});n.fightButton.click();assert.equal(n.combat.state.active,true);assert.equal(nags(n),0);n.combat.dispose();
});

test('the guard reaches 2.1 m like the slap: a half-step in to 1.7 m first',()=>{
  const d=driver({opponent:[0,-2]});assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);
  assert.ok(near(Math.hypot(d.position.x-d.actors[0].x,d.position.z-d.actors[0].z),1.7,1e-9));assert.ok(near(d.position.z,-.3,1e-9));
  d.combat.update(.016);assert.ok(near(d.combat.state.az,-.3,1e-9),'the borrowed body stands where the visitor stepped');d.combat.dispose();
  const close=driver({opponent:[0,-1.5]});assert.equal(close.combat.engage(close.actors[0].hit,{explicit:true}),true);assert.equal(close.position.z,0,'no step inside 1.8 m');close.combat.dispose();
  const far=driver({opponent:[0,-2.2]});assert.equal(far.combat.engage(far.actors[0].hit,{explicit:true}),false);
  assert.deepEqual(far.toasts,['Chega mais perto do trombil.']);assert.equal(far.position.z,0);far.combat.dispose();
});

test('nearestActor and begin agree on 2.1 m: holding Q at 2 m starts the fight',()=>{
  const d=driver({dom:true,opponent:[0,-2]});d.key('keydown');for(let i=0;i<7;i++)d.combat.update(.1);
  assert.equal(d.combat.state.active,true);assert.ok(Math.hypot(d.position.x,d.position.z+2)<=1.8);assert.equal(nags(d),0);d.combat.dispose();
  const out=driver({dom:true,opponent:[0,-2.25]});out.key('keydown');for(let i=0;i<10;i++)out.combat.update(.1);
  assert.equal(out.combat.state.active,false);assert.equal(nags(out),1);out.combat.dispose();
});

test('the half-step respects collisions and is undone when the fight is refused',()=>{
  // A low planter (0.5 m: it blocks feet, not blows) between visitor and opponent.
  const planter={minX:-1,maxX:1,minZ:-.6,maxZ:-.4,minY:0,maxY:.5};
  const d=driver({opponent:[0,-2],collide:true,obstacles:[planter]});
  assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),false);assert.deepEqual(d.toasts,['Sem espaço para a porrada.']);
  assert.ok(near(d.position.x,0,1e-9)&&near(d.position.z,0,1e-9),'stepped back');d.combat.dispose();
  // A wall in the way refuses the fight after the step: the step is undone too.
  const wall={minX:-1,maxX:1,minZ:-1.3,maxZ:-1.1,minY:0,maxY:2.5};
  const w=driver({opponent:[0,-2],collide:true,obstacles:[wall]});
  assert.equal(w.combat.engage(w.actors[0].hit,{explicit:true}),false);assert.ok(near(w.position.z,0,1e-9));w.combat.dispose();
  // Open ground with collision on: the step lands at the guard distance.
  const o=driver({opponent:[0,-2],collide:true});assert.equal(o.combat.engage(o.actors[0].hit,{explicit:true}),true);
  assert.ok(near(Math.hypot(o.position.x,o.position.z+2),1.7,1e-6));o.combat.dispose();
});

test('the fight camera prefers the profile, keeps a valid shot and switches only when it is lost',()=>{
  const d=driver({opponent:[0,-1.6],fixed:true,reducedMotion:true});assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);
  // Midpoint (0, -0.8), axis along -z: the profile is 3.6 m out on x, the visitor on the left.
  let p=d.shoot();assert.ok(near(p.x,3.6,1e-6)&&near(p.z,-.8,1e-6)&&near(p.y,1.95,1e-6),p.toArray().join());
  const open=d.world.regions.slice(),hole=(x)=>[{minX:-30,maxX:x-.5,minZ:-30,maxZ:30,y:0},{minX:x+.5,maxX:30,minZ:-30,maxZ:30,y:0},{minX:x-.5,maxX:x+.5,minZ:-30,maxZ:-1.3,y:0},{minX:x-.5,maxX:x+.5,minZ:-.3,maxZ:30,y:0}];
  d.world.regions.splice(0,Infinity,...hole(3.6));p=d.shoot();assert.ok(near(p.x,-3.6,1e-6),'lost: the other profile');
  d.world.regions.splice(0,Infinity,...open);for(let i=0;i<5;i++){p=d.shoot();assert.ok(near(p.x,-3.6,1e-6),'still valid: kept');}
  d.world.regions.splice(0,Infinity,...hole(-3.6));p=d.shoot();assert.ok(near(p.x,3.6,1e-6),'lost again: back to the first');
  d.combat.dispose();
});

test('fallbacks stay: crane on crowded ground, upgraded after 0.6 s; never beside the tram',()=>{
  const d=driver({opponent:[0,-1.6],fixed:true,reducedMotion:true}),open=d.world.regions.slice();
  d.world.regions.splice(0,Infinity,{minX:-1,maxX:1,minZ:-2.5,maxZ:.7,y:0});
  assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);let p=d.shoot();
  assert.ok(near(p.x,0,1e-6)&&near(p.z,1.4,1e-6)&&near(p.y,3.2,1e-6),'crane over the shoulder: '+p.toArray().join());
  d.world.regions.splice(0,Infinity,...open);p=d.shoot();assert.ok(near(p.y,3.2,1e-6),'no hop on the next frame');
  for(let i=0;i<7;i++)d.combat.update(.1);p=d.shoot();assert.ok(near(p.x,3.6,1e-6)&&near(p.y,1.95,1e-6),'profile once it is there');
  d.combat.dispose();
  const t=driver({opponent:[0,-1.6],fixed:true,reducedMotion:true});t.world.regions.splice(0,Infinity,{minX:-1,maxX:1,minZ:-2.5,maxZ:.7,y:0});
  t.scene.userData.tramRide={carrier:{x:0,z:-.8,yaw:0,riding:false}};
  assert.equal(t.combat.engage(t.actors[0].hit,{explicit:true}),false);assert.deepEqual(t.toasts,['Sem espaço para a porrada.']);t.combat.dispose();
});

test('the opponent varies its blows: never three alike, weighted by distance, signature kept',()=>{
  const random=seeded(11),close=new Set(['hug','tickle','pinch','pull','both','stomp']),long=new Set(['whip','shoe','sweepLeg','fan']);
  for(const special of [-1,11,8]){
    for(const distance of [1.1,1.45,1.75]){
      let last=-1,repeats=0,run=0;const counts=new Array(MOVES.length).fill(0);
      for(let i=0;i<3000;i++){const m=chooseMove(distance,last,repeats,special,random);assert.ok(m>=0&&m<MOVES.length);
        run=m===last?run+1:1;assert.ok(run<=2,`${special}@${distance}: ${MOVES[m].id} three times`);repeats=m===last?repeats+1:1;last=m;counts[m]++;}
      assert.ok(counts.filter(c=>c>0).length>=12,'most of the sixteen moves appear');
      if(special>=0){const share=counts[special]/3000;assert.ok(share>.15&&share<.3,`signature share ${share}`);}
      else assert.ok(Math.max(...counts)/3000<.16,'no move dominates');
    }
  }
  const share=(distance,set)=>{let n=0,last=-1,repeats=0;for(let i=0;i<4000;i++){const m=chooseMove(distance,last,repeats,-1,random);repeats=m===last?repeats+1:1;last=m;if(set.has(MOVES[m].pose))n++;}return n/4000;};
  assert.ok(share(1.1,close)>share(1.75,close)*1.6,'up close: hugs, pinches, ear pulls');
  assert.ok(share(1.75,long)>share(1.1,long)*1.6,'at reach: towels and slippers');
  // Out of range a move is a last resort, and a move used twice is never offered a third time.
  for(let i=0;i<200;i++)assert.notEqual(chooseMove(1.4,4,2,4,random),4);
});

test('in a fight the forcado no longer repeats the pega: no blow three times in a row',()=>{
  const d=driver({opponent:[0,-1.45],name:'forcado',random:seeded(5)});assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);
  const blows=[];let serial=d.combat.events.serial;
  for(let i=0;i<1800&&d.combat.state.active;i++){d.combat.setBrio(100);d.combat.update(1/30);
    while(serial<d.combat.events.serial){const e=d.combat.events.entries[serial%16];serial++;if(e.type==='impact')blows.push(e.move);}}
  assert.ok(blows.length>=20,'blows: '+blows.length);
  for(let i=2;i<blows.length;i++)assert.ok(!(blows[i]===blows[i-1]&&blows[i]===blows[i-2]),blows.join(' '));
  assert.ok(new Set(blows).size>=6,blows.join(' '));const pega=blows.filter(m=>m==='abraco').length/blows.length;
  assert.ok(pega>0&&pega<.45,'pega share '+pega);d.combat.dispose();
});

test('cartoon key poses: 30% deeper wind-up and recoil, hit-stop unchanged',()=>{
  assert.ok(near(WIND_UP,.22*1.3,1e-9));
  for(const move of MOVES){const out={},start=move.windup-Math.min(.05,move.windup*.38);
    sampleCombatMotion(move,start,out);assert.ok(near(out.drive,-WIND_UP,1e-9),move.id);
    sampleCombatMotion(move,move.windup,out);assert.equal(out.drive,1);}
  // A landed opponent blow pushes the visitor about 30% further than the 0.55 m/s first cut.
  const d=driver({opponent:[0,-1.45],fixed:true,random:()=>0});assert.equal(d.combat.engage(d.actors[0].hit,{explicit:true}),true);
  let serial=d.combat.events.serial,landedAt=null;
  for(let i=0;i<240&&landedAt===null;i++){d.combat.update(1/60);while(serial<d.combat.events.serial){const e=d.combat.events.entries[serial%16];serial++;if(e.type==='impact')landedAt=d.position.z;}}
  assert.notEqual(landedAt,null);for(let i=0;i<90;i++)d.combat.update(1/60);
  const pushed=d.position.z-landedAt;assert.ok(pushed>.075&&pushed<.1,'pushed '+pushed);d.combat.dispose();
});
