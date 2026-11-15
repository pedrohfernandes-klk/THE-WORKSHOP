// Paste this whole file in DevTools on /?test&quality=medium&nobatch.
// Optional exact startup marks are supplied by performance-integration.patch.
(() => {
  'use strict';
  window.workshopMeasure?.dispose();
  const g = window.__gallery;
  if (!g?.renderer || !g.post) throw new Error('Abrir com ?test&quality=high|medium|low.');
  const renderer = g.renderer, post = g.post;
  const original = post.render;
  const capacity = 36000;
  const intervals = new Float64Array(capacity);
  const calls = new Uint32Array(capacity), triangles = new Uint32Array(capacity);
  let recording = false, n = 0, previous = 0, started = 0, label = '', timer = 0;
  const reports = [];
  const undo = new Map();
  const markTime = name => performance.getEntriesByName(name, 'mark').at(-1)?.startTime ?? null;
  function wrapped(dt) {
    if (!recording) return original.call(this, dt);
    const now = performance.now();
    const auto = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try { return original.call(this, dt); }
    finally {
      if (!document.hidden && previous && n < capacity) {
        intervals[n] = now - previous;
        calls[n] = renderer.info.render.calls;
        triangles[n] = renderer.info.render.triangles;
        n++;
      }
      previous = document.hidden ? 0 : now;
      renderer.info.autoReset = auto;
    }
  }
  post.render = wrapped;
  function distribution(values, count) {
    if (!count) return null;
    const sorted = Array.from(values.subarray(0, count)).sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < count; i++) sum += sorted[i];
    return { mean: sum / count, p50: sorted[Math.floor((count - 1) * 0.5)],
      p95: sorted[Math.floor((count - 1) * 0.95)], max: sorted[count - 1] };
  }
  function environment() {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      url: location.href, userAgent: navigator.userAgent,
      gpu: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      quality: g.quality, pixelRatio: renderer.getPixelRatio(),
      governor: window.__galleryPerf?.snapshot() ?? null,
      camera: g.camera.position.toArray(), batch: g.world?.batchStats ?? null,
    };
  }
  function stop() {
    if (!recording) return null;
    recording = false; clearTimeout(timer);
    const frameMs = distribution(intervals, n);
    const result = { label, started, ended: performance.now(), frames: n,
      frameMs, fps: frameMs ? 1000 / frameMs.mean : null,
      calls: distribution(calls, n), triangles: distribution(triangles, n),
      counters: 'all renderer passes inside post.render; excludes draws outside it',
      environment: environment() };
    reports.push(result); console.log('[Workshop]', result); return result;
  }
  function start(zone, seconds = 20) {
    if (recording) stop();
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new Error('Duração: 1–300 s.');
    label = String(zone); n = 0; previous = 0; started = performance.now(); recording = true;
    timer = setTimeout(stop, seconds * 1000);
  }
  function diagnostic(kind, enabled) {
    const world = g.world;
    if (!world) throw new Error('Aguardar o campus.');
    const object = kind === 'murals' ? world.groups.murals
      : kind === 'sun' ? world.modules.get('environment')?.sun : null;
    if (!object) throw new Error('Usar murals ou sun.');
    if (enabled === false) {
      if (!undo.has(object)) undo.set(object, object.visible);
      object.visible = false;
    } else if (undo.has(object)) { object.visible = undo.get(object); undo.delete(object); }
  }
  function startup() {
    return { entryReadyMs: markTime('workshop:entry-ready'),
      campusBuiltMs: markTime('workshop:campus-built'),
      campusMeaning: 'modules built; not all textures uploaded or shaders compiled',
      unavailable: 'null means not instrumented; a late console paste cannot recover exact timing',
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON() ?? null,
      resources: performance.getEntriesByType('resource').map(r => ({
        name: r.name, duration: r.duration, transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize,
      })) };
  }
  function download() {
    const blob = new Blob([JSON.stringify({ environment: environment(), startup: startup(), reports }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'workshop-measure.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function dispose() {
    if (recording) stop();
    for (const [object, visible] of undo) object.visible = visible;
    undo.clear();
    if (post.render === wrapped) post.render = original;
    document.removeEventListener('visibilitychange', visibility);
    delete window.workshopMeasure;
  }
  function visibility() { previous = 0; }
  document.addEventListener('visibilitychange', visibility);
  window.workshopMeasure = { start, stop, diagnostic, startup, download, dispose, reports };
  console.log('Medição pronta: workshopMeasure.start("Hall", 20); depois .download().');
})();
