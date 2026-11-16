import { reserveModuleVoice, finishModuleVoice } from './audio-lease.js';
// Opt-in cast personalities. No new actors, geometry, lights or per-frame objects.
// The legacy NPC module remains authoritative for talking, impacts and recovery.
import { groundAt } from './collision.js';

const TAU = Math.PI * 2;
const wrap = a => a - TAU * Math.round(a / TAU);

export function createNpcPersonalities(ctx, { npcs, castById, chooseLine, say }) {
  const records = [], lookup = new WeakMap();
  const voices = new Array(8).fill(null);
  let world = null, camera = null, now = 0, serial = 0, eventAt = -1e9;
  let eventX = 0, eventZ = 0, victim = null, nextLine = 0, gestureTime = null;
  let snakeTime = null, started = false, mutedLast = false, nextPlan = 0;
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i], entry = castById.get(n.S.name), kind = entry?.behavior;
    if (kind !== 'onlooker' && kind !== 'sniffer' && kind !== 'hugger') continue;
    const r = { n, entry, kind, index: records.length, homeX: n.x, homeZ: n.z,
      obstacles: [], covers: [], navigationReady: false, cover: null, event: 0, until: 0, targetX: n.x, targetZ: n.z,
      nextPlan: 0, nextSpeak: 0, nextSniff: 7 + records.length * 3,
      sniffAt: -1e9, hugAt: -1e9, hugUntil: 0, snortAt: -1,
      nextHug: 0, feign: false, moving: false, posed: false, lastSound: -1e9 };
    records.push(r); lookup.set(n,r);
    // Pin ordinary wander to the current safe point. Our bounded navigation may
    // move it, but ordinary random patrol/director routing must not move it too.
    n.fixed = true; n.S.fixed = true; n.S.personality = kind;
    n.pts[0] = n.x; n.pts[1] = n.z;
  }
  function quiet() { return !!ctx.scene?.userData?.questQuiet; }
  function interrupted(n) {
    return n.busy || n.pestT > 0 || n.windT > 0 || n.goOn || n.S.seated
      || n.sillyT >= 0 || n.hatState > 0 || n.freezeT > 0;
  }
  function awake(n) {
    if(!camera)return false;
    const dx=n.x-camera.position.x,dz=n.z-camera.position.z;
    return dx*dx+dz*dz<=1600 && Math.abs(camera.position.y-(n.baseY+1.62))<2.4;
  }
  function setNavigation(value) {
    world=value?.regions&&value?.colliders ? value : null;
    if(!world)return;
    for(let j=0;j<records.length;j++) {
      const r=records[j];r.obstacles.length=0;r.covers.length=0;r.navigationReady=true;
      for(let i=0;i<world.colliders.length;i++) {
        const c=world.colliders[i];let actor=false;
        for(let k=0;k<npcs.length;k++)if(npcs[k].col===c){actor=true;break;}
        if(actor)continue;
        if(c.maxX<r.homeX-16||c.minX>r.homeX+16||c.maxZ<r.homeZ-16||c.minZ>r.homeZ+16)continue;
        if(r.obstacles.length>=256){r.navigationReady=false;break;}
        r.obstacles.push(c);
        if(r.covers.length<8&&c.maxX-c.minX<=1.1&&c.maxZ-c.minZ<=1.1&&(c.maxY??0)>=1.5&&(c.minY??0)<=.2)r.covers.push(c);
      }
    }
  }
  function safe(r,x,z) {
    if(!world||!r.navigationReady)return false;
    const n=r.n,dx=x-r.homeX,dz=z-r.homeZ;
    if(dx*dx+dz*dz>144)return false;
    const floor=groundAt(world.regions,x,z,0,.1);
    if(floor===null||Math.abs(floor)>.1)return false; // no stairs, lifts or drops
    const radius=Math.max(.4,n.colW+.08);
    for(let i=0;i<r.obstacles.length;i++) {
      const c=r.obstacles[i];
      if((c.maxY??Infinity)<.15||(c.minY??-Infinity)>n.colH)continue;
      const cx=x<c.minX?c.minX:x>c.maxX?c.maxX:x;
      const cz=z<c.minZ?c.minZ:z>c.maxZ?c.maxZ:z;
      const ex=x-cx,ez=z-cz;if(ex*ex+ez*ez<radius*radius)return false;
    }
    for(let i=0;i<npcs.length;i++) {
      const other=npcs[i];if(other===n)continue;
      const ex=x-other.x,ez=z-other.z,rr=radius+other.colW+.08;
      if(ex*ex+ez*ez<rr*rr)return false;
    }
    if(camera){const ex=x-camera.position.x,ez=z-camera.position.z;if(ex*ex+ez*ez<2.25)return false;}
    return true;
  }
  function route(r,x,z) {
    const dx=x-r.n.x,dz=z-r.n.z,d=Math.sqrt(dx*dx+dz*dz);
    const steps=Math.max(1,Math.ceil(d/.18));
    for(let i=1;i<=steps;i++){const k=i/steps;if(!safe(r,r.n.x+dx*k,r.n.z+dz*k))return false;}
    return true;
  }
  function plan(r) {
    const n=r.n,dx=n.x-eventX,dz=n.z-eventZ,d=Math.sqrt(dx*dx+dz*dz)||1;
    r.targetX=n.x;r.targetZ=n.z;r.cover=null;
    // At most one deterministic direct route, at 0.8-second intervals. No
    // pathfinder, teleport or wall sliding: if it is unsafe, watch from here.
    let tx=eventX+dx/d*(4.1+r.index*.35),tz=eventZ+dz/d*(4.1+r.index*.35);
    let best=Infinity;
    for(let i=0;i<r.covers.length;i++) {
      const c=r.covers[i],w=c.maxX-c.minX,h=c.maxZ-c.minZ;
      if(w>1.1||h>1.1||(c.maxY??0)<1.5||(c.minY??0)>.2)continue;
      const cx=(c.minX+c.maxX)*.5,cz=(c.minZ+c.maxZ)*.5;
      const ex=cx-eventX,ez=cz-eventZ,ed=Math.sqrt(ex*ex+ez*ez);
      if(ed<2.7||ed>5.2)continue;
      const back=Math.max(w,h)*.5+n.colW+.16;
      const px=cx+ex/ed*back,pz=cz+ez/ed*back;
      const dd=(px-n.x)**2+(pz-n.z)**2;
      if(dd<best&&dd<25){best=dd;tx=px;tz=pz;r.cover=c;}
    }
    if((d<3||d>6||r.cover)&&route(r,tx,tz)){r.targetX=tx;r.targetZ=tz;}else r.cover=null;
  }
  function emit(x,z,who) { eventX=x;eventZ=z;victim=who;eventAt=now;serial++; }
  function sound(name,n) {
    const r=lookup.get(n);
    if(!r||!awake(n)||quiet())return false;
    const relevant=(r.kind==='sniffer'&&(name==='slap'||name==='snort'))
      ||(r.kind==='hugger'&&(name==='slap'||name==='laugh'));
    if(!relevant)return false;
    if(ctx.audio?.muted||now-r.lastSound<.7)return true;
    let ac,bus;
    try{ac=ctx.audio?.context;bus=ctx.audio?.bus;}catch{return true;}
    if(!ac||!bus||ac.state!=='running')return true;
    let slot=-1;for(let i=0;i<voices.length;i++)if(!voices[i]){slot=i;break;}
    if(slot<0)return true;
    r.lastSound=now;
    const lease = reserveModuleVoice(ctx, name === 'slap' ? 3 : 2, true, .55, bus); if (!lease) return true;
    let oscillator,gain,filter;
    try {
      oscillator=ac.createOscillator();gain=ac.createGain();filter=ac.createBiquadFilter();
      const pig=r.kind==='sniffer',t=Math.max(ac.currentTime,lease.startAt),duration=name==='laugh' ? .48 : .28;
      const dx=n.x-camera.position.x,dz=n.z-camera.position.z;
      const distance=Math.sqrt(dx*dx+dz*dz),volume=.12*Math.max(0,1-distance/18)**2;
      oscillator.type=pig?'sawtooth':'triangle';
      oscillator.frequency.setValueAtTime(pig?110:98,t);
      oscillator.frequency.exponentialRampToValueAtTime(pig?55:49,t+duration);
      filter.type='bandpass';filter.frequency.value=pig?420:170;filter.Q.value=pig?2:.7;
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.015);
      if(name==='laugh') {
        gain.gain.exponentialRampToValueAtTime(.0001,t+.12);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.8),t+.17);
        gain.gain.exponentialRampToValueAtTime(.0001,t+.28);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.6),t+.33);
      }
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      oscillator.connect(filter);filter.connect(gain);gain.connect(lease.gain); lease.track(oscillator); finishModuleVoice(lease, oscillator); voices[slot]=oscillator;
      oscillator.onended=()=>{oscillator.disconnect();filter.disconnect();gain.disconnect();if(voices[slot]===oscillator)voices[slot]=null;};
      oscillator.start(t);oscillator.stop(t+duration+.02);
    }catch{lease.release();try{oscillator?.stop();}catch{}oscillator?.disconnect();filter?.disconnect();gain?.disconnect();voices[slot]=null;}
    return true;
  }
  function silence() {for(let i=0;i<voices.length;i++)if(voices[i]){try{voices[i].stop();}catch{}voices[i]=null;}}
  function onEvent(name,n) {
    if(quiet())return;
    const r=lookup.get(n);
    if(name==='slap'){emit(n.x,n.z,n);return;}
    if(!r)return;
    if(name==='speech'&&r.kind==='sniffer')r.snortAt=now+n.talkT+.12;
    if(name==='talk'&&r.kind==='hugger'&&now>=r.nextHug){r.hugAt=now+.9;r.hugUntil=r.hugAt+1.1;r.nextHug=now+18;}
  }
  function before(dt,frame) {
    camera=frame?.camera||camera;
    if(!camera||!records.length)return;
    now=typeof frame.time==='number'?frame.time:now+Math.max(0,dt);
    const ud=ctx.scene.userData,g=ud.lastGesture,cp=camera.position;
    const snake=ud.snakeEvent;
    if(!started){started=true;gestureTime=g?.time??null;snakeTime=snake?.time??null;}
    const isQuiet=quiet(),isMuted=!!ctx.audio?.muted;
    if(isQuiet||isMuted&&!mutedLast)silence();mutedLast=isMuted;
    if(isQuiet){gestureTime=g?.time??null;snakeTime=snake?.time??null;eventAt=-1e9;}
    else {
      if(g&&g.time!==gestureTime){gestureTime=g.time;if(g.name==='clap'||g.name==='dance'||g.name==='manguito'||g.name==='pirete'||g.name==='slap')emit(cp.x,cp.z,null);}
      if(snake&&snake.time!==snakeTime&&(snake.kind==='start'||snake.kind==='lose'))emit(snake.x,snake.z,null);
      snakeTime=snake?.time??null;
    }
    for(let i=0;i<records.length;i++) {
      const r=records[i],n=r.n;r.moving=false;
      if(r.posed){n.rig?.setPreset?.(null,0);r.posed=false;}
      if(isQuiet){r.until=0;r.snortAt=-1;r.hugUntil=0;r.sniffAt=-1e9;r.targetX=n.x;r.targetZ=n.z;continue;}
      if(!awake(n)||interrupted(n)||n.talkT>0)continue;
      if(r.kind==='onlooker') {
        if(r.event!==serial&&now-eventAt<2&&victim!==n){r.event=serial;const ex=n.x-eventX,ez=n.z-eventZ;if(ex*ex+ez*ez<225)r.until=now+7;}
        if(now>=r.until)continue;
        const dx=n.x-cp.x,dz=n.z-cp.z,d=Math.sqrt(dx*dx+dz*dz)||1;
        const e=camera.matrixWorld.elements;
        r.feign=d<8&&(-e[8]*dx-e[10]*dz)/d>.9;
        if(!ctx.reducedMotion&&!r.feign&&now>=r.nextPlan&&now>=nextPlan){r.nextPlan=now+2.4;nextPlan=now+.8;plan(r);}
        if(!ctx.reducedMotion&&!r.feign&&world) {
          const ex=r.targetX-n.x,ez=r.targetZ-n.z,dist=Math.sqrt(ex*ex+ez*ez);
          const step=Math.min(dist,.7*Math.min(Math.max(dt,0),.1));
          if(dist>.04){const nx=n.x+ex/dist*step,nz=n.z+ez/dist*step;if(safe(r,nx,nz)){n.x=nx;n.z=nz;n.ph+=step*7;r.moving=true;}}
        }
        n.pts[0]=n.x;n.pts[1]=n.z;
        n.baseYaw=Math.atan2(eventX-n.x,eventZ-n.z)+(r.feign?1.5:0);
        if(now>r.nextSpeak&&now>nextLine&&d<9&&n.laughAt<=0&&n.laughT<=0) {
          const key=r.feign?'feign':r.cover?'peek':'comment';
          const text=chooseLine(r.entry,key);r.nextSpeak=now+15;nextLine=now+5;
          if(text)say(n,text,false);
        }
      } else if(r.kind==='sniffer'&&now>r.nextSniff) {
        r.nextSniff=now+10+i*1.7;r.sniffAt=now;
      }
    }
  }
  function after(dt,frame) {
    if(!camera)return;
    const isQuiet=quiet();
    for(let i=0;i<records.length;i++) {
      const r=records[i],n=r.n;
      if(isQuiet||!awake(n)||interrupted(n)) {
        if(r.posed){n.rig?.setPreset?.(null,0);r.posed=false;}continue;
      }
      if(r.kind==='onlooker'&&now<r.until&&n.talkT<=0&&n.laughT<=0) {
        n.head.rotation.y=r.feign?1.05:wrap(Math.atan2(eventX-n.x,eventZ-n.z)-n.yaw)*.6;
        if(!ctx.reducedMotion&&r.cover&&!r.feign)n.head.rotation.z=Math.sin(now*1.8+i)*.08;
        n.rig?.setPreset?.('incredulidade',r.feign ? .3 : .65);r.posed=true;
        if(r.moving){const swing=Math.sin(n.ph)*.25;n.legs[0].rotation.x=swing;n.legs[1].rotation.x=-swing;}
      } else if(r.kind==='sniffer') {
        const t=now-r.sniffAt;
        if(t>=0&&t<1.15&&n.talkT<=0&&!ctx.reducedMotion){n.head.rotation.x+=Math.sin(t/1.15*Math.PI)*.2;n.rig?.eyes?.setLook?.(0,-.15);}
        if(r.snortAt>=0&&now>=r.snortAt){r.snortAt=-1;if(n.talkT<=0)sound('snort',n);}
      } else if(r.kind==='hugger'&&now>=r.hugAt&&now<r.hugUntil&&!ctx.reducedMotion) {
        const dx=n.x-camera.position.x,dz=n.z-camera.position.z;
        if(dx*dx+dz*dz<=16) {
          const k=Math.sin((now-r.hugAt)/1.1*Math.PI);
          n.arms[0].rotation.x=-1.35*k;n.arms[1].rotation.x=-1.35*k;
          n.arms[0].rotation.z=-.9*k;n.arms[1].rotation.z=.9*k;
        }
      }
    }
  }
  function dispose(){silence();for(let i=0;i<records.length;i++)records[i].n.rig?.setPreset?.(null,0);}
  return {before,after,onEvent,sound,setNavigation,dispose};
}

export const createNpcOnlookers = createNpcPersonalities;
