// Yield main-thread construction after genuine locomotion; no network or timer before it.
export function idleSlice(){return new Promise(resolve=>{if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:1000});else setTimeout(resolve,16);});}
export async function afterFirstMove(startup){if(startup&&!startup.moved)await startup.whenMoved;}
let workUntil=0;
export async function workSlice(){const now=typeof performance!=='undefined'?performance.now():Date.now();if(now<workUntil)return;await idleSlice();workUntil=(typeof performance!=='undefined'?performance.now():Date.now())+2;}
