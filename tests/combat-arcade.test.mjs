import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {buildCharacter} from '../assets/gallery/npc-models.js';
import {createCombat,chooseMove,chooseString,MOVES} from '../assets/gallery/combat.js';
import {STRINGS,LAUNCHER,launcherOf,findContinuation,tripleRun,comboScale,hitstunOf,juggleHit,stepAir,liftOff,
  BUFFER,JUGGLE_MAX,JUGGLE_CEILING,GRAVITY,LAUNCH_V,KO_SLOW,KO_TIME_SCALE,THROW_POWER,tauntOf,nameOf} from '../assets/gallery/combat-arcade.js';
const M={boxUV};
const seeded=(seed=1)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;

// The same fake DOM as combat-polish.test.mjs: elements, styles, attributes, window key listeners.
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
function driver({dom=false,opponent=[0,-1.45],fixed=true,obstacles=[],reducedMotion=false,random=()=>.9,name='actor0'}={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.62,0);camera.lookAt(opponent[0],1.62,opponent[1]);
  const actors=[];for(let i=0;i<7;i++){const rig=buildCharacter(THREE,M,{quality:'low'}),root=new THREE.Group();root.rotation.order='YXZ';root.add(rig.mesh);scene.add(root);const x=i===0?opponent[0]:8+i,z=i===0?opponent[1]:0;
    actors.push({S:{name:i===0?name:'actor'+i},rig,root,body:rig.bones.body,head:rig.bones.head,arms:rig.bones.arms,legs:rig.bones.legs,x,z,baseY:0,yaw:0,colW:.35,colH:2,sillyT:-1,windT:0,pestT:0,hatState:0,fixed:i===0&&fixed,hit:new THREE.Object3D(),col:{minX:x-.35,maxX:x+.35,minZ:z-.35,maxZ:z+.35,minY:0,maxY:2}});}
  const world={regions:[{minX:-30,maxX:30,minZ:-30,maxZ:30,y:0}],colliders:[...actors.map(a=>a.col),...obstacles]};
  const position=new THREE.Vector3(0,1.62,0);
  const controls={floor:0,airborne:false,readPosition(o){Object.assign(o,position);},releaseCombatKeys(){},combatMove(dx,dz){position.x+=dx;position.z+=dz;},combatJump(){}};
  const toasts=[],workshop=[],events=new EventTarget();events.addEventListener('workshop',e=>workshop.push(e.detail));
  const ctx={THREE,scene,M,quality:'low',audio:{muted:true},reducedMotion,events,ui:{toast(text){toasts.push(text);}}};
  const fake=dom?fakeDom():null,saved={document:globalThis.document,window:globalThis.window};
  if(fake){globalThis.document=fake.document;globalThis.window=fake.window;}
  let combat;try{combat=createCombat(ctx,{camera,controls,world,random,npcModule:{combatActors:actors,findActor:o=>actors.find(a=>a.hit===o)}});}
  finally{if(fake){globalThis.document=saved.document;globalThis.window=saved.window;}}
  const log=[];let serial=0;
  const drain=()=>{while(serial<combat.events.serial){const e=combat.events.entries[serial%16];serial++;log.push({...e});}};
  const step=(dt=1/60,frames=1,each)=>{for(let i=0;i<frames&&combat.state.active;i++){each?.(i);combat.update(dt);drain();}};
  const start=()=>{assert.equal(combat.engage(actors[0].hit,{explicit:true}),true);drain();};
  const find=(cls)=>fake&&[...fake.body.children].flatMap(function all(n){return [n,...n.children.flatMap(all)];}).find(n=>String(n.className).split(' ').includes(cls));
  const panelTags=()=>fake.body.children.find(n=>n.className==='combat-panel').children.filter(n=>String(n.className).startsWith('combat-tag'));
  return {combat,actors,position,controls,world,toasts,workshop,log,drain,step,start,find,panelTags,key:(type,code,init={})=>fake.window.dispatch(type,{code,...init})};
}
const impacts=(d,by='visitor')=>d.log.filter(e=>e.type==='impact'&&(!by||e.by===by));
// The constant random value that makes chooseMove pick `move` at 1.45 m first (with `special`).
function pickFor(move,special=-1){for(let v=.5;v<1;v+=.0005)if(chooseMove(1.45,-1,0,special,()=>v)===move)return ()=>v;throw new Error('no random value picks '+move);}

