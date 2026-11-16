import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { updateAudioListener } from './spatial-audio.js';

// A separate transport clock, with admission still owned by the ONE global broker.
export function createStatueAudio(ctx) {
  const parent=ctx.audio, scene=ctx.scene;
  let ac=null,bus=null,limiter=null,closing=false,changing=false,wanted=false;
  const view={get context(){return ac;},get bus(){return bus;},get muted(){return !!parent?.muted;},
    acquireVoice(options){if(!ac||ac.state!=='running'||wanted||scene.userData.questQuiet)return null;return parent?.acquireVoice?.({...options,sourceContext:ac})||null;},
    releaseVoice(token){parent?.releaseVoice?.(token);},duck(seconds){parent?.duck?.(seconds);},preparePunchline(){return parent?.preparePunchline?.()||0;}};
  function ensure(){
    if(ac||closing||!parent?.context||parent.context.state!=='running')return;
    const Factory=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Factory)return;
    try{ac=new Factory({sampleRate:parent.context.sampleRate,latencyHint:'interactive'});parent.registerVoiceContext?.(ac);bus=ac.createGain();limiter=ac.createDynamicsCompressor();
      limiter.threshold.value=-9;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.08;
      bus.gain.value=parent.muted||scene.userData.questQuiet?0:.45;bus.connect(limiter);limiter.connect(ac.destination);settle();
    }catch{ac?.close?.().catch(()=>{});ac=null;bus=null;limiter=null;}
  }
  async function settle(){
    if(!ac||changing||closing)return;changing=true;
    try{for(let i=0;i<4&&!closing;i++){const hold=wanted||typeof document!=='undefined'&&document.hidden;if(hold&&ac.state==='running')await ac.suspend();else if(!hold&&ac.state==='suspended')await ac.resume();else break;if(hold===(wanted||typeof document!=='undefined'&&document.hidden))break;}}
    catch{/* A browser may require the next user gesture to resume. Never resume the ambient context here. */}
    finally{changing=false;}
  }
  function gesture(){ensure();settle();}
  function setPaused(value){wanted=!!value;settle();}
  function update(camera){ensure();if(!ac)return;const silent=!!parent.muted||!!scene.userData.questQuiet||typeof document!=='undefined'&&document.hidden;
    bus.gain.value=silent?0:.45;updateAudioListener(view,camera);}
  if(typeof window!=='undefined'){window.addEventListener('pointerdown',gesture);window.addEventListener('keydown',gesture);}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',settle);
  function dispose(){closing=true;if(typeof window!=='undefined'){window.removeEventListener('pointerdown',gesture);window.removeEventListener('keydown',gesture);}if(typeof document!=='undefined')document.removeEventListener('visibilitychange',settle);ac?.close().catch(()=>{});bus?.disconnect();limiter?.disconnect();}
  return {audio:view,setPaused,update,dispose,get suspended(){return !ac||ac.state==='suspended';}};
}

const THAW_LINES=Object.freeze(['Eu estava a pensar.','Quem me mudou o intervalo?','O pombo estava a avaliar.']);
export function createStatueDirector(ctx,{actors,combat,say}={}){
  const {THREE}=ctx,ud=ctx.scene.userData;
  let frozen=false,elapsed=0,target=null,previousOwner=null,pausedSpeech=false,thaws=0,disposed=false,pendingThaw=null,thawWait=0;
  const parts=[],matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),position=new THREE.Vector3(),q=new THREE.Quaternion(),worldHead=new THREE.Vector3();
  function part(g,x,y,z,sx,sy,sz,color){ctx.M.boxUV(g);g=g.index?g.toNonIndexed():g;scale.set(sx,sy,sz);position.set(x,y,z);matrix.compose(position,q,scale);g.applyMatrix4(matrix);const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);}
  part(new THREE.SphereGeometry(1,10,6),0,.1,0,.10,.13,.18,0x747e82);
  part(new THREE.SphereGeometry(1,10,6),0,.25,.09,.075,.08,.085,0x4b6562);
  part(new THREE.BoxGeometry(1,1,1),0,.245,.18,.045,.025,.075,0xbba47d);
  part(new THREE.BoxGeometry(1,1,1),0,.075,-.18,.12,.025,.14,0x465055);
  part(new THREE.SphereGeometry(1,8,4),-.087,.11,0,.035,.09,.13,0x535c62);
  part(new THREE.SphereGeometry(1,8,4),.087,.11,0,.035,.09,.13,0x535c62);
  part(new THREE.BoxGeometry(1,1,1),-.035,-.025,.025,.015,.06,.07,0xa36d64);
  part(new THREE.BoxGeometry(1,1,1),.035,-.025,.025,.015,.06,.07,0xa36d64);
  const geometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();
  const material=ctx.M.get('plaster',{color:0xffffff,roughness:.86,tile:1}).clone();material.vertexColors=true;
  const pigeon=new THREE.Mesh(geometry,material);pigeon.name='statue-pigeon';pigeon.visible=false;pigeon.userData.noPick=true;pigeon.castShadow=false;ctx.scene.add(pigeon);
  function pauseSpeech(){const owner=ud.ttsOwner;if(!owner||!owner.synth||!owner.utterance||owner.lease?.context!==ctx.audio?.context)return;previousOwner=owner;try{owner.synth.pause();pausedSpeech=true;}catch{}}
  function resumeSpeech(){if(!pausedSpeech)return;const owner=previousOwner;previousOwner=null;pausedSpeech=false;try{if(ud.questQuiet&&ud.ttsOwner===owner)owner.synth.cancel();owner.synth.resume();}catch{}}
  function transition(value,camera){
    frozen=value;elapsed=0;pigeon.visible=false;
    if(value){target=null;let best=144;for(let i=0;i<actors.length;i++){const n=actors[i];if(!n.root.visible||n.combatHidden||!n.head)continue;const dx=n.x-camera.position.x,dz=n.z-camera.position.z,d=dx*dx+dz*dz;if(d<best){best=d;target=n;}}pauseSpeech();}
    else{resumeSpeech();pendingThaw=target;thawWait=0;target=null;}
  }
  function update(dt,camera){if(disposed||!camera)return;const value=!!ud.npcStatues;if(value!==frozen)transition(value,camera);if(ud.questQuiet){pendingThaw=null;if(pausedSpeech)resumeSpeech();}if(!frozen){if(pendingThaw){thawWait+=Math.min(.1,Math.max(0,dt));const n=pendingThaw;if(thawWait>12||Math.hypot(n.x-camera.position.x,n.z-camera.position.z)>40)pendingThaw=null;else if(!n.busy&&!n.combatControlled&&n.talkT<=0&&n.sillyT<0){if(say?.(n,THAW_LINES[thaws%THAW_LINES.length])){thaws++;pendingThaw=null;}}}return;}
    elapsed+=Math.min(.1,Math.max(0,dt));if(!target||!target.root.visible||Math.hypot(target.x-camera.position.x,target.z-camera.position.z)>40){pigeon.visible=false;return;}
    if(elapsed<1)return;target.root.updateMatrixWorld(true);worldHead.set(0,(target.rig?.height||2)+.05,0);target.root.localToWorld(worldHead);pigeon.position.copy(worldHead);pigeon.rotation.y=target.yaw||0;pigeon.visible=true;
  }
  function dispose(){if(disposed)return;disposed=true;resumeSpeech();ctx.scene.remove(pigeon);geometry.dispose();material.dispose();}
  return {update,dispose,pigeon};
}
