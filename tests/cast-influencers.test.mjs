import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {boxUV} from '../assets/gallery/materials.js';
import {buildCharacter,createNpcEffects} from '../assets/gallery/npc-models.js';
import {createNpcComedy} from '../assets/gallery/npc-comedy.js';
import {createReadableBubbles} from '../assets/gallery/readable-bubbles.js';

const read=p=>fs.readFileSync(new URL('../assets/'+p,import.meta.url),'utf8');
const cast=JSON.parse(read('data/npc-cast.json')),comedy=JSON.parse(read('data/npc-comedy.json')),manifest=JSON.parse(read('data/cast/manifest.json'));
const pools=id=>JSON.parse(read('data/comedy/'+id+'.json'));
const texts=list=>(list||[]).map(e=>typeof e==='string'?e:e.text);
const INFLUENCERS=['tremoco_vegan','coach_madrugada','apanhados','tia_stories'];
const OWNER={mano:['Isto já não é o que era, ai egrégios avós!','Olha, olha aquela gente... Não são de cá... Hmmm.'],
  forcado:['Limites? Quem tem limite é o cartão de crédito, hahahah!']};
// The commuters wait at the campus stop and ride the tram to the market and the Marginal.
const COMMUTERS={tortoise:0,raccoon:1,cat:2,walrus:3};
function placesOf(id){
  if(id in COMMUTERS){const b=COMMUTERS[id];return [[83.4+(b%2)*.45,28.45+Math.floor(b/2)*1.1],[115,37],[32,81]];}
  const slot=manifest.slots.find(s=>s.defaultId===id);return slot?[slot.home]:[];
}

test('four new influencers: cast entries, split files, comedy files and slots of their own',()=>{
  const M={get:()=>new THREE.MeshStandardMaterial(),boxUV};
  for(const id of INFLUENCERS){
    const c=cast.characters.find(c=>c.id===id);assert.ok(c,id);
    assert.equal(c.legacy,false);assert.equal(c.enabledByDefault,true);assert.ok(c.displayName&&c.humanMoment);
    // Existing rig kinds and wardrobes only (one cheap opt-in prop, the ring light).
    assert.ok(['human','velho','mano','chubby','forcado','pig','bear','cat','goat'].includes(c.model.head),id+' head');
    assert.ok(['influencer','tracksuit','neighbor','tourist'].includes(c.model.clothing),id+' wardrobe');
    const rig=buildCharacter(THREE,M,{...c.model,quality:'high'});assert.ok(rig.triangles<=15000);rig.dispose();
    assert.ok(c.lines.talk.length>=10,id+' talks');assert.ok(c.lines.fight.length>=2,id+' answers a fight');
    // The split cast file is the generated copy of the entry, and the manifest knows it.
    const text=read('data/cast/'+id+'.json'),entry=manifest.characters.find(e=>e.id===id);
    assert.deepEqual(JSON.parse(text),c);assert.ok(entry);assert.equal(entry.sha256,createHash('sha256').update(text).digest('hex'));
    const slot=manifest.slots.find(s=>s.defaultId===id);assert.ok(slot&&slot.slot>=14,id+' slot');
    const d=comedy.characters[id];assert.ok(d&&d.url==='./comedy/'+id+'.json'&&d.signature.score>=4&&d.voice);
    assert.ok(Buffer.byteLength(read('data/comedy/'+id+'.json'))<=comedy.policy.maxCharacterBytes);
  }
  assert.equal(manifest.slots.length,18);assert.equal(manifest.metadata.maxActive,18);assert.equal(comedy.policy.maxActive,18);
  assert.ok(manifest.metadata.maxActive<=18,'the streaming cap never goes past eighteen');
});

