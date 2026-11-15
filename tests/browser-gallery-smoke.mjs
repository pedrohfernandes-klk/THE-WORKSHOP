// Browser coverage for the gallery (index.html): it boots under its own CSP,
// draws the room, measures a real gaze, re-hangs only walls the visitor cannot
// see, keeps what was looked at, produces an exhibition with a working link,
// and a shared link reopens exactly that hang.
//
// Run with: npm run test:gallery   (needs `npx playwright install chromium`;
// set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a different Chromium build)
import { chromium } from 'playwright';
import { startStaticServer } from '../scripts/static-server.mjs';

const { server, origin } = await startStaticServer(0);
const fail = message => { throw new Error(message); };
const results = {};
let browser;

// Software WebGL in CI: SwiftShader through ANGLE.
const launchOptions = {
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

function watch(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' && !/favicon/i.test(text)) problems.push(`console: ${text}`);
    if (/Content Security Policy/i.test(text)) problems.push(`csp: ${text}`);
  });
  page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()}`));
  return problems;
}

// page.waitForFunction polls through eval, which the page's CSP (rightly)
// forbids; poll with plain evaluate calls instead, so the real CSP stays on.
async function until(page, predicate, arg, { timeout = 30000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try { if (await page.evaluate(predicate, arg)) return; } catch { /* page still loading */ }
    if (Date.now() > deadline) fail(`Timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 200));
  }
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await until(page, () => !!window.__gallery, null, { label: 'the gallery to boot' });
  await page.evaluate(() => window.__gallery.ready);
}

try {
  browser = await chromium.launch(launchOptions);

  // ===== 1. Boot, enter, and the room draws =====
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = watch(page);
  await boot(page, `${origin}/?test`);
  const enter = page.getByRole('button', { name: /enter/i }).first();
  await enter.waitFor({ state: 'visible', timeout: 30000 });
  await until(page, () => !document.getElementById('enter').disabled, null, { label: 'Enter to enable' });
  await enter.click();
  await until(page, () => window.__gallery.state.entered && window.__gallery.state.frames > 10, null, { label: 'entry' });
  // Let the lights come up.
  await page.waitForTimeout(4000);
  results.pixels = await page.evaluate(() => window.__gallery.samplePixels());
  if (!(results.pixels.mean > 40)) fail(`Room renders too dark or blank: ${JSON.stringify(results.pixels)}`);
  if (!(results.pixels.sd > 6)) fail(`Room renders flat (no detail): ${JSON.stringify(results.pixels)}`);
  results.hangSize = await page.evaluate(() => new Set(window.__gallery.curator.hang).size);
  if (results.hangSize !== 15) fail(`Hang should hold 15 distinct works, got ${results.hangSize}`);

  // ===== 2. A real gaze is measured =====
  const lookSlot = 3;
  const looked = await page.evaluate(async (slot) => {
    const g = window.__gallery;
    await g.lookAtSlot(slot);
    // Let the visitor settle: looking is stillness, and software WebGL in CI
    // draws only a few frames a second, so this takes longer than on a GPU.
    const settleBy = performance.now() + 20000;
    while (g.state.gazeWeight < 0.7 && performance.now() < settleBy) await new Promise(r => setTimeout(r, 200));
    const id = g.curator.hang[slot];
    const before = g.curator.seconds[id] || 0;
    await new Promise(r => setTimeout(r, 3000));
    return { id, gained: (g.curator.seconds[id] || 0) - before, gazeSlot: g.state.gazeSlot };
  }, lookSlot);
  results.gaze = looked;
  if (looked.gazeSlot !== lookSlot) fail(`Gaze should rest on slot ${lookSlot}, got ${looked.gazeSlot}`);
  if (!(looked.gained > 0.2)) fail(`Looking at a work did not accrue attention: ${JSON.stringify(looked)}`);

  // ===== 3. The room re-hangs walls the visitor cannot see, and keeps what was looked at =====
  const rehang = await page.evaluate(async (slot) => {
    const g = window.__gallery;
    g.dwell(slot, 12);
    const kept = g.curator.hang[slot];
    // Keep looking at the same wall: everything behind is unseen.
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline && g.state.swaps.length === 0) {
      await new Promise(r => setTimeout(r, 250));
    }
    const swap = g.state.swaps[0] || null;
    return {
      swap,
      keptStillHung: g.curator.hang[slot] === kept,
      swappedVisibleNow: swap ? g.state.lastVisible[swap.slot] > swap.at - 0.6 && swap.slot === g.state.gazeSlot : null,
      distinct: new Set(g.curator.hang).size,
    };
  }, lookSlot);
  results.rehang = rehang;
  if (!rehang.swap) fail('No re-hang happened after sustained attention');
  if (rehang.swap.slot === lookSlot) fail('The room re-hung the work being looked at');
  if (!rehang.keptStillHung) fail('A work the visitor lingered on was taken down');
  if (rehang.distinct !== 15) fail('Re-hang produced a duplicate work');

  // ===== 4. Your exhibition: a titled catalogue and a working link =====
  await page.getByRole('button', { name: /your exhibition/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  const exhibition = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const link = [...d.querySelectorAll('a[href*="#show="], [data-link], input')].map(e => e.href || e.value || e.dataset.link).find(v => v && v.includes('#show=')) ||
      (d.innerHTML.match(/[^"'\s<>]*#show=[^"'\s<>]*/) || [])[0];
    return { text: d.innerText.slice(0, 400), link: link || null, hang: window.__gallery.curator.hang.slice() };
  });
  results.exhibition = { text: exhibition.text.slice(0, 120), link: exhibition.link };
  if (!exhibition.text.trim()) fail('Exhibition dialog is empty');
  const link = exhibition.link || await page.evaluate(() => {
    const g = window.__gallery;
    const s = g.curator.summary(new Date());
    return `${location.origin}${location.pathname}#show=${g.encodeShow({ hang: s.hang, seconds: Object.fromEntries(s.works.map(w => [w.id, w.seconds])) })}`;
  });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });

  // ===== 5. The shared link reopens exactly that hang, fixed =====
  const sharedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const sharedProblems = watch(sharedPage);
  const sharedUrl = link.replace(/^https?:\/\/[^/]+\/(?:index\.html)?/, `${origin}/?test`);
  await boot(sharedPage, sharedUrl);
  const shared = await sharedPage.evaluate(() => ({ hang: window.__gallery.curator.hang.slice(), fixed: window.__gallery.curator.fixed }));
  results.shared = { fixed: shared.fixed, same: shared.hang.join() === exhibition.hang.join() };
  if (!shared.fixed) fail('A shared exhibition should open fixed');
  if (!results.shared.same) fail(`Shared link did not reproduce the hang:\n${shared.hang}\n${exhibition.hang}`);
  if (sharedProblems.length) fail(`Shared page problems:\n${sharedProblems.join('\n')}`);
  await sharedPage.close();

  // ===== 6. Phone width: no sideways scroll, entry reachable =====
  const phone = await browser.newPage({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  const phoneProblems = watch(phone);
  await boot(phone, `${origin}/?test`);
  results.phone = await phone.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    quality: window.__gallery.quality,
  }));
  if (results.phone.overflow > 1) fail(`Horizontal overflow on phone: ${results.phone.overflow}px`);
  if (phoneProblems.length) fail(`Phone problems:\n${phoneProblems.join('\n')}`);
  await phone.close();

  if (problems.length) fail(`Page problems:\n${problems.join('\n')}`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
