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

export function createCombat(ctx,{camera,controls,world,npcModule,getPlayer,canAct=()=>true,canStart=()=>true,onSlap=()=>{},enableStatues=false}={}){
  const {THREE}=ctx,npcs=npcModule?.combatActors||[];
  const events={serial:0,entries:new Array(16)};
  for(let i=0;i<16;i++)events.entries[i]={serial:0,type:'',fightId:0,aId:'',bId:'',ax:0,az:0,bx:0,bz:0,intensity:0,move:'',time:0};
  const state={active:false,paused:false,id:0,kind:'',venue:'',serial:0,event:'',actorA:'',actorB:'',aId:'',bId:'',ax:0,az:0,bx:0,bz:0,brioA:100,brioB:100,prideA:100,prideB:100};
  ctx.scene.userData.combatEvents=events;ctx.scene.userData.combatState=state;
  let clock=0,a=null,b=null,donor=null,avatar=null,selected=2,hitstop=0,shake=0,scriptEnd=0,nextAi=0;
  let queueCount=0,combo=0,lastTap=-Infinity,blockAt=-Infinity,dodgeUntil=0,dodgeReady=0,counterUntil=0;
  let noiseBuffer=null,noiseContext=null,aiTurn=0;
  let enteredAt=0,endingAt=0,loser=null,equipped='',tripId='',climaxFight=false;
  const visitorStatus={fell:false,fightId:0},scriptedResult={sequence:0,fightId:0,winner:'',completed:false,visitorWon:false};
  let arenaX=0,arenaZ=0,savedFov=60;
  let rendering=false,firstHandsVisible=false,disposed=false,uiDirty=true,pausedBefore=false;
  const queue=new Int8Array(3),colliders=[],active=[],out={x:0,z:0,floor:0,step:0,region:null};
  const position={x:0,y:1.62,z:0},savedCamera=new THREE.Vector3(),savedQuat=new THREE.Quaternion();
  const cameraPoint=new THREE.Vector3(),cameraAim=new THREE.Vector3(),soundPoint=new THREE.Vector3();
  const voices=new Array(6).fill(null),records=[],byNpc=new WeakMap(),said=new Map();
  function callout(text){const memory=npcModule.comedyMemory;const allowed=memory?memory.commit(text):clock-(said.get(text)??-Infinity)>=600;if(allowed){said.set(text,clock);toast(text);}}
  function record(n,visitor=false){return {n,visitor,pride:100,attack:-1,t:0,landed:false,boost:1,blocking:false,recoilX:0,recoilZ:0,
    attackCount:0,headZ:0,inPlace:false,oldBusy:false,oldControlled:false,base:new Float32Array(18),bones:null};}
  for(let i=0;i<npcs.length;i++){const r=record(npcs[i]);records.push(r);byNpc.set(r.n,r);}
  let visitor=null;
  const panel=typeof document==='undefined'?null:document.createElement('section');
  let cssLink=null,hud=null,statusText=null,banner=null,moveSelect=null,statueButton=null,fightButton=null,blockButton=null;
  function toast(text){ctx.ui?.toast?.(text);}
  function freeze(){return !!ctx.scene.userData.npcStatues;}
  function quiet(){return !!ctx.scene.userData.questQuiet;}
  function readVisitor(){controls.readPosition(position);}
  function id(r){return r?.visitor?'visitor':r?.n?.S?.name||'';}
  function emit(type,intensity=0,move=''){
    const e=events.entries[events.serial%16];e.serial=++events.serial;e.type=type;e.fightId=state.id;
    e.aId=id(a);e.bId=id(b);e.ax=a?.n.x||0;e.az=a?.n.z||0;e.bx=b?.n.x||0;e.bz=b?.n.z||0;
    e.intensity=intensity;e.move=move;e.time=clock;state.serial=e.serial;state.event=type;state.actorA=state.aId=e.aId;state.actorB=state.bId=e.bId;
  }
  function capture(r){
    const n=r.n;r.headZ=n.head.position.z;r.oldBusy=n.busy;r.oldControlled=!!n.combatControlled;n.busy=true;n.combatControlled=true;
    r.bones=[n.body,n.head,n.arms[0],n.arms[1],n.legs[0],n.legs[1]];
    for(let i=0;i<6;i++){const q=r.bones[i].rotation;r.base[i*3]=q.x;r.base[i*3+1]=q.y;r.base[i*3+2]=q.z;}
    n.talkT=0;n.bubble=0;if(n.sprite)n.sprite.visible=false;
    r.pride=100;r.attack=-1;r.t=0;r.blocking=false;r.recoilX=r.recoilZ=0;r.attackCount=0;
  }
  function restore(r){if(!r)return;const n=r.n;for(let i=0;i<6;i++)r.bones[i].rotation.set(r.base[i*3],r.base[i*3+1],r.base[i*3+2]);n.head.position.z=r.headZ;n.busy=r.oldBusy;n.combatControlled=r.oldControlled;}
  function stopSounds(){for(let i=0;i<voices.length;i++)if(voices[i]){try{voices[i].stop();}catch{}voices[i]=null;}}
  function sound(r,step=0,soft=false,moveIndex=-1){
    if(freeze()||quiet()||ctx.audio?.muted)return;
    let ac,bus;try{ac=ctx.audio?.context;bus=ctx.audio?.bus;}catch{return;}if(!ac||!bus||ac.state!=='running')return;
    let slot=-1;for(let i=0;i<6;i++)if(!voices[i]){slot=i;break;}if(slot<0)return;
    const profile=moveIndex>=0?FOLEY[moveIndex]:null,duration=profile?BEAT*profile[5]:BEAT/4;
    // No broker means silence: never bypass the global voice budget.
    const token=ctx.audio.acquireVoice?.({priority:3,foreground:true,ms:(duration+.03)*1000});
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
    const root=new THREE.Group();root.name='combat-visitor';root.add(rig.mesh);root.visible=false;ctx.scene.add(root);
    avatar={S:{name:'visitor'},root,rig,body:rig.bones.body,head:rig.bones.head,arms:rig.bones.arms,legs:rig.bones.legs,
      x:0,z:0,baseY:0,yaw:0,colW:.35,colH:rig.height,busy:false,combatControlled:false};
    visitor=record(avatar,true);
  }
  function eligible(n,allowSeated=false){return n&&(!n.S.seated||allowSeated)&&!n.combatHidden&&!n.busy&&!n.goOn&&n.sillyT<0&&n.windT<=0&&n.pestT<=0&&n.hatState<=0;}
  function chooseDonor(target){
    let chosen=null,best=144;
    for(let i=0;i<npcs.length;i++){const n=npcs[i];if(i>=1&&i<=5||n===target||!eligible(n)||n.routineMoving||n.talkT>0)continue;const dx=n.x-position.x,dz=n.z-position.z,d=dx*dx+dz*dz;if(d>best){best=d;chosen=n;}}
    return chosen;
  }
  function prepareCollision(){
    colliders.length=0;const x=(a.n.x+b.n.x)*.5,z=(a.n.z+b.n.z)*.5;
    for(let i=0;i<world.colliders.length;i++){const c=world.colliders[i];if(c===a.n.col||c===b.n.col||c===donor?.col)continue;
      if(c.maxX<x-12||c.minX>x+12||c.maxZ<z-12||c.minZ>z+12)continue;
      if(colliders.length>=256)return false;colliders.push(c);
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
  function placeCamera(){
    const x=(a.n.x+b.n.x)*.5,z=(a.n.z+b.n.z)*.5,dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz)||1;
    const floor=Math.max(a.n.baseY||0,b.n.baseY||0);cameraAim.set(x,floor+1.15,z);
    const carrier=state.venue==='tram'?ctx.scene.userData.tramRide?.carrier:null;
    if(carrier?.riding){const c=Math.cos(carrier.yaw),sn=Math.sin(carrier.yaw),dx0=x-carrier.x,dz0=z-carrier.z,lx=c*dx0-sn*dz0,lz=sn*dx0+c*dz0;
      for(let i=0;i<4;i++){const cz=lz+(i%2?1.65:-1.65),cx=i<2?0:(i===2 ? .3 : -.3);const g=groundAt(carrier.localWorld.regions,cx,cz,.35,.1);
        if(g===null||blockedSegment(lx,lz,cx,cz,carrier.localWorld.colliders))continue;
        cameraPoint.set(carrier.x+c*cx+sn*cz,g+1.85,carrier.z-sn*cx+c*cz);return true;}return false;}
    for(let i=0;i<4;i++){
      const side=i%2===0?1:-1,along=i>=2,ox=(along?dx:(-dx*.55-dz*.84))/d*3.8*side,oz=(along?dz:(-dz*.55+dx*.84))/d*3.8*side;
      const cx=x+ox,cz=z+oz,g=groundAt(world.regions,cx,cz,controls.floor,.65);
      if(g===null||blockedSegment(x,z,cx,cz))continue;
      cameraPoint.set(cx,Math.max(g+2.05,floor+2.05),cz);return true;
    }return false;
  }
  function begin(first,second,kind,allowSeated=false,venue=''){
    if(state.active||freeze()||quiet()||!canAct()||!first||!second)return false;
    a=first;b=second;donor=null;state.venue=venue;readVisitor();
    if(kind==='visitor'&&(!canStart()||controls.seated)){toast(controls.seated?'Levanta-te para a porrada.':'Larga o papel primeiro.');a=b=null;return false;}
    if(kind==='visitor'){
      if(!eligible(b.n,allowSeated)){toast('Agora não dá para porrada.');a=b=null;return false;}
      if(Math.hypot(position.x-b.n.x,position.z-b.n.z)>1.8||Math.abs(position.y-1.62-(b.n.baseY||0))>.8){toast('Chega mais perto do trombil.');a=b=null;return false;}
      donor=chooseDonor(b.n);if(!donor){toast('O palco está cheio.');a=b=null;return false;}
      a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;
    }else if(!eligible(a.n,allowSeated)||!eligible(b.n,allowSeated)||Math.hypot(a.n.x-position.x,a.n.z-position.z)>40||Math.hypot(b.n.x-position.x,b.n.z-position.z)>40||Math.hypot(a.n.x-b.n.x,a.n.z-b.n.z)>6||Math.abs((a.n.baseY||0)-(b.n.baseY||0))>.8){a=b=null;return false;}
    if(!prepareCollision()||(kind==='visitor'&&(blockedSegment(a.n.x,a.n.z,b.n.x,b.n.z)||!placeCamera()))){toast('Sem espaço para a porrada.');a=b=null;donor=null;return false;}
    capture(a);capture(b);a.inPlace=b.inPlace=allowSeated;
    if(donor){donor.combatShadowProxy=avatar;donor.combatOldBusy=donor.busy;donor.busy=true;donor.combatHidden=true;donor.combatHitMask=donor.hit.layers.mask;donor.hit.layers.mask=0;}
    if(kind==='visitor')avatar.root.visible=true;
    state.active=true;state.id++;state.kind=kind;state.venue=venue;arenaX=(a.n.x+b.n.x)*.5;arenaZ=(a.n.z+b.n.z)*.5;climaxFight=false;visitorStatus.fell=false;visitorStatus.fightId=state.id;enteredAt=clock;endingAt=0;loser=null;queueCount=combo=aiTurn=0;hitstop=shake=0;blockAt=-Infinity;dodgeUntil=0;dodgeReady=clock;counterUntil=0;lastTap=-Infinity;nextAi=clock+BEAT*2;scriptEnd=clock+8;
    controls.releaseCombatKeys?.();ctx.audio?.duck?.(8);emit('fightStarted',.2);callout(kind==='visitor'?'Olha a porrada!':'Vai haver porrada!');uiDirty=true;return true;
  }
  function engage(object){
    const n=npcModule.findActor(object);if(!n)return false;
    if(state.active&&state.kind==='visitor')return attack(0);
    let joining=false,oldVenue='',oldTrip='';
    if(state.active){if(n!==a.n&&n!==b.n)return false;if(!canStart()||controls.seated||!chooseDonor(n)){toast('Levanta-te e liberta espaço.');return false;}readVisitor();if(Math.hypot(position.x-n.x,position.z-n.z)>1.8)return false;makeAvatar();const oldA=a,oldB=b;a=visitor;b=byNpc.get(n);a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;const spaceReady=prepareCollision()&&!blockedSegment(a.n.x,a.n.z,b.n.x,b.n.z)&&placeCamera();a=oldA;b=oldB;if(!spaceReady){prepareCollision();toast('Sem espaço para a porrada.');return false;}joining=true;oldVenue=state.venue;oldTrip=tripId;end('joined');}
    const onTram=joining?oldVenue==='tram':!!ctx.scene.userData.tramRide?.hasPassenger?.(n);
    makeAvatar();if(!begin(visitor,byNpc.get(n),'visitor',onTram,onTram?'tram':''))return false;
    if(joining){climaxFight=true;state.venue=oldVenue;tripId=oldTrip;}return attack(0);
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
    if(avatar){avatar.root.visible=false;avatar.comedyPuddle=0;}state.active=false;state.paused=false;queueCount=0;stopSounds();controls.releaseCombatKeys?.();a=b=null;uiDirty=true;
  }
  function launch(r,index){r.attack=index;r.t=0;r.landed=false;r.attackCount++;r.boost=r.visitor&&clock<counterUntil?1.5:1;if(r.visitor)counterUntil=0;sound(r,index%5,true);}
  function attack(index=selected){
    if(!state.active||endingAt||state.kind!=='visitor'||freeze()||quiet())return false;
    const move=clamp(index|0,0,15);
    if(clock-lastTap>1.1)combo=0;lastTap=clock;combo=(combo+1)%3;
    if(combo===0)callout('Isto é que é porrada!');
    const chosen=equipped?WEAPONS[equipped]:combo===0&&move===0?2:combo===2&&move===0?1:move;
    if(equipped==='luva'){callout('Exijo satisfação!');emit('ceremony',.4,'luva');}
    if(a.attack<0)launch(a,chosen);else if(queueCount<3)queue[queueCount++]=chosen;return true;
  }
  function block(value){if(!state.active||state.kind!=='visitor'||freeze())return;a.blocking=!!value;if(value)blockAt=clock;uiDirty=true;}
  function dodge(){
    if(!state.active||state.kind!=='visitor'||freeze()||clock<dodgeReady)return false;
    dodgeReady=clock+.8;dodgeUntil=clock+.3;const dx=b.n.x-a.n.x,dz=b.n.z-a.n.z,d=Math.hypot(dx,dz)||1;
    controls.combatMove(-dz/d*.55,dx/d*.55);sound(a,4,true);emit('dodge',.2);return true;
  }
  function hit(r,target,move){
    const dx=target.n.x-r.n.x,dz=target.n.z-r.n.z,d=Math.hypot(dx,dz);
    // Two torso spheres; extend the attacking centre along its reach, then test.
    const ux=d?dx/d:0,uz=d?dz/d:1,sx=dx-ux*.85,sz=dz-uz*.85,dy=(target.n.baseY||0)-(r.n.baseY||0);
    if(d>move.range||sx*sx+sz*sz+dy*dy>1.05*1.05||state.venue!=='tram'&&blockedSegment(r.n.x,r.n.z,target.n.x,target.n.z))return;
    if(target.visitor&&(clock<dodgeUntil||(move.pose==='sweepLeg'||move.pose==='stomp')&&controls.airborne)){counterUntil=clock+.75;emit('dodge',.3,move.id);return;}
    const guarded=target.blocking,perfect=guarded&&target.visitor&&clock-blockAt<.22;
    const courage=r.visitor&&ctx.scene.userData.bairroEffects?.courageUntil>performance.now()/1000&&new Date().getDay()===2?2:1;
    let damage=Math.round(move.power*r.boost*courage*(guarded ? .2 : 1));if(perfect){damage=0;counterUntil=clock+.8;callout('Ó trombil de papo seco!');}
    target.pride=Math.max(0,target.pride-damage);if(!target.visitor&&damage>0)target.n.rancor=(target.n.rancor||0)+1;target.recoilX=ux*(perfect ? .05 : guarded ? .15 : .55);target.recoilZ=uz*(perfect ? .05 : guarded ? .15 : .55);
    if(!ctx.reducedMotion){hitstop=.06;shake=.16;}sound(target,combo===0?3:combo,guarded,id(r)==='velho'&&move.index===8?4:move.index);emit('impact',damage/25,equipped&&r.visitor?equipped:move.id);uiDirty=true;
    if(r.visitor&&move.index<=2)onSlap();
    if(!target.visitor&&damage>0)npcModule.combatImpact?.(target.n,false,move.id);
    if(damage>0){callout(r.visitor?'Levas no trombil!':'Fecha o trombil!');if(id(r)==='forcado'&&move.index===11)ctx.events?.dispatchEvent?.(new CustomEvent('workshop',{detail:{type:'forcado-signature',value:{fightId:state.id,npcId:'forcado',eventId:'combat-'+state.id+'-pega-'+r.attackCount}}}));}
    if(target.pride===0){endingAt=clock+(target.visitor||!npcModule.comedyMemory?2.4:.8);loser=target;r.attack=target.attack=-1;queueCount=0;target.n.comedyPuddle=target.visitor||!npcModule.comedyMemory?1:0;if(target.visitor)visitorStatus.fell=true;callout('Eh, calma, Zé!');emit('knockout',1,move.id);}
  }
  function moveNpc(r,dt,target){
    if(r.visitor){controls.combatMove(r.recoilX*dt,r.recoilZ*dt);return;}
    if(r.inPlace||r.n.fixed)return;
    const dx=target.n.x-r.n.x,dz=target.n.z-r.n.z,d=Math.hypot(dx,dz),chase=r.attack<0&&d>1.45&&d<6 ? .7 : 0;
    moveInWorld(r.n.x,r.n.z,0,(r.recoilX+(d?dx/d*chase:0))*dt,(r.recoilZ+(d?dz/d*chase:0))*dt,r.n.colW||.4,world.regions,colliders,active,out);
    if(Math.abs(out.floor)<.1){r.n.x=out.x;r.n.z=out.z;}
  }
  function simulate(r,target,dt){
    moveNpc(r,dt,target);r.recoilX*=Math.exp(-dt*9);r.recoilZ*=Math.exp(-dt*9);
    if(r.attack<0)return;r.t+=dt*(r.visitor&&equipped==='luva' ? .5 : 1);const move=MOVES[r.attack];
    if(!r.landed&&r.t>=move.windup){r.landed=true;hit(r,target,move);if(!state.active)return;}
    if(r.t>=move.duration){r.attack=-1;if(r.visitor&&queueCount){const next=queue[0];for(let i=1;i<queueCount;i++)queue[i-1]=queue[i];queueCount--;launch(r,next);}}
  }
  function pose(r,target){
    const n=r.n;n.head.position.z=r.headZ;for(let i=0;i<6;i++)r.bones[i].rotation.set(0,0,0);
    n.yaw=Math.atan2(target.n.x-n.x,target.n.z-n.z);n.root.position.set(n.x,n.baseY||0,n.z);n.root.rotation.set(0,n.yaw,0);n.rig?.setExpression?.(0,r.pride<40 ? .5 : 0);if(n.blob){n.blob.position.x=n.x;n.blob.position.z=n.z;n.blob.visible=true;}
    n.arms[0].rotation.x=n.arms[1].rotation.x=r.blocking?-1.2:-.25;n.arms[0].rotation.z=-.2;n.arms[1].rotation.z=.2;
    if(r.attack>=0){
      const m=MOVES[r.attack],t=clamp(r.t/m.duration,0,1),k=Math.sin(t*Math.PI)*(ctx.reducedMotion ? .45 : 1),p=m.pose;
      n.head.rotation.z=(p==='tickle' ? .12 : .05)*k;n.body.rotation.y=(p==='back'?-.35:.25)*k;
      if(p==='stomp'||p==='sweepLeg'){n.legs[1].rotation.x=-.85*k;n.legs[1].rotation.z=(p==='sweepLeg' ? .65 : .1)*k;}
      else if(p==='both'||p==='hug'||p==='tickle'||p==='pillow'){n.arms[0].rotation.x=n.arms[1].rotation.x=-1.25*k;n.arms[0].rotation.z=-.8*(1-k);n.arms[1].rotation.z=.8*(1-k);if(p==='both'){n.arms[0].rotation.y=.9*k;n.arms[1].rotation.y=-.9*k;}if(p==='tickle'&&!ctx.reducedMotion){n.arms[0].rotation.z+=Math.sin(t*28)*.12;n.arms[1].rotation.z-=Math.sin(t*28)*.12;}if(p==='pillow'){n.body.rotation.x=.18*k;n.arms[0].rotation.y=n.arms[1].rotation.y=.25*k;}}
      else{n.arms[1].rotation.x=-(p==='over'?2.5:p==='shoe'?2.1:p==='finger' ? .75 : 1.2)*k;n.arms[1].rotation.z=(p==='back'?-.9:p==='fan'?(ctx.reducedMotion ? .15 : Math.sin(t*24)*.35):p==='shoe'?Math.sin(t*Math.PI*2)*1.1:p==='whip'?Math.sin(t*10)*.9:.8)*k;n.arms[1].rotation.y=(p==='pull'?-1:p==='pinch' ? .7 : 0)*k;}
    }
    if(r.attack>=0&&SPECIAL[id(r)]===r.attack){const k=Math.sin(clamp(r.t/MOVES[r.attack].duration,0,1)*Math.PI)*(ctx.reducedMotion ? .45 : 1);
      if(id(r)==='forcado'){n.body.rotation.x=.35*k;n.head.rotation.x=.2*k;n.arms[0].rotation.x=n.arms[1].rotation.x=-1.6*k;}
      else if(id(r)==='velho'){n.arms[1].rotation.x=-1.8*k;n.body.rotation.y=.1*k;}
      else if(id(r)==='gordo'){n.body.rotation.x=-.25*k;n.arms[0].rotation.z=-.6*k;n.arms[1].rotation.z=.6*k;}
      else if(id(r)==='mano'){n.arms[0].rotation.x=-1.1*k;n.arms[1].rotation.x=-.75*k;n.arms[1].rotation.y=.8*k;}
      else if(id(r)==='porco_fato'){n.head.position.z=r.headZ+.12*k;n.head.rotation.x=-.2*k;n.arms[1].rotation.x=-.2*k;}
    }
    if(n.col){const w=n.colW||.4;n.col.minX=n.x-w;n.col.maxX=n.x+w;n.col.minZ=n.z-w;n.col.maxZ=n.z+w;n.col.minY=0;n.col.maxY=n.colH||2;}
  }
  function update(dt){
    if(disposed)return;readVisitor();const paused=freeze();state.paused=paused;
    if(paused&&!pausedBefore)stopSounds();pausedBefore=paused;
    if(state.active&&a?.visitor){a.n.x=position.x;a.n.z=position.z;a.n.baseY=position.y-1.62;a.n.shadowY=controls.floor;}
    if((quiet()||!canAct())&&state.active){end(quiet()?'quiet':'overlay');return;}
    if(paused){if(avatar)avatar.root.visible=false;refreshUi();return;}
    clock+=Math.min(.1,Math.max(0,dt));
    if(!state.active){refreshUi();return;}
    if(avatar){avatar.root.visible=state.kind==='visitor';avatar.root.scale.setScalar(ctx.reducedMotion?1:clamp((clock-enteredAt)/.5,.01,1));}
    const distance=Math.hypot(a.n.x-b.n.x,a.n.z-b.n.z);
    if(distance>8||Math.hypot(b.n.x-position.x,b.n.z-position.z)>40||state.venue!=='tram'&&state.kind==='visitor'&&Math.hypot(position.x-arenaX,position.z-arenaZ)>6){end('distance');refreshUi();return;}
    if(!endingAt&&state.kind==='scripted'&&clock>=scriptEnd){end('finished');refreshUi();return;}
    if(endingAt){pose(a,b);pose(b,a);loser.n.head.rotation.x=.4;loser.n.body.rotation.x=.2;if((loser.visitor||!npcModule.comedyMemory)&&!ctx.reducedMotion){const sob=Math.sin((clock-enteredAt)*18)*.035;loser.n.arms[0].rotation.z-=sob;loser.n.arms[1].rotation.z+=sob;}
      loser.n.comedyPuddle=loser.visitor||!npcModule.comedyMemory?1:0;if(clock>=endingAt){const victim=loser.n,wasVisitor=loser.visitor;victim.comedyPuddle=0;end('ko');if(!wasVisitor)npcModule.combatImpact?.(victim,true);}refreshUi();return;}
    const step=hitstop>0?0:Math.min(.1,Math.max(0,dt));hitstop=Math.max(0,hitstop-dt);shake=Math.max(0,shake-dt);
    if(clock>=nextAi){
      nextAi=clock+BEAT*(state.kind==='scripted'?2:3);const ai=state.kind==='scripted'&&(aiTurn++%2===1)?a:b;
      if(ai.attack<0){const index=SPECIAL[id(ai)]??(ai.attackCount%4);launch(ai,index);ai.blocking=false;callout('Vou-te ao trombil!');}
    }
    if(b.attack<0)b.blocking=(Math.floor(clock/BEAT)%4)===1;
    simulate(a,b,step);if(!state.active){refreshUi();return;}simulate(b,a,step);if(!state.active){refreshUi();return;}
    pose(a,b);pose(b,a);
    state.aId=id(a);state.bId=id(b);state.ax=a.n.x;state.az=a.n.z;state.bx=b.n.x;state.bz=b.n.z;state.brioA=state.prideA=a.pride;state.brioB=state.prideB=b.pride;
    npcModule.refreshEffects?.(camera);refreshUi();
  }
  function renderCamera(){
    if(!state.active||state.kind!=='visitor'||freeze()||rendering)return;
    if(!placeCamera()){end('camera');return;}
    savedCamera.copy(camera.position);savedQuat.copy(camera.quaternion);savedFov=camera.fov;rendering=true;
    if(state.venue==='tram'&&camera.fov<70){camera.fov=70;camera.updateProjectionMatrix();}
    camera.position.copy(cameraPoint);camera.lookAt(cameraAim);
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
  function nearest(){readVisitor();let best=null,distance=1.8*1.8;for(let i=0;i<npcs.length;i++){const n=npcs[i],dx=n.x-position.x,dz=n.z-position.z,d=dx*dx+dz*dz;if(eligible(n)&&Math.abs(position.y-1.62-(n.baseY||0))<.8&&d<distance){best=n;distance=d;}}if(best)engage(best.hit);else toast('Chega mais perto do trombil.');}
  function typing(e){return !!e.target?.closest?.('input,textarea,select,[contenteditable="true"]');}
  function keydown(e){
    if(e.ctrlKey||e.metaKey||e.altKey||typing(e)||!canAct())return;
    if(enableStatues&&e.code==='KeyX'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)statues();return;}
    if(!state.active||freeze()||state.kind!=='visitor')return;
    if(e.code==='Escape'){end('exit');return;}
    if(!['KeyQ','KeyE','KeyZ','KeyC','KeyF','ShiftLeft','ShiftRight'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    if(e.code==='KeyQ')attack(selected);else if(e.code==='KeyE')block(true);else if(e.code==='KeyZ')attack(7);else if(e.code==='KeyC')attack(11);else if(e.code==='KeyF')attack(9);else dodge();uiDirty=true;
  }
  function keyup(e){if(e.code==='KeyE'&&a)block(false);if(state.active&&!freeze()&&['KeyQ','KeyE','KeyZ','KeyC','KeyF','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}}
  function pointer(e){
    if(!state.active||freeze()||state.kind!=='visitor'||typing(e)||e.target?.closest?.('button,select,.combat-panel'))return;
    if(e.button!==0&&e.button!==2)return;e.preventDefault();e.stopImmediatePropagation();
    if(e.type==='pointerdown')attack(e.button===0?0:1);
  }
  function blurred(){if(a)a.blocking=false;end('blur');}
  function refreshUi(){
    if(!panel)return;panel.hidden=!state.active;hud.hidden=!canAct();
    if(banner)banner.hidden=!state.active||clock-enteredAt>.5;
    if(!uiDirty&&statueButton.getAttribute('aria-pressed')===(freeze()?'true':'false'))return;
    uiDirty=false;statueButton.setAttribute('aria-pressed',(freeze()?'true':'false'));statueButton.textContent=freeze()?'RETOMAR':'ESTÁTUAS';
    fightButton.textContent=state.active?'SAIR DA PORRADA':'PORRADA';
    moveSelect.value=String(selected);if(a&&b)statusText.textContent=freeze()?'Personagens em pausa':`BRIO: ${a.pride} · ${b.pride}`;
    if(blockButton)blockButton.setAttribute('aria-pressed',(a?.blocking?'true':'false'));
  }
  function apologize(target){let n=typeof target==='string'?npcs.find(n=>n.S.name===target):npcModule.findActor(target);if(!n){readVisitor();let best=12.25;for(let i=0;i<npcs.length;i++){const q=npcs[i],dx=q.x-position.x,dz=q.z-position.z,d=dx*dx+dz*dz;if(q.rancor>0&&d<best){n=q;best=d;}}}if(!n||state.active||freeze())return false;n.rancor=0;n.grudge=-Infinity;n.escalate=false;n.pestCd=60;callout('DESCULPA. Ficamos por aqui.');return true;}
  function setWeapon(kind){equipped=['carapau','paposeco','couve','jornal','chinelo','toalha','nata','luva'].includes(kind)?kind:'';return equipped;}
  function doubleCalduco(){if(!state.active||state.kind!=='visitor'||freeze()||endingAt)return false;attack(4);if(queueCount<3)queue[queueCount++]=4;return true;}
  function getBrio(){return visitor?.pride??100;}
  function setBrio(value){if(visitor)visitor.pride=clamp(Number(value)||0,0,100);uiDirty=true;return getBrio();}
  function adjustBrio(delta){return setBrio(getBrio()+delta);}
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',action);return b;}
  if(panel){
    cssLink=document.createElement('link');cssLink.rel='stylesheet';cssLink.href=new URL('./combat-ui.css',import.meta.url).href;document.head.append(cssLink);
    hud=document.createElement('div');hud.className='combat-hud';hud.hidden=true;hud.setAttribute('role','toolbar');hud.setAttribute('aria-label','Porrada e estátuas');statueButton=button('ESTÁTUAS',()=>statues());statueButton.setAttribute('aria-label','Estátuas: pausar personagens (X)');
    fightButton=button('PORRADA',()=>state.active?end('exit'):nearest());statueButton.hidden=!enableStatues;hud.append(statueButton,fightButton);document.body.append(hud);
    panel.className='combat-panel';panel.setAttribute('aria-label','Porrada');panel.hidden=true;
    statusText=document.createElement('p');statusText.setAttribute('role','status');panel.append(statusText);banner=document.createElement('strong');banner.className='combat-banner';banner.textContent='PORRADA!';panel.append(banner);
    const label=document.createElement('label');label.textContent='Golpe ';moveSelect=document.createElement('select');moveSelect.setAttribute('aria-label','Escolher golpe');
    for(let i=0;i<MOVES.length;i++){const option=document.createElement('option');option.value=String(i);option.textContent=MOVES[i].label;moveSelect.append(option);}moveSelect.addEventListener('change',()=>{selected=+moveSelect.value;uiDirty=true;});label.append(moveSelect);panel.append(label);
    const keys=document.createElement('p');keys.className='combat-keys';keys.textContent='Clique: chapada · Direito: revés · Q: golpe · Z/C: especiais · F: chinelada · E: defender · Shift: esquivar · Espaço: saltar · WASD: mover';panel.append(keys);
    const actions=document.createElement('div');actions.className='combat-actions';actions.append(button('GOLPEAR',()=>attack(selected)));
    blockButton=button('DEFENDER',()=>block(!a?.blocking));blockButton.setAttribute('aria-pressed','false');actions.append(blockButton,button('ESQUIVAR',dodge),button('SALTAR',()=>controls.combatJump()));panel.append(actions);document.body.append(panel);
    window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);
    for(const name of ['pointerdown','pointerup','mousedown','mouseup','contextmenu'])window.addEventListener(name,pointer,true);
    window.addEventListener('blur',blurred);
  }
  function dispose(){end('dispose');if(freeze())statues(false);disposed=true;hud?.remove();panel?.remove();cssLink?.remove();stopSounds();if(typeof window!=='undefined'){window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);for(const name of ['pointerdown','pointerup','mousedown','mouseup','contextmenu'])window.removeEventListener(name,pointer,true);window.removeEventListener('blur',blurred);}if(avatar){ctx.scene.remove(avatar.root);avatar.rig.mesh.geometry.dispose();avatar.rig.mesh.material.dispose();}}
  function getVisitorStatus(){return visitorStatus;}
  function getScriptedResult(){return scriptedResult;}
  const api={actors:npcs,getVisitorStatus,getScriptedResult,state,events,engage,startScripted,end,attack,block,dodge,statues,apologize,setWeapon,doubleCalduco,getBrio,setBrio,adjustBrio,update,renderCamera,restoreCamera,dispose};
  ctx.scene.userData.combatAPI=api;return api;
}
