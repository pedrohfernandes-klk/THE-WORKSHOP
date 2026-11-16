import {idleSlice} from './startup-idle.js';
// Shared speech ledger and bounded, opt-in comic direction. No render objects.
const keyOf = text => typeof text === 'string' ? text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-PT') : '';
export function createComedyMemory({ now = () => performance.now() / 1000 } = {}) {
  const spoken = new Map(), actors = new Map();
  function get(id) {
    let m = actors.get(id);
    if (!m) { m = { chapadas: 0, ultimoLugar: '', ultimoGesto: '', quemLevou: '', grau: 1, insistencia: 0, lastTalk: -Infinity }; actors.set(id,m); }
    return m;
  }
  function canSpeak(text) { const key=keyOf(text);return !!key && now()-(spoken.get(key)??-Infinity)>=600; }
  function commit(text) { if(!canSpeak(text))return false;spoken.set(keyOf(text),now());return true; }
  function remember(id,event,details={}) {
    const m=get(id),t=now();
    if(event==='slap')m.chapadas++;
    if(event==='talk'){m.insistencia=t-m.lastTalk<20?m.insistencia+1:1;m.lastTalk=t;}
    if(details.lugar!==undefined)m.ultimoLugar=details.lugar;
    if(details.gesto!==undefined)m.ultimoGesto=details.gesto;
    if(details.victim!==undefined)m.quemLevou=details.victim;
    m.grau=Math.min(3,Math.max(1,m.insistencia,m.chapadas));return m;
  }
  function choose(entries) { if(!Array.isArray(entries))return null;for(let i=0;i<entries.length;i++){const e=entries[i];if(canSpeak(typeof e==='string'?e:e?.text))return e;}return null; }
  return {get,canSpeak,commit,remember,choose};
}

const EVENTS = Object.freeze({ talk:'approach',again:'repeat_talk',ignore:'ignored',ouch:'slap1',ouch2:'slap2',ouch3:'slap3',ha:'witness',run:'run',jump:'jump',sit:'sit',manguito:'gesture8',pirete:'gesture9',sun:'sunny' });
const GESTURE_LABELS=Object.freeze({wave:'aceno',thumbs:'polegar levantado',clap:'aplauso',point:'dedo apontado',shrug:'encolher de ombros',dance:'passo de dança',peace:'gesto de paz',manguito:'manguito',pirete:'pirete',slap:'chapadão'});
const ACTOR_LABELS=Object.freeze({bull:'touro',goat:'cabra',pigeon:'pombo',horse:'cavalo',cat:'gato',pig:'porco',walrus:'morsa',rooster:'galo',tortoise:'cágado',raccoon:'guaxinim',forcado:'forcado',velho:'senhor',gordo:'vizinho',mano:'mano',tio_camisola:'tio da camisola',senhor_banho:'senhor do banho',cusco_roupao:'vizinho do roupão',porco_fato:'senhor de fato',urso_treino:'urso do treino'});
const EXCESS_FIRST = 'Olha que lhe arrebentas a tromba, bro! Para lá com isso, #%&@!';
const EXCESS_LAST = 'Eh, calma, Zé!';
export const EXCESS_WITNESS_LINES=Object.freeze([
 EXCESS_FIRST,EXCESS_LAST,'assim já é demais!','Ai, que ele dá cabo do homem!',
 'ganda sapa, bro! hihihihi!','eia, ca estúpidos!',
 'LOOOOL! Hihihihihi!','LMFAOOOO! HÁ-HÁ-HÁ!'
]);

