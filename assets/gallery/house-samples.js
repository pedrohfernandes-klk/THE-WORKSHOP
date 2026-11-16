// Six owner-supplied recordings. Lazy, bounded, globally admitted; no private audio context.
export const HOUSE_SAMPLES=Object.freeze({
 chime:{file:'lock-chime.mp3',cooldown:30,gain:.32,maxDuration:2.4,vocal:false},
 impact:{file:'impact.mp3',cooldown:30,gain:.28,maxDuration:1.2,vocal:false},
 comic:{file:'short-comic.mp3',cooldown:60,gain:.24,maxDuration:1,vocal:true},
 puff:{file:'comic-puff.mp3',cooldown:90,gain:.24,maxDuration:1,vocal:false},
 voice:{file:'short-voice.mp3',cooldown:60,gain:.24,maxDuration:2,vocal:true},
 announcer:{file:'announcer.opus',cooldown:60,gain:.24,maxDuration:4,vocal:true},
});
export function createHouseSamples(ctx,{now=()=>performance.now()/1000,fetcher=globalThis.fetch,isSpeaking=()=>false}={}){
 const cache=new Map(),pending=new Map(),last=new Map(),ud=ctx.scene.userData;
 let moved=false,disposed=false,active=null,lastAny=-Infinity,generation=0,combatSerial=0,wasSuppressed=false,listener=null,knockouts=0,slaps=0,fifthVoice=null,lastFifth=-Infinity,pendingVoice=null,voiceReadyAt=0,voiceExpiresAt=0,voiceTurn=0;
 const abort=new AbortController();
 function blocked(vocal){const a=ctx.audio;return disposed||!(ctx.startup?ctx.startup.moved:moved)||!a||a.muted||a.quietConfirmed||ud.questQuiet||ud.tramHallQuiet||ud.questSilence?.requested||ud.bairroEffects?.silenceUntil>now()||vocal&&ud.npcStatues;}
 function stop(){generation++;const a=active;active=null;if(!a)return;try{a.source.stop();}catch{}try{a.source.disconnect();a.gain.disconnect();a.panner?.disconnect();}catch{}a.token.release();}
 async function load(id){
  if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
  const spec=HOUSE_SAMPLES[id],ac=ctx.audio?.context;if(!spec||!ac||blocked(spec.vocal))return null;
  const p=(async()=>{const response=await fetcher(new URL('../audio/house/'+spec.file,import.meta.url),{signal:abort.signal});if(!response.ok)throw Error('Sample HTTP '+response.status);const bytes=await response.arrayBuffer();const buffer=await ac.decodeAudioData(bytes);if(!disposed)cache.set(id,buffer);return buffer;})().catch(()=>null).finally(()=>pending.delete(id));pending.set(id,p);return p;
 }
 async function play(id,{manual=false,offset,duration:requestedDuration,maxDelay=Infinity,x,z}={}){
  if(!Object.prototype.hasOwnProperty.call(HOUSE_SAMPLES,id))return false;
  const spec=HOUSE_SAMPLES[id];if(spec.vocal&&!manual)return false;
  if(id==='announcer'&&(!manual||!Number.isFinite(offset)||offset<0||!Number.isFinite(requestedDuration)||requestedDuration<=0||requestedDuration>4))return false;
  if(listener&&Number.isFinite(x)&&Number.isFinite(z)&&(x-listener.x)**2+(z-listener.z)**2>1600)return false;
  const requested=now(),epoch=generation;
  if(blocked(spec.vocal)||active||requested-lastAny<8||requested-(last.get(id)??-Infinity)<spec.cooldown)return false;
  // First use only warms the buffer; existing synthesized impact remains immediate.
  if(!manual&&!cache.has(id)){void load(id);return false;}
  // Never steal or overlap an existing joke, signature or foreground effect.
  if(isSpeaking()||(ctx.audio.stats?.().foreground??1)>0)return false;
  const buffer=await load(id);if(!buffer||epoch!==generation||blocked(spec.vocal)||active||now()-requested>Math.min(maxDelay,manual?Infinity:.25))return false;
  if(now()-lastAny<8||now()-(last.get(id)??-Infinity)<spec.cooldown||isSpeaking()||(ctx.audio.stats?.().foreground??1)>0)return false;
  const ac=ctx.audio.context;if(!ac||ac.state!=='running'||!ctx.audio.bus)return false;
  offset=Number.isFinite(offset)?Math.max(0,Math.min(offset,buffer.duration-.01)):0;
  const duration=Math.min(spec.maxDuration,Number.isFinite(requestedDuration)?requestedDuration:spec.maxDuration,buffer.duration-offset);if(!(duration>0))return false;
  const lead=spec.vocal?Math.min(.8,Math.max(0,ctx.audio.preparePunchline?.()||0)):0;
  const token=ctx.audio.acquireVoice?.({priority:1,foreground:true,ms:(duration+lead+.1)*1000});if(!token)return false;
  let source,gain,panner;
  try{
   source=ac.createBufferSource();gain=ac.createGain();source.buffer=buffer;gain.gain.value=spec.gain;source.connect(gain);
   if(Number.isFinite(x)&&Number.isFinite(z)){panner=ac.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=2;panner.maxDistance=40;panner.rolloffFactor=1;panner.positionX.value=x;panner.positionY.value=1.4;panner.positionZ.value=z;gain.connect(panner);panner.connect(token.gain);}else gain.connect(token.gain);
   token.gain.connect(ctx.audio.bus);token.track(source);
   const voice={source,gain,panner,token,vocal:spec.vocal};active=voice;
   source.onended=()=>{if(active===voice)active=null;try{source.disconnect();gain.disconnect();panner?.disconnect();}catch{}token.release();};
   source.start(token.startAt+lead,offset,duration);last.set(id,now());lastAny=now();return true;
  }catch{if(active?.token===token)active=null;try{source?.stop();source?.disconnect();gain?.disconnect();panner?.disconnect();}catch{}token.release();return false;}
 }
 function onEvent(event){if(event.detail?.type==='password-ok')void play('chime');}
 const events=ctx.events||ud.workshopEvents;events?.addEventListener('workshop',onEvent);
 function update(camera){
  if(camera?.position)listener=camera.position;
  const suppressed=blocked(true);if(suppressed&&!wasSuppressed)generation++;wasSuppressed=suppressed;
  if(active&&(blocked(active.vocal)||!active.token.active&&!active.token.fading))stop();
  if(suppressed)pendingVoice=null;
  const count=ud.stats?.slaps||0;
  if(count!==slaps){const before=slaps;slaps=count;if(fifthVoice&&count>before&&Math.floor(count/5)>Math.floor(before/5)&&now()-lastFifth>=90&&!suppressed){
   lastFifth=now();pendingVoice=fifthVoice==='alternate'?(voiceTurn++%2?'comic':'voice'):fifthVoice;voiceReadyAt=now()+3;voiceExpiresAt=now()+12;void load(pendingVoice);
  }}
  if(pendingVoice){
   if(now()>voiceExpiresAt)pendingVoice=null;
   else if(now()>=voiceReadyAt&&cache.has(pendingVoice)&&!active&&!isSpeaking()&&(ctx.audio.stats?.().foreground??1)===0){const id=pendingVoice;pendingVoice=null;void play(id,{manual:true,maxDelay:voiceExpiresAt-now()});}
  }
  const ring=ud.combatEvents;if(!ring||ring.serial===combatSerial)return;
  // Consume even while blocked: thaw never replays a backlog.
  combatSerial=ring.serial;const entry=ring.entries?.[(ring.serial-1)%ring.entries.length];
  if(entry?.serial===ring.serial&&entry.type==='knockout'){knockouts++;if(knockouts%3===0&&!blocked(false))void play('puff',{x:entry.bx,z:entry.bz});}
  if(entry?.serial===ring.serial&&entry.type==='impact'&&entry.intensity>0&&!blocked(false))void play('impact',{x:entry.bx,z:entry.bz});
 }
 const api={play,update,configure({fifthSlapVoice=null,approved=false}={}){fifthVoice=approved&&['voice','comic','alternate'].includes(fifthSlapVoice)?fifthSlapVoice:null;},setMoved(){moved=true;},stop,dispose(){if(disposed)return;disposed=true;stop();abort.abort();events?.removeEventListener('workshop',onEvent);cache.clear();pending.clear();}};
 ud.houseSamples=api;return api;
}
