// Authored acceptance tests; Claude/integrator runs them, not the author.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createComedyMemory } from '../assets/gallery/npc-comedy.js';

function clockedMemory() {
  let seconds = 0;
  const memory = createComedyMemory({ now: () => seconds });
  return { memory, at(value) { seconds = value; } };
}

test('a spoken line is unavailable for 600 seconds across every situation', () => {
  const h = clockedMemory(), m = h.memory;
  assert.equal(m.canSpeak('A reunião fugiu.'), true);
  assert.equal(m.commit('A reunião fugiu.'), true);
  assert.equal(m.canSpeak('A reunião fugiu.'), false);
  h.at(599.999);
  assert.equal(m.canSpeak('A reunião fugiu.'), false);
  h.at(600);
  assert.equal(m.canSpeak('A reunião fugiu.'), true);
  assert.equal(m.commit('A reunião fugiu.'), true);
  h.at(1199.999);
  assert.equal(m.canSpeak('A reunião fugiu.'), false);
});

test('case, leading/trailing and repeated whitespace cannot evade the global ledger', () => {
  const { memory: m } = clockedMemory();
  assert.equal(m.commit('  A   reunião fugiu.  '), true);
  assert.equal(m.canSpeak('a reunião FUGIU.'), false);
  assert.equal(m.commit('a reunião fugiu.'), false);
  assert.equal(m.canSpeak('A ata ficou.'), true);
});

test('eligibility checks do not consume an unspoken line', () => {
  const { memory: m } = clockedMemory();
  for (let i = 0; i < 20; i++) assert.equal(m.canSpeak('Só vim buscar a cadeira.'), true);
  assert.equal(m.commit('Só vim buscar a cadeira.'), true);
  assert.equal(m.canSpeak('Só vim buscar a cadeira.'), false);
});

test('another speaker or scene cannot repeat a committed callback', () => {
  const h = clockedMemory(), m = h.memory;
  // The same ledger belongs to the whole cast, not to a character or category.
  m.remember('tio', 'talk');
  assert.equal(m.commit('A cadeira é que sabe.'), true);
  m.remember('critico', 'talk');
  assert.equal(m.canSpeak('A cadeira é que sabe.'), false);
  h.at(25); // a new duet may start; its old line still may not repeat
  assert.equal(m.canSpeak('A cadeira é que sabe.'), false);
  h.at(601);
  assert.equal(m.canSpeak('A cadeira é que sabe.'), true);
});

import { createNpcComedy } from '../assets/gallery/npc-comedy.js';

test('insistence and slap history belong to each actor; a pause resets only insistence', () => {
  const h = clockedMemory(), m = h.memory;
  assert.equal(m.remember('bull','talk').grau,1);
  h.at(1); assert.equal(m.remember('bull','talk').grau,2);
  h.at(2); assert.equal(m.remember('bull','talk').grau,3);
  assert.equal(m.get('cat').grau,1);
  h.at(22); assert.equal(m.remember('bull','talk').insistencia,1);
  assert.equal(m.get('bull').grau,1);
  for(let i=0;i<4;i++)m.remember('bull','slap');
  assert.equal(m.get('bull').chapadas,4);
  assert.equal(m.get('bull').grau,3);
  h.at(100); assert.equal(m.remember('bull','talk').grau,3);
  assert.equal(m.get('cat').chapadas,0);
});

test('choose skips exhausted text without consuming its replacement', () => {
  const {memory:m}=clockedMemory();
  const a={text:'A reunião foi embora.',score:4},b={text:'Ficou a cadeira a decidir.',score:4};
  m.commit(a.text);
  assert.equal(m.choose([a,b]),b);
  assert.equal(m.choose([a,b]),b);
  m.commit(b.text);
  assert.equal(m.choose([a,b]),null);
  assert.equal(m.canSpeak('  '),false);
});

function actor(id,x=0) {
  return {S:{name:id},x,z:0,baseY:0,busy:false,windT:0,pestT:0,sillyT:-1,talkT:0,
    arms:[{rotation:{z:0}},{rotation:{z:0}}],head:{rotation:{x:0}}};
}
function fixture(t,extra={}) {
  let seconds=100;
  const npcs=['bull','pig','cat','goat','pigeon'].map((id,i)=>actor(id,i));
  const spoken=[],laughs=[];
  const ctx={yieldBuild:()=>Promise.resolve(),scene:{userData:{}},audio:{muted:false},reducedMotion:true};
  const data={characters:Object.fromEntries(npcs.map(n=>[n.S.name,{}])),duets:[
    {id:'first',trigger:'approach',roles:['bull','pig'],lines:[
      {speaker:'bull',text:'A cadeira pediu a palavra.',score:4,pause:.6},
      {speaker:'pig',text:'A mesa apresentou recurso.',score:4,pause:.6}]},
    {id:'second',trigger:'run',roles:['bull','cat'],lines:[
      {speaker:'bull',text:'A ata saiu a correr.',score:4,pause:.6},
      {speaker:'cat',text:'Ao menos não levou o banco.',score:4,pause:.6}]}
  ],gags:[],...extra};
  // No browser or actual requests: even the lazy-loading path gets local data.
  t.mock.method(globalThis,'fetch',async()=>({ok:true,text:async()=>JSON.stringify({levels:{'1':{
    approach:[{text:'Trouxe uma cadeira de testemunha.',score:4}],
    photo:[{text:'Já recebi {chapadas} avisos.',score:4}]
  }}})}));
  let engine;
  engine=createNpcComedy(ctx,{npcs,data,now:()=>seconds,
    say(n,text){if(engine.allow(n,text)){spoken.push({id:n.S.name,text,time:seconds});n.talkT=.2;}},
    startLaugh(n){if(engine.allowLaugh(n))laughs.push(n.S.name);}
  });
  const frame={time:seconds,camera:{position:{x:0,y:1.62,z:0}}};
  function advance(duration=.1){const steps=Math.ceil(duration/.1);for(let i=0;i<steps;i++){
    const dt=Math.min(.1,duration-i*.1);seconds+=dt;frame.time=seconds;
    for(const n of npcs)n.talkT=Math.max(0,n.talkT-dt);
    engine.update(dt,frame);
  }}
  engine.update(0,frame);t.after(()=>engine.dispose());
  return {engine,npcs,ctx,spoken,laughs,frame,advance};
}

