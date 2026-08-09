Exit code: 0
Wall time: 1.6 seconds
Output:
// Browser coverage for the things a headless Node test cannot reach and that
// the agent sandbox cannot verify at all: that the Studio desk's synthesiser
// really produces audio, that its transport and MIDI wiring exist, and that
// the museum's projection screens actually load their iframes.
//
// Run with: npm run test:instrument   (needs `npx playwright install chromium`)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png',
  '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.webm':'video/webm' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const ext = file.slice(file.lastIndexOf('.'));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve,reject) => {
  server.once('error',reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const results = {};
const fail = m => { throw new Error(m); };
let browser;

try {
  // --allow-file-access / fake media so getUserMedia and autoplay do not prompt.
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  // ===== 1. The synthesiser actually makes sound =====
  const desk = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const deskErrors = [];
  desk.on('pageerror', e => deskErrors.push(e.message));
  await desk.goto(`${baseUrl}/assets/apps/studio-mixing-desk.html`, { waitUntil: 'domcontentloaded' });
  await desk.waitForSelector('#keybed .wkey');

  results.keys = await desk.evaluate(() => ({
    white: document.querySelectorAll('#keybed .wkey').length,
    black: document.querySelectorAll('#keybed .bkey').length,
    presets: document.querySelectorAll('#synthPreset option').length
  }));
  if (results.keys.white !== 15 || results.keys.black !== 10) fail(`Keybed geometry wrong: ${JSON.stringify(results.keys)}`);

  // Route the desk's master through an analyser and play a chord. This is the
  // assertion the sandbox could never make: that pressing keys yields signal.
  results.audio = await desk.evaluate(async () => {
    const press = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const lift  = k => window.dispatchEvent(new KeyboardEvent('keyup',   { key: k, bubbles: true }));
    press('a');                                    // creates/resumes the AudioContext
    await new Promise(r => setTimeout(r, 250));
    const ctx = window.__deskAudioProbe?.();       // exposed for tests; see desk source
    lift('a');
    if (!ctx) return { probed: false };
    const analyser = ctx.ctx.createAnalyser();
    ctx.master.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    ['a', 's', 'd'].forEach(press);
    await new Promise(r => setTimeout(r, 320));
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    const voices = ctx.voices();
    ['a', 's', 'd'].forEach(lift);
    return { probed: true, peak, voices };
  });
  if (!results.audio.probed) fail('Synth audio probe is missing');
  if (!(results.audio.peak > 0.001)) fail(`Synth produced no audio (peak ${results.audio.peak})`);
  if (results.audio.voices < 3) fail(`Chord did not allocate 3 voices (got ${results.audio.voices})`);

  // Transport, arp and MIDI wiring must exist regardless of hardware.
  results.controls = await desk.evaluate(() => ({
    arp: !!document.querySelector('#arpBtn'),
    latch: !!document.querySelector('#arpLatch'),
    panic: !!document.querySelector('#panicBtn'),
    bend: !!document.querySelector('#synBend'),
    mod: !!document.querySelector('#synMod'),
    midiSupported: typeof navigator.requestMIDIAccess === 'function'
  }));
  for (const k of ['arp', 'latch', 'panic', 'bend', 'mod']) {
    if (!results.controls[k]) fail(`Missing synth control: ${k}`);
  }
  if (deskErrors.length) fail(`Desk page errors: ${deskErrors.join('\n')}`);

  // ===== 2. Museum registries and projection wiring survive a real browser =====
  const museum = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const museumErrors = [];
  museum.on('pageerror', e => museumErrors.push(e.message));
  await museum.goto(`${baseUrl}/index.html?selftest`, { waitUntil: 'domcontentloaded' });
  await museum.locator('#posterEnter:not([disabled])').waitFor({ state: 'visible', timeout: 60000 });
  await museum.locator('body').filter({ hasText: /SELFTEST/i }).waitFor({ state: 'visible', timeout: 60000 });
  const selftestResults = await museum.evaluate(() => window.__workshopSelfTestResults);
  if(!Array.isArray(selftestResults)) fail('Museum selftest did not publish structured results');
  const failed = selftestResults.filter(result => !result.ok);
  results.selftest = `${selftestResults.length - failed.length}/${selftestResults.length} passed`;
  if (failed.length) fail(`Museum selftest failures:\n${JSON.stringify(failed, null, 2)}`);

  const projectionChecks=selftestResults.filter(result=>/projection|remote resolves a target|Amphitheatre projection iframe/.test(result.test));
  if(projectionChecks.length<8 || projectionChecks.some(result=>!result.ok)){
    fail(`Projection wiring checks missing or failed:\n${JSON.stringify(projectionChecks, null, 2)}`);
  }
  results.screens = { wiringChecks:projectionChecks.length };

  // Structural light registries are insufficient: sample the rendered WebGL
  // framebuffer after travelling to every public destination. This catches
  // black materials, exposure mistakes and lights that exist but illuminate
  // nothing in the visitor's actual view.
  await museum.locator('#posterEnter').evaluate(button=>button.click());
  await museum.waitForTimeout(1800);
  const sampleRenderedLight=()=>museum.locator('#renderCanvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    const pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    // Ignore the outer 8% where canvas clearing, letterboxing and edge fog can
    // dominate. Sample a regular spatial grid rather than a byte stride so the
    // result cannot alias with repeated geometry or scanlines.
    const values=[];
    const x0=Math.floor(width*.08),x1=Math.ceil(width*.92);
    const y0=Math.floor(height*.08),y1=Math.ceil(height*.92);
    const step=Math.max(2,Math.floor(Math.min(width,height)/180));
    let luminance=0,dark=0,shadow=0,midtone=0,bright=0,clipped=0,count=0;
    for(let y=y0;y<y1;y+=step) for(let x=x0;x<x1;x+=step){
      const i=(y*width+x)*4;
      const value=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      values.push(value); luminance+=value; dark+=value<12; shadow+=value<28;
      midtone+=value>=28&&value<=220; bright+=value>220; clipped+=value>248; count++;
    }
    values.sort((a,b)=>a-b);
    const percentile=p=>values[Math.min(values.length-1,Math.floor(values.length*p))]||0;
    const p10=percentile(.10),p25=percentile(.25),p50=percentile(.50),p75=percentile(.75),p90=percentile(.90);
    return {
      mean:+(luminance/count).toFixed(1),p10:+p10.toFixed(1),p25:+p25.toFixed(1),
      p50:+p50.toFixed(1),p75:+p75.toFixed(1),p90:+p90.toFixed(1),
      contrast:+(p90-p10).toFixed(1),darkRatio:+(dark/count).toFixed(3),
      shadowRatio:+(shadow/count).toFixed(3),midtoneRatio:+(midtone/count).toFixed(3),
      brightRatio:+(bright/count).toFixed(3),clippedRatio:+(clipped/count).toFixed(3),
      samples:count
    };
  });
  results.lighting=[];
  const lightingFailures=[];
  for(const room of ['gallery','theatre','studio','lab','thinking','maze','maps','spark','night','hood','outdoor']){
    try{
      await museum.locator('#mapBtn').evaluate(button=>button.click());
      await museum.locator(`.fastMapBtn[data-room="${room}"]`).first().evaluate(button=>button.click());
      await museum.waitForTimeout(1100);
      const sample=await sampleRenderedLight();
      const reasons=[];
      // Near-black projection surfaces are legitimate and may occupy a large
      // rectangle. A room fails only when the broader distribution also lacks
      // readable midtones/highlights, not merely because black pixels exist.
      if(sample.mean<45) reasons.push(`mean ${sample.mean} < 45`);
      if(sample.p50<35) reasons.push(`median ${sample.p50} < 35`);
      if(sample.p75<60) reasons.push(`75th percentile ${sample.p75} < 60`);
      if(sample.shadowRatio>.72 && sample.midtoneRatio<.20){
        reasons.push(`shadows ${(sample.shadowRatio*100).toFixed(1)}% with only ${(sample.midtoneRatio*100).toFixed(1)}% midtones`);
      }
      // Washout means the shadows have disappeared or almost the entire view
      // is clipped/bright with little tonal separation. A bright room alone is
      // not a failure.
      if(sample.mean>205) reasons.push(`mean ${sample.mean} > 205`);
      if(sample.brightRatio>.78 && sample.contrast<38){
        reasons.push(`bright pixels ${(sample.brightRatio*100).toFixed(1)}% with contrast ${sample.contrast}`);
      }
      const clippedLimit=(room==='outdoor'||room==='hood')?.25:.18;
      if(sample.clippedRatio>clippedLimit) reasons.push(`clipped whites ${(sample.clippedRatio*100).toFixed(1)}% > ${(clippedLimit*100).toFixed(0)}%`);
      if(room==='lab' && (sample.p50<48 || sample.p75<60)) reasons.push('lab work surfaces are not legible');
      if(room==='spark' && (sample.p50<35 || sample.p75<60)) reasons.push('spark room lacks readable midtones');
      if(room==='maps' && (sample.p10>145 || sample.contrast<50)) reasons.push('maps room is flat or washed out');
      const result={room,...sample,ok:reasons.length===0,reasons};
      results.lighting.push(result);
      if(reasons.length) lightingFailures.push(result);
    }catch(error){
      const result={room,ok:false,reasons:[`sampling/navigation error: ${error.message}`]};
      results.lighting.push(result);
      lightingFailures.push(result);
      // A failed destination can leave Rooms open; close it before continuing
      // so diagnostics for later rooms remain independent.
      await museum.locator('#fastMapCloseBtn').evaluate(button=>button.click()).catch(()=>{});
    }
  }
  if(lightingFailures.length){
    fail(`Room lighting failures (${lightingFailures.length}/${results.lighting.length}):\n${JSON.stringify(lightingFailures,null,2)}\nAll samples:\n${JSON.stringify(results.lighting,null,2)}`);
  }
  if (museumErrors.length) fail(`Museum page errors: ${museumErrors.join('\n')}`);

  console.log(JSON.stringify(results, null, 2));
  console.log('browser-instrument-smoke: OK');
} finally {
  if(browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

