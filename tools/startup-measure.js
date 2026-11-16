// Inject before navigation with page.addInitScript(installStartupMeasure).
export function installStartupMeasure(){
 const report={version:1,entryReady:null,entryReadyDOM:null,campusBuilt:null,entered:null,longTasks:[],frameGaps:[],errors:[]};
 window.__startupMeasure=report;
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>50)report.longTasks.push({start:e.startTime,duration:e.duration,name:e.name});}).observe({type:'longtask',buffered:true});}catch(e){report.errors.push('LongTask observer unavailable');}
 let previous=0;
 function sample(now){const enter=document.getElementById('enter');if(report.entryReady===null&&enter&&!enter.disabled){report.entryReadyDOM=performance.now();report.entryReady=performance.getEntriesByName('workshop:entry-ready').at(-1)?.startTime??performance.now();performance.mark('startup-entry-ready');}
  const world=window.__gallery?.world;const campusMark=performance.getEntriesByName('workshop:campus-built').at(-1);
  if(report.campusBuilt===null&&(campusMark||world&&(world.streaming?world.streaming.nearbyReady:true))){report.campusBuilt=campusMark?.startTime??performance.now();performance.mark('startup-campus-built');}
  if(report.entered!==null&&previous>=report.entered&&previous<report.entered+10000){report.frameGaps.push(Math.min(now,report.entered+10000)-previous);if(now>=report.entered+10000)report.frameWindowComplete=true;}previous=now;
  if(now<20000||report.entered===null||now<report.entered+10000)requestAnimationFrame(sample);
 }
 document.addEventListener('click',e=>{if(report.entered===null&&e.target.closest?.('#enter')){report.entered=performance.now();performance.mark('startup-entered');previous=report.entered;}},true);
 requestAnimationFrame(sample);
}
