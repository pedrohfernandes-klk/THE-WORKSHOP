import {sampleCombatMotion,crossedContact,stepSpring,stepGuardCharge,solveFootPlant,GUARD_HOLD} from './combat-motion.js';
import {createCombatParticles} from './combat-particles.js';
import {BUFFER,CANCEL,CHAIN_GRACE,BLOCKSTUN,COUNTER_DAMAGE,COUNTER_STUN,COUNTER_STOP,LAUNCH_V,BOUNCE_V,TRIP_V,OTG_V,TRAM_LIFT,DOWN_TIME,RISE_TIME,SPLAT_TIME,SPLAT_HEIGHT,WALL_REACH,
  GRAB,GRAB_RANGE,GRAB_HOLD,BREAK_WINDOW,THROW_POWER,AI_BREAK,STRING_CHANCE,AI_JUGGLES,AI_GUARD,AI_WAKE_GUARD,WINS,KO_SLOW,KO_TIME_SCALE,KO_PUSH,KO_ROUND,KO_MATCH,TAUNT_AT,
  STRINGS,JUGGLE_MOVES,launcherOf,findContinuation,tripleRun,comboScale,hitstunOf,stepAir,liftOff,juggleHit,landsIn,nameOf,tauntOf,VICTORY,
  MOVE_HINT,TOUCH_HINT,createArcadeHud} from './combat-arcade.js';
import { buildCharacter } from './npc-models.js';
import { moveInWorld, groundAt } from './collision.js';

// Props are mimed with the existing hands/rig: no towel, shoe or projectile mesh.
export const MOVES = Object.freeze([
  ['chapada','Chapada','sweep',12,.12,.36],['reves','Revés','back',13,.14,.38],
  ['sanduiche','Sanduíche','both',20,.2,.5],['peteleco','Peteleco','finger',7,.1,.28],
  ['calduco','Calduço','over',12,.18,.4],['orelha','Puxão de orelha','pull',11,.2,.45],
  ['pisadela','Pisadela','stomp',13,.2,.46],['rasteira','Rasteira','sweepLeg',17,.24,.52],
  ['toalhada','Toalhada','whip',16,.18,.42],['chinelada','Chinelada','shoe',16,.2,.45],
  ['pastel','Pastel de nata','jab',10,.16,.38],['abraco','Abraço de urso','hug',18,.25,.58],
  ['almofada','Almofada','pillow',11,.18,.42],['leque','Leque','fan',8,.12,.32],
  ['cocegas','Cócegas','tickle',9,.22,.5],['beliscao','Beliscão','pinch',10,.14,.32]
].map((m,i)=>Object.freeze({id:m[0],label:m[1],pose:m[2],power:m[3],windup:m[4],duration:m[5],index:i,range:1.8})));
const SPECIAL=Object.freeze({forcado:11,velho:8,gordo:2,mano:3,urso_treino:11,porco_fato:10});
const SPECIAL_LABEL=Object.freeze({forcado:'Pega',velho:'Bengalada',gordo:'Barrigada',mano:'Transferência',urso_treino:'Abraço de urso',porco_fato:'Focinhada'});
const NOTES=Object.freeze([110,130.8128,146.8324,164.8138,195.9977]); // A minor pentatonic; 96 BPM
const BEAT=60/96;
// source, filter, cutoff Hz, Q, octave, beat fraction, pulses, attack seconds.
export const FOLEY=Object.freeze([
 ['noise','bandpass',850,.65,1,.25,1,.002], ['noise','highpass',1500,.5,1,.25,1,.012],
 ['noise','bandpass',650,1.2,1,.5,2,.003], ['sine','lowpass',4000,.5,8,.125,1,.001],
 ['triangle','lowpass',550,1,1,.25,1,.003], ['sine','bandpass',1200,2,4,.5,2,.025],
 ['triangle','lowpass',180,.5,.5,.25,1,.005], ['noise','lowpass',500,.7,1,.5,1,.035],
 ['noise','highpass',2800,.9,1,.25,1,.008], ['noise','bandpass',1400,2.2,1,.375,2,.002],
 ['noise','lowpass',330,1.3,1,.5,2,.009], ['sine','bandpass',240,2,.5,.5,1,.035],
 ['noise','lowpass',170,.6,1,.25,1,.018], ['noise','highpass',4400,.5,1,.5,3,.015],
 ['sine','bandpass',2100,1.1,4,.5,4,.004], ['triangle','highpass',1900,.8,8,.125,1,.001]
].map(Object.freeze));
const WEAPONS=Object.freeze({carapau:8,paposeco:4,couve:12,jornal:13,chinelo:9,toalha:8,nata:10,luva:0});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// The guard starts as far as a slap reaches (main.js SLAP_REACH). Past the old 1.8 m the visitor
// first takes a half-step in to 1.7 m, inside the 1.8 m range of every blow.
const GUARD_START=2.1,GUARD_REACH=1.8,GUARD_STEP=1.7,GUARD_GRACE=.15,NAG_GAP=2,RECOIL=1.3;
// Where each mimed move sits best: a hug or a pinch up close, a slap at arm's length, a towel
// or a slipper at the edge of reach.
const IDEAL=Object.freeze({hug:1.05,tickle:1.1,pinch:1.15,pull:1.2,both:1.25,stomp:1.25,over:1.3,finger:1.4,sweep:1.45,back:1.45,jab:1.5,pillow:1.5,fan:1.55,sweepLeg:1.6,shoe:1.65,whip:1.7});
const WEIGHTS=new Float64Array(MOVES.length);
function moveWeight(m,distance,last,repeats){
  if(m.index===last&&repeats>=2)return 0;
  const fit=Math.exp(-(((distance-IDEAL[m.pose])/.35)**2));
  return (distance<=m.range?1:.1)*(.2+fit)*(m.index===last?.5:1);
}
// The opponent's next blow: weighted by distance and range, never a third time in a row
// (`repeats` counts how many times `last` has just been used). The signature move keeps one
// blow in four (one in seven straight after itself) wherever the fight stands.
export function chooseMove(distance,last=-1,repeats=0,special=-1,random=Math.random){
  let total=0;for(let i=0;i<MOVES.length;i++){WEIGHTS[i]=i===special?0:moveWeight(MOVES[i],distance,last,repeats);total+=WEIGHTS[i];}
  if(special>=0&&special<MOVES.length&&!(special===last&&repeats>=2)){WEIGHTS[special]=total/3*(distance<=MOVES[special].range?1:.1)*(special===last?.5:1);total+=WEIGHTS[special];}
  let pick=clamp(random(),0,.999999)*total,chosen=-1;
  for(let i=0;i<MOVES.length;i++){if(WEIGHTS[i]<=0)continue;chosen=i;if((pick-=WEIGHTS[i])<0)break;}
  return chosen;
}
// The opponent's string: weighted like chooseMove by how well its first blow suits the distance,
// never one that would give a blow three times in a row after `last`. A fighter's signature string
// (combat-arcade.js STRINGS, `owner`) keeps one string in four; nobody else's ever comes out.
const STRING_WEIGHTS=new Float64Array(STRINGS.length);
export function chooseString(distance,last=-1,repeats=0,owner='',random=Math.random){
  let total=0,signature=-1;
  for(let i=0;i<STRINGS.length;i++){const s=STRINGS[i];STRING_WEIGHTS[i]=0;
    if(s.owner&&s.owner!==owner||tripleRun(s.moves,last,repeats))continue;if(s.owner){signature=i;continue;}
    const m=MOVES[s.moves[0]];STRING_WEIGHTS[i]=(distance<=m.range?1:.1)*(.2+Math.exp(-(((distance-IDEAL[m.pose])/.45)**2)));total+=STRING_WEIGHTS[i];}
  if(signature>=0){STRING_WEIGHTS[signature]=total>0?total/3:1;total+=STRING_WEIGHTS[signature];}
  if(total<=0)return -1;
  let pick=clamp(random(),0,.999999)*total,chosen=-1;
  for(let i=0;i<STRINGS.length;i++){if(STRING_WEIGHTS[i]<=0)continue;chosen=i;if((pick-=STRING_WEIGHTS[i])<0)break;}
  return chosen;
}
const HITSTUN=Float64Array.from(MOVES,hitstunOf);
// The key each blow answers to in a string (Q, R, Z, C, F); the others start from the chosen-blow key.
const MOVE_KEY=Object.freeze(['Q','R','','','','','','Z','','F','','C','','','','']);
const FIGHT_KEYS=new Set(['KeyQ','KeyE','KeyZ','KeyC','KeyF','KeyR','ShiftLeft','ShiftRight']);
const smooth01=x=>x*x*(3-2*x);