test('each influencer has ten-plus lines of talk, slap reactions at every level and a fight answer',()=>{
  for(const id of INFLUENCERS){
    const p=pools(id),L=p.levels,all=new Set();assert.equal(p.id,id);
    assert.ok(texts(L['1'].approach).length>=10,id+' approach');
    for(const level of ['1','2','3'])for(const event of ['approach','repeat_talk','ignored','slap1','slap2','slap3','witness','run','fight'])
      assert.ok(texts(L[level][event]).length>=1,`${id} ${event} at level ${level}`);
    for(const event of comedy.events)assert.ok(texts(L['1'][event]).length>=1,`${id} ${event}`);
    for(const level of Object.values(L))for(const list of Object.values(level))for(const e of list){
      assert.ok(e.score>=4);assert.ok(!all.has(e.text),'repeated line '+e.text);all.add(e.text);
      assert.ok(!/\b(merda|caralho|foda|puta|crl)\b/i.test(e.text),'swearing is bleeped: '+e.text);
    }
  }
  for(const reaction of ['Isto vai para os stories!','Deixa like antes de bater!'])
    assert.ok(INFLUENCERS.some(id=>texts(pools(id).levels['1'].slap1).includes(reaction)),reaction);
});

test('at least six overheard scenes star an influencer, and every one can actually be overheard',()=>{
  const scenes=[...comedy.duets,...comedy.gags],ids=new Set(scenes.map(s=>s.id));
  assert.equal(ids.size,scenes.length,'scene ids are unique');
  const starring=scenes.filter(s=>s.roles.some(r=>INFLUENCERS.includes(r)));
  assert.ok(starring.length>=6,'scenes with influencers: '+starring.length);
  assert.ok(starring.filter(s=>s.roles.some(r=>!INFLUENCERS.includes(r))).length>=4,'with the old cast too');
  assert.ok(starring.some(s=>s.roles.filter(r=>INFLUENCERS.includes(r)).length>=2),'influencers between themselves');
  for(const s of scenes.filter(s=>/^i\d\d_/.test(s.id))){
    const lines=s.lines||s.beats;assert.ok(lines.length>=2&&lines.length<=8,s.id);assert.ok(comedy.events.includes(s.trigger),s.id+' trigger');
    assert.ok(s.roles.length<=comedy.policy.maxSceneSpeakers);
    for(const b of lines){assert.ok(s.roles.includes(b.speaker),s.id+' speaker '+b.speaker);assert.ok(b.score>=4&&b.pause>=.4&&b.pause<=.8);
      assert.ok(comedy.deliveryValues.includes(b.delivery));assert.ok(comedy.characters[b.speaker],b.speaker);assert.ok(!comedy.protectedLineContext[b.text]);}
    // A scene starts only with every role within 12 m of the visitor: some choice of their places
    // (a commuter may be at the stop or in the tram at the market) has a point 11 m from all of them.
    const choices=s.roles.map(placesOf);assert.ok(choices.every(c=>c.length),s.id+' roles have places');
    const meet=(rest,picked)=>{if(!rest.length){const cx=picked.reduce((a,p)=>a+p[0],0)/picked.length,cz=picked.reduce((a,p)=>a+p[1],0)/picked.length;return picked.every(p=>Math.hypot(p[0]-cx,p[1]-cz)<=11);}
      return rest[0].some(p=>meet(rest.slice(1),[...picked,p]));};
    assert.ok(meet(choices,[]),s.id+' roles never meet');
  }
});

test("the owner's lines are word for word on the moustache with MB Way and the forcado, at the front of their talk",()=>{
  for(const [id,lines] of Object.entries(OWNER)){
    const approach=texts(pools(id).levels['1'].approach),talk=cast.characters.find(c=>c.id===id).lines.talk;
    for(const line of lines){
      assert.ok(approach.indexOf(line)>=0&&approach.indexOf(line)<=2,id+' says it early: '+line);
      assert.ok(talk.includes(line));assert.ok(cast.protectedLines.includes(line));assert.ok(comedy.protectedLines.includes(line));
    }
  }
  assert.ok(comedy.duets.some(s=>s.roles.includes('mano')&&OWNER.mano.every(l=>s.lines.some(b=>b.speaker==='mano'&&b.text===l))));
  assert.ok(comedy.gags.some(s=>s.roles[0]==='forcado'&&s.beats.some(b=>b.text===OWNER.forcado[0])));
  const source=read('gallery/spaces/npcs.js');for(const line of [...OWNER.mano,...OWNER.forcado])assert.ok(source.includes(line));
});

