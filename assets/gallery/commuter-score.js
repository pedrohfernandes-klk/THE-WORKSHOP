// VIAGEM: original 96 BPM A-minor-pentatonic arrangement. Each note uses the
// shared audio broker; no persistent oscillator, independent context or media.
const BEAT=60/96,SCALE=[220,261.625565,293.664768,329.627557,391.995436];
const COMMUTE=[0,-1,2,-1,0,3,-1,2,0,-1,4,-1,2,3,2,-1];
export function createTramScore(ctx){
  let ac=null,bus=null,out=null,panner=null,filter=null,echo=null,feedback=null,wet=null,pump=null;
  let next=0,step=0,duckAt=0,disposed=false,closing=false,stopAt=-1,enabled=false;
  const tokens=new Array(24).fill(null);
  const isQuiet=()=>!!ctx.scene.userData.questQuiet||!!ctx.audio?.muted||(ctx.scene.userData.bairroEffects?.silenceUntil||0)>performance.now()/1000;
  function arm(){
    if(disposed)return false;const c=ctx.audio?.context,b=ctx.audio?.bus;if(!c||!b||c.state!=='running'||typeof ctx.audio?.acquireVoice!=='function')return false;
    if(c===ac&&b===bus)return true;disposeNodes();ac=c;bus=b;
    out=c.createGain();out.gain.value=0;pump=c.createGain();pump.gain.value=1;
    filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2200;filter.Q.value=1.1;
    panner=c.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=3;panner.maxDistance=40;panner.rolloffFactor=1.5;
    echo=c.createDelay(.5);echo.delayTime.value=.073;feedback=c.createGain();feedback.gain.value=.18;wet=c.createGain();wet.gain.value=.12;
    out.connect(pump);pump.connect(filter);filter.connect(panner);filter.connect(echo);echo.connect(feedback);feedback.connect(echo);echo.connect(wet);wet.connect(panner);panner.connect(bus);
    next=Math.ceil(c.currentTime/(BEAT/2))*(BEAT/2);step=Math.round(next/(BEAT/2))%16;return true;
  }
  function admit(t,duration){
    if(!ac||disposed||isQuiet())return null;
    let slot=-1;for(let i=0;i<tokens.length;i++)if(!tokens[i]?.active){slot=i;break;}if(slot<0)return null;
    const token=ctx.audio.acquireVoice({priority:0,foreground:false,ms:Math.ceil((Math.max(0,t-ac.currentTime)+duration+.08)*1000)});
    if(token)tokens[slot]=token;return token;
  }
  function tone(kind,t,f,volume,duration){
    const token=admit(t,duration);if(!token)return;t=Math.max(t,token.startAt);
    const source=ac.createOscillator(),gain=ac.createGain();source.type=kind==='rail'?'sine':kind==='steel'?'sine':kind==='vinyl'?'sawtooth':'triangle';
    source.frequency.setValueAtTime(f,t);
    if(kind==='rail')source.frequency.exponentialRampToValueAtTime(36,t+.16);
    if(kind==='steel')source.detune.value=7;
    gain.gain.setValueAtTime(.00001,t);gain.gain.linearRampToValueAtTime(volume,t+.006);gain.gain.exponentialRampToValueAtTime(.00001,t+duration-.01);
    source.connect(gain);gain.connect(token.gain);token.gain.connect(out);token.track(source);
    source.start(t);source.stop(t+duration);
    if(kind==='rail'){pump.gain.setTargetAtTime(.58,t,.003);pump.gain.setTargetAtTime(1,t+.035,.07);}
  }
  function vinyl(stopping){
    if(!arm()||isQuiet())return;const duration=stopping?2:1.1,token=admit(ac.currentTime,duration);if(!token)return;
    const t=Math.max(ac.currentTime,token.startAt),o=ac.createOscillator(),flutter=ac.createOscillator(),depth=ac.createGain(),gain=ac.createGain();
    o.type='triangle';flutter.type='sine';flutter.frequency.value=4.7;depth.gain.value=1.7;
    o.frequency.setValueAtTime(stopping?220:55,t);o.frequency.exponentialRampToValueAtTime(stopping?22:220,t+duration-.04);
    flutter.connect(depth);depth.connect(o.detune);gain.gain.setValueAtTime(.15,t);gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
    o.connect(gain);gain.connect(token.gain);token.gain.connect(out);token.track(o);token.track(flutter);
    o.start(t);flutter.start(t);o.stop(t+duration);flutter.stop(t+duration);out.gain.setTargetAtTime(.28,t,.025);
    if(stopping){stopAt=t+duration;closing=false;}else{stopAt=-1;closing=true;}
  }
  function update(time,world,speed,x,y,z,aboard,quiet,acceleration=0){
    if(!ac||disposed)return;
    enabled=aboard||closing||stopAt>ac.currentTime;
    const muted=quiet||isQuiet()||!enabled;
    out.gain.setTargetAtTime(muted?0:.28,ac.currentTime,.06);
    panner.positionX.value=x;panner.positionY.value=y+1.4;panner.positionZ.value=z;
    if(stopAt>=0&&ac.currentTime>=stopAt){hush();stopAt=-1;enabled=false;return;}
    if(muted){next=ac.currentTime+.04;return;}
    if(aboard)closing=false;
    if(!aboard||stopAt>ac.currentTime)return;
    if(time>=duckAt){duckAt=time+2;ctx.audio?.duck?.(2.5);}
    const now=ac.currentTime;if(next<now-.1){next=Math.ceil(now/(BEAT/2))*(BEAT/2);step=Math.round(next/(BEAT/2))%16;}
    filter.frequency.setTargetAtTime(2200,now,.3);
    for(let count=0;count<2&&next<now+.09;count++){
      if(speed>.05&&(step%2===0||acceleration>0))tone('rail',next,72,step%2?.22:.42,.21);
      const notes=COMMUTE,degree=notes[step];
      if(degree>=0&&step%4===0)tone('piano',next,SCALE[degree]/2,.08,.42);
      next+=BEAT/2;step=(step+1)%16;
    }
  }
  function hush(){if(ac&&out){out.gain.cancelScheduledValues(ac.currentTime);out.gain.setValueAtTime(0,ac.currentTime);}for(let i=0;i<tokens.length;i++){tokens[i]?.release?.();tokens[i]=null;}}
  function disposeNodes(){hush();for(const n of [out,pump,panner,filter,echo,feedback,wet])n?.disconnect();ac=bus=null;}
  return {arm,update,hush,doorClose(){vinyl(false);},dispose(){disposed=true;disposeNodes();}};
}