test('the string tables: three or more strings for everyone, signatures only for their owner, one launcher each',()=>{
  const owners=['visitor','actor0','forcado','velho','gordo','mano','urso_treino','porco_fato'];
  for(const owner of owners){const mine=STRINGS.filter(s=>!s.owner||s.owner===owner);assert.ok(mine.length>=3,owner);
    for(const s of mine){assert.equal(s.keys.length,s.moves.length,s.id);assert.ok(s.moves.length>=2&&s.moves.length<=3,s.id);assert.ok(!tripleRun(s.moves),s.id);
      for(const m of s.moves)assert.ok(m>=0&&m<MOVES.length,s.id);}}
  assert.equal(new Set(STRINGS.map(s=>s.id)).size,STRINGS.length);
  // The owner's examples: Q,Q,Z chapada-chapada-rasteira, Q,C sanduíche no ar, Z,Z,F.
  const path=new Int8Array(4);path[0]=0;assert.equal(STRINGS[findContinuation('visitor',path,1,'Q')].moves[1],0);
  path[1]=0;assert.equal(STRINGS[findContinuation('visitor',path,2,'Z')].moves[2],7);
  assert.equal(STRINGS[findContinuation('visitor',path,1,'C')].moves[1],2);assert.equal(launcherOf('visitor'),2);
  path[0]=7;assert.equal(STRINGS[findContinuation('visitor',path,1,'Z')].moves[1],6);path[1]=6;assert.equal(STRINGS[findContinuation('visitor',path,2,'F')].moves[2],9);
  path[0]=0;path[1]=0;assert.equal(findContinuation('visitor',path,2,'C'),-1,'the pega de caras is the forcado\'s');assert.equal(STRINGS[findContinuation('forcado',path,2,'C')].moves[2],11);
  assert.equal(findContinuation('visitor',path,0,'Q'),-1,'nothing to continue from neutral');
  for(const [owner,move] of Object.entries(LAUNCHER))assert.equal(launcherOf(owner),move);
  // Hitstun: every string combos on a clean hit; the same blow pressed again after recovery never loops.
  for(const s of STRINGS)for(let i=1;i<s.moves.length;i++){const prev=MOVES[s.moves[i-1]],next=MOVES[s.moves[i]];if(prev.pose==='sweepLeg'||s.moves[i-1]===launcherOf(s.owner||'visitor')||next.index===11)continue;
    assert.ok(hitstunOf(prev)>.07+next.windup,`${s.id}: ${prev.id} -> ${next.id}`);}
  const quickest=Math.min(...MOVES.map(m=>m.windup));for(const m of MOVES)assert.ok(hitstunOf(m)<m.duration-m.windup+quickest,m.id);
  assert.equal(comboScale(1),1);assert.ok(comboScale(3)<comboScale(2));assert.equal(comboScale(40),.4);
});

test('a string chains on a clean hit inside its window, the same at 60, 30 and 20 fps',()=>{
  for(const fps of [60,30,20]){
    const d=driver();d.start();const dt=1/fps;let frame=0;d.combat.press('Q',0);
    d.step(dt,Math.round(1.6*fps),()=>{const t=frame++*dt;if(Math.abs(t-.1)<dt/2)d.combat.press('Q',0);if(Math.abs(t-.33)<dt/2)d.combat.press('Z',7);});
    const hits=impacts(d);assert.deepEqual(hits.map(e=>e.move),['chapada','chapada','rasteira'],fps+' fps');
    assert.deepEqual(hits.map(e=>e.combo),[1,2,3],fps+' fps: a true combo');assert.deepEqual(hits.map(e=>e.step),[1,2,3]);
    // Chained on hit: the second chapada lands well before a chapada pressed after the first one ends would.
    assert.ok(hits[1].time-hits[0].time<.33,fps+' fps: cancelled into the second blow');
    d.combat.dispose();
  }
});