function fixtureComedy(t,ids){
  let seconds=100;
  const npcs=ids.map((id,i)=>({S:{name:id},x:i,z:0,baseY:0,busy:false,windT:0,pestT:0,sillyT:-1,sillyType:0,talkT:0,
    arms:[{rotation:{z:0}},{rotation:{z:0}}],head:{rotation:{x:0}}}));
  const spoken=[],ctx={yieldBuild:()=>Promise.resolve(),scene:{userData:{}},audio:{muted:true},reducedMotion:true};
  t.mock.method(globalThis,'fetch',async url=>{const id=String(url).split('/').pop();return {ok:true,text:async()=>read('data/comedy/'+id)};});
  let engine;
  engine=createNpcComedy(ctx,{npcs,data:comedy,now:()=>seconds,say(n,text){if(engine.allow(n,text)){spoken.push({id:n.S.name,text});n.talkT=.3;return true;}return false;},startLaugh(){}});
  const frame={camera:{position:{x:0,y:1.62,z:0}}};
  async function advance(duration){for(let i=0;i<Math.ceil(duration/.1);i++){seconds+=.1;for(const n of npcs){n.talkT=Math.max(0,n.talkT-.1);if(n.sillyT>=0){n.sillyT+=.1;if(n.sillyT>=1)n.sillyT=-1;}}engine.update(.1,frame);await new Promise(r=>setImmediate(r));}}
  t.after(()=>engine.dispose());
  return {engine,npcs,spoken,ctx,advance};
}

test('the fight answer comes from the asked one\'s own lines, once per ledger window; the old cast has none',async t=>{
  const h=fixtureComedy(t,['coach_madrugada','bull']);await h.advance(3);
  const [coach,bull]=h.npcs,fight=texts(pools('coach_madrugada').levels['1'].fight);
  const first=h.engine.fightLine(coach),second=h.engine.fightLine(coach);
  assert.equal(first,fight[0]);assert.equal(second,fight[1]);assert.equal(h.engine.memory.canSpeak(first),false);
  assert.equal(h.engine.fightLine(bull),'');
  h.ctx.scene.userData.questQuiet=true;assert.equal(h.engine.fightLine(coach),'');
});

test('a scene waits for a speaker\'s little spin instead of dying',async t=>{
  const h=fixtureComedy(t,['tremoco_vegan','coach_madrugada']);await h.advance(3);
  const tremoco=h.npcs[0];
  // npcs.js talk(): the scene is asked for first, then the one talked to does a little spin.
  h.engine.notify('talk',tremoco);tremoco.sillyT=0;tremoco.sillyType=0;await h.advance(12);
  const lines=comedy.duets.find(s=>s.id==='i02_engagement').lines.map(b=>b.text);
  assert.deepEqual(h.spoken.map(e=>e.text),lines);
});

test('a fall still ends a scene',async t=>{
  const h=fixtureComedy(t,['tremoco_vegan','coach_madrugada']);await h.advance(3);
  h.engine.notify('talk',h.npcs[0]);h.npcs[0].sillyT=0;h.npcs[0].sillyType=4;await h.advance(12);
  assert.equal(h.spoken.length,0,'a slapped speaker ends the scene');
});

