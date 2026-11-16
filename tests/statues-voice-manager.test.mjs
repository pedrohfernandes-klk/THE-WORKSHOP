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


test('child expiry and renew use its clock while the main context advances',()=>{
 const main=new Context(),child=new Context(),m=createVoiceManager(main);
 child.advance(3);const v=m.acquireVoice({priority:2,foreground:true,ms:1000,sourceContext:child});
 assert.equal(v.startAt,3);child.state='suspended';main.advance(100);m.tick();assert.equal(v.active,true);
 assert.equal(v.renew(2000),true);assert.equal(v.expires,5);child.state='running';child.advance(4.99);m.tick();assert.equal(v.active,true);
 child.advance(5);m.tick();assert.equal(v.active,false);
});
test('mixed contexts retain exactly the original 24/6/2 admission rules',()=>{
 const main=new Context(),child=new Context(),m=createVoiceManager(main);
 for(let i=0;i<24;i++)assert.ok(m.acquireVoice({priority:0,foreground:i<6,ms:10000,sourceContext:i%2?main:child}));
 assert.ok(m.acquireVoice({priority:1,foreground:true,ms:10000,sourceContext:child}));
 assert.ok(m.acquireVoice({priority:2,foreground:true,ms:10000,sourceContext:main}));
 assert.equal(m.acquireVoice({priority:3,foreground:true,ms:10000,sourceContext:child}),null);
 assert.deepEqual(m.stats(),{voices:24,foreground:6,fading:2,stolen:2,unmanaged:0});
});
test('suspended oldest lower-priority victim keeps the main-clock 30ms tail',()=>{
 const main=new Context(),child=new Context();main.advance(100);child.advance(3);const m=createVoiceManager(main);
 const oldest=m.acquireVoice({priority:0,ms:10000,sourceContext:child});const source=sounding(child,oldest);child.state='suspended';
 for(let i=0;i<23;i++)assert.ok(m.acquireVoice({priority:0,ms:10000}));
 assert.ok(m.acquireVoice({priority:1,ms:10000}));assert.equal(oldest.fading,true);
 assert.ok(Math.abs(oldest.fadeEnd-100.03)<1e-9);assert.ok(Math.abs(source.stopCalls.at(-1)-3.03)<1e-9);
 main.advance(100.02);m.tick();assert.equal(oldest.released,false);
 main.advance(100.031);m.tick();assert.equal(oldest.released,true);assert.equal(m.stats().fading,0);
});
test('registered child audit sees sources before admission without changing diagnostic shape',()=>{
 const main=new Context(),child=new Context(),m=createVoiceManager(main,{test:true});m.registerContext(child);
 const raw=child.createOscillator();raw.start();assert.equal(m.stats().unmanaged,1);
 assert.deepEqual(m.diagnostics(),{installed:true,sources:1,managedSources:0,unmanaged:1,scheduled:0});
 const lease=m.acquireVoice({ms:1000,sourceContext:child});assert.equal(lease.track(raw),true);
 assert.deepEqual(m.diagnostics(),{installed:true,sources:1,managedSources:1,unmanaged:0,scheduled:0});m.dispose();
});
test('punchline schedules child automation in child time, never main time',()=>{
 const main=new Context(),child=new Context();main.advance(100);child.advance(3);const m=createVoiceManager(main);
 const v=m.acquireVoice({ms:10000,sourceContext:child});m.preparePunchline();
 const times=v.gain.gain.events.map(e=>e.at(-1));assert.ok(times.every(t=>t>=3&&t<4));
 assert.equal(m.preparePunchline(),.29);
});