test('input buffer: a key up to 0.25 s early still comes out, earlier it is dropped; the wrong key never chains',()=>{
  // Z, Z at once: the rasteira's window opens 0.31 s later, past the buffer. One blow only.
  let d=driver();d.start();d.combat.press('Z',7);d.combat.press('Z',7);d.step(1/60,90);
  assert.deepEqual(impacts(d).map(e=>e.move),['rasteira']);d.combat.dispose();
  // Z, then Z 0.1 s later: buffered into the pisadela, which reaches the tripped body.
  d=driver();d.start();d.combat.press('Z',7);d.step(1/60,6);d.combat.press('Z',7);d.step(1/60,90);
  assert.deepEqual(impacts(d).map(e=>e.move+e.step),['rasteira1','pisadela2']);d.combat.dispose();
  assert.equal(BUFFER,.25);
  // Q then F: no visitor string goes chapada-chinelada, so F waits for the chapada to end (a fresh blow).
  d=driver();d.start();d.combat.press('Q',0);d.step(1/60,8);d.combat.press('F',9);d.step(1/60,60);
  const hits=impacts(d);assert.deepEqual(hits.map(e=>e.move+e.step),['chapada1','chinelada1']);d.combat.dispose();
});

test('a blow pressed from just out of reach steps in first, through the collision; farther it just swings',()=>{
  const d=driver({opponent:[0,-1.45]});d.start();d.position.z=.6;d.combat.update(1/60);d.combat.press('Q',0);
  assert.ok(near(Math.hypot(d.position.x,d.position.z+1.45),1.7,1e-6),'stepped in to 1.7 m');d.step(1/60,30);assert.equal(impacts(d).length,1);d.combat.dispose();
  const far=driver({opponent:[0,-1.45]});far.start();far.position.z=1.4;far.combat.update(1/60);far.combat.press('Q',0);assert.ok(near(far.position.z,1.4,1e-9),'2.85 m: no step');
  far.step(1/60,30);assert.equal(impacts(far).length,0);far.combat.dispose();
});

test('counter-hit: caught in the wind-up, a blow says CONTRA!, does 40% more and holds the hit-stop longer',()=>{
  for(const reducedMotion of [false,true]){
    const d=driver({dom:true,random:pickFor(7),reducedMotion});d.start();let pressed=false,stop=-1;
    d.step(1/60,240,()=>{const b=d.combat.inspect('b');if(!pressed&&b.move==='rasteira'&&b.t<.05){pressed=true;d.combat.press('Q',0);}
      if(pressed&&stop<0&&d.log.some(e=>e.type==='counter'))stop=d.combat.inspect('b').hitstop;});
    const counter=d.log.find(e=>e.type==='counter'),hit=impacts(d)[0];assert.ok(counter,'counter event');
    assert.equal(hit.move,'chapada');assert.equal(hit.counter,true);assert.equal(Math.round(hit.intensity*25),Math.round(12*1.4));
    assert.equal(d.combat.inspect('b').move,'','the rasteira was interrupted');
    if(reducedMotion)assert.equal(stop,0,'no hit-stop with reduced motion');else assert.ok(near(stop,.13,1e-9),'hit-stop '+stop);
    assert.equal(d.find('combat-call').textContent,'CONTRA!');assert.deepEqual(d.toasts,[]);d.combat.dispose();
  }
  // A plain hit: 12 and the usual 60 ms.
  const d=driver();d.start();d.combat.press('Q',0);let stop=-1;d.step(1/60,30,()=>{if(stop<0&&impacts(d).length)stop=d.combat.inspect('b').hitstop;});
  assert.equal(impacts(d)[0].counter,false);assert.equal(Math.round(impacts(d)[0].intensity*25),12);assert.ok(near(stop,.06,1e-9));d.combat.dispose();
});

test('the launcher sends the opponent up about 0.8 s and 0.9 m, and the first landing bounces once',()=>{
  const d=driver();d.start();d.combat.press('Q',2);let up=-1,landed=-1,top=0;
  d.step(1/60,150,()=>{const b=d.combat.inspect('b');top=Math.max(top,b.air);if(up<0&&b.airborne)up=b.fightTime;if(up>=0&&landed<0&&d.log.some(e=>e.type==='bounce'))landed=b.fightTime;});
  assert.ok(d.log.some(e=>e.type==='launch'),'launch event');assert.ok(near(landed-up,2*LAUNCH_V/GRAVITY,.05),'air time '+(landed-up));
  assert.ok(near(top,LAUNCH_V*LAUNCH_V/(2*GRAVITY),.03),'apex '+top);assert.equal(d.log.filter(e=>e.type==='bounce').length,1);
  d.step(1/60,90);const b=d.combat.inspect('b');assert.ok(b.down>0||b.rise>0||!b.airborne,'down after the second landing');d.combat.dispose();
});

