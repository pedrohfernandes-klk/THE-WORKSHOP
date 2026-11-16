import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceManager } from '../assets/gallery/voice-manager.js';

// Deterministic scheduling double, NOT a rendering/audio-quality benchmark.
class Param {
  value = 1;
  events = [];
  cancelScheduledValues(t) { this.events.push(['cancel', t]); }
  cancelAndHoldAtTime(t) { this.events.push(['hold', t]); }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); }
}
class Node {
  gain = new Param();
  connections = [];
  disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections.length = 0; }
}
class Source extends Node {
  constructor(ctx) { super(); this.ctx = ctx; this.listeners = []; this.started = false; this.ended = false; this.stopAt = Infinity; this.stopCalls = []; }
  start(t = 0) { if (this.started) throw Error('already started'); this.started = true; this.startAt = Math.max(t, this.ctx.currentTime); }
  stop(t = 0) { if (!this.started) throw Error('not started'); this.stopAt = Math.max(t, this.ctx.currentTime); this.stopCalls.push(this.stopAt); }
  addEventListener(name, fn, options) { if (name === 'ended') this.listeners.push({ fn, once: options?.once }); }
  dispatchEnded() {
    if (this.ended) return;
    this.ended = true;
    for (const listener of [...this.listeners]) listener.fn();
    this.listeners = this.listeners.filter(listener => !listener.once);
    this.onended?.();
  }
}
class Context {
  currentTime = 0;
  sources = [];
  createGain() { return new Node(); }
  createOscillator() { const source = new Source(this); this.sources.push(source); return source; }
  createBufferSource() { const source = new Source(this); this.sources.push(source); return source; }
  advance(t, dispatch = true) {
    assert.ok(t >= this.currentTime);
    this.currentTime = t;
    if (dispatch) for (const source of this.sources) if (source.started && source.stopAt <= t) source.dispatchEnded();
  }
}
const reserve = (manager, priority = 0, foreground = false, ms = 10000) => manager.acquireVoice({ priority, foreground, ms });
const sounding = (ctx, lease) => { const source = ctx.createOscillator(); assert.equal(lease.track(source), true); source.connect(lease.gain); source.start(); return source; };

test('24 sustained voices, six foreground, two fading slots; never a 27th admission', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const original = Array.from({ length: 24 }, (_, i) => reserve(manager, 0, i < 6));
  assert.ok(original.every(Boolean));
  assert.equal(reserve(manager), null);
  assert.ok(reserve(manager, 1, true));
  assert.ok(reserve(manager, 2, true));
  assert.equal(reserve(manager, 3, true), null);
  assert.deepEqual(manager.stats(), { voices: 24, foreground: 6, fading: 2, stolen: 2, unmanaged: 0 });
  ctx.advance(.031); manager.tick();
  assert.equal(manager.stats().fading, 0);
  assert.ok(reserve(manager, 3, true));
  manager.dispose();
});

test('foreground cap applies even with unused total capacity and never steals a background voice to evade it', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  reserve(manager, 0, false);
  for (let i = 0; i < 6; i++) reserve(manager, 3, true);
  assert.equal(reserve(manager, 3, true), null);
  assert.equal(manager.stats().voices, 7);
  manager.dispose();
});

test('new voice starts immediately; oldest lower-priority victim fades for 30ms', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const oldest = reserve(manager, 1), source = sounding(ctx, oldest);
  const youngerLower = reserve(manager, 0);
  for (let i = 2; i < 24; i++) reserve(manager, 2);
  ctx.advance(1);
  const next = reserve(manager, 2);
  assert.equal(next.startAt, 1);
  assert.equal(oldest.fading, true);
  assert.equal(youngerLower.active, true); // oldest eligible, not lowest numeric priority
  assert.equal(oldest.renew(1000), false);
  assert.equal(source.stopAt, 1.03);
  assert.deepEqual(oldest.gain.gain.events.at(-1), ['ramp', 0, 1.03]);
  ctx.advance(1.029); manager.tick();
  assert.equal(source.disconnected, false);
  assert.equal(oldest.released, false);
  ctx.advance(1.031); manager.tick();
  assert.equal(oldest.released, true);
  assert.equal(source.disconnected, true);
  manager.dispose();
});

test('equal priority cannot steal; highest-priority speech remains reserved', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  for (let i = 0; i < 24; i++) reserve(manager, 3);
  assert.equal(reserve(manager, 3), null);
  assert.equal(reserve(manager, 2), null);
  assert.equal(manager.stats().stolen, 0);
  manager.dispose();
});