test('in a fight only the asked one\'s answer shows, anchored above the head; quiet hides it',()=>{
  const userData={},camera=new THREE.PerspectiveCamera(65,1,.1,200);camera.updateMatrixWorld();
  const bubbles=createReadableBubbles(THREE,{renderer:{domElement:{clientWidth:800,clientHeight:800}},userData});
  const scene=new THREE.Scene();
  function actor(x){const g=new Proxy({canvas:{width:256,height:256},measureText:t=>({width:t.length*9})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
    const root=new THREE.Group(),head=new THREE.Object3D(),sprite=new THREE.Sprite(new THREE.SpriteMaterial());root.position.set(x,0,-4);head.position.y=1.7;root.add(head);scene.add(root,sprite);
    const n={x,z:-4,baseY:0,root,head,sprite,bctx:g,btex:new THREE.Texture(),bOff:.1};bubbles.register(n);n.talkT=bubbles.setText(n,'Porrada? Espera, que eu ponho o filtro!');return n;}
  scene.updateMatrixWorld(true);
  const asked=actor(0),other=actor(1.5);userData.combatState={active:true};asked.combatControlled=true;asked.fightLineT=2.8;
  bubbles.update(camera);
  assert.equal(asked.sprite.visible,true);assert.equal(other.sprite.visible,false);
  assert.ok(asked.sprite.position.y>1.9&&Math.abs(asked.sprite.position.x)<1e-6&&Math.abs(asked.sprite.position.z+4)<1e-6);
  asked.fightLineT=0;bubbles.update(camera);assert.equal(asked.sprite.visible,false,'no answer, no text in a fight');
  asked.fightLineT=2;userData.questQuiet=true;bubbles.update(camera);assert.equal(asked.sprite.visible,false);
});

test('shadows and daze stars are allocated for every slot',()=>{
  const group=new THREE.Group(),npcs=[],map=new THREE.Texture();
  for(let i=0;i<18;i++)npcs.push({x:i,z:0,baseY:.35,colW:.3,root:{visible:true},stars:{visible:false,position:new THREE.Vector3(),scale:new THREE.Vector3(1,1,1)},blob:null,sprite:null,d2:i});
  const fx=createNpcEffects(THREE,group,npcs,new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial(),new THREE.SpriteMaterial({map}),18);
  fx.update(new THREE.PerspectiveCamera());assert.equal(fx.capacity,18);
  for(const mesh of group.children)if(mesh.isInstancedMesh){assert.equal(mesh.count,18);assert.ok(mesh.instanceMatrix.count>=mesh.count);}
});

test('at the market the influencers stream in on the 0.35 m floor, and the asked one answers when the porrada starts',async()=>{
  const previous=globalThis.fetch,errors=[];
  globalThis.fetch=async url=>{const path=new URL(url).pathname,m=path.match(/assets\/(data\/.+\.json)$/);if(!m)return {ok:false};return {ok:true,text:async()=>read(m[1])};};
  const scene=new THREE.Scene(),ctx={THREE,scene,startup:{moved:true},quality:'low',audio:{muted:true},M:{get:()=>new THREE.MeshStandardMaterial(),boxUV},yieldBuild:async()=>{},onActorError:(id,e)=>errors.push([id,e.message])};
  let mod;
  try{
    const {build}=await import('../assets/gallery/spaces/npcs.js');mod=build(ctx);
    const camera=new THREE.PerspectiveCamera();camera.position.set(102,1.97,31);camera.updateMatrixWorld();
    let time=0;const frame=()=>({camera,time:time+=.1,level:0});
    for(let i=0;i<260&&!(mod.actors.length>=4&&i>120);i++){mod.update(.1,frame());await new Promise(r=>setTimeout(r,2));}
    assert.deepEqual(errors,[]);
    for(const id of ['tremoco_vegan','coach_madrugada','apanhados']){const n=mod.actors.find(n=>n.S.name===id);assert.ok(n,id+' streamed in');
      assert.equal(n.baseY,.35);assert.ok(Array.isArray(n.bounds));assert.ok(n.x>92&&n.x<112&&n.z>20&&n.z<44,id+' at the market');}
    assert.equal(mod.actors.find(n=>n.S.name==='coach_madrugada').S.phone,true,'the coach holds his phone up');
    assert.ok(mod.actors.length<=18);
    // combat.js: the visitor asked the coach; the coach is now fight-controlled and the ring says so.
    const coach=mod.actors.find(n=>n.S.name==='coach_madrugada');
    const entries=Array.from({length:16},()=>({serial:0}));entries[0]={serial:1,type:'fightStarted',aId:'visitor',bId:'coach_madrugada'};
    scene.userData.combatEvents={serial:1,entries};scene.userData.combatState={active:true};coach.combatControlled=true;
    mod.update(.1,frame());
    const answers=texts(pools('coach_madrugada').levels['1'].fight);
    assert.ok(answers.includes(coach.curText),'answer: '+coach.curText);assert.ok(coach.fightLineT>0&&coach.talkT>0);
    for(let i=0;i<40;i++)mod.update(.1,frame());
    assert.equal(coach.fightLineT,0,'the answer lasts the first beats only');assert.equal(coach.talkT,0);
  }finally{mod?.dispose();globalThis.fetch=previous;}
});