export function createCombat(ctx,{camera,controls,world,npcModule,getPlayer,canAct=()=>true,canStart=()=>true,onSlap=()=>{},enableStatues=false,random=Math.random}={}){
  const {THREE}=ctx,npcs=npcModule?.combatActors||[];
  const particles=createCombatParticles(THREE,ctx.scene),guard={elapsed:0,fired:false,lapse:0};let guardHeld=false,frameDt=0;
  let nagPending=false,nagAt=-Infinity,charge=null,chargeShown=0,shot=-1,shotRetry=0,stepX=0,stepZ=0;
  const direction=new THREE.Vector3(),followPosition=new THREE.Vector3();let followReady=false;
  const motion={phase:0,drive:0,anticipation:0,settle:0,twist:0,lift:0},plant={hip:0,knee:0,ankle:0};
  const jointKeys=['elbows','wrists','knees','ankles','shoulders','cheeks'];
  let pillA=null,pillB=null,lagA=null,lagB=null,shownA=100,shownB=100;
  const events={serial:0,entries:new Array(16)};
  // round: the round the entry belongs to; winner/final on 'ko' (final: the match is decided) and
  // on 'round' (final: the deciding round); by (who struck: 'visitor' or an NPC id), counter, combo
  // (hits so far) and step (blow of the string, 1 first) on 'impact', 'counter', 'launch' and the hug's events.
  for(let i=0;i<16;i++)events.entries[i]={serial:0,type:'',fightId:0,aId:'',bId:'',ax:0,az:0,bx:0,bz:0,intensity:0,move:'',time:0,kind:'',round:0,winner:'',by:'',final:false,counter:false,combo:0,step:0};
  const state={active:false,paused:false,id:0,kind:'',venue:'',serial:0,event:'',actorA:'',actorB:'',aId:'',bId:'',ax:0,az:0,bx:0,bz:0,brioA:100,brioB:100,prideA:100,prideB:100,
    round:0,final:false,winsA:0,winsB:0,comboA:0,comboB:0,ko:false};
  // Fighting-game layer: fight time (stops in hit-stop, slows in the K.O.), the K.O., the hug.
  let ft=0,koAt=0,slowUntil=0,koWinner=null,matchOver=false,grabber=null,grabbed=null,grabT=0,aiBreakAt=Infinity,arcade=null,throwButton=null,hintsShown=0;
  const tiltEuler=new THREE.Euler(0,0,0,'YXZ');
  let coarse=false;try{coarse=typeof matchMedia==='function'&&!!matchMedia('(pointer:coarse)').matches;}catch{coarse=false;}
  const GRAB_PROMPT=coarse?'LARGA-ME! 🤗':'LARGA-ME! (C)';
  ctx.scene.userData.combatEvents=events;ctx.scene.userData.combatState=state;
  const originalToast=ctx.ui?.toast;const guardedToast=(...args)=>{if(!state.active)originalToast?.apply(ctx.ui,args);};if(ctx.ui)ctx.ui.toast=guardedToast;
  let clock=0,a=null,b=null,donor=null,avatar=null,selected=0,hitstop=0,shake=0,scriptEnd=0,nextAi=0;
  let queueCount=0,blockAt=-Infinity,dodgeUntil=0,dodgeReady=0,counterUntil=0;
  let noiseBuffer=null,noiseContext=null,aiTurn=0;
  let enteredAt=0,endingAt=0,loser=null,equipped='',tripId='',climaxFight=false;
  const visitorStatus={fell:false,fightId:0},scriptedResult={sequence:0,fightId:0,winner:'',completed:false,visitorWon:false};
  let arenaX=0,arenaZ=0,savedFov=60;
  let rendering=false,firstHandsVisible=false,disposed=false,uiDirty=true,pausedBefore=false;
  const queue=new Int8Array(3),colliders=[],active=[],out={x:0,z:0,floor:0,step:0,region:null};
  const position={x:0,y:1.62,z:0},savedCamera=new THREE.Vector3(),savedQuat=new THREE.Quaternion();
  const cameraPoint=new THREE.Vector3(),cameraAim=new THREE.Vector3(),soundPoint=new THREE.Vector3();
  const voices=new Array(6).fill(null),records=[],byNpc=new WeakMap(),said=new Map();
  function callout(text){if(state.active)return;const memory=npcModule.comedyMemory;const allowed=memory?memory.commit(text):clock-(said.get(text)??-Infinity)>=600;if(allowed){said.set(text,clock);toast(text);}}
  function record(n,visitor=false){return {n,visitor,pride:100,attack:-1,t:0,landed:false,boost:1,blocking:false,recoilX:0,recoilZ:0,
    spring:{x:0,v:0},attackCount:0,lastMove:-1,repeats:0,headZ:0,inPlace:false,oldBusy:false,oldControlled:false,base:new Float32Array(18),bones:null,
    // stun: hit- or blockstun left (stunHit: from a clean hit). clean/guarded: the current blow
    // connected. air/airV/airborne/juggles: the launch. down/rise/splat: on the floor, getting up,
    // pinned to a wall. path/depth: the string so far; chainUntil: its grace after a blow ends.
    // buf*: one buffered key. grab: 1 holding, 2 held. won: the victory pose.
    stun:0,stunHit:false,clean:false,guarded:false,air:0,airV:0,airborne:false,juggles:0,bounced:false,trip:false,splat:0,down:0,rise:0,tilt:0,
    path:new Int8Array(4),depth:0,chainUntil:-1,endedAt:-Infinity,guardUntil:0,punish:false,wasFree:true,bufKey:'',bufMove:-1,bufAt:-Infinity,aiString:-1,aiJuggle:0,opened:false,combo:0,grab:0,breakLock:false,wins:0,won:false};}
  function registerActor(n){if(byNpc.has(n))return;const r=record(n);records.push(r);byNpc.set(n,r);}
  for(const n of npcs)registerActor(n);
  const unsubscribeActor=npcModule?.onActorReady?.(registerActor);
  let visitor=null;
  const panel=typeof document==='undefined'?null:document.createElement('section');
  let cssLink=null,hud=null,statusText=null,banner=null,moveSelect=null,statueButton=null,fightButton=null,blockButton=null;
  function toast(text){if(!state.active)ctx.ui?.toast?.(text);}
  function freeze(){return !!ctx.scene.userData.npcStatues;}
  function quiet(){return !!(ctx.scene.userData.questQuiet||ctx.scene.userData.tramHallQuiet);}
  function readVisitor(){controls.readPosition(position);}
  function id(r){return r?.visitor?'visitor':r?.n?.S?.name||'';}
  function emit(type,intensity=0,move=''){
    const e=events.entries[events.serial%16];e.serial=++events.serial;e.type=type;e.fightId=state.id;
    e.aId=id(a);e.bId=id(b);e.ax=a?.n.x||0;e.az=a?.n.z||0;e.bx=b?.n.x||0;e.bz=b?.n.z||0;
    e.intensity=intensity;e.move=move;e.time=clock;state.serial=e.serial;state.event=type;state.actorA=state.aId=e.aId;state.actorB=state.bId=e.bId;
    e.kind=state.kind;e.round=state.round;e.winner='';e.by='';e.final=false;e.counter=false;e.combo=0;e.step=0;return e;
  }
  function capture(r){
    const n=r.n;r.headZ=n.head.position.z;r.oldBusy=n.busy;r.oldControlled=!!n.combatControlled;n.busy=true;n.combatControlled=true;
    r.bones=[n.body,n.head,n.arms[0],n.arms[1],n.legs[0],n.legs[1]];
    for(let i=0;i<6;i++){const q=r.bones[i].rotation;r.base[i*3]=q.x;r.base[i*3+1]=q.y;r.base[i*3+2]=q.z;}
    n.talkT=0;n.bubble=0;if(n.sprite)n.sprite.visible=false;
    r.spring.x=r.spring.v=0;r.pride=100;r.attack=-1;r.t=0;r.blocking=false;r.recoilX=r.recoilZ=0;r.attackCount=0;r.lastMove=-1;r.repeats=0;
    resetFighter(r);r.wins=0;r.tilt=0;
  }
  // Between rounds and at the start: on the feet, no string, no juggle, nothing buffered.
  function resetFighter(r){
    r.attack=-1;r.t=0;r.landed=false;r.stun=0;r.stunHit=false;r.clean=r.guarded=false;r.air=r.airV=0;r.airborne=false;r.juggles=0;r.bounced=r.trip=false;
    r.splat=r.down=r.rise=0;r.depth=0;r.chainUntil=-1;r.endedAt=-Infinity;r.guardUntil=0;r.punish=false;r.wasFree=true;r.bufMove=-1;r.bufKey='';r.aiString=-1;r.aiJuggle=0;r.opened=false;r.combo=0;r.grab=0;r.breakLock=false;r.won=false;
    r.recoilX=r.recoilZ=0;r.spring.x=r.spring.v=0;r.lastMove=-1;r.repeats=0;
  }
  function restore(r){if(!r)return;resetJoints(r);const n=r.n;for(let i=0;i<6;i++)r.bones[i].rotation.set(r.base[i*3],r.base[i*3+1],r.base[i*3+2]);n.head.position.z=r.headZ;n.busy=r.oldBusy;n.combatControlled=r.oldControlled;
    n.root.rotation.set(0,n.yaw||0,0);n.root.position.y=n.baseY||0;r.air=0;r.tilt=0;}
  function stopSounds(){for(let i=0;i<voices.length;i++)if(voices[i]){try{voices[i].stop();}catch{}voices[i]=null;}}
  function sound(r,step=0,soft=false,moveIndex=-1){
    if(freeze()||quiet()||ctx.audio?.muted)return;
    const voiceAudio=ctx.scene.userData.statueAudio?.audio||ctx.audio;
    let ac,bus;try{ac=voiceAudio?.context;bus=voiceAudio?.bus;}catch{return;}if(!ac||!bus||ac.state!=='running')return;
    let slot=-1;for(let i=0;i<6;i++)if(!voices[i]){slot=i;break;}if(slot<0)return;
    const profile=moveIndex>=0?FOLEY[moveIndex]:null,duration=profile?BEAT*profile[5]:BEAT/4;
    // No broker means silence: never bypass the global voice budget.
    const token=voiceAudio.acquireVoice?.({priority:3,foreground:true,ms:(duration+.03)*1000});
    if(!token||!token.active)return;
    let source,gain,filter,pan;
    try{
      gain=ac.createGain();filter=ac.createBiquadFilter();pan=ac.createPanner();
      pan.panningModel='HRTF';pan.distanceModel='inverse';pan.refDistance=1;pan.maxDistance=40;pan.rolloffFactor=1.3;
      soundPoint.set(r.n.x,(r.n.baseY||0)+1.2,r.n.z);
      pan.positionX.value=soundPoint.x;pan.positionY.value=soundPoint.y;pan.positionZ.value=soundPoint.z;
      const t=token.startAt,base=NOTES[((step%5)+5)%5],wave=profile?profile[0]:'sine';
      if(wave==='noise'){
        if(noiseContext!==ac){noiseContext=ac;noiseBuffer=ac.createBuffer(1,4096,ac.sampleRate);const data=noiseBuffer.getChannelData(0);let seed=1977;for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;data[i]=seed/2147483648-1;}}
        source=ac.createBufferSource();source.buffer=noiseBuffer;source.loop=true;
      }else{
        source=ac.createOscillator();source.type=wave;const f=base*(profile?profile[4]:1);
        source.frequency.setValueAtTime(f,t);source.frequency.exponentialRampToValueAtTime(Math.max(30,moveIndex===11?f*2:moveIndex===15?f*1.5:f*.75),t+duration);
      }
      filter.type=profile?profile[1]:'lowpass';filter.frequency.setValueAtTime(profile?profile[2]:1200,t);filter.Q.value=profile?profile[3]:.7;
      if(moveIndex===8||moveIndex===1)filter.frequency.exponentialRampToValueAtTime(profile[2]*.35,t+duration);
      const pulses=profile?profile[6]:1,attack=profile?profile[7]:.008,volume=soft ? .045 : moveIndex===13 ? .065 : .12;
      gain.gain.setValueAtTime(.0001,t);
      for(let i=0;i<pulses;i++){const beat=t+i*duration/pulses;gain.gain.exponentialRampToValueAtTime(volume,beat+Math.min(attack,duration/pulses*.3));gain.gain.exponentialRampToValueAtTime(.0001,beat+duration/pulses-.002);}
      source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(token.gain);token.gain.connect(bus);if(!token.track(source))throw new Error('voice admission expired');voices[slot]=source;
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();token.release();if(voices[slot]===source)voices[slot]=null;};source.start(t);source.stop(t+duration+.02);
    }catch{try{source?.stop();}catch{}source?.disconnect();filter?.disconnect();gain?.disconnect();pan?.disconnect();token.release();voices[slot]=null;}
  }
  function makeAvatar(){
    if(avatar)return;
    const rig=buildCharacter(THREE,ctx.M,{head:'human',clothing:'tracksuit',shape:[1,1,1],quality:ctx.quality,
      colors:{skin:'#c98e6c',jacket:'#64717b',trousers:'#535d67',shirt:'#d8cdb5',shoes:'#302b28'}});
    rig.setPreset?.('incredulidade',.35);
    const root=new THREE.Group();root.name='combat-visitor';root.rotation.order='YXZ';root.add(rig.mesh);root.visible=false;ctx.scene.add(root);
    avatar={S:{name:'visitor'},root,rig,body:rig.bones.body,head:rig.bones.head,arms:rig.bones.arms,legs:rig.bones.legs,
      x:0,z:0,baseY:0,yaw:0,colW:.35,colH:rig.height,busy:false,combatControlled:false};
    visitor=record(avatar,true);
  }
  function eligible(n,allowSeated=false){return n&&(!n.S.seated||allowSeated)&&!n.combatHidden&&!n.busy&&!n.goOn&&n.sillyT<0&&n.windT<=0&&n.pestT<=0&&n.hatState<=0;}
  function chooseDonor(target){
    let chosen=null,best=81;
    for(let i=0;i<npcs.length;i++){const n=npcs[i];if((n.slotIndex??npcs.indexOf(n))>=1&&(n.slotIndex??npcs.indexOf(n))<=5||n===target||!eligible(n,true)||n.routineMoving||n.talkT>0)continue;const dx=n.x-position.x,dz=n.z-position.z,d=dx*dx+dz*dz;if(d>best){best=d;chosen=n;}}
    return chosen;
  }
  function prepareCollision(){
    colliders.length=0;const x=(a.n.x+b.n.x)*.5,z=(a.n.z+b.n.z)*.5;
    // The car's world boxes are dropped only while the visitor rides inside (a yawed car's boxes cover
    // its own aisle); docked, with the visitor on the platform, the walls still stop a fight through them.
    const tram=state.venue==='tram'&&ctx.scene.userData.tramRide?.carrier?.riding?ctx.scene.userData.tramRide:null;
    for(let i=0;i<world.colliders.length;i++){const c=world.colliders[i];if(c===a.n.col||c===b.n.col||c===donor?.col||tram?.isCarCollider?.(c))continue;
      if(c.maxX<x-12||c.minX>x+12||c.maxZ<z-12||c.minZ>z+12)continue;
      if(colliders.length>=1024)return false;colliders.push(c);
    }return true;
  }
  function blockedSegment(x,z,tx,tz,list=colliders){
    const dx=tx-x,dz=tz-z;
    for(let i=0;i<list.length;i++){
      const c=list[i];if((c.maxY??Infinity)<.9||(c.minY??0)>2.5)continue;
      let lo=0,hi=1;
      if(Math.abs(dx)<1e-8){if(x<c.minX-.2||x>c.maxX+.2)continue;}else{let p=(c.minX-.2-x)/dx,q=(c.maxX+.2-x)/dx;if(p>q){const k=p;p=q;q=k;}lo=Math.max(lo,p);hi=Math.min(hi,q);}
      if(Math.abs(dz)<1e-8){if(z<c.minZ-.2||z>c.maxZ+.2)continue;}else{let p=(c.minZ-.2-z)/dz,q=(c.maxZ+.2-z)/dz;if(p>q){const k=p;p=q;q=k;}lo=Math.max(lo,p);hi=Math.min(hi,q);}
      if(lo<=hi&&hi>0&&lo<1)return true;
    }return false;
  }
  // Only what stands between the two fighters counts: a bench or a planter at either
  // one's feet must not refuse the fight, a wall between them still does.
  function blockedBetween(ax,az,bx,bz){const dx=bx-ax,dz=bz-az;return blockedSegment(ax+dx*.3,az+dz*.3,ax+dx*.7,az+dz*.7);}
  // A walking opponent closes to 1.45 m before the first blow: the fight must still be clear
  // along that shorter line, or it would start and no blow could ever land.
  function blockedFight(){const dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz),k=d>1.45&&!b.n.fixed?1.45/d:1;return blockedBetween(a.n.x,a.n.z,b.n.x,b.n.z)||k<1&&blockedBetween(a.n.x,a.n.z,a.n.x+dx*k,a.n.z+dz*k);}
  // Shots, most preferred first. Open ground: 0-1 the profile (both fighters side-on, 3.6 m out,
  // the visitor on the left first), 2-5 the three-quarter and over-the-shoulder views, 6-21 a
  // tighter ring, 22 the crane, 23 overhead. Riding the tram: 24-27, inside the car.
  const SHOTS=24,CRANE=22,TRAM_SHOTS=4;
  function shotAt(i,x,z,dx,dz,d,floor,carrier){
    if(i>=SHOTS){const c=Math.cos(carrier.yaw),sn=Math.sin(carrier.yaw),dx0=x-carrier.x,dz0=z-carrier.z,lx=c*dx0-sn*dz0,lz=sn*dx0+c*dz0,j=i-SHOTS;
      const cz=lz+(j%2?1.65:-1.65),cx=j<2?0:(j===2 ? .3 : -.3),g=groundAt(carrier.localWorld.regions,cx,cz,.35,.1);
      if(g===null||blockedSegment(lx,lz,cx,cz,carrier.localWorld.colliders))return false;
      cameraPoint.set(carrier.x+c*cx+sn*cz,g+1.85,carrier.z-sn*cx+c*cz);return true;}
    if(i<2){const side=i?-1:1,cx=x-dz/d*3.6*side,cz=z+dx/d*3.6*side,g=groundAt(world.regions,cx,cz,controls.floor,.65);
      if(g===null||blockedSegment(x,z,cx,cz))return false;
      cameraPoint.set(cx,Math.max(g,floor)+1.95,cz);return true;}
    if(i<6){const j=i-2,side=j%2===0?1:-1,along=j>=2,ox=(along?dx:(-dx*.55-dz*.84))/d*3.8*side,oz=(along?dz:(-dz*.55+dx*.84))/d*3.8*side;
      // On the fight axis the near body hid the opponent: shift over the shoulder and up.
      const lat=along?1.3:0,cx=x+ox-dz/d*lat,cz=z+oz+dx/d*lat,g=groundAt(world.regions,cx,cz,controls.floor,.65);
      if(g===null||blockedSegment(x,z,cx,cz))return false;
      cameraPoint.set(cx,Math.max(g,floor)+(along?2.45:2.05),cz);return true;}
    // Crowded spots (benches, the pool edge, trees) must not refuse a fight: a tighter
    // ring at eight angles, then a crane shot over the visitor's shoulder, then overhead.
    if(i<CRANE){const j=i-6,r=j<8?3:2.2,ang=(j%8)*Math.PI/4,cx=x+Math.cos(ang)*r,cz=z+Math.sin(ang)*r,g=groundAt(world.regions,cx,cz,controls.floor,.9);
      if(g===null||blockedSegment(x,z,cx,cz))return false;
      cameraPoint.set(cx,Math.max(g+2.05,floor+2.05),cz);return true;}
    // The crane and overhead shots are for open ground: in or beside the tram they would show
    // the car's roof, so there the old rule stands (no camera, no fight).
    if(state.venue==='tram')return false;
    const car=ctx.scene.userData.tramRide?.carrier;
    if(car){const c=Math.cos(car.yaw),s=Math.sin(car.yaw),ox=x-car.x,oz=z-car.z;if(Math.abs(c*ox-s*oz)<3.4&&Math.abs(s*ox+c*oz)<6)return false;}
    if(i===CRANE){const bx=a.n.x-dx/d*1.4,bz=a.n.z-dz/d*1.4;if(blockedSegment(x,z,bx,bz))return false;cameraPoint.set(bx,floor+3.2,bz);return true;}
    cameraPoint.set(x-dx/d*.35,floor+4.2,z-dz/d*.35);return true;
  }
  function placeCamera(){
    const x=(a.n.x+b.n.x)*.5,z=(a.n.z+b.n.z)*.5,dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz)||1;
    const floor=Math.max(a.n.baseY||0,b.n.baseY||0);cameraAim.set(x,floor+1.15,z);
    const carrier=state.venue==='tram'?ctx.scene.userData.tramRide?.carrier:null,first=carrier?.riding?SHOTS:0,last=first?SHOTS+TRAM_SHOTS:SHOTS;
    // Hysteresis: the chosen shot stays while it is valid, so the camera never hops between two
    // good candidates from one frame to the next. The crane and overhead are never blocked, so
    // from them a better view is looked for again every 0.6 s, not every frame.
    if(shot>=first&&shot<last&&!(shot>=CRANE&&shot<SHOTS&&clock>=shotRetry)&&shotAt(shot,x,z,dx,dz,d,floor,carrier))return true;
    for(let i=first;i<last;i++)if(shotAt(i,x,z,dx,dz,d,floor,carrier)){if(i>=CRANE&&i<SHOTS)shotRetry=clock+.6;shot=i;return true;}
    shot=-1;return false;
  }
  // From 1.8 m out to the slap's 2.1 m the visitor steps in to the guard distance first, through
  // the ordinary collision; a step that cannot get within reach is undone, as is one taken for a
  // fight then refused.
  function halfStep(n){
    stepX=stepZ=0;const dx=n.x-position.x,dz=n.z-position.z,d=Math.hypot(dx,dz);if(d<=GUARD_REACH)return true;
    const x0=position.x,z0=position.z,k=(d-GUARD_STEP)/d;controls.combatMove(dx*k,dz*k);readVisitor();stepX=position.x-x0;stepZ=position.z-z0;
    if(Math.hypot(n.x-position.x,n.z-position.z)<=GUARD_REACH+.000001)return true;stepBack();return false;
  }
  function stepBack(){if(stepX||stepZ){controls.combatMove(-stepX,-stepZ);readVisitor();}stepX=stepZ=0;}
  // Mid-fight, a fresh blow pressed from just out of reach (pushed back by the last hits, or facing
  // someone who cannot walk) steps in to the guard distance first, through the same collision.
  function closeIn(){
    const dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz);if(d<=GUARD_REACH||d>2.6||!grounded(a)||controls.airborne)return;
    const k=(d-GUARD_STEP)/d;controls.combatMove(dx*k,dz*k);readVisitor();a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;
  }
  function begin(first,second,kind,allowSeated=false,venue=''){
    if(state.active||freeze()||quiet()||!canAct()||!first||!second)return false;
    a=first;b=second;donor=null;state.venue=venue;readVisitor();
    if(kind==='visitor'&&(!canStart()||controls.seated)){toast(controls.seated?'Levanta-te para a porrada.':'Larga a bola de papel. Isto é porrada, não é basquetebol.');a=b=null;return false;}
    if(kind==='visitor'){
      if(!eligible(b.n,allowSeated)){toast('Agora não dá para porrada.');a=b=null;return false;}
      if(Math.hypot(position.x-b.n.x,position.z-b.n.z)>GUARD_START||Math.abs(position.y-1.62-(b.n.baseY||0))>.8){toast('Chega mais perto do trombil.');a=b=null;return false;}
      donor=chooseDonor(b.n);if(!donor){toast('O palco está cheio.');a=b=null;return false;}
      if(!halfStep(b.n)){toast('Sem espaço para a porrada.');a=b=null;donor=null;return false;}
      a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;
    }else if(!eligible(a.n,allowSeated)||!eligible(b.n,allowSeated)||Math.hypot(a.n.x-position.x,a.n.z-position.z)>40||Math.hypot(b.n.x-position.x,b.n.z-position.z)>40||Math.hypot(a.n.x-b.n.x,a.n.z-b.n.z)>6||Math.abs((a.n.baseY||0)-(b.n.baseY||0))>.8){a=b=null;return false;}
    shot=-1;
    if(!prepareCollision()||(kind==='visitor'&&(blockedFight()||!placeCamera()))){if(kind==='visitor')stepBack();toast('Sem espaço para a porrada.');a=b=null;donor=null;return false;}
    stepX=stepZ=0;
    capture(a);capture(b);a.inPlace=b.inPlace=allowSeated;
    if(donor){donor.combatShadowProxy=avatar;donor.combatOldBusy=donor.busy;donor.busy=true;donor.combatHidden=true;donor.combatHitMask=donor.hit.layers.mask;donor.hit.layers.mask=0;}
    if(kind==='visitor')avatar.root.visible=true;
    followReady=false;guardHeld=false;nagPending=false;shownA=shownB=100;
    for(const n of npcs){n.bubble=0;n.talkT=0;if(n.sprite)n.sprite.visible=false;}
    state.active=true;state.id++;state.kind=kind;state.venue=venue;arenaX=(a.n.x+b.n.x)*.5;arenaZ=(a.n.z+b.n.z)*.5;climaxFight=false;visitorStatus.fell=false;visitorStatus.fightId=state.id;enteredAt=clock;endingAt=0;loser=null;queueCount=aiTurn=0;hitstop=shake=0;blockAt=-Infinity;dodgeUntil=0;dodgeReady=clock;counterUntil=0;nextAi=clock+BEAT*2;scriptEnd=clock+8;
    controls.releaseCombatKeys?.();ctx.audio?.duck?.(8);emit('fightStarted',.2);callout(kind==='visitor'?'Olha a porrada!':'Vai haver porrada!');
    koAt=slowUntil=0;koWinner=null;matchOver=false;releaseGrab();state.ko=false;state.round=0;state.winsA=state.winsB=state.comboA=state.comboB=0;
    if(arcade){arcade.setStill(ctx.reducedMotion);arcade.clear();arcade.setNames(nameOf(id(a)),nameOf(id(b)));arcade.setWins(0,0);
      if(kind==='visitor'&&hintsShown<2){hintsShown++;arcade.line(coarse?TOUCH_HINT:MOVE_HINT,clock,6,true);}}
    startRound(1);uiDirty=true;return true;
  }
  // Best of three: BRIO back to full, both on their feet, the opponent opens with a single blow.
  // 'round' carries the round number and, in `final`, whether it decides the match.
  function startRound(n){
    state.round=n;state.final=state.kind==='visitor'&&(n>=3||a.wins===WINS-1&&b.wins===WINS-1);resetFighter(a);resetFighter(b);
    a.pride=b.pride=100;shownA=shownB=100;hitstop=0;nextAi=clock+BEAT*2;state.ko=false;uiDirty=true;
    // Each round is fought where the last one ended: the 6 m leash is measured from here.
    arenaX=(a.n.x+b.n.x)*.5;arenaZ=(a.n.z+b.n.z)*.5;
    const e=emit('round',n/3,'');e.final=state.final;
    if(arcade&&state.kind==='visitor'){arcade.setWins(a.wins,b.wins);arcade.round(n,state.final,clock);}
  }
  // The round's loser gets up (RISE_TIME, untouchable) while the next round is called.
  function nextRound(){
    const fallen=loser;if(fallen)fallen.n.comedyPuddle=0;koAt=slowUntil=0;endingAt=0;koWinner=null;loser=null;startRound(state.round+1);if(fallen)fallen.rise=RISE_TIME;
  }
  function engage(object,{explicit=false}={}){
    if(!explicit&&(!state.active||state.kind!=='visitor'))return false;
    const n=npcModule.findActor(object);if(!n)return false;
    if(state.active&&state.kind==='visitor')return attack(0);
    let joining=false,oldVenue='',oldTrip='';
    if(state.active){if(n!==a.n&&n!==b.n)return false;if(!canStart()||controls.seated||!chooseDonor(n)){toast('Levanta-te e liberta espaço.');return false;}readVisitor();if(Math.hypot(position.x-n.x,position.z-n.z)>GUARD_START)return false;makeAvatar();const oldA=a,oldB=b;a=visitor;b=byNpc.get(n);a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;const spaceReady=prepareCollision()&&!blockedFight()&&placeCamera();a=oldA;b=oldB;if(!spaceReady){prepareCollision();toast('Sem espaço para a porrada.');return false;}joining=true;oldVenue=state.venue;oldTrip=tripId;end('joined');}
    const onTram=joining?oldVenue==='tram':!!ctx.scene.userData.tramRide?.hasPassenger?.(n);
    makeAvatar();if(!begin(visitor,byNpc.get(n),'visitor',onTram,onTram?'tram':''))return false;
    if(joining){climaxFight=true;state.venue=oldVenue;tripId=oldTrip;}return true;
  }
  function startScripted(aId,bId,options={}){
    let x=null,y=null;for(let i=0;i<records.length;i++){if(id(records[i])===aId)x=records[i];if(id(records[i])===bId)y=records[i];}
    if(x===y||!begin(x,y,'scripted',!!options.allowSeated,options.venue||''))return false;scriptEnd=clock+clamp(options.duration||6,1,8);state.venue=options.venue||'';tripId=options.tripId||'';climaxFight=!!options.climax;scriptedResult.completed=false;if(state.venue==='tram')callout('Porrada no comboio!');return true;
  }
  function end(reason='finished'){
    if(!state.active)return;restoreCamera();
    if(reason==='ko'&&state.kind==='visitor'){const won=loser===b;if(!won)b.n.rancor=(b.n.rancor||0)+2;ctx.events?.dispatchEvent?.(new CustomEvent('workshop',{detail:{type:won?'porrada-win':'porrada-loss',value:{fightId:state.id,opponentId:id(b),climax:climaxFight,tripId,brioRemaining:a.pride,amount:won?10+Math.floor(a.pride/10):-5}}}));}
    if((state.kind==='scripted'||climaxFight)&&reason!=='joined'){scriptedResult.sequence++;scriptedResult.fightId=state.id;scriptedResult.completed=reason==='ko'||reason==='finished';scriptedResult.visitorWon=state.kind==='visitor'&&reason==='ko'&&loser===b;scriptedResult.winner=reason==='ko'?id(loser===a?b:a):a.pride>b.pride?id(a):b.pride>a.pride?id(b):'';}
    emit('fightEnded',reason==='ko'?1:0);restore(a);restore(b);
    if(donor){donor.combatShadowProxy=null;donor.busy=donor.combatOldBusy;donor.combatHidden=false;donor.hit.layers.mask=donor.combatHitMask;donor=null;}
    if(avatar){avatar.root.visible=false;avatar.comedyPuddle=0;}particles.clear();followReady=false;guardHeld=false;nagPending=false;shot=-1;state.active=false;state.paused=false;queueCount=0;stopSounds();controls.releaseCombatKeys?.();a=b=null;uiDirty=true;
    releaseGrab();koAt=slowUntil=0;koWinner=null;state.ko=false;arcade?.clear();
  }
  function launch(r,index){r.attack=index;r.t=0;r.landed=false;r.clean=r.guarded=false;r.attackCount++;r.boost=r.visitor&&clock<counterUntil?1.5:1;if(r.visitor)counterUntil=0;sound(r,index%5,true);
    // The opponent sees some of the visitor's blows coming and guards through their contact.
    if(r.visitor&&b&&free(b)&&random()<AI_GUARD)b.guardUntil=clock+MOVES[index].windup+.25;}
  // Free to start a blow; on the feet; still reeling, so the next hit continues a combo.
  function free(r){return r.attack<0&&r.stun<=0&&!r.airborne&&r.down<=0&&r.rise<=0&&r.splat<=0&&!r.grab;}
  function grounded(r){return !r.airborne&&r.down<=0&&r.rise<=0&&r.splat<=0;}
  function hurt(r){return r.stun>0&&r.stunHit||r.airborne||r.down>0||r.splat>0;}
  // A string's next blow may start: after a clean hit from contact + CANCEL (the cancel window);
  // after a block or a miss once the blow is over, for CHAIN_GRACE.
  function chainReady(r){if(r.stun>0||r.airborne||r.down>0||r.rise>0||r.grab)return false;if(r.attack<0)return r.depth>0&&ft<=r.chainUntil;return r.clean&&r.t>=MOVES[r.attack].windup+CANCEL;}
  // `late`: how long ago (fight time) the blow could have started; carried into it so a string
  // combos the same at 30 fps as at 60 (never more than half the wind-up, which stays visible).
  function startChain(r,m,late=0){r.depth=1;r.path[0]=m;r.chainUntil=-1;launch(r,m);r.t=clamp(late,0,MOVES[m].windup*.5);}
  function nextInChain(r,m,late=0){if(r.depth<r.path.length)r.path[r.depth]=m;r.depth++;r.chainUntil=-1;launch(r,m);r.t=clamp(late,0,MOVES[m].windup*.5);}
  // Since when the fighter's chain window has been open (on a clean hit: contact + CANCEL; after the blow: its end).
  function chainLate(r){return r.attack>=0?Math.max(0,r.t-MOVES[r.attack].windup-CANCEL):Math.max(0,ft-r.endedAt);}
  // Every attack key lands here: Q the chosen blow (a chapada unless another was picked), R revés,
  // Z rasteira, C abraço de urso, F chinelada. Held in a hug, C breaks free; any other key wastes the try.
  function press(key,move=selected){
    if(!state.active||endingAt||state.kind!=='visitor'||freeze()||quiet())return false;
    if(a.grab===2){if(key==='C'&&!a.breakLock)breakThrow();else a.breakLock=true;return true;}
    const index=clamp(move|0,0,15);
    if(equipped){const chosen=WEAPONS[equipped];if(equipped==='luva'){callout('Exijo satisfação!');emit('ceremony',.4,'luva');}
      if(free(a)){a.depth=0;launch(a,chosen);}else if(queueCount<3)queue[queueCount++]=chosen;return true;}
    a.bufKey=key||'';a.bufMove=index;a.bufAt=ft;serveInput(a);return true;
  }
  function attack(index=selected){const m=clamp(index|0,0,15);return press(MOVE_KEY[m],m);}
  // The buffered key comes out as soon as it can: the string's next blow when its window opens,
  // or a fresh blow once the fighter is free. Older than BUFFER, it is dropped.
  function serveInput(r){
    if(r.attack<0&&r.depth>0&&ft>r.chainUntil)r.depth=0;
    if(r.visitor&&queueCount&&free(r)){const next=queue[0];for(let i=1;i<queueCount;i++)queue[i-1]=queue[i];queueCount--;r.depth=0;launch(r,next);return;}
    if(r.bufMove<0)return;if(ft-r.bufAt>BUFFER){r.bufMove=-1;r.bufKey='';return;}
    const s=findContinuation(id(r),r.path,r.depth,r.bufKey);
    if(s>=0){if(chainReady(r)){const m=STRINGS[s].moves[r.depth],late=Math.min(chainLate(r),ft-r.bufAt);r.bufMove=-1;r.bufKey='';nextInChain(r,m,late);}return;}
    // A fresh blow starts on the frame (no carry): recovery + the quickest wind-up always outlasts
    // a hitstun, so the same blows pressed again never loop into an endless combo.
    if(free(r)){const m=r.bufMove;r.bufMove=-1;r.bufKey='';if(r.visitor)closeIn();startChain(r,m);}
  }
  function block(value){if(!state.active||state.kind!=='visitor'||freeze())return;a.blocking=!!value;if(value)blockAt=clock;uiDirty=true;}
  function dodge(){
    if(!state.active||state.kind!=='visitor'||freeze()||clock<dodgeReady||a.grab||!grounded(a)||a.stun>0&&a.stunHit)return false;
    dodgeReady=clock+.8;dodgeUntil=clock+.3;const dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz)||1;
    controls.combatMove(-dz/d*.55,dx/d*.55);sound(a,4,true);emit('dodge',.2);return true;
  }
  function hit(r,target,move){
    const dx=target.n.x-r.n.x,dz=target.n.z-r.n.z,d=Math.hypot(dx,dz);
    // Two torso spheres; extend the attacking centre along its reach, then test.
    const ux=d?dx/d:0,uz=d?dz/d:1,sx=dx-ux*.85,sz=dz-uz*.85,dy=(target.n.baseY||0)-(r.n.baseY||0);
    if(d>move.range||sx*sx+sz*sz+dy*dy>1.05*1.05||state.venue!=='tram'&&blockedBetween(r.n.x,r.n.z,target.n.x,target.n.z))return;
    // Held in a hug or getting up: out of reach. On the floor only a stomp still lands.
    if(target.grab||target.rise>0||target.down>0&&move.pose!=='stomp')return;
    if(target.visitor&&(clock<dodgeUntil||(move.pose==='sweepLeg'||move.pose==='stomp')&&controls.airborne)){counterUntil=clock+.75;emit('dodge',.3,move.id);return;}
    const air=target.airborne||target.splat>0||target.down>0,tram=state.venue==='tram';
    // Swinging drops the guard, and so does reeling from a clean hit or flying.
    const guarded=target.blocking&&!air&&target.attack<0&&!(target.stun>0&&target.stunHit),perfect=guarded&&target.visitor&&clock-blockAt<.22;
    // Counter-hit: caught in the wind-up of a blow of their own.
    const counter=!guarded&&target.attack>=0&&target.t<MOVES[target.attack].windup;
    r.combo=guarded?0:hurt(target)?r.combo+1:1;
    const courage=r.visitor&&ctx.scene.userData.bairroEffects?.courageUntil>performance.now()/1000&&new Date().getDay()===2?2:1;
    let damage=Math.round(move.power*r.boost*courage*(guarded ? .2 : (counter?COUNTER_DAMAGE:1)*comboScale(r.combo)*(air?.85:1)));if(perfect){damage=0;counterUntil=clock+.8;callout('Ó trombil de papo seco!');}
    if(guarded)r.guarded=true;else r.clean=true;
    target.spring.v+=(guarded?.5:1.8)*RECOIL;
    if(!ctx.reducedMotion)particles.burst(target.n.x,(target.n.baseY||0)+1.15+target.air,target.n.z,ux,uz);
    const push=(perfect ? .05 : guarded ? .15 : air ? .25 : .55)*RECOIL;
    target.pride=Math.max(0,target.pride-damage);if(!target.visitor&&damage>0)target.n.rancor=(target.n.rancor||0)+1;target.recoilX=ux*push;target.recoilZ=uz*push;
    let launched=false;
    // A blow the opponent guarded is answered as soon as its blockstun ends.
    if(guarded){target.stun=BLOCKSTUN;target.stunHit=false;if(!target.visitor&&state.kind==='visitor'){target.punish=true;nextAi=Math.min(nextAi,clock+BLOCKSTUN+.02);}}
    else{
      // A clean hit stops whatever the target was doing and decides how it reels: a stomp lifts
      // a body off the floor, a hit in the air keeps it up, the attacker's launcher sends it up,
      // a rasteira trips it, anything else stuns it (longer on a counter-hit).
      target.attack=-1;target.depth=0;target.aiString=-1;target.aiJuggle=0;if(target.visitor)queueCount=0;
      const lift=tram?TRAM_LIFT:1;
      if(target.down>0){target.down=0;liftOff(target,OTG_V*lift);target.juggles++;}
      else if(target.splat>0)target.juggles++;
      else if(target.airborne)juggleHit(target,lift);
      else if(move.index===launcherOf(id(r))){liftOff(target,LAUNCH_V*lift);target.juggles=0;target.bounced=target.trip=false;launched=true;if(!r.visitor)r.aiJuggle=AI_JUGGLES;}
      else if(move.pose==='sweepLeg'){liftOff(target,TRIP_V*lift);target.juggles=0;target.trip=target.bounced=true;}
      else{target.stun=HITSTUN[move.index]+(counter?COUNTER_STUN:0);target.stunHit=true;}
    }
    if(!ctx.reducedMotion){hitstop=counter?.06+COUNTER_STOP:launched?.09:.06;shake=counter||launched?.22:.16;}
    if(counter){emit('counter',.7,move.id).by=id(r);if(arcade&&state.kind==='visitor')arcade.call('counter','CONTRA!',clock);}
    if(launched)emit('launch',.6,move.id).by=id(r);
    sound(target,r.combo%5+(counter?2:0),guarded,id(r)==='velho'&&move.index===8?4:move.index);
    const e=emit('impact',damage/25,equipped&&r.visitor?equipped:move.id);e.by=id(r);e.counter=counter;e.combo=r.combo;e.step=r.depth;uiDirty=true;
    if(arcade&&state.kind==='visitor'&&r.combo>=2)arcade.combo(r.combo,r===b,clock);
    if(r.visitor&&move.index<=2)onSlap();
    if(!target.visitor&&damage>0)npcModule.combatImpact?.(target.n,false,move.id);
    if(damage>0)callout(r.visitor?'Levas no trombil!':'Fecha o trombil!');
    if(target.pride===0)knockout(r,target,move);
  }
  // A round's K.O.: slow motion, the camera pushes in, «K.O.!», then the winner's pose and line,
  // and the next round or the end of the match. 'ko' names the round's winner and, in `final`,
  // whether it decided the match; a deciding K.O. is still followed by the old 'knockout'.
  let tauntShown=false;
  function knockout(w,l,move){
    const visitorFight=state.kind==='visitor';w.wins++;matchOver=!visitorFight||w.wins>=WINS;loser=l;koWinner=w;koAt=clock;state.ko=true;tauntShown=false;state.winsA=a.wins;state.winsB=b.wins;
    slowUntil=visitorFight&&!ctx.reducedMotion?clock+KO_SLOW:0;
    endingAt=clock+(visitorFight?(matchOver?KO_MATCH:KO_ROUND):(l.visitor||!npcModule.comedyMemory?2.4:.8));
    releaseGrab();w.attack=l.attack=-1;w.depth=l.depth=0;w.aiString=l.aiString=-1;w.aiJuggle=l.aiJuggle=0;w.bufMove=l.bufMove=-1;w.stun=l.stun=0;queueCount=0;
    if(!l.airborne&&l.splat<=0)l.down=DOWN_TIME;
    if(l.visitor)visitorStatus.fell=true;
    if(matchOver)l.n.comedyPuddle=l.visitor||!npcModule.comedyMemory?1:0;
    callout('Eh, calma, Zé!');const e=emit('ko',1,move.id);e.winner=id(w);e.final=matchOver;
    if(matchOver)emit('knockout',1,move.id);
    if(arcade&&visitorFight){arcade.comboEnd(clock);arcade.setWins(a.wins,b.wins);arcade.call('ko','K.O.!',clock);}
  }
  // The bear hug: at the end of its wind-up it grabs a fighter on the feet within GRAB_RANGE,
  // whatever the guard. A jump or a dodge escapes it, and a reeling fighter can only be grabbed
  // from inside a string. The held one has BREAK_WINDOW to press C; then the slam.
  let grabCombo=0;
  function tryGrab(r,target){
    const dx=target.n.x-r.n.x,dz=target.n.z-r.n.z,d=Math.hypot(dx,dz),dy=(target.n.baseY||0)-(r.n.baseY||0);
    if(d>GRAB_RANGE||Math.abs(dy)>.5||state.venue!=='tram'&&blockedBetween(r.n.x,r.n.z,target.n.x,target.n.z)||target.grab||!grounded(target)
      ||target.stun>0&&!(target.stunHit&&r.depth>1)||target.visitor&&(clock<dodgeUntil||controls.airborne))return false;
    grabCombo=hurt(target)?r.combo:0;grabber=r;grabbed=target;grabT=0;r.grab=1;target.grab=2;r.clean=true;
    target.attack=-1;target.depth=0;target.aiString=-1;target.aiJuggle=0;target.stun=0;target.breakLock=false;target.bufMove=-1;if(target.visitor)queueCount=0;
    aiBreakAt=!target.visitor&&random()<AI_BREAK?.16+random()*.24:Infinity;
    emit('grab',.5,'abraco').by=id(r);sound(r,2,true,GRAB);
    if(arcade&&state.kind==='visitor'){if(target.visitor){arcade.call('grab',GRAB_PROMPT,clock);if(throwButton)throwButton.className='is-break';}else arcade.call('slam','ABRAÇO DE URSO!',clock);}
    return true;
  }
  function stepGrab(step){if(!grabber)return;grabT+=step;if(grabT>=aiBreakAt)breakThrow();else if(grabT>=BREAK_WINDOW)slam();}
  function releaseGrab(){if(grabber)grabber.grab=0;if(grabbed)grabbed.grab=0;if(grabbed?.visitor&&arcade)arcade.clearCall();grabber=grabbed=null;grabT=0;aiBreakAt=Infinity;if(throwButton)throwButton.className='';}
  function breakThrow(){
    const r=grabber,t=grabbed;if(!r)return;releaseGrab();
    const dx=t.n.x-r.n.x,dz=t.n.z-r.n.z,d=Math.hypot(dx,dz)||1,push=.9*RECOIL;
    r.recoilX=-dx/d*push;r.recoilZ=-dz/d*push;t.recoilX=dx/d*push;t.recoilZ=dz/d*push;r.attack=-1;r.depth=0;r.aiString=-1;
    r.stun=t.stun=.2;r.stunHit=t.stunHit=false;r.spring.v+=.8;t.spring.v+=.8;
    emit('throwBreak',.4,'abraco').by=id(t);sound(t,4,true);if(arcade&&state.kind==='visitor')arcade.call('escape','SOLTOU-SE!',clock);
  }
  function slam(){
    const r=grabber,t=grabbed;if(!r)return;releaseGrab();
    r.combo=grabCombo>0?grabCombo+1:1;
    const dx=t.n.x-r.n.x,dz=t.n.z-r.n.z,d=Math.hypot(dx,dz),ux=d?dx/d:0,uz=d?dz/d:1;
    const courage=r.visitor&&ctx.scene.userData.bairroEffects?.courageUntil>performance.now()/1000&&new Date().getDay()===2?2:1;
    const damage=Math.round(THROW_POWER*r.boost*courage*comboScale(r.combo));
    t.pride=Math.max(0,t.pride-damage);if(!t.visitor&&damage>0)t.n.rancor=(t.n.rancor||0)+1;
    t.recoilX=ux*.4*RECOIL;t.recoilZ=uz*.4*RECOIL;t.spring.v+=1.8*RECOIL;liftOff(t,(TRIP_V+.6)*(state.venue==='tram'?TRAM_LIFT:1));t.juggles=0;t.trip=t.bounced=true;
    if(!ctx.reducedMotion){hitstop=.1;shake=.24;particles.burst(t.n.x,(t.n.baseY||0)+.6,t.n.z,ux,uz);}
    sound(t,0,false,GRAB);emit('throw',.8,'abraco').by=id(r);const e=emit('impact',damage/25,'abraco');e.by=id(r);e.combo=r.combo;e.step=r.depth;uiDirty=true;
    if(arcade&&state.kind==='visitor'){arcade.call('slam','ABRAÇO DE URSO!',clock);if(r.combo>=2)arcade.combo(r.combo,r===b,clock);}
    if(!t.visitor&&damage>0)npcModule.combatImpact?.(t.n,false,'abraco');
    if(damage>0&&id(r)==='forcado')ctx.events?.dispatchEvent?.(new CustomEvent('workshop',{detail:{type:'forcado-signature',value:{fightId:state.id,npcId:'forcado',eventId:'combat-'+state.id+'-pega-'+r.attackCount}}}));
    if(t.pride===0)knockout(r,t,MOVES[GRAB]);
  }
  // Something solid right behind (away from the other fighter): the wall a juggle splats on.
  function wallBehind(r){const o=r===a?b:a,dx=r.n.x-o.n.x,dz=r.n.z-o.n.z,d=Math.hypot(dx,dz)||1;return blockedSegment(r.n.x,r.n.z,r.n.x+dx/d*WALL_REACH,r.n.z+dz/d*WALL_REACH);}
  // A launched body comes down: a trip, or the second landing, stays on the floor. The first
  // landing of a launch splats on a wall right behind, or bounces off the floor ("CATRAPUM!").
  function land(r){
    r.airborne=false;if(r.trip||r.bounced){r.trip=false;r.down=DOWN_TIME;return;}
    r.bounced=true;const visitorFight=state.kind==='visitor',tram=state.venue==='tram';
    if(!tram&&wallBehind(r)){r.splat=SPLAT_TIME;r.air=SPLAT_HEIGHT;emit('wallSplat',.7);sound(r,1,false,6);if(arcade&&visitorFight&&!endingAt)arcade.call('wall','PAREDE!',clock);return;}
    liftOff(r,BOUNCE_V*(tram?TRAM_LIFT:1));emit('bounce',.5);sound(r,0,true,6);if(arcade&&visitorFight&&!endingAt)arcade.call('bounce','CATRAPUM!',clock);
  }
  // Stun, flight, the wall, the floor and getting up, in fight time. The round's loser stays down.
  function timers(r,dt){
    if(r.stun>0)r.stun=Math.max(0,r.stun-dt);
    if(r.airborne){if(stepAir(r,dt))land(r);}
    else if(r.splat>0){r.splat=Math.max(0,r.splat-dt);r.air=SPLAT_HEIGHT*r.splat/SPLAT_TIME;if(r.splat<=0){r.air=0;r.down=DOWN_TIME;}}
    else if(r.down>0){if(!(endingAt&&r===loser)){r.down=Math.max(0,r.down-dt);if(r.down<=0)r.rise=RISE_TIME;}}
    else if(r.rise>0)r.rise=Math.max(0,r.rise-dt);
  }
  // The opponent: the first attack of a round is a single blow, then a string STRING_CHANCE of the
  // time. It waits while its target is off its feet or held.
  function aiDecide(ai,foe){
    // Busy with its own blow: the next beat. Kept off its feet or reeling: as soon as it is free.
    if(!free(ai)){if(ai.attack<0&&ai.aiString<0)nextAi=Math.min(nextAi,clock+(ai.punish?.02:.1));return;}
    if(!grounded(foe)||foe.grab){nextAi=Math.min(nextAi,clock+.3);return;}
    const owner=id(ai),distance=Math.hypot(foe.n.x-ai.n.x,foe.n.z-ai.n.z);
    // Right after a block: the quickest blow it has, to catch the visitor's next wind-up.
    if(ai.punish){ai.punish=false;const m=pickQuick(ai,distance);if(m>=0){ai.opened=true;ai.aiString=-1;
      if(random()<STRING_CHANCE)ai.aiString=stringFrom(ai,m);
      aiStart(ai,m);return;}}
    if(ai.opened&&random()<STRING_CHANCE){const s=chooseString(distance,ai.lastMove,ai.repeats,owner,random);if(s>=0){ai.aiString=s;aiStart(ai,STRINGS[s].moves[0]);callout('Vou-te ao trombil!');return;}}
    ai.opened=true;ai.aiString=-1;aiStart(ai,chooseMove(distance,ai.lastMove,ai.repeats,SPECIAL[owner]??-1,random));callout('Vou-te ao trombil!');
  }
  function aiStart(r,m){r.repeats=m===r.lastMove?r.repeats+1:1;r.lastMove=m;r.blocking=false;startChain(r,m);}
  function aiNext(r,m){r.repeats=m===r.lastMove?r.repeats+1:1;r.lastMove=m;r.blocking=false;nextInChain(r,m,chainLate(r));}
  // Its string goes on while the blows connect (at once on a clean hit, after the blow on a block)
  // and stops at a miss or where the next blow could not land; after a launch it keeps the body
  // up with quick blows that still reach it before it comes down.
  function aiFollow(r,target){
    if(endingAt||r.visitor)return;
    if(r.aiString>=0){const s=STRINGS[r.aiString];
      if(r.depth>=s.moves.length||r.landed&&!r.clean&&!r.guarded||r.attack<0&&ft>r.chainUntil)r.aiString=-1;
      else if(chainReady(r)){const m=s.moves[r.depth];
        if(target.rise>0||target.grab||target.down>0&&MOVES[m].pose!=='stomp'||m===GRAB&&!grounded(target))r.aiString=-1;else{aiNext(r,m);return;}}
      if(r.aiString>=0)return;}
    if(r.aiJuggle<=0)return;
    if(!target.airborne&&target.splat<=0){if(!hurt(target)||target.down>0)r.aiJuggle=0;return;}
    if(r.attack>=0?!(r.clean&&r.t>=MOVES[r.attack].windup+CANCEL):!free(r))return;
    const m=pickJuggle(r,target);if(m>=0){r.aiJuggle--;aiStart(r,m);}
  }
  // One of the strings that start with blow m (any of them alike), or -1.
  function stringFrom(r,m){let n=0,pick=-1;for(let i=0;i<STRINGS.length;i++){const s=STRINGS[i];if(s.moves[0]!==m||s.owner&&s.owner!==id(r)||tripleRun(s.moves,r.lastMove,r.repeats))continue;n++;if(random()*n<1)pick=i;}return pick;}
  // A punish: a chapada or a peteleco (the quickest two), whichever is allowed and in reach.
  function pickQuick(r,distance){
    const k=random()<.5?0:1;for(let i=0;i<2;i++){const m=JUGGLE_MOVES[(k+i)%2];if(m===r.lastMove&&r.repeats>=2||distance>MOVES[m].range)continue;return m;}
    return -1;
  }
  function pickJuggle(r,target){
    const left=target.airborne?landsIn(target):target.splat,k=Math.floor(random()*JUGGLE_MOVES.length);
    for(let i=0;i<JUGGLE_MOVES.length;i++){const m=JUGGLE_MOVES[(k+i)%JUGGLE_MOVES.length];if(m===r.lastMove&&r.repeats>=2||MOVES[m].windup+.03>=left)continue;return m;}
    return -1;
  }
  function moveNpc(r,dt,target){
    if(r.visitor){controls.combatMove(r.recoilX*dt,r.recoilZ*dt);return;}
    if(r.inPlace||r.n.fixed)return;
    const dx=target.n.x-r.n.x,dz=target.n.z-r.n.z,d=Math.hypot(dx,dz),hug=(r.grab===2||r.grab===1&&target.visitor)&&d>GRAB_HOLD?Math.min(2.4,(d-GRAB_HOLD)*8):0;
    const chase=hug||(!(ctx.scene.userData.bairroEffects?.patienceUntil>performance.now()/1000)&&!endingAt&&free(r)&&d>1.45&&d<6 ? .7 : 0);
    moveInWorld(r.n.x,r.n.z,0,(r.recoilX+(d?dx/d*chase:0))*dt,(r.recoilZ+(d?dz/d*chase:0))*dt,r.n.colW||.4,world.regions,colliders,active,out);
    if(Math.abs(out.floor)<.1){r.n.x=out.x;r.n.z=out.z;}
  }
  function simulate(r,target,dt){
    moveNpc(r,dt,target);r.recoilX*=Math.exp(-dt*9);r.recoilZ*=Math.exp(-dt*9);timers(r,dt);
    // Holding a hug, the blow's clock waits at contact until the slam or the break.
    if(r.attack<0)return;const previous=r.t;if(r.grab!==1)r.t+=dt*(r.visitor&&equipped==='luva' ? .5 : 1);const move=MOVES[r.attack];
    if(crossedContact(previous,r.t,move,r.landed)){r.landed=true;if(move.index===GRAB)tryGrab(r,target);else hit(r,target,move);if(!state.active||r.attack<0)return;}
    if(r.t>=move.duration){r.attack=-1;r.endedAt=ft-(r.t-move.duration);r.chainUntil=r.depth>0?r.endedAt+CHAIN_GRACE:-1;if(r.visitor&&queueCount){const next=queue[0];for(let i=1;i<queueCount;i++)queue[i-1]=queue[i];queueCount--;r.depth=0;launch(r,next);}}
  }
  function resetJoints(r){
    const b=r.n.rig?.bones;if(!b)return;
    for(const name of jointKeys)if(b[name])for(const joint of b[name])joint.rotation.set(0,0,0);
    if(b.neck)b.neck.rotation.set(0,0,0);if(b.hat)b.hat.rotation.set(0,0,0);if(b.hair)b.hair.rotation.set(0,0,0);if(b.belly)b.belly.scale.set(1,1,1);
  }
  function pose(r,target){
    resetJoints(r);
    const n=r.n;n.head.position.z=r.headZ;for(let i=0;i<6;i++)r.bones[i].rotation.set(0,0,0);
    n.yaw=Math.atan2(target.n.x-n.x,target.n.z-n.z);
    // Up in a juggle, pinned to a wall or hopping as the winner; tilted back when launched, flat on
    // the floor, coming up again (a slump only, in the tram). The tilt pivots at the feet.
    const still=ctx.reducedMotion,ko=endingAt>0&&r===loser,reeling=hurt(r)||r.grab===2;
    const lie=r.down>0?-1.42:r.rise>0?-1.42*r.rise/RISE_TIME:r.airborne?-.55:r.splat>0?-.15:0,want=state.venue==='tram'?lie*.3:lie;
    r.tilt=still?want:r.tilt+(want-r.tilt)*(1-Math.exp(-frameDt*14));
    n.root.position.set(n.x,(n.baseY||0)+r.air+(r.won&&!still?Math.abs(Math.sin((clock-koAt)*7))*.12:0),n.z);
    if(Math.abs(r.tilt)>1e-4){tiltEuler.set(r.tilt,n.yaw,0);n.root.quaternion.setFromEuler(tiltEuler);}else n.root.rotation.set(0,n.yaw,0);
    n.rig?.setExpression?.(reeling||ko?.55:r.won?.7:0,r.won?-.4:reeling||ko?.8:r.pride<40 ? .5 : 0);if(n.blob){n.blob.position.x=n.x;n.blob.position.z=n.z;n.blob.visible=true;}
    n.arms[0].rotation.x=n.arms[1].rotation.x=r.blocking?-1.2:-.25;n.arms[0].rotation.z=-.2;n.arms[1].rotation.z=.2;
    if(r.attack>=0){
      const m=MOVES[r.attack],t=clamp(r.t/m.duration,0,1),sample=sampleCombatMotion(m,r.t,motion),k=sample.drive*(ctx.reducedMotion ? .45 : 1),p=m.pose;
      n.head.rotation.z=(p==='tickle' ? .12 : .05)*k;n.body.rotation.y=sample.twist*(ctx.reducedMotion?.45:1);
      if(p==='stomp'||p==='sweepLeg'){n.legs[1].rotation.x=-.85*k;n.legs[1].rotation.z=(p==='sweepLeg' ? .65 : .1)*k;}
      else if(p==='both'||p==='hug'||p==='tickle'||p==='pillow'){n.arms[0].rotation.x=n.arms[1].rotation.x=-1.25*k;n.arms[0].rotation.z=-.8*(1-k);n.arms[1].rotation.z=.8*(1-k);if(p==='both'){n.arms[0].rotation.y=.9*k;n.arms[1].rotation.y=-.9*k;}if(p==='tickle'&&!ctx.reducedMotion){n.arms[0].rotation.z+=Math.sin(t*28)*.12;n.arms[1].rotation.z-=Math.sin(t*28)*.12;}if(p==='pillow'){n.body.rotation.x=.18*k;n.arms[0].rotation.y=n.arms[1].rotation.y=.25*k;}}
      else{n.arms[1].rotation.x=-(p==='over'?2.5:p==='shoe'?2.1:p==='finger' ? .75 : 1.2)*k;n.arms[1].rotation.z=(p==='back'?-.9:p==='fan'?(ctx.reducedMotion ? .15 : Math.sin(t*24)*.35):p==='shoe'?Math.sin(t*Math.PI*2)*1.1:p==='whip'?Math.sin(t*10)*.9:.8)*k;n.arms[1].rotation.y=(p==='pull'?-1:p==='pinch' ? .7 : 0)*k;}
    }
    if(r.attack>=0&&SPECIAL[id(r)]===r.attack){const k=sampleCombatMotion(MOVES[r.attack],r.t,motion).drive*(ctx.reducedMotion ? .45 : 1);
      if(id(r)==='forcado'){n.body.rotation.x=.35*k;n.head.rotation.x=.2*k;n.arms[0].rotation.x=n.arms[1].rotation.x=-1.6*k;}
      else if(id(r)==='velho'){n.arms[1].rotation.x=-1.8*k;n.body.rotation.y=.1*k;}
      else if(id(r)==='gordo'){n.body.rotation.x=-.25*k;n.arms[0].rotation.z=-.6*k;n.arms[1].rotation.z=.6*k;}
      else if(id(r)==='mano'){n.arms[0].rotation.x=-1.1*k;n.arms[1].rotation.x=-.75*k;n.arms[1].rotation.y=.8*k;}
      else if(id(r)==='porco_fato'){n.head.position.z=r.headZ+.12*k;n.head.rotation.x=-.2*k;n.arms[1].rotation.x=-.2*k;}
    }
    // Reactions over the blow's pose: held in a hug, hugging, flying, on the floor, reeling.
    if(r.grab===2){const s=still?0:Math.sin(clock*40)*.08;n.arms[0].rotation.x=n.arms[1].rotation.x=-.15;n.arms[0].rotation.z=-.12+s;n.arms[1].rotation.z=.12-s;n.legs[0].rotation.x=-.35;n.legs[1].rotation.x=.25;n.head.rotation.x=-.2;}
    else if(r.grab===1){n.arms[0].rotation.x=n.arms[1].rotation.x=-1.35;n.arms[0].rotation.z=.55;n.arms[1].rotation.z=-.55;n.arms[0].rotation.y=n.arms[1].rotation.y=0;n.body.rotation.x=.15;}
    else if(r.airborne||r.splat>0){const f=still?0:Math.sin(clock*22)*.35;n.arms[0].rotation.x=-2.2+f;n.arms[1].rotation.x=-2.2-f;n.arms[0].rotation.z=-.9;n.arms[1].rotation.z=.9;n.legs[0].rotation.x=-.5-f*.5;n.legs[1].rotation.x=.2+f*.5;n.head.rotation.x=-.3;}
    else if(r.down>0||r.rise>0){n.arms[0].rotation.x=n.arms[1].rotation.x=-.4;n.arms[0].rotation.z=-1.25;n.arms[1].rotation.z=1.25;n.head.rotation.x=ko?.4:.15;}
    else if(r.stun>0&&r.stunHit){const k=Math.min(1,r.stun/.25);n.head.rotation.x=-.35*k;n.body.rotation.x=-.18*k;n.arms[0].rotation.x=n.arms[1].rotation.x=-.1;n.arms[0].rotation.z=-.5*k;n.arms[1].rotation.z=.5*k;}
    // The winner: arms up, hands on the hips with the chest out, or a flex (VICTORY).
    const style=r.won?(r.visitor?0:VICTORY[id(r)]||0):-1;
    if(style>=0){const k=still?1:clamp((clock-koAt-(slowUntil?KO_SLOW:0))/.25,0,1);n.head.rotation.x=-.22*k;n.body.rotation.x=-.08*k;
      if(style===1){n.arms[0].rotation.x=n.arms[1].rotation.x=.25*k;n.arms[0].rotation.z=-.75*k;n.arms[1].rotation.z=.75*k;n.body.rotation.x=-.16*k;}
      else if(style===2){n.arms[0].rotation.x=n.arms[1].rotation.x=-1.6*k;n.arms[0].rotation.z=-1.2*k;n.arms[1].rotation.z=1.2*k;}
      else{n.arms[0].rotation.x=n.arms[1].rotation.x=-2.75*k;n.arms[0].rotation.z=-.35*k;n.arms[1].rotation.z=.35*k;}}
    if(ko&&matchOver&&(r.visitor||!npcModule.comedyMemory)&&!still){const sob=Math.sin((clock-enteredAt)*18)*.035;n.arms[0].rotation.z-=sob;n.arms[1].rotation.z+=sob;}
    const rig=n.rig?.bones;
    if(rig){
      const drive=r.attack>=0?motion.drive:0,hit=stepSpring(r.spring,0,frameDt,6,.65);
      if(rig.neck)rig.neck.rotation.z=ctx.reducedMotion?0:hit*.10;
      if(rig.hat)rig.hat.rotation.z=ctx.reducedMotion?0:-hit*.16+motion.settle*.025*(r.attack>=0?1:0);
      if(rig.hair)rig.hair.rotation.x=ctx.reducedMotion?0:hit*.09;
      if(rig.belly)rig.belly.scale.z=1+(ctx.reducedMotion?0:hit*.06);
      if(rig.cheeks)for(let i=0;i<2;i++)rig.cheeks[i].rotation.z=(i?1:-1)*hit*.08;
      for(let i=0;i<2;i++){
        if(rig.shoulders)rig.shoulders[i].rotation.y=n.arms[i].rotation.y*.12;
        if(rig.elbows)rig.elbows[i].rotation.x=style===1?-1.5:style===2?-1.9:r.grab===1?-1:-.30-(r.blocking?.75:Math.max(0,1-drive)*.16);
        if(rig.wrists)rig.wrists[i].rotation.z=(i?1:-1)*(drive*.16+hit*.05);
        const lifting=r.attack>=0&&i===1&&(MOVES[r.attack].pose==='stomp'||MOVES[r.attack].pose==='sweepLeg');
        if(rig.knees&&rig.ankles){
          solveFootPlant(.40,.34,lifting?Math.max(0,drive)*.12:0,plant);
          rig.knees[i].rotation.x=plant.knee;rig.ankles[i].rotation.x=plant.ankle;
          n.legs[i].rotation.x+=plant.hip;
        }
      }
    }
    if(n.col){const w=n.colW||.4;n.col.minX=n.x-w;n.col.maxX=n.x+w;n.col.minZ=n.z-w;n.col.maxZ=n.z+w;n.col.minY=n.baseY||0;n.col.maxY=n.col.minY+(n.colH||2);}
  }
  function update(dt){
    if(disposed)return;frameDt=Math.min(.05,Math.max(0,dt));readVisitor();const paused=freeze();
    particles.update(frameDt,paused||hitstop>0);
    if(!state.active||state.kind==="scripted"){
      // The hold counts real time (stepGuardCharge clamps a frame to 0.1 s), not the 0.05 s
      // animation step: at low frame rates 0.7 s took many seconds.
      const ready=guardHeld&&!paused&&!quiet()&&canAct()&&!!nearestActor(),fire=stepGuardCharge(guard,dt,guardHeld,ready,GUARD_GRACE);
      if(guardHeld&&nagPending){if(ready)nagPending=false;else if(guard.lapse>=GUARD_GRACE)nag();}
      refreshCharge();if(fire)nearest();
    }else refreshCharge();
    state.paused=paused;
    pausedBefore=paused;
    if(state.active&&a?.visitor){a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;}
    if((quiet()||!canAct())&&state.active){end(quiet()?'quiet':'overlay');return;}
    if(paused){frameDt=0;if(avatar)avatar.root.visible=false;refreshUi();return;}
    clock+=Math.min(.1,Math.max(0,dt));
    if(!state.active){refreshUi();return;}
    if(avatar){avatar.root.visible=state.kind==='visitor';avatar.root.scale.setScalar(ctx.reducedMotion?1:clamp((clock-enteredAt)/.5,.01,1));}
    const distance=Math.hypot(a.n.x-b.n.x,a.n.z-b.n.z);
    if(distance>8||Math.hypot(b.n.x-position.x,b.n.z-position.z)>40||state.venue!=='tram'&&state.kind==='visitor'&&Math.hypot(position.x-arenaX,position.z-arenaZ)>6){end('distance');refreshUi();return;}
    if(!endingAt&&state.kind==='scripted'&&clock>=scriptEnd){end('finished');refreshUi();return;}
    if(endingAt){
      // The K.O.: the last blow plays out at 30% for KO_SLOW, the loser comes down and stays
      // there, the winner poses and has the last word; then the next round or the end.
      const ko=Math.min(.1,Math.max(0,dt))*(clock<slowUntil?KO_TIME_SCALE:1);frameDt=ko;ft+=ko;hitstop=0;shake=Math.max(0,shake-dt);
      simulate(a,b,ko);simulate(b,a,ko);if(!state.active){refreshUi();return;}
      if(koWinner&&!koWinner.won&&clock>=koAt+(slowUntil?KO_SLOW:0))koWinner.won=true;
      if(arcade&&state.kind==='visitor'&&koWinner&&!tauntShown&&clock>=koAt+TAUNT_AT){tauntShown=true;const w=id(koWinner);arcade.line(nameOf(w)+': «'+tauntOf(w,Math.floor(random()*8))+'»',clock,Math.max(.5,endingAt-clock));}
      pose(a,b);pose(b,a);loser.n.comedyPuddle=matchOver&&(loser.visitor||!npcModule.comedyMemory)?1:0;
      if(clock>=endingAt){if(matchOver){const victim=loser.n,wasVisitor=loser.visitor;victim.comedyPuddle=0;end('ko');if(!wasVisitor)npcModule.combatImpact?.(victim,true);}else nextRound();}
      arcade?.update(clock);refreshUi();return;}
    const step=hitstop>0?0:Math.min(.1,Math.max(0,dt));frameDt=step;hitstop=Math.max(0,hitstop-dt);shake=Math.max(0,shake-dt);ft+=step;
    if(clock>=nextAi){
      nextAi=clock+BEAT*(state.kind==='scripted'?2:3);const ai=state.kind==='scripted'&&(aiTurn++%2===1)?a:b;
      if(ai.attack<0)aiDecide(ai,ai===a?b:a);
    }
    // The opponent guards one beat in four, keeps the guard through blockstun, and cannot guard
    // while it reels, flies, lies or is held.
    const bFree=free(b);if(bFree&&!b.wasFree&&state.kind==='visitor'&&a.attack>=0&&random()<AI_WAKE_GUARD)b.guardUntil=clock+.35;b.wasFree=bFree;
    if(b.attack<0)b.blocking=!b.grab&&!hurt(b)&&b.rise<=0&&(b.stun>0||clock<b.guardUntil||(Math.floor(clock/BEAT)%4)===1);
    simulate(a,b,step);if(!state.active){refreshUi();return;}simulate(b,a,step);if(!state.active){refreshUi();return;}
    stepGrab(step);if(!state.active){refreshUi();return;}
    if(!endingAt){if(a.visitor)serveInput(a);else aiFollow(a,b);aiFollow(b,a);}
    // A combo ends once its target is back on its feet and steady.
    if(a.combo&&!hurt(b)&&b.grab!==2){a.combo=0;if(state.kind==='visitor')arcade?.comboEnd(clock);}
    if(b.combo&&!hurt(a)&&a.grab!==2){b.combo=0;if(state.kind==='visitor')arcade?.comboEnd(clock);}
    pose(a,b);pose(b,a);
    state.aId=id(a);state.bId=id(b);state.ax=a.n.x;state.az=a.n.z;state.bx=b.n.x;state.bz=b.n.z;state.brioA=state.prideA=a.pride;state.brioB=state.prideB=b.pride;
    state.winsA=a.wins;state.winsB=b.wins;state.comboA=a.combo;state.comboB=b.combo;
    arcade?.update(clock);npcModule.refreshEffects?.(camera);refreshUi();
  }
  function renderCamera(){
    if(!state.active||state.kind!=='visitor'||freeze()||rendering)return;
    if(!placeCamera()){end('camera');return;}
    // The K.O. pushes the shot in toward the fighters: along a line placeCamera found clear.
    if(koAt&&!ctx.reducedMotion)cameraPoint.lerp(cameraAim,KO_PUSH*smooth01(clamp((clock-koAt)/KO_SLOW,0,1)));
    savedCamera.copy(camera.position);savedQuat.copy(camera.quaternion);savedFov=camera.fov;rendering=true;
    if(state.venue==='tram'&&camera.fov<70){camera.fov=70;camera.updateProjectionMatrix();}
    if(!followReady){followPosition.copy(savedCamera);followReady=true;}
    followPosition.lerp(cameraPoint,ctx.reducedMotion?1:1-Math.exp(-Math.max(.001,frameDt)*12));
    if(blockedSegment(cameraAim.x,cameraAim.z,followPosition.x,followPosition.z))followPosition.copy(cameraPoint);
    camera.position.copy(followPosition);camera.lookAt(cameraAim);
    if(!ctx.reducedMotion&&shake>0)camera.rotateZ(Math.sin(clock*60)*shake*.04);
    camera.updateMatrixWorld(true);const hands=getPlayer?.();if(hands?.group){firstHandsVisible=hands.group.visible;hands.group.visible=false;}
  }
  function restoreCamera(){if(!rendering)return;camera.position.copy(savedCamera);camera.quaternion.copy(savedQuat);if(camera.fov!==savedFov){camera.fov=savedFov;camera.updateProjectionMatrix();}camera.updateMatrixWorld(true);const hands=getPlayer?.();if(hands?.group)hands.group.visible=firstHandsVisible;rendering=false;}
  function statues(value=!freeze()){
    if(value&&!enableStatues)return false;
    const changed=freeze()!==!!value;ctx.scene.userData.npcStatues=!!value;npcModule.setStatues?.(!!value);emit(value?'statuesOn':'statuesOff');
    if(value&&changed){readVisitor();const ids=[];for(let i=0;i<npcs.length;i++){const n=npcs[i],dx=n.x-position.x,dz=n.z-position.z;if(n.root.visible&&!n.combatHidden&&dx*dx+dz*dz<=144&&Math.abs(position.y-1.62-(n.baseY||0))<1)ids.push(n.S.name);}
      if(ids.length>=3){ids.sort();const sceneId=ids.join('|');ctx.events?.dispatchEvent?.(new CustomEvent('workshop',{detail:{type:'statue-scene',value:{sceneId,actorIds:ids,count:ids.length,eventId:'statues-'+sceneId}}}));}}
    uiDirty=true;refreshUi();
  }
  function nearestActor(){
    readVisitor();camera.getWorldDirection(direction);let best=null,distance=GUARD_START*GUARD_START;
    for(let i=0;i<npcs.length;i++){const n=npcs[i],dx=n.x-position.x,dz=n.z-position.z,d=dx*dx+dz*dz;
      if((eligible(n)||(state.active&&state.kind==='scripted'&&(n===a?.n||n===b?.n)))&&Math.abs(position.y-1.62-(n.baseY||0))<.8&&d<distance&&(dx*direction.x+dz*direction.z)>Math.sqrt(d)*.65){best=n;distance=d;}}
    return best;
  }
  function nearest(){const best=nearestActor();return best?engage(best.hit,{explicit:true}):false;}
  // Q with nobody in reach used to be silent: one line per press, at most one every 2 s.
  function nag(){nagPending=false;if(freeze()||quiet()||!canAct()||clock-nagAt<NAG_GAP)return;nagAt=clock;toast('Chega mais perto do trombil.');}
  // The guard's charge around the crosshair: one element, written only when the fill moves a step.
  function refreshCharge(){
    if(!charge)return;const p=guardHeld&&!guard.fired&&!(state.active&&state.kind==='visitor')?Math.min(1,guard.elapsed/GUARD_HOLD):0,q=Math.round(p*40)/40;
    if(q===chargeShown)return;chargeShown=q;charge.hidden=q<=0;if(q>0)charge.style.setProperty('--charge',String(q));
  }

  function typing(e){return !!e.target?.closest?.('input,textarea,select,[contenteditable="true"]');}
  function keydown(e){
    if(e.ctrlKey||e.metaKey||e.altKey||typing(e)||!canAct())return;
    if((!state.active||state.kind==='scripted')&&e.code==='KeyQ'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){guardHeld=true;nagPending=true;}return;}
    if(enableStatues&&e.code==='KeyX'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)statues();return;}
    if(!state.active||freeze()||state.kind!=='visitor')return;
    if(e.code==='Escape'){end('exit');return;}
    if(/^Digit[1-8]$/.test(e.code)){selected=Number(e.code.slice(5))-1+(e.shiftKey?8:0);e.preventDefault();e.stopImmediatePropagation();return;}
    if(!FIGHT_KEYS.has(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    if(e.code==='KeyQ')press('Q',selected);else if(e.code==='KeyE')block(true);else if(e.code==='KeyZ')press('Z',7);else if(e.code==='KeyC')press('C',GRAB);else if(e.code==='KeyF')press('F',9);else if(e.code==='KeyR')press('R',1);else dodge();uiDirty=true;
  }
  function keyup(e){if(e.code==='KeyQ'){if(guardHeld&&nagPending&&!nearestActor())nag();guardHeld=false;nagPending=false;guard.elapsed=guard.lapse=0;guard.fired=false;refreshCharge();}if(e.code==='KeyE'&&a)block(false);if(state.active&&!freeze()&&FIGHT_KEYS.has(e.code)){e.preventDefault();e.stopImmediatePropagation();}}
  function pointer(e){
    if(!state.active||freeze()||state.kind!=='visitor'||typing(e)||e.target?.closest?.('button,select,.combat-panel'))return;
    if(e.button!==0&&e.button!==2)return;e.preventDefault();e.stopImmediatePropagation();
    if(e.type==='pointerdown'){if(e.button===0)press('Q',0);else press('R',1);}
  }
  function blurred(){guardHeld=false;nagPending=false;guard.elapsed=guard.lapse=0;refreshCharge();if(a)a.blocking=false;end('blur');}
  function refreshUi(){
    if(!panel)return;panel.hidden=!state.active;hud.hidden=!canAct();statueButton.hidden=state.active||!enableStatues;arcade.show(state.active&&state.kind==='visitor');
    if(!uiDirty)return;
    fightButton.textContent=state.active?'×':'🥊';fightButton.setAttribute('aria-label',state.active?'Sair da luta':'Entrar em guarda (manter Q)');
    if(a&&b){shownA=a.pride;shownB=b.pride;
      pillA.style.transform=`scaleX(${a.pride/100})`;pillB.style.transform=`scaleX(${b.pride/100})`;
      lagA.style.transform=`scaleX(${shownA/100})`;lagB.style.transform=`scaleX(${shownB/100})`;
      pillA.parentNode.setAttribute('aria-valuenow',String(a.pride));pillB.parentNode.setAttribute('aria-valuenow',String(b.pride));}
    uiDirty=false;
  }

  function apologize(target){let n=typeof target==='string'?npcs.find(n=>n.S.name===target):npcModule.findActor(target);if(!n){readVisitor();let best=12.25;for(let i=0;i<npcs.length;i++){const q=npcs[i],dx=q.x-position.x,dz=q.z-position.z,d=dx*dx+dz*dz;if(q.rancor>0&&d<best){n=q;best=d;}}}if(!n||state.active||freeze())return false;if(npcModule.reconcileActor&&!npcModule.reconcileActor(n))return false;n.rancor=0;n.grudge=-Infinity;n.escalate=false;n.pestCd=60;callout('DESCULPA. Ficamos por aqui.');return true;}
  function setWeapon(kind){equipped=['carapau','paposeco','couve','jornal','chinelo','toalha','nata','luva'].includes(kind)?kind:'';return equipped;}
  function doubleCalduco(){if(!state.active||state.kind!=='visitor'||freeze()||endingAt)return false;attack(4);if(queueCount<3)queue[queueCount++]=4;return true;}
  function getBrio(){return visitor?.pride??100;}
  function setBrio(value){if(visitor)visitor.pride=clamp(Number(value)||0,0,100);uiDirty=true;return getBrio();}
  function adjustBrio(delta){return setBrio(getBrio()+delta);}
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',action);return b;}
  if(panel){
    cssLink=document.createElement('link');cssLink.rel='stylesheet';cssLink.href=new URL('./combat-ui.css',import.meta.url).href;document.head.append(cssLink);
    hud=document.createElement('div');hud.className='combat-hud';hud.hidden=true;hud.setAttribute('role','toolbar');hud.setAttribute('aria-label','Porrada e estátuas');statueButton=button('ESTÁTUAS',()=>statues());statueButton.setAttribute('aria-label','Estátuas: pausar personagens (X)');
    fightButton=button('🥊',()=>{if(state.active)end('exit');else if(!nearest()&&!nearestActor())nag();});fightButton.setAttribute('aria-label','Entrar em guarda (manter Q)');statueButton.hidden=!enableStatues;hud.append(statueButton,fightButton);document.body.append(hud);
    charge=document.createElement('div');charge.className='combat-charge';charge.hidden=true;charge.setAttribute('aria-hidden','true');document.body.append(charge);
    panel.className='combat-panel';panel.setAttribute('aria-label','Brio e movimentos');panel.hidden=true;
    // Names and round pips over the bars; the combo counter, calls and lines in one fixed layer.
    arcade=createArcadeHud(document);panel.append(arcade.tags[0],arcade.tags[1]);document.body.append(arcade.layer);
    function pill(label){const track=document.createElement('div');track.className='combat-pill';track.setAttribute('role','progressbar');track.setAttribute('aria-label',label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');const lag=document.createElement('i'),value=document.createElement('i');lag.className='combat-pill-lag';value.className='combat-pill-value';track.append(lag,value);panel.append(track);return [value,lag];}
    [pillA,lagA]=pill('O teu brio');[pillB,lagB]=pill('Brio do adversário');
    const actions=document.createElement('div');actions.className='combat-actions';
    // Touch: the five string keys (✋ Q, ↶ R, 🦵 Z, 👟 F, 🤗 C: the hug, and the way out of one).
    for(const [icon,label,action] of [['✋','Chapada',()=>press('Q',0)],['↶','Revés',()=>press('R',1)],['🦵','Rasteira',()=>press('Z',7)],['👟','Chinelada',()=>press('F',9)],['🤗','Abraço de urso: agarrar, ou soltar-te',()=>press('C',GRAB)],['🛡','Defender',()=>block(!a?.blocking)],['↔','Esquivar',dodge],['↑','Saltar',()=>controls.combatJump()],['⟳','Mudar golpe',()=>{selected=(selected+1)%16;}],['⚡','Golpe escolhido',()=>press('Q',selected)]]){const b=button(icon,action);b.setAttribute('aria-label',label);actions.append(b);if(icon==='🤗')throwButton=b;}panel.append(actions);document.body.append(panel);
    window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);
    for(const name of ['pointerdown','pointerup','mousedown','mouseup','contextmenu'])window.addEventListener(name,pointer,true);
    window.addEventListener('blur',blurred);
  }
  function dispose(){unsubscribeActor?.();end('dispose');particles.dispose();if(ctx.ui?.toast===guardedToast)ctx.ui.toast=originalToast;if(freeze())statues(false);disposed=true;hud?.remove();panel?.remove();charge?.remove();arcade?.dispose();cssLink?.remove();stopSounds();if(typeof window!=='undefined'){window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);for(const name of ['pointerdown','pointerup','mousedown','mouseup','contextmenu'])window.removeEventListener(name,pointer,true);window.removeEventListener('blur',blurred);}if(avatar){ctx.scene.remove(avatar.root);avatar.rig.mesh.geometry.dispose();avatar.rig.mesh.material.dispose();}}
  function getVisitorStatus(){return visitorStatus;}
  function getScriptedResult(){return scriptedResult;}
  // A read-only look at one fighter ('a' the visitor or the first NPC, 'b' the opponent), for
  // tests and the console. The two snapshot objects are reused.
  const views={a:{},b:{}};
  function inspect(side='b'){
    const r=side==='a'?a:b,v=side==='a'?views.a:views.b;v.active=!!r;if(!r)return v;
    v.id=id(r);v.move=r.attack>=0?MOVES[r.attack].id:'';v.t=r.t;v.stun=r.stun;v.stunHit=r.stunHit;v.air=r.air;v.airborne=r.airborne;v.juggles=r.juggles;v.bounced=r.bounced;
    v.down=r.down;v.rise=r.rise;v.splat=r.splat;v.grab=r.grab;v.combo=r.combo;v.depth=r.depth;v.string=r.aiString>=0?STRINGS[r.aiString].id:'';v.wins=r.wins;v.pride=r.pride;v.won=r.won;
    v.blocking=r.blocking;v.hitstop=hitstop;v.timeScale=endingAt&&clock<slowUntil?KO_TIME_SCALE:1;v.fightTime=ft;return v;
  }
  const api={actors:npcs,getVisitorStatus,getScriptedResult,state,events,engage,startScripted,end,attack,press,block,dodge,statues,apologize,setWeapon,doubleCalduco,getBrio,setBrio,adjustBrio,inspect,update,renderCamera,restoreCamera,dispose};
  ctx.scene.userData.combatAPI=api;return api;
}