test('juggle: hits keep the body up under a ceiling, gravity grows with each, and every juggle comes down',()=>{
  // Pure: a body hit at every apex still lands, and sooner each time.
  const r={air:0,airV:0,airborne:false,juggles:0,stun:0};liftOff(r,LAUNCH_V);let t=0,pops=0,last=0;const flights=[];
  while(r.airborne&&t<10){if(r.airV<=0&&pops<12){juggleHit(r);pops++;flights.push(t-last);last=t;}if(stepAir(r,1/120)){r.airborne=false;}t+=1/120;assert.ok(r.air<=JUGGLE_CEILING+.02,'ceiling '+r.air);}
  assert.ok(t<4,'came down after '+t.toFixed(2)+' s');assert.ok(r.juggles>JUGGLE_MAX);
  for(let i=2;i<flights.length;i++)assert.ok(flights[i]<=flights[i-1]+1e-9,'each pop shorter');
  // In a fight: Q, C (sanduíche no ar), then mashing Q. The combo grows, the body stays under the ceiling and lands.
  const d=driver({dom:true});d.start();d.combat.press('Q',0);let top=0,frame=0,shown=0,shout='';
  d.step(1/60,300,()=>{const f=frame++;if(f===6)d.combat.press('C',11);if(f>30&&f%9===0)d.combat.press('Q',0);top=Math.max(top,d.combat.inspect('b').air);
    const combo=d.find('combat-combo');if(combo&&!combo.className.includes('is-foe')){const n=parseInt(combo.children[0].textContent,10)||0;if(n>shown){shown=n;shout=combo.children[1].textContent;}}});
  const hits=impacts(d);assert.ok(hits.some(e=>e.move==='sanduiche'&&e.combo===2),'the launcher is the second hit');
  assert.ok(Math.max(...hits.map(e=>e.combo))>=5,'juggled: '+hits.map(e=>e.combo).join());assert.ok(top<=JUGGLE_CEILING+.02,'top '+top);
  const b=d.combat.inspect('b');assert.equal(b.airborne,false,'down again despite the mashing');
  // Damage falls off along the combo.
  const late=hits.filter(e=>e.combo>=4&&e.move==='chapada');assert.ok(late.every(e=>e.intensity*25<12*.8),'scaled');
  assert.equal(shown,Math.max(...hits.map(e=>e.combo)),'the counter showed the whole combo');assert.ok(shout.startsWith('SAPAS'),shout);
  d.combat.dispose();
});

test('a juggle that comes down by a wall splats on it; on open ground it bounces',()=>{
  const wall={minX:-2,maxX:2,minZ:-2.2,maxZ:-2,minY:0,maxY:2.6};
  const d=driver({obstacles:[wall]});d.start();d.combat.press('Q',2);d.step(1/60,120);
  assert.ok(d.log.some(e=>e.type==='wallSplat'),'splat');assert.ok(!d.log.some(e=>e.type==='bounce'),'no bounce at the wall');d.combat.dispose();
  const o=driver();o.start();o.combat.press('Q',2);o.step(1/60,120);assert.ok(o.log.some(e=>e.type==='bounce'));assert.ok(!o.log.some(e=>e.type==='wallSplat'));o.combat.dispose();
});

