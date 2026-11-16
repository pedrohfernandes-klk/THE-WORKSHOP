// Explicit source admission. Native AudioContext factories are never replaced.
const FORWARDED=['banks','rr','pw','last','tone','bed','bedWind','bedCity','nightL','stormL','hum','srcOut','srcLp','srcClack','rain','lastReveal','thunders'];
const CLEAR={tone:['tone'],bed:['bed','bedWind','bedCity'],night:['nightL'],storm:['stormL'],hum:['hum']};
export const rootEngine=E=>E._root||E;
function scope(root,token){
  const E=Object.create(root);E._root=root;E._voice=token;
  E.dry=token.gain;E.dry.connect(root.dry);
  E.wetIn=root.ctx.createGain();E.wetIn.gain.value=1;token.addOutput(E.wetIn);E.wetIn.connect(root.wetIn);
  for(const key of FORWARDED)Object.defineProperty(E,key,{get(){return root[key];},set(value){root[key]=value;},configurable:true});
  return E;
}
export function trackAudioSource(E,source){
  if(!E._voice?.track(source)){try{source.disconnect();}catch{}throw new Error('Audio source created outside admitted event');}
  E._tracked=(E._tracked||0)+1;return source;
}
export function managedEvent(E,t,duration,priority=1){
  if(E._voice?.active)return E;
  const root=rootEngine(E);if(root.blocked)return null;
  const token=root.voiceManager?.acquireVoice({priority,foreground:false,ms:Math.ceil((Math.max(0,t-root.ctx.currentTime)+duration+.12)*1000)});
  return token?scope(root,token):null;
}
export function managedLoop(E,key){
  const root=rootEngine(E);if(root.blocked)return null;
  const now=root.ctx.currentTime,all=root.managedLoops||(root.managedLoops=Object.create(null));
  let r=all[key];if(!r)r=all[key]={token:null,retry:0,renew:0};
  if(r.token?.active)return null; // the builder caller must reuse its existing result
  if(now<r.retry)return null;r.retry=now+.5;
  const token=root.voiceManager?.acquireVoice({priority:0,foreground:false,ms:2000});if(!token)return null;
  r.token=token;r.renew=now+1;
  token.onRelease=()=>{if(r.token!==token)return;r.token=null;for(const field of CLEAR[key]||[])root[field]=null;if(root.last)root.last={};};
  return scope(root,token);
}
export function maintainLoop(E,key,wanted,builder){
  const root=rootEngine(E),r=root.managedLoops?.[key],now=root.ctx.currentTime;
  if(!wanted||root.blocked){r?.token?.release();return;}
  if(!r?.token?.active){builder(root);return;}
  if(now>=r.renew){r.renew=now+1;r.token.renew(2000);}
}
export function dropManagedLoop(E,key){rootEngine(E).managedLoops?.[key]?.token?.release();}
