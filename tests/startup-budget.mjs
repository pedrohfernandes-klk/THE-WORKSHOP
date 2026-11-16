// node tests/startup-budget.mjs report.json [--maxEntryMs=N --maxTasks=N --maxBytes=X --maxTaskMs=100 --maxGapMs=N]
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function assessStartup(report,limits={maxEntryMs:2000,maxTaskMs:100,maxGapMs:50}){
 const failures=[];const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 if(report?.version!==1)return {valid:false,passed:false,failures:['Unsupported startup report version'],metrics:null};
 for(const key of ['entryReady','campusBuilt','entered'])if(!finite(report[key]))failures.push('Missing or invalid '+key);
 if(!Array.isArray(report.longTasks)||!report.longTasks.every(e=>finite(e.start)&&finite(e.duration)))failures.push('Invalid long tasks');
 if(!Array.isArray(report.frameGaps)||!report.frameGaps.length||!report.frameGaps.every(finite))failures.push('Missing or invalid frame samples');
 if(!Array.isArray(report.resources)||!report.resources.every(r=>finite(r.start)&&finite(r.transferSize)))failures.push('Invalid resource records');
 if(!report.environment?.chrome||!report.gpu)failures.push('Missing browser/GPU identity');
 if(failures.length)return {valid:false,passed:false,failures,metrics:null};
 const gaps=[...report.frameGaps].sort((a,b)=>a-b),postTasks=report.longTasks.filter(e=>e.duration>50&&e.start<report.entered+10000&&e.start+e.duration>report.entered),tasks=report.longTasks.filter(e=>e.duration>50&&(e.start<20000||postTasks.includes(e)));
 const resourceStats=deadline=>{const cohort=report.resources.filter(r=>r.start<deadline),js=cohort.filter(r=>/\.(?:m?js)(?:[?#]|$)/i.test(r.name||''));return {requests:cohort.length,bytes:cohort.reduce((n,r)=>n+r.transferSize,0),jsRequests:js.length,jsKB:js.reduce((n,r)=>n+r.transferSize,0)/1024};};
 const entryResources=resourceStats(report.entryReady),clickResources=resourceStats(report.entered);
 const hasJSIdentity=report.resources.every(r=>typeof r.name==='string');
 const metrics={maxPostEnterTaskMs:Math.max(0,...postTasks.map(e=>e.duration)),postEnterTasks:postTasks.length,entryRequests:entryResources.requests,entryBytes:entryResources.bytes,entryJSRequests:hasJSIdentity?entryResources.jsRequests:null,entryJSKB:hasJSIdentity?entryResources.jsKB:null,clickRequests:clickResources.requests,clickBytes:clickResources.bytes,clickJSRequests:hasJSIdentity?clickResources.jsRequests:null,clickJSKB:hasJSIdentity?clickResources.jsKB:null,entryMs:report.entryReady,campusMs:report.campusBuilt,tasks:tasks.length,maxTaskMs:Math.max(0,...tasks.map(e=>e.duration)),requests:report.resources.length,
 bytes:report.resources.reduce((n,r)=>n+r.transferSize,0),maxGapMs:gaps.at(-1),p95GapMs:gaps[Math.floor((gaps.length-1)*.95)]};
 for(const [limit,key] of [['maxEntryMs','entryMs'],['maxTasks','tasks'],['maxBytes','bytes'],['maxTaskMs','maxTaskMs'],['maxGapMs','maxGapMs'],['maxPostEnterTaskMs','maxPostEnterTaskMs'],['maxRequests','requests'],['maxEntryRequests','entryRequests'],['maxEntryJSRequests','entryJSRequests'],['maxEntryJSKB','entryJSKB'],['maxClickJSRequests','clickJSRequests'],['maxClickJSKB','clickJSKB']]){
  if(limits[limit]!==undefined){if(!finite(limits[limit]))failures.push('Invalid limit '+limit);else if(metrics[key]===null)failures.push('Missing resource URLs for '+limit);else if(metrics[key]>limits[limit])failures.push(key+' '+metrics[key]+' exceeds '+limits[limit]);}
 }
 if(report.errors?.length)failures.push('Browser/observer errors: '+report.errors.length);
 if(report.httpErrors?.length)failures.push('HTTP failures: '+report.httpErrors.length);
 return {valid:true,passed:failures.length===0,failures,metrics};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];if(!file){console.error('Pass a measured startup JSON report and explicit budgets.');process.exitCode=2;}
 else{const limits={maxEntryMs:2000,maxTaskMs:100,maxGapMs:50};for(const arg of process.argv.slice(3)){const m=/^--(maxEntryMs|maxTasks|maxBytes|maxTaskMs|maxGapMs|maxPostEnterTaskMs|maxRequests|maxEntryRequests|maxEntryJSRequests|maxEntryJSKB|maxClickJSRequests|maxClickJSKB)=(.+)$/.exec(arg);if(!m)throw new Error('Unknown budget '+arg);limits[m[1]]=Number(m[2]);}
 const report=JSON.parse(await readFile(file,'utf8')),result=assessStartup(report,limits);console.log(JSON.stringify({...result,limits},null,2));if(!result.passed)process.exitCode=1;}
}