test('the bear hug grabs through a guard, slams for 24 unless C breaks it in time; a wrong key wastes the try; a jump escapes',()=>{
  const forcado=pickFor(11,11);
  for(const mode of ['none','break','wrong','late','jump']){
    const d=driver({name:'forcado',random:forcado,dom:true});d.start();d.combat.block(true);let grabbedAt=-1,frame=0,brioAfter=-1;
    d.step(1/60,240,()=>{const f=frame++,a=d.combat.inspect('a'),b=d.combat.inspect('b');if(brioAfter<0&&d.log.some(e=>e.type==='throw'||e.type==='throwBreak'))brioAfter=d.combat.getBrio();
      if(mode==='jump')d.controls.airborne=b.move==='abraco';
      if(a.grab===2&&grabbedAt<0)grabbedAt=f;
      if(grabbedAt>=0&&f===grabbedAt+12){if(mode==='break')d.combat.press('C',11);if(mode==='wrong'){d.combat.press('Q',0);d.combat.press('C',11);}}
      if(grabbedAt>=0&&f===grabbedAt+40&&mode==='late')d.combat.press('C',11);});
    const types=d.log.map(e=>e.type);
    if(mode==='jump'){assert.ok(!types.includes('grab'),'a jump escapes the hug');d.combat.dispose();continue;}
    assert.ok(types.includes('grab'),mode+': grabbed although guarding');
    if(mode==='break'){assert.ok(types.includes('throwBreak'));assert.equal(brioAfter,100);assert.equal(d.find('combat-call').textContent,'SOLTOU-SE!');}
    else{assert.ok(types.includes('throw'),mode);const slam=impacts(d,'forcado').find(e=>e.move==='abraco');assert.equal(Math.round(slam.intensity*25),THROW_POWER);assert.equal(brioAfter,100-THROW_POWER);}
    d.combat.dispose();
  }
  // The visitor's hug: grabbed in reach, missed out of it; the opponent breaks some (AI_BREAK).
  let d=driver({random:()=>.9});d.start();d.combat.press('C',11);d.step(1/60,90);assert.ok(d.log.some(e=>e.type==='throw'));assert.equal(d.combat.inspect('b').pride,100-THROW_POWER);d.combat.dispose();
  d=driver({random:()=>.1});d.start();d.combat.press('C',11);d.step(1/60,90);assert.ok(d.log.some(e=>e.type==='throwBreak'),'the opponent broke it');assert.equal(d.combat.inspect('b').pride,100);d.combat.dispose();
  d=driver({opponent:[0,-1.75]});d.start();d.combat.press('C',11);d.step(1/60,90);assert.ok(!d.log.some(e=>e.type==='grab'),'out of reach');d.combat.dispose();
});

test('best of three: BRIO back to full each round, round and ko events, the deciding K.O. ends the match',()=>{
  const d=driver({dom:true,fixed:false,random:seeded(7)});d.start();const brioAtRound=[];let frame=0;
  d.step(1/60,60*120,()=>{const f=frame++,round=d.combat.state.round;
    if(round===1&&!d.combat.state.ko)d.combat.setBrio(Math.min(d.combat.getBrio(),5));
    else if(round>=2){d.combat.setBrio(100);if(f%8===0)d.combat.press('Q',0);}});
  const rounds=d.log.filter(e=>e.type==='round'),kos=d.log.filter(e=>e.type==='ko');
  assert.deepEqual(rounds.map(e=>[e.round,e.final]),[[1,false],[2,false],[3,true]]);
  assert.deepEqual(kos.map(e=>[e.round,e.winner,e.final]),[[1,'actor0',false],[2,'visitor',false],[3,'visitor',true]]);
  assert.equal(d.log.filter(e=>e.type==='knockout').length,1,'one knockout: the deciding one');
  const ended=d.log.find(e=>e.type==='fightEnded');assert.equal(ended.intensity,1);assert.equal(d.combat.state.active,false);
  const order=d.log.map(e=>e.type).filter(t=>['ko','knockout','fightEnded'].includes(t));assert.deepEqual(order.slice(-3),['ko','knockout','fightEnded']);
  const wins=d.workshop.filter(e=>e.type==='porrada-win');assert.equal(wins.length,1);assert.equal(d.workshop.filter(e=>e.type==='porrada-loss').length,0);
  // The K.O. line and the pips.
  const [tagA,tagB]=d.panelTags();assert.equal(tagA.textContent,'Tu');assert.equal(tagB.textContent,nameOf('actor0'));
  assert.equal(tagA.attributes['data-wins'],'2');assert.equal(tagB.attributes['data-wins'],'1');assert.deepEqual(d.toasts,[]);
  d.combat.dispose();
  // BRIO resets at each round start.
  const r=driver({fixed:false,random:seeded(3)});r.start();let seen=0;
  r.step(1/60,60*60,()=>{r.combat.setBrio(100);r.combat.press('Q',0);const n=r.log.filter(e=>e.type==='round').length;if(n===2&&!seen){seen=1;assert.equal(r.combat.inspect('b').pride,100);assert.equal(r.combat.inspect('a').wins,1);}});
  assert.equal(seen,1);r.combat.dispose();
});

