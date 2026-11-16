import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bubbleDuration,bubbleLayout,createReadableBubbles} from '../assets/gallery/readable-bubbles.js';
import {createComedyMemory,createNpcComedy,EXCESS_WITNESS_LINES} from '../assets/gallery/npc-comedy.js';
function fixture(width=390,height=844){
 const userData={},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,width/height,.1,200);camera.updateMatrixWorld();
 const helper=createReadableBubbles(THREE,{renderer:{domElement:{clientWidth:width,clientHeight:height}},userData});
 function actor(x,z,text='Uma fala perfeitamente legível.'){
  const canvas={width:256,height:256},drawn=[];
  const g=new Proxy({canvas,font:'17px sans-serif',measureText(t){return {width:t.length*parseFloat(this.font.match(/([\d.]+)px/)?.[1]||17)*.53};},fillText(t){drawn.push(t);}},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const root=new THREE.Group(),head=new THREE.Object3D(),sprite=new THREE.Sprite(new THREE.SpriteMaterial());root.position.set(x,0,z);head.position.y=1.7;root.add(head);scene.add(root,sprite);
  const n={x,z,baseY:0,root,head,sprite,bctx:g,btex:new THREE.Texture(),bOff:.1};helper.register(n);n.talkT=helper.setText(n,text);return {n,drawn,g};
 }
 return {helper,userData,camera,scene,actor,width,height};
}
test('CSS pixel footprint stays constant at 2/20m and clamps offscreen heads at both viewport sizes',()=>{
 for(const [width,height] of [[390,844],[1440,900]]){
  const f=fixture(width,height),a=f.actor(0,-2);f.helper.update(f.camera);
  const first=a.n.sprite.scale.x/(-a.n.sprite.position.z)*height*f.camera.projectionMatrix.elements[5]/2;
  a.n.z=-20;a.n.root.position.z=-20;f.helper.update(f.camera);
  const second=a.n.sprite.scale.x/(-a.n.sprite.position.z)*height*f.camera.projectionMatrix.elements[5]/2;assert.ok(Math.abs(first-second)<1e-7);assert.ok(second<=width*.4);
  a.n.x=40;a.n.z=-1;a.n.root.position.set(40,0,-1);f.helper.update(f.camera); // farther than40 => intentionally asleep
  a.n.x=20;a.n.root.position.x=20;f.helper.update(f.camera);
  const center=a.n.sprite.position.clone().project(f.camera),cx=(center.x+1)*width/2,cy=(1-center.y)*height/2,px=Math.min(256,width*.4,height*.4);
  assert.ok(cx-px/2>=11.999);assert.ok(cx+px/2<=width-11.999);assert.ok(cy-px/2>=11.999);assert.ok(cy+px/2<=height-11.999);
  const font=Number(a.g.font.match(/([\d.]+)px/)[1]);assert.ok(font*px/256>=16);
 }
});
test('near speakers move beside the head and long lines paginate without reducing font or shortening lifetime',()=>{
 const out={};bubbleLayout(390,844,195,300,true,out);assert.notEqual(out.x,195);
 const text='Olha que lhe arrebentas a tromba, bro! Para lá com isso, #%&@!',f=fixture(),a=f.actor(0,-2,text),duration=a.n.talkT;
 assert.ok(duration>=bubbleDuration(text));assert.equal(bubbleDuration('12345'),2.1);
 for(let i=0;i<=600;i++){a.n.talkT=Math.max(.001,duration*(1-i/600));f.helper.update(f.camera);}
 assert.equal(a.drawn.join(' '),text);assert.ok(a.drawn.length>3);
});
test('only three nearest sprites; quiet/combat hide all, statues keep page and lifetime unchanged',()=>{
 const f=fixture(),actors=[f.actor(0,-8),f.actor(0,-3),f.actor(0,-6),f.actor(0,-2)];f.helper.update(f.camera);
 assert.equal(actors.filter(a=>a.n.sprite.visible).length,3);assert.equal(actors[0].n.sprite.visible,false);
 const remaining=actors.map(a=>a.n.talkT),paints=actors.map(a=>a.drawn.length);f.userData.npcStatues=true;for(let i=0;i<10;i++)f.helper.update(f.camera);
 assert.deepEqual(actors.map(a=>a.n.talkT),remaining);assert.deepEqual(actors.map(a=>a.drawn.length),paints);
 for(const flag of ['questQuiet','tramHallQuiet','combatState']){f.userData[flag]=flag==='combatState'?{active:true}:true;f.helper.update(f.camera);assert.ok(actors.every(a=>!a.n.sprite.visible));delete f.userData[flag];}
});
test('owner witness lines stay exact and every reaction shares the 600-second ledger',()=>{
 const exact=['assim já é demais!','Ai, que ele dá cabo do homem!','ganda sapa, bro! hihihihi!','eia, ca estúpidos!'];for(const s of exact)assert.ok(EXCESS_WITNESS_LINES.includes(s));
 let time=0;const memory=createComedyMemory({now:()=>time});for(const s of EXCESS_WITNESS_LINES){assert.equal(memory.commit(s),true);assert.equal(memory.commit(s),false);}time=599.9;for(const s of EXCESS_WITNESS_LINES)assert.equal(memory.canSpeak(s),false);time=600;for(const s of EXCESS_WITNESS_LINES)assert.equal(memory.canSpeak(s),true);
 // Drive actual escalation with a normal nearby witness, not an optional cast slot.
 time=0;const ud={},spoken=[],actors=['victim','witness'].map((id,i)=>({S:{name:id},x:i,z:-2,baseY:0,talkT:0,sillyT:-1,busy:false}));let engine;
 engine=createNpcComedy({scene:{userData:ud},audio:{muted:true},yieldBuild:()=>new Promise(()=>{})},{npcs:actors,data:{characters:{victim:{},witness:{}}},now:()=>time,startLaugh(){},say(n,text){if(engine.allow(n,text)){spoken.push(text);n.talkT=.1;return true;}return false;}});
 const frame={camera:{position:{x:0,y:1.62,z:0}}};engine.update(.1,frame);
 for(let cycle=0;cycle<5;cycle++){time+=13;for(let i=0;i<5;i++)engine.notify('slap',actors[0]);for(let i=0;i<12;i++){time+=.5;for(const n of actors)n.talkT=0;engine.update(.5,frame);}}
 assert.deepEqual(spoken,EXCESS_WITNESS_LINES);ud.combatState={active:true};engine.notify('slap',actors[0]);engine.update(.1,frame);assert.equal(spoken.length,8);engine.dispose();
});