test('renew extends a live lease but cannot resurrect an expired lease before tick', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const lease = reserve(manager, 0, false, 100);
  ctx.advance(.05); assert.equal(lease.renew(200), true);
  ctx.advance(.2); manager.tick(); assert.equal(lease.active, true);
  ctx.advance(.251); assert.equal(lease.renew(200), false);
  assert.equal(lease.released, true);
  assert.equal(manager.stats().voices, 0);
  manager.dispose();
});

test('multiple tracked sources count once and release only when all end; release is idempotent', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const lease = reserve(manager), a = sounding(ctx, lease), b = sounding(ctx, lease);
  assert.equal(lease.track(a), true);
  assert.equal(lease.sources.length, 2);
  let calls = 0; lease.onRelease = () => calls++;
  a.stop(.1); b.stop(.2);
  ctx.advance(.1); assert.equal(lease.active, true);
  ctx.advance(.2); assert.equal(lease.released, true);
  lease.release(); manager.releaseVoice(lease);
  assert.equal(calls, 1);
  assert.equal(a.disconnected && b.disconnected, true);
  manager.dispose();
});

test('stopAll and dispose reject callback re-entry; ordinary admission resumes only after stopAll', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  let attempted = 'unset';
  reserve(manager).onRelease = () => { attempted = reserve(manager); manager.stopAll(); };
  manager.stopAll('mute');
  assert.equal(attempted, null);
  assert.equal(manager.stats().voices, 0);
  const resumed = reserve(manager); assert.ok(resumed);
  resumed.onRelease = () => { attempted = reserve(manager); };
  manager.dispose();
  assert.equal(attempted, null);
  assert.equal(reserve(manager), null);
  assert.equal(manager.stats().voices, 0);
});

test('expired source-less speech leases release callbacks and capacity', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const speech = reserve(manager, 3, true, 200);
  let reason; speech.onRelease = value => { reason = value; };
  ctx.advance(.201); manager.tick();
  assert.equal(reason, 'expired');
  assert.equal(manager.stats().foreground, 0);
  manager.dispose();
});

test('invalid duration never allocates a voice', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  for (const ms of [undefined, NaN, Infinity, -1, 0, 3600001]) assert.equal(manager.acquireVoice({ ms }), null);
  assert.equal(manager.stats().voices, 0);
  manager.dispose();
});

test('production leaves native source factories untouched; audit distinguishes voices, sources and scheduling', () => {
  const ctx = new Context(), oscillatorFactory = ctx.createOscillator, bufferFactory = ctx.createBufferSource;
  const production = createVoiceManager(ctx);
  assert.equal(ctx.createOscillator, oscillatorFactory);
  assert.equal(ctx.createBufferSource, bufferFactory);
  assert.equal(production.diagnostics(), null);
  production.dispose();
  const manager = createVoiceManager(ctx, { test: true });
  assert.notEqual(ctx.createOscillator, oscillatorFactory);
  const lease = reserve(manager); sounding(ctx, lease); sounding(ctx, lease);
  const rogue = ctx.createBufferSource(); rogue.start();
  const future = ctx.createOscillator(); future.start(1);
  assert.equal(manager.stats().voices, 1);
  assert.deepEqual(manager.diagnostics(), { installed: true, sources: 3, managedSources: 2, unmanaged: 1, scheduled: 1 });
  rogue.stop(.1); ctx.advance(.11);
  assert.equal(manager.stats().unmanaged, 0);
  ctx.advance(1.1); assert.equal(manager.stats().unmanaged, 1);
  future.stop(); ctx.advance(1.11);
  manager.dispose();
  assert.equal(ctx.createOscillator, oscillatorFactory);
  assert.equal(ctx.createBufferSource, bufferFactory);
});

test('parallel dry/wet outputs receive steal fade and cleanup without bypassing broker', () => {
  const ctx = new Context(), manager = createVoiceManager(ctx);
  const lease = reserve(manager), dry = ctx.createGain(), wet = ctx.createGain();
  lease.addOutput(dry); lease.addOutput(wet);
  for (let i = 1; i < 24; i++) reserve(manager);
  reserve(manager, 1);
  assert.deepEqual(dry.gain.events.at(-1), ['ramp', 0, .03]);
  assert.deepEqual(wet.gain.events.at(-1), ['ramp', 0, .03]);
  ctx.advance(.031); manager.tick();
  assert.equal(dry.disconnected && wet.disconnected, true);
  manager.dispose();
});
