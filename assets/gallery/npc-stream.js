import {idleSlice} from './startup-idle.js';
// Slots never enter gameplay arrays; only fully built, warmed actors do.
export function createActorStream(ctx,{slots,assemble,commit,fetchCast=defaultFetch}={}) {
  const records=slots.map(slot=>({slot,state:0,entry:null,actor:null,retry:0,attempts:0}));
  let camera=null,working=false,disposed=false,clock=0;
  const pause=()=>ctx.yieldBuild?ctx.yieldBuild():idleSlice();
  function near(r){if(!camera||ctx.startup&&!ctx.startup.moved)return false;const dx=r.slot.home[0]-camera.position.x,dz=r.slot.home[1]-camera.position.z;return dx*dx+dz*dz<1600;}
  async function run(r){
    working=true;r.state=1;
    try {
      await pause();if(disposed||!near(r)){r.state=0;return;}
      if(!r.entry){r.entry=await fetchCast(r.slot.id);if(disposed)return;await pause();}
      if(!near(r)){r.state=0;return;}
      if(!r.actor)r.actor=await assemble(r.slot,r.entry);
      if(disposed)return;
      // Visitor may have left during download/build/driver compilation.
      if(!near(r)){r.state=0;return;}
      commit(r.actor);r.state=2;
    }catch(error){r.state=0;r.attempts++;r.retry=clock+Math.min(30,2*r.attempts);ctx.onActorError?.(r.slot.id,error);}
    finally{working=false;}
  }
  function update(frame){camera=frame?.camera||camera;clock=Number.isFinite(frame?.time)?frame.time:clock;
    if(disposed||working||ctx.startup&&!ctx.startup.moved)return;
    for(let i=0;i<records.length;i++){const r=records[i];if(r.state===0&&clock>=r.retry&&near(r)){void run(r);break;}}
  }
  return {update,dispose(){disposed=true;},get pending(){return working;},get readyCount(){let n=0;for(const r of records)if(r.state===2)n++;return n;}};
}
async function defaultFetch(id){
  if(!/^[a-z0-9_]+$/.test(id))throw Error('Invalid NPC id');
  const response=await fetch(new URL('../data/cast/'+id+'.json',import.meta.url));
  if(!response.ok)throw Error('NPC cast unavailable: '+id);
  const text=await response.text();await idleSlice();const entry=JSON.parse(text);
  if(entry.id!==id||!entry.model||!entry.lines)throw Error('Invalid NPC cast: '+id);
  return entry;
}