export function createNpcComedy(ctx, { npcs, data={}, say, startLaugh, fall, now: externalNow } = {}) {
  const yieldData=ctx.yieldBuild||idleSlice;
  let manifestReady=Object.keys(data).length>0,manifestRequest=null,manifestTimer=0,manifestRetry=0,manifestAttempts=0;
  let manualPaused=false,wasPaused=false,externalOffset=0,lastExternal=externalNow?externalNow():0;
  let clock=0,camera=null,active=false,sceneIndex=0,sceneLength=0,nextBeat=0,nextScene=0;
  let emitting=false,emitter=null,emissionText='',emissionCanonical='',lastGesture=null,lastSnake=null,lastPick=null,lastWeather='';
  let started=false,nextFetch=0,fetching=0,disposed=false,chainTarget=null,chainCount=0,chainAt=-Infinity,chainUsed=false;
  let excessCursor=0;
  let mutedLast=false,laughStart=-Infinity,laughCount=0,lastPlace='',pendingExcess=null,excessExpires=0;
  let dominoEpoch=0,dominoCount=0,dominoUntil=0,dominoCooldown=0,punchPrepared=false;
  const time=()=>externalNow?externalNow()-externalOffset:clock;
  const memory=createComedyMemory({now:time});
  const records=[],byNpc=new WeakMap(),byId=new Map(),seenScenes=new Map(),authorized=new Set();
  function authorize(entry){const text=typeof entry==='string'?entry:entry?.text;if(typeof text==='string'&&!entry?.context&&!data.protectedLineContext?.[text]&&!(entry?.score<4))authorized.add(keyOf(text));}
  for(const descriptor of Object.values(data.characters||{}))authorize(descriptor.signature);
  for(const scene of [...(data.duets||[]),...(data.gags||[])])for(const beat of scene.lines||scene.beats||[])authorize(beat);
  for(const entry of data.protectedLines||[])authorize(entry);
  const queue=new Array(8),voices=new Array(6).fill(null);
  const debug={active:false,duets:0,emitted:0,laughs:0,fetches:0};
  for(let i=0;i<8;i++)queue[i]={n:null,text:'',canonical:'',pause:.6,domino:false};
  function registerActor(n){
    if(byNpc.has(n))return;
    const id=n.S.name,descriptor=data.characters?.[id]||{};
    const r={n,id,descriptor,pools:null,status:0,attempts:0,retryAt:0,request:null,requestTimer:0,pending:'',pendingUntil:0,lastEvent:-Infinity,cryUntil:0,cryAt:0,puddleUntil:0,cryPending:false,cryExpires:0,laughAt:0,bigLaughAt:0,fallAt:0,fallEpoch:0,lastCanonical:'',selectedText:''};
    records.push(r);byNpc.set(n,r);byId.set(id,r);memory.get(id);
    n.comedyPuddle=0;
  }
  for(const n of npcs)registerActor(n);
  function quiet(){return manualPaused||!!ctx.scene?.userData?.npcStatues||!!(ctx.scene?.userData?.questQuiet||ctx.scene?.userData?.tramHallQuiet||ctx.scene?.userData?.combatState?.active);}
  function awake(n,range=40){if(!camera)return false;const dx=n.x-camera.position.x,dz=n.z-camera.position.z;return dx*dx+dz*dz<=range*range&&Math.abs((n.baseY||0)+1.62-camera.position.y)<2.4;}
  function available(n){return awake(n)&&!n.busy&&!(n.windT>0)&&!(n.pestT>0)&&!(n.sillyT>=0)&&!(n.talkT>0);}
  function allow(n,text){
    if(disposed||quiet()||!awake(n)||data.protectedLineContext?.[text])return false;
    if(!emitting&&!authorized.has(keyOf(text))&&byNpc.get(n)?.selectedText!==text)return false;
    if(active&&(!emitting||n!==emitter||text!==emissionText))return false;
    if(EXCESS_WITNESS_LINES.includes(text)&&!emitting)return false;
    const record=byNpc.get(n),canonical=emitting?emissionCanonical:record?.selectedText===text?record.lastCanonical:'';
    if(canonical&&!memory.canSpeak(canonical))return false;
    if(!memory.commit(text))return false;
    if(canonical&&keyOf(text)!==keyOf(canonical))memory.commit(canonical);
    if(record)record.selectedText='';
    debug.emitted++;return true;
  }
  function render(text,n){
    const m=memory.get(n.S.name);
    return text.replace(/\{(chapadas|ultimoLugar|ultimoGesto|quemLevou)\}/g,(_,key)=>String(key==='ultimoGesto'?(GESTURE_LABELS[m[key]]||m[key]):key==='quemLevou'?(ACTOR_LABELS[m[key]]||'vizinho'):m[key]));
  }
  function permitted(entry,target){
    const rule=entry?.context;
    if(!rule)return true;
    return rule.target==='fictional_npc'&&target&&rule.allowedTargetIds?.includes(target.S.name);
  }
  function select(n,event,target){
    const r=byNpc.get(n);if(!r||!r.pools)return '';
    const signature=r.descriptor.signature;
    if(event==='approach'&&signature?.text&&memory.canSpeak(signature.text)){r.lastCanonical=signature.text;return signature.text;}
    const m=memory.get(r.id),levels=r.pools.levels||r.pools;
    const callbacks=data.callbacks?.memory;
    if(Array.isArray(callbacks))for(let i=0;i<callbacks.length;i++){const e=callbacks[i];if(e.speaker!==r.id||e.event!==event||typeof e.text!=='string'||e.score<4)continue;
      if(e.text.includes('{ultimoGesto}')&&!m.ultimoGesto||e.text.includes('{ultimoLugar}')&&!m.ultimoLugar||e.text.includes('{quemLevou}')&&!m.quemLevou)continue;
      const text=render(e.text,n);if(memory.canSpeak(e.text)&&memory.canSpeak(text)){r.lastCanonical=e.text;return text;}
    }
    let list=levels[String(m.grau)]?.[event];
    if(!Array.isArray(list)||!list.length){for(let g=m.grau-1;g>=1;g--){list=levels[String(g)]?.[event];if(Array.isArray(list)&&list.length)break;}}
    if(!Array.isArray(list))return '';
    for(let i=0;i<list.length;i++){
      const e=list[i],raw=typeof e==='string'?e:e?.text;
      if(typeof raw!=='string'||e?.score<4||data.protectedLineContext?.[raw]||!permitted(e,target))continue;
      const text=render(raw,n);if(memory.canSpeak(raw)&&memory.canSpeak(text)){r.lastCanonical=raw;return text;}
    }
    return '';
  }
  function line(n,key){const r=byNpc.get(n);let event=EVENTS[key]||key;if(key==='talk'&&memory.get(n.S.name).insistencia>1)event='repeat_talk';if(tryScene(event))return '';const text=select(n,event,null);if(r)r.selectedText=text;return text;}
  function request(r){if(disposed||r.status!==0||ctx.startup&&!ctx.startup.moved)return;r.status=4;yieldData().then(()=>{r.status=0;if(!disposed&&awake(r.n))fetchRecord(r);});}
  function fetchRecord(r){
    if(r.status!==0||fetching>=2||disposed)return;
    // Fixed self-origin path; manifest cannot turn a dialogue load into an external request.
    if(!/^[a-z0-9_]+$/.test(r.id)){r.status=3;return;}
    r.status=1;r.attempts++;fetching++;debug.fetches++;
    const controller=new AbortController();r.request=controller;
    r.requestTimer=setTimeout(()=>controller.abort(),8000);
    fetch(new URL('../data/comedy/'+r.id+'.json',import.meta.url),{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('dialogue unavailable');const text=await response.text();if(new TextEncoder().encode(text).byteLength>30720)throw new Error('dialogue exceeds 30 KiB');await yieldData();if(disposed||!awake(r.n))throw new Error('actor left range');return JSON.parse(text);})
      .then(body=>{if(!disposed){r.pools=body;r.status=2;for(const level of Object.values(body.levels||{}))for(const list of Object.values(level))if(Array.isArray(list))for(const entry of list)authorize(entry);}})
      .catch(()=>{r.status=3;r.retryAt=time()+30;r.pending='';})
      .finally(()=>{clearTimeout(r.requestTimer);r.request=null;fetching--;});
  }
  function anyAwake(){for(let i=0;i<records.length;i++)if(awake(records[i].n))return true;return false;}
  let manifestScheduled=false;
  function loadManifest(){if(manifestReady||manifestRequest||manifestScheduled||disposed||ctx.startup&&!ctx.startup.moved||!anyAwake())return;manifestScheduled=true;yieldData().then(()=>{manifestScheduled=false;if(!disposed&&anyAwake())fetchManifest();});}
  function fetchManifest(){
    if(disposed||manifestReady||manifestRequest)return;
    manifestAttempts++;
    const controller=new AbortController();manifestRequest=controller;
    manifestTimer=setTimeout(()=>controller.abort(),8000);
    fetch(new URL('../data/npc-comedy.json',import.meta.url),{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('manifest unavailable');const text=await response.text();if(new TextEncoder().encode(text).byteLength>204800)throw new Error('manifest too large');await yieldData();return JSON.parse(text);})
      .then(body=>{if(disposed)return;data=body;
        for(let i=0;i<records.length;i++){const r=records[i];r.descriptor=data.characters?.[r.id]||{};authorize(r.descriptor.signature);}
        for(const scene of [...(data.duets||[]),...(data.gags||[])])for(const beat of scene.lines||scene.beats||[])authorize(beat);
        for(const entry of data.protectedLines||[])authorize(entry);
        manifestReady=true;
      }).catch(()=>{manifestRetry=time()+30;})
      .finally(()=>{clearTimeout(manifestTimer);manifestRequest=null;});
  }
  function clearQueue(){active=false;debug.active=false;punchPrepared=false;sceneIndex=sceneLength=0;for(let i=0;i<8;i++){queue[i].n=null;queue[i].text='';}}
  function stopAudio(){for(let i=0;i<voices.length;i++){const v=voices[i];if(v){try{v.stop();}catch{}voices[i]=null;}}}
  function cancel(){clearQueue();stopAudio();pendingExcess=null;chainTarget=null;chainCount=0;chainUsed=false;chainAt=-Infinity;dominoEpoch++;dominoCount=0;dominoUntil=0;dominoCooldown=time()+8;for(let i=0;i<records.length;i++){const r=records[i];r.pending='';r.cryPending=false;r.cryUntil=0;r.puddleUntil=0;r.laughAt=0;r.bigLaughAt=0;r.fallAt=0;r.fallEpoch=0;r.n.comedyPuddle=0;}}
  function sound(n,kind='laugh'){
    if(quiet()||!awake(n,18)||ctx.audio?.muted)return true;
    let ac,bus;try{ac=ctx.audio?.context;bus=ctx.audio?.bus;}catch{return true;}
    if(!ac||!bus||ac.state!=='running')return true;
    let slot=-1;for(let i=0;i<voices.length;i++)if(!voices[i]){slot=i;break;}if(slot<0)return true;
    const r=byNpc.get(n),voice=r?.descriptor.voice||{},family=voice.family||'chuckle';
    const pitch=Math.max(50,Math.min(900,Number(voice.pitch)||150));
    const duration=kind==='bleep' ? .16 : kind==='sob' ? .45 : kind==='biglaugh' ? .95 : .65;
    const lease=ctx.audio.acquireVoice?.({priority:kind==='bleep'?3:2,foreground:true,ms:(duration+.08)*1000});if(!lease)return true;
    let osc,gain,filter,panner;
    try{
      osc=ac.createOscillator();gain=ac.createGain();filter=ac.createBiquadFilter();
      lease.track(osc);const t=lease.startAt;
      osc.type=kind==='bleep'?'square':family==='snort'?'sawtooth':family==='chirp'?'sine':'triangle';
      const rancor=memory.get(n.S.name).chapadas>0?Math.pow(2,-1/12):1;
      const base=kind==='bleep'?880:(kind==='sob'?pitch*.7:pitch)*rancor;
      osc.frequency.setValueAtTime(base,t);osc.frequency.exponentialRampToValueAtTime(Math.max(25,base*(family==='drum' ? .45 : .75)),t+duration);
      filter.type='lowpass';filter.frequency.value=kind==='bleep'?1400:family==='murmur'?350:1800;
      const dx=n.x-camera.position.x,dz=n.z-camera.position.z,vol=.09*Math.max(0,1-Math.sqrt(dx*dx+dz*dz)/18)**2;
      gain.gain.setValueAtTime(.0001,t);
      const count=kind==='biglaugh'?5:kind==='laugh'?3:1;
      for(let i=0;i<count;i++){const beat=t+i*duration/count;gain.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),beat+.025);gain.gain.exponentialRampToValueAtTime(.0001,beat+duration/count-.01);}
      panner=ac.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=3;panner.maxDistance=18;panner.rolloffFactor=1;
      panner.positionX.value=n.x;panner.positionY.value=(n.baseY||0)+1.4;panner.positionZ.value=n.z;
      osc.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(lease.gain);lease.gain.connect(bus);voices[slot]=osc;
      osc.onended=()=>{lease.release();osc.disconnect();gain.disconnect();filter.disconnect();panner.disconnect();if(voices[slot]===osc)voices[slot]=null;};
      osc.start(t);osc.stop(t+duration+.02);
    }catch{lease.release();try{osc?.stop();}catch{}osc?.disconnect();gain?.disconnect();filter?.disconnect();panner?.disconnect();voices[slot]=null;}
    return true;
  }
  function allowLaugh(n){
    if(quiet()||!awake(n,18))return false;
    const t=time();if(t-laughStart>=6){laughStart=t;laughCount=0;}
    if(laughCount>=3)return false;laughCount++;debug.laughs++;return true;
  }
  function begin(scene){
    const t=time();if(active||t<nextScene||quiet())return false;
    const lines=scene.lines||scene.beats;if(!Array.isArray(lines)||!lines.length||lines.length>8)return false;
    for(let i=0;i<(scene.roles?.length||0);i++){const role=byId.get(scene.roles[i]);if(!role||!available(role.n)||!awake(role.n,12))return false;}
    let count=0;
    for(let i=0;i<lines.length;i++){
      const b=lines[i],r=byId.get(b.speaker);if(!r||typeof b.text!=='string'||b.score<4||data.protectedLineContext?.[b.text]||!permitted(b,null))return false;
      const text=render(b.text,r.n);if(!memory.canSpeak(b.text)||!memory.canSpeak(text))return false;
      for(let j=0;j<count;j++)if(keyOf(queue[j].text)===keyOf(text))return false;
      const q=queue[count++];q.n=r.n;q.text=text;q.canonical=b.text;q.pause=Math.max(.4,Math.min(.8,Number(b.pause)||.6));q.domino=i===lines.length-1;q.bigLaugh=false;
    }
    active=true;debug.active=true;sceneLength=count;sceneIndex=0;nextBeat=t+.4;nextScene=t+20;seenScenes.set(scene.id,t);debug.duets++;return true;
  }
  function tryScene(event){
    const lists=[data.duets,data.gags]; // event-time allocation, never idle-frame allocation
    for(let k=0;k<2;k++){const list=lists[k];if(!Array.isArray(list))continue;for(let i=0;i<list.length;i++){const s=list[i];if(s.trigger===event&&time()-(seenScenes.get(s.id)??-Infinity)>=Math.max(20,s.cooldown||20)&&begin(s))return true;}}
    return false;
  }
  function notify(event,n,target){
    if(disposed||quiet())return;
    const t=time();
    if(n){
      const r=byNpc.get(n);if(!r||!awake(n))return;
      if(event==='fall'){domino(n,r);return;}
      if(event==='talk')memory.remember(r.id,'talk');
      if(event==='slap'){
        memory.remember(r.id,'slap');
        if(chainTarget!==n||t-chainAt>12){chainTarget=n;chainCount=0;chainUsed=false;}
        chainAt=t;chainCount++;
        for(let i=0;i<records.length;i++)memory.get(records[i].id).quemLevou=r.id;
        if(chainCount>=5&&!chainUsed){chainUsed=true;pendingExcess=n;excessExpires=t+8;r.cryPending=true;r.cryExpires=t+15;}
        event=chainCount>=3?'slap3':chainCount===2?'slap2':'slap1';
      }
      if(event==='talk'){tryScene(memory.get(r.id).insistencia>1?'repeat_talk':'approach');return;}
      if(event==='slap1'||event==='slap2'||event==='slap3')return;
      if(!r.pools){r.pending=event;r.pendingUntil=t+3;return;}
      if(t-r.lastEvent<3)return;r.lastEvent=t;
      if(tryScene(event))return;
      const text=select(n,event,target);if(text&&available(n)){emitting=true;emitter=n;emissionText=text;emissionCanonical=r.lastCanonical||text;try{say(n,text,false);}finally{emitting=false;}}
    }else if(!tryScene(event)){
      let closest=null,best=144;for(let i=0;i<records.length;i++){const r=records[i];if(!available(r.n))continue;const dx=r.n.x-camera.position.x,dz=r.n.z-camera.position.z,d=dx*dx+dz*dz;if(d<best){best=d;closest=r.n;}}
      if(closest)notify(event,closest,target);
    }
  }
  function domino(n,r){
    if(!fall||ctx.reducedMotion)return;const t=time();
    if(t>dominoUntil){if(t<dominoCooldown)return;dominoEpoch++;dominoCount=0;dominoUntil=t+5;dominoCooldown=t+8;r.fallEpoch=dominoEpoch;}
    if(dominoCount>=2)return;let next=null,best=Infinity;
    for(let i=0;i<records.length;i++){const a=records[i],m=a.n;if(m===n||a.fallEpoch===dominoEpoch||m.fixed||m.S.seated||!available(m))continue;
      const dx=m.x-n.x,dz=m.z-n.z,d=dx*dx+dz*dz,reach=(n.colW||.3)+(m.colW||.3)+.35;
      if(d<reach*reach&&d<best){next=a;best=d;}}
    if(next){next.fallEpoch=dominoEpoch;next.fallAt=t+.12;dominoCount++;}
  }
  function defeat(n){const r=byNpc.get(n);if(!r||quiet())return false;r.cryPending=true;r.cryExpires=time()+15;return true;}
  function excess(){
    if(!pendingExcess||active||time()>excessExpires){if(time()>excessExpires)pendingExcess=null;return;}
    let chosen=null,best=288;
    for(let i=0;i<records.length;i++){const r=records[i],n=r.n;if(n===pendingExcess||!available(n))continue;const dx=n.x-pendingExcess.x,dz=n.z-pendingExcess.z,d=dx*dx+dz*dz;if(d>=144)continue;const rank=d+(n.S.personality==='onlooker'?0:144);if(rank<best){chosen=n;best=rank;}}
    if(!chosen)return;
    let count=0;
    for(let tries=0;tries<EXCESS_WITNESS_LINES.length&&count<2;tries++){
      const text=EXCESS_WITNESS_LINES[excessCursor++%EXCESS_WITNESS_LINES.length];if(!memory.canSpeak(text))continue;
      const q=queue[count++];q.n=chosen;q.text=q.canonical=text;q.pause=.6;q.domino=false;q.bigLaugh=/LOL|LMFAO|hihihihi/.test(text);
    }
    if(!count){pendingExcess=null;return;}queue[count-1].domino=true;
    active=true;debug.active=true;sceneLength=count;sceneIndex=0;nextBeat=time()+.5;nextScene=Math.max(nextScene,time()+20);pendingExcess=null;

  }
  function fresh(stamp){const wall=externalNow?externalNow():performance.now()/1000;return typeof stamp==='number'&&Math.abs(wall-stamp)<=3;}
  function observe(){
    const ud=ctx.scene.userData,g=ud.lastGesture,s=ud.snakeEvent,p=ud.lastModulePick,w=ud.weather?.mode||'',place=ud.stats?.place||'';
    if(!started){started=true;lastGesture=g?.time;lastSnake=s?.time;lastPick=p?.time;lastWeather=w;}
    if(quiet()){lastGesture=g?.time;lastSnake=s?.time;lastPick=p?.time;lastWeather=w;return;}
    if(place!==lastPlace){lastPlace=place;for(let i=0;i<records.length;i++)memory.get(records[i].id).ultimoLugar=place;}
    if(g&&g.time!==lastGesture){lastGesture=g.time;if(fresh(g.time)){for(let i=0;i<records.length;i++)memory.get(records[i].id).ultimoGesto=g.name;if(g.name==='manguito'||g.name==='pirete')notify(g.name==='manguito'?'gesture8':'gesture9');else if(g.name==='dance'&&camera.position.x>=66&&camera.position.x<=77&&camera.position.z>=19&&camera.position.z<=27)notify('arraial');}}
    if(s&&s.time!==lastSnake){lastSnake=s.time;if(s.kind==='lose'||s.kind==='start')notify('snake');}
    if(p&&p.time!==lastPick){lastPick=p.time;if(fresh(p.time)){if(p.module==='duck')notify('duck');else if(p.module==='photobooth')notify('photo');else if(p.module==='arraial')notify('arraial');}}
    if(w!==lastWeather){lastWeather=w;notify(w);}
  }
  function update(dt,frame){
    camera=frame?.camera||camera;if(ctx.startup&&!ctx.startup.moved)return;
    if(ctx.scene?.userData?.questQuiet||ctx.scene?.userData?.tramHallQuiet||ctx.scene?.userData?.combatState?.active){cancel();if(externalNow)lastExternal=externalNow();return;}
    const frozen=manualPaused||!!ctx.scene?.userData?.npcStatues;
    if(externalNow){const stamp=externalNow();if(frozen||wasPaused)externalOffset+=Math.max(0,stamp-lastExternal);lastExternal=stamp;}
    if(frozen){wasPaused=true;observe();return;}
    if(!wasPaused)clock+=Math.min(.1,Math.max(0,dt||0));wasPaused=false;
    if(disposed||!camera)return;const muted=!!ctx.audio?.muted;if(muted&&!mutedLast)stopAudio();mutedLast=muted;observe();if(quiet()){cancel();return;}
    const t=time();
    if(!manifestReady&&!manifestRequest&&manifestAttempts<2&&t>=manifestRetry)loadManifest();
    for(let i=0;i<records.length;i++){
      const r=records[i],n=r.n;if(!awake(n)){n.comedyPuddle=0;r.fallAt=0;r.laughAt=0;r.pending='';r.cryPending=false;continue;}
      if(r.fallAt>0&&t>=r.fallAt){r.fallAt=0;if(available(n))fall?.(n);}
      if(r.status===3&&r.attempts<2&&t>=r.retryAt)r.status=0;
      if(manifestReady&&r.status===0&&t>=nextFetch&&fetching<2){nextFetch=t+.25;request(r);}
      if(r.pending&&t>r.pendingUntil)r.pending='';
      else if(r.pending&&r.status===2){const event=r.pending;r.pending='';notify(event,n);}
      if(r.cryPending&&t>r.cryExpires)r.cryPending=false;
      if(r.cryPending&&n.sillyT<0&&!n.busy){r.cryPending=false;r.cryAt=t;r.cryUntil=t+1.2;r.puddleUntil=t+2.4;sound(n,'sob');}
      n.comedyPuddle=t<r.puddleUntil?(ctx.reducedMotion?1:Math.min(1,(t-r.cryAt)*3)*Math.min(1,(r.puddleUntil-t)*3)):0;
      if(r.bigLaughAt>0&&t>=r.bigLaughAt){r.bigLaughAt=0;if(available(n)&&allowLaugh(n))sound(n,'biglaugh');}
      if(r.laughAt>0&&t>=r.laughAt){r.laughAt=0;if(available(n))startLaugh(n,'',false);}
    }
    excess();
    if(!active||t<nextBeat)return;
    if(sceneIndex>=sceneLength){clearQueue();return;}
    const q=queue[sceneIndex];
    if(!q.n||!awake(q.n,18)||q.n.busy||q.n.windT>0||q.n.sillyT>=0){clearQueue();return;}
    if(q.n.talkT>0){nextBeat=t+.1;return;}
    if(sceneIndex===sceneLength-1&&!punchPrepared){punchPrepared=true;const lead=ctx.audio?.preparePunchline?.()||0;if(lead>0){nextBeat=t+lead;return;}}
    emitting=true;emitter=q.n;emissionText=q.text;emissionCanonical=q.canonical;const emittedBefore=debug.emitted;try{say(q.n,q.text,false);}finally{emitting=false;}
    if(debug.emitted===emittedBefore){clearQueue();return;}
    const last=sceneIndex===sceneLength-1,delay=Math.max(0,q.n.talkT||0)+q.pause+(q.bigLaugh?1.1:0);
    if(q.bigLaugh){const r=byNpc.get(q.n);if(r)r.bigLaughAt=t+Math.max(0,q.n.talkT||0)+.1;}
    if(last&&q.domino){
      let added=0;for(let i=0;i<records.length&&added<3;i++){const r=records[i],n=r.n;const dx=n.x-q.n.x,dz=n.z-q.n.z;if(n!==q.n&&awake(n,18)&&!n.busy&&dx*dx+dz*dz<64){r.laughAt=t+delay+added*.35;added++;}}
    }
    sceneIndex++;nextBeat=t+delay;
  }
  function after(){
    if(disposed||quiet())return;const t=time();
    for(let i=0;i<records.length;i++){
      const r=records[i],n=r.n;if(t>=r.cryUntil||!awake(n)||ctx.reducedMotion||n.sillyT>=0||n.busy)continue;
      const k=Math.sin((t-r.cryAt)*18)*.035;n.arms[0].rotation.z+=k;n.arms[1].rotation.z-=k;n.head.rotation.x+=.13;
    }
  }
  function setPaused(value){manualPaused=!!value;if(manualPaused){wasPaused=true;if(externalNow)lastExternal=externalNow();}}
  function thaw(n,text){if(!['Eu estava a pensar.','Quem me mudou o intervalo?','O pombo estava a avaliar.'].includes(text)||quiet()||!awake(n))return false;authorized.add(keyOf(text));return say(n,text,false);}
  function isSignature(n,text){return byNpc.get(n)?.descriptor.signature?.text===text;}
  function dispose(){disposed=true;cancel();manifestRequest?.abort();clearTimeout(manifestTimer);for(let i=0;i<records.length;i++){records[i].request?.abort();clearTimeout(records[i].requestTimer);}}
  return {registerActor,thaw,allow,line,select,notify,update,after,cancel,dispose,memory,debug,allowLaugh,sound,loadManifest,isSignature,setPaused,defeat};
}