test('the K.O.: 0.6 s at 30% (none with reduced motion), K.O.! on screen, then the winner poses and has the last word',()=>{
  for(const reducedMotion of [false,true]){
    const d=driver({dom:true,fixed:false,random:seeded(4),reducedMotion});d.start();let koAt=-1,slow=0,won=false,frame=0;
    d.step(1/60,60*40,()=>{const f=frame++;d.combat.setBrio(100);if(koAt<0){if(f%8===0)d.combat.press('Q',0);if(d.combat.state.ko)koAt=f;}
      else if(f<koAt+150){if(d.combat.inspect('a').timeScale<1)slow++;if(d.combat.inspect('a').won)won=true;}});
    assert.ok(koAt>0);
    if(reducedMotion)assert.equal(slow,0);else{assert.ok(Math.abs(slow-KO_SLOW*60)<=2,'slow frames '+slow);}
    assert.equal(KO_TIME_SCALE,.3);assert.ok(won,'victory pose');
    const line=d.find('combat-line');assert.ok(line.textContent.startsWith('Tu: «'),line.textContent);
    d.combat.dispose();
  }
  // The deciding K.O. call and the winner's taunt from the list; swearing bleeped.
  for(const id of ['visitor','forcado','mano','other','pig'])for(let i=0;i<4;i++){const line=tauntOf(id,i);assert.ok(line.length>8);assert.ok(!/merda|caralho|foda|crl/i.test(line),line);}
  assert.equal(tauntOf('forcado',0),'Limites? Quem tem limite é o cartão de crédito, hahahah!');
});

test('the opponent uses strings (its signature too), still never three alike, and juggles after its launcher',()=>{
  // Pure choice: owner-only signatures, no third repeat, the signature about a quarter of the strings.
  const random=seeded(9);let signature=0;
  for(let i=0;i<3000;i++){const s=chooseString(1.45,0,2,'forcado',random);assert.ok(s>=0);assert.ok(!STRINGS[s].owner||STRINGS[s].owner==='forcado');assert.notEqual(STRINGS[s].moves[0],0,'a third chapada');if(STRINGS[s].owner)signature++;}
  for(let i=0;i<500;i++){const s=chooseString(1.45,-1,0,'visitor',random);assert.equal(STRINGS[s].owner,'');}
  let share=0;for(let i=0;i<3000;i++)if(STRINGS[chooseString(1.45,-1,0,'forcado',random)].owner)share++;share/=3000;assert.ok(share>.18&&share<.32,'signature share '+share);
  // In a fight: the forcado against a visitor who never answers.
  const d=driver({name:'forcado',fixed:false,random:seeded(5)});d.start();const strings=new Set();
  d.step(1/30,1800,()=>{d.combat.setBrio(100);const s=d.combat.inspect('b').string;if(s)strings.add(s);});
  const blows=impacts(d,'forcado');assert.ok(blows.filter(e=>e.step>=2).length>=10,'string blows: '+blows.filter(e=>e.step>=2).length);
  assert.ok(strings.has('pega-de-caras'),'signature: '+[...strings].join());assert.ok(strings.size>=3,[...strings].join());
  for(let i=2;i<blows.length;i++)assert.ok(!(blows[i].move===blows[i-1].move&&blows[i].move===blows[i-2].move),blows.map(e=>e.move).join(' '));
  assert.ok(d.log.some(e=>e.type==='launch'),'it launched');
  const launch=d.log.findIndex(e=>e.type==='launch');assert.ok(d.log.slice(launch+1,launch+6).some(e=>e.type==='impact'&&e.combo>=3),'and juggled');
  d.combat.dispose();
});

test('the arcade layer only lives during a visitor fight, and the hug button shows the way out',()=>{
  const d=driver({dom:true,name:'forcado',random:pickFor(11,11)});const layer=d.find('combat-fx');assert.equal(layer.hidden,true);
  for(let i=0;i<30;i++)d.combat.update(1/60);assert.equal(layer.hidden,true);assert.equal(d.combat.events.serial,0,'no fight, no events');
  const buttons=d.find('combat-actions').children.map(b=>b.attributes['aria-label']);
  for(const label of ['Chapada','Revés','Rasteira','Chinelada','Abraço de urso: agarrar, ou soltar-te','Defender','Esquivar','Saltar'])assert.ok(buttons.includes(label),label);
  d.start();d.combat.update(1/60);assert.equal(layer.hidden,false);assert.equal(d.find('combat-call').textContent,'RONDA 1');
  const hug=d.find('combat-actions').children.find(b=>b.attributes['aria-label'].startsWith('Abraço'));let held=false;
  d.step(1/60,200,()=>{if(d.combat.inspect('a').grab===2&&hug.className==='is-break')held=true;});assert.ok(held,'the hug button glows while held');
  assert.equal(hug.className,'');d.combat.end('exit');d.combat.update(1/60);assert.equal(layer.hidden,true);
  d.combat.dispose();assert.equal(layer.removed,true);
});
