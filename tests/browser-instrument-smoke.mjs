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
  if (museumErrors.length) fail(`Museum page errors: ${museumErrors.join('\n')}`);

  console.log(JSON.stringify(results, null, 2));
  console.log('browser-instrument-smoke: OK');
} finally {
  if(browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
