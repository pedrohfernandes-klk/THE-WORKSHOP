// Combat timing in seconds: contact is the end of the fast strike, not the
// midpoint of a generic sine. Shared scratch outputs make posing allocation-free.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);
// Cartoon wind-up depth: 30% past the first cut (0.22) so the pull-back reads at fight distance.
export const WIND_UP=.286;
// Seconds of held intention before the guard starts.
export const GUARD_HOLD=.7;
export function sampleCombatMotion(move,time,out){
  const contact=move.windup,strike=Math.min(.05,contact*.38),start=contact-strike;
  const recovery=Math.max(.08,move.duration-contact),t=clamp(time,0,move.duration);
  let drive,anticipation,settle;
  if(t<start){anticipation=smooth(t/Math.max(.001,start));drive=-WIND_UP*anticipation;settle=0;out.phase=0;}
  else if(t<contact){const k=(t-start)/strike;anticipation=1-k;drive=-WIND_UP+(1+WIND_UP)*k*k;settle=0;out.phase=1;}
  else {const k=(t-contact)/recovery;anticipation=0;drive=(1-smooth(k))*(1+.16*Math.sin(k*Math.PI*2));settle=Math.sin(k*Math.PI*3)*Math.exp(-k*5);out.phase=2;}
  out.drive=drive;out.anticipation=anticipation;out.settle=settle;
  out.twist=drive*(move.pose==='back'?-.48:move.pose==='whip'?.48:move.pose==='jab'?.12:.28);
  out.lift=(move.pose==='stomp'||move.pose==='sweepLeg')?Math.max(0,drive):0;
  return out;
}
export function crossedContact(previous,current,move,landed){return !landed&&previous<move.windup&&current>=move.windup;}
export function stepSpring(state,target,dt,frequency=7,damping=.8){
  // Bounded substeps keep the spring stable on a long presentation frame.
  let remaining=Math.min(.1,Math.max(0,dt));const w=frequency*Math.PI*2;
  while(remaining>0){const h=Math.min(remaining,1/120);state.v+=(w*w*(target-state.x)-2*damping*w*state.v)*h;state.x+=state.v*h;remaining-=h;}
  return state.x;
}
export function stepGuardHold(state,dt,held,eligible){
  if(!held||!eligible){state.elapsed=0;state.fired=false;return false;}
  if(state.fired)return false;state.elapsed+=Math.max(0,Math.min(dt,.1));
  if(state.elapsed+.000001<GUARD_HOLD)return false;state.fired=true;return true;
}
// The hold as the visitor feels it: real time, at most 0.1 s a frame (a stall never fires it),
// and a target lost for up to `grace` seconds keeps the charge, so one flickering frame of an
// NPC's state does not start the count again. Letting go still resets at once. `lapse` is how
// long the held key has had no target.
export function stepGuardCharge(state,dt,held,eligible,grace=.15){
  const step=Math.max(0,Math.min(dt,.1));
  if(held&&!eligible){state.lapse=(state.lapse||0)+step;if(state.lapse>grace+.000001){state.elapsed=0;state.fired=false;}return false;}
  state.lapse=0;return stepGuardHold(state,step,held,true);
}
export function solveFootPlant(upper,lower,lift,out){
  const length=upper+lower,d=clamp(length-lift,Math.abs(upper-lower)+.0001,length);
  const knee=Math.acos(clamp((upper*upper+lower*lower-d*d)/(2*upper*lower),-1,1));
  out.knee=Math.PI-knee;out.hip=-Math.acos(clamp((upper*upper+d*d-lower*lower)/(2*upper*d),-1,1));out.ankle=-out.hip-out.knee;return out;
}
