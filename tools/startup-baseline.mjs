import {chromium} from 'playwright';
import {startStaticServer} from '../scripts/static-server.mjs';
import {installStartupMeasure} from './startup-measure.js';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const cpuProfile=process.env.STARTUP_CPU_PROFILE!=='0',traceEnabled=process.env.STARTUP_TRACE!=='0';
const root=resolve(process.argv[2]||'_dev/r2-4-tram'),quality=process.argv[3]||'medium';
const {server,origin}=await startStaticServer(0,root);let browser;const errors=[],responses=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:2500000,uploadThroughput:2500000});
 if(cpuProfile){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
 if(traceEnabled)await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-devtools.timeline,disabled-by-default-devtools.screenshot',transferMode:'ReturnAsStream'});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());if(m.type()==='warning'&&/skipped|shader|failed/i.test(m.text()))errors.push('warning: '+m.text());});page.on('response',r=>{if(r.status()>=400)responses.push({url:r.url(),status:r.status()});});
 await page.addInitScript(installStartupMeasure);
 await page.goto(origin+'/index.html?test=1&quality='+quality,{waitUntil:'domcontentloaded',timeout:120000});
 const until=async(fn,timeout)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Observation deadline exceeded');};
 await until(()=>document.getElementById('enter')&&!document.getElementById('enter').disabled,120000);
 await page.locator('#enter').click();await page.waitForTimeout(3600);
 await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');await page.waitForTimeout(5000);await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');await page.waitForTimeout(12400);
 if(process.env.STARTUP_WAIT_CAMPUS==='1')await until(()=>{const w=window.__gallery?.world;return !!w&&(w.streaming?w.streaming.nearbyReady:true);},180000).catch(()=>errors.push('Campus not built within the additional 180-second observation'));
 const report=await page.evaluate(()=>{const r=window.__startupMeasure,resources=performance.getEntriesByType('resource').filter(e=>e.startTime<r.entered);const gl=window.__gallery?.renderer?.getContext(),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {...r,campusBuilt:performance.getEntriesByName('workshop:campus-built').at(-1)?.startTime??r.campusBuilt,marks:performance.getEntriesByType('mark').map(e=>({name:e.name,start:e.startTime})),streaming:window.__gallery?.world?.streaming?{nearbyReady:window.__gallery.world.streaming.nearbyReady}:null,observedAt:performance.now(),measures:performance.getEntriesByType('measure').map(e=>({name:e.name,start:e.startTime,duration:e.duration})),resources:resources.map(e=>({name:e.name,start:e.startTime,end:e.responseEnd,initiatorType:e.initiatorType,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),render:window.__gallery?.renderer?.info.render};});
 const resourceStats=deadline=>{const cohort=report.resources.filter(r=>r.start<deadline),js=cohort.filter(r=>/\.(?:m?js)(?:[?#]|$)/i.test(r.name||''));return {requests:cohort.length,bytes:cohort.reduce((n,r)=>n+r.transferSize,0),jsRequests:js.length,jsBytes:js.reduce((n,r)=>n+r.transferSize,0)};};
 report.resourceWindows={semantics:'Full transfer bytes for requests started before cutoff; not bytes received by cutoff',entryReady:resourceStats(report.entryReady),clickEnter:resourceStats(report.entered)};
 report.longTaskWindows={navigation20s:report.longTasks.filter(e=>e.start<20000),postEnter10s:report.longTasks.filter(e=>e.start<report.entered+10000&&e.start+e.duration>report.entered)};
 let trace='';if(traceEnabled){const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;while(true){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});}
 report.environment={quality,root,chrome:browser.version(),networkMbit:20,viewport:[1440,900],headless:true,cache:'cold',cpuProfile,traceEnabled};report.errors.push(...errors);report.httpErrors=responses;
 const profile=cpuProfile?(await cdp.send('Profiler.stop')).profile:null;const prefix=process.env.OUTPUT_PREFIX||'_dev/startup-baseline-'+quality+'-test';if(profile)await writeFile(prefix+'.cpu.json',JSON.stringify(profile));await writeFile(prefix+'.json',JSON.stringify(report,null,2));if(traceEnabled)await writeFile(prefix+'.trace.json',trace);await page.screenshot({path:prefix+'.png'});
 const gaps=report.frameGaps;console.log(JSON.stringify({entryReady:report.entryReady,campusBuilt:report.campusBuilt,entered:report.entered,longTasks:report.longTasks.length,maxTask:Math.max(0,...report.longTasks.filter(e=>e.start<20000||e.start<report.entered+10000&&e.start+e.duration>report.entered).map(e=>e.duration)),maxPostEnterTask:Math.max(0,...report.longTaskWindows.postEnter10s.map(e=>e.duration)),resourceWindows:report.resourceWindows,maxFrameGap:Math.max(0,...gaps),requests:report.resources.length,bytes:report.resources.reduce((n,r)=>n+r.transferSize,0),gpu:report.gpu,errors:report.errors,httpErrors:responses.length,report:prefix+'.json'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