test('duet speech uses the global ledger and a second scene cannot start before 20 seconds', t=>{
  const h=fixture(t);h.engine.notify('talk',h.npcs[0]);h.advance(3);
  assert.deepEqual(h.spoken.map(e=>e.text),['A cadeira pediu a palavra.','A mesa apresentou recurso.']);
  assert.equal(h.engine.memory.canSpeak(h.spoken[0].text),false);
  h.engine.notify('run');h.advance(2);
  assert.equal(h.engine.debug.duets,1);
  h.advance(16);h.engine.notify('run');h.advance(3);
  assert.equal(h.engine.debug.duets,2);
  assert.equal(h.spoken.length,4);
});

test('quiet cancels a half-spoken scene permanently without consuming the unheard reply', t=>{
  const h=fixture(t);h.engine.notify('talk',h.npcs[0]);h.advance(.5);
  assert.equal(h.spoken.length,1);
  h.ctx.scene.userData.questQuiet=true;h.advance(1);
  assert.equal(h.engine.debug.active,false);
  h.engine.notify('run');h.ctx.scene.userData.lastGesture={name:'pirete',time:101};
  h.advance(1);h.ctx.scene.userData.questQuiet=false;h.advance(30);
  assert.equal(h.spoken.length,1);
  assert.equal(h.engine.memory.canSpeak('A mesa apresentou recurso.'),true);
});

test('leaving before the first beat cancels instead of delivering an out-of-context scene', t=>{
  const h=fixture(t);h.engine.notify('talk',h.npcs[0]);h.frame.camera.position.x=100;
  h.advance(1);h.frame.camera.position.x=0;h.advance(5);
  assert.equal(h.spoken.length,0);
  assert.equal(h.engine.debug.active,false);
});

test('domino laughter has at most three distinct observers and excludes the punchline speaker', t=>{
  const h=fixture(t);h.engine.notify('talk',h.npcs[0]);h.advance(5);
  assert.ok(h.laughs.length>=1);
  assert.ok(h.laughs.length<=3);
  assert.equal(new Set(h.laughs).size,h.laughs.length);
  assert.equal(h.laughs.includes('pig'),false,'the author must not lead laughter at its own punchline');
});

test('five slaps trigger one intervention per chain; quiet clears pending consequences', t=>{
  const h=fixture(t,{duets:[]});h.npcs[2].S.personality='onlooker';
  for(let i=0;i<5;i++){h.engine.notify('slap',h.npcs[0]);h.advance(.1);}
  h.advance(3);
  const first='Olha que lhe arrebentas a tromba, bro! Para lá com isso, #%&@!';
  assert.equal(h.spoken.filter(e=>e.text===first).length,1);
  assert.equal(h.spoken.filter(e=>e.text==='Eh, calma, Zé!').length,1);
  for(let i=0;i<5;i++)h.engine.notify('slap',h.npcs[0]);h.advance(3);
  assert.equal(h.spoken.filter(e=>e.text===first).length,1);
  h.ctx.scene.userData.questQuiet=true;h.advance(.1);
  assert.equal(h.npcs[0].comedyPuddle,0);
  h.ctx.scene.userData.questQuiet=false;h.advance(10);
  assert.equal(h.spoken.filter(e=>e.text===first).length,1);
});

test('a changed memory placeholder cannot recycle a callback before 600 seconds', async t=>{
  const h=fixture(t,{duets:[]});
  await new Promise(resolve=>setImmediate(resolve)); // settle mocked lazy JSON
  const n=h.npcs[0],first=h.engine.line(n,'photo');
  assert.equal(first,'Já recebi 0 avisos.');
  assert.equal(h.engine.allow(n,first),true);
  h.engine.memory.remember('bull','slap');
  assert.equal(h.engine.line(n,'photo'),'');
  h.advance(601);
  const next=h.engine.line(n,'photo');
  assert.equal(next,'Já recebi 1 avisos.');
  assert.equal(h.engine.allow(n,next),true);
});
