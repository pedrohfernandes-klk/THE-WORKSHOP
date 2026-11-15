// Procedural action-game score (pure Web Audio). A minor, 104 BPM. No files, no network.
// createMusic() -> { start(ctx?), setMuted(b), get muted, setIntensity(0..1), update(dt) }

const BPM = 104;
const STEP = 60 / BPM / 4; // 16th note
const LOOK = 0.12;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Am - F - C - G (midi). root = bass note, notes = pad voicing, arp = chord tones for the pluck
const CHORDS = [
  { root: 33, notes: [57, 60, 64], arp: [69, 72, 76, 81, 79] },
  { root: 29, notes: [53, 57, 60], arp: [69, 72, 77, 76, 81] },
  { root: 36, notes: [55, 60, 64], arp: [67, 72, 76, 79, 84] },
  { root: 31, notes: [55, 59, 62], arp: [67, 71, 74, 79, 76] },
];
const BASS_STEPS = [0, 3, 6, 8, 10, 14];
const BASS_ALT = [0, 3, 6, 7, 10, 12, 14];

export function createMusic() {
  let ctx = null, started = false, muted = false, intensity = 0.5;
  let timer = null, nextTime = 0, step = 0, bar = 0;
  let nodes = null, noiseBuf = null, rng = mulberry32(1), arpPat = [], hidden = false;

  const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };

  function build() {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -9; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.002; lim.release.value = 0.08;
    const master = g(0);
    comp.connect(lim); lim.connect(master); master.connect(ctx.destination);
    const bus = g(0.55); bus.connect(comp);

    const duck = g(1); duck.connect(bus); // side-chained group (pad + bass)
    const L = {};
    for (const k of ['pad', 'bass', 'drums', 'hat', 'open', 'arp', 'fx']) { L[k] = g(0); }
    L.pad.connect(duck); L.bass.connect(duck);
    L.drums.connect(bus); L.hat.connect(bus); L.open.connect(bus); L.fx.connect(bus);
    L.arp.connect(bus);
    // arp echo (dotted 8th)
    const dl = ctx.createDelay(1); dl.delayTime.value = STEP * 3;
    const fb = g(0.32), wet = g(0.45), dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 2800;
    L.arp.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(wet); wet.connect(bus);

    const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0), r = mulberry32(99);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    noiseBuf = buf;
    nodes = { master, duck, L };
    applyIntensity(true);
    applyMute();
  }

  function ramp(param, v, tc) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(v, t, tc);
  }
  function sm(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
  function applyIntensity(fast) {
    if (!nodes) return;
    const i = intensity, tc = fast ? 0.01 : 0.6; // ~2 s to settle
    const L = nodes.L;
    ramp(L.pad.gain, 0.30 + 0.05 * i, tc);
    ramp(L.hat.gain, 0.5 + 0.5 * sm(0, 0.5, i), tc);
    ramp(L.bass.gain, 0.22 + 0.78 * sm(0, 0.4, i), tc);
    ramp(L.drums.gain, sm(0.12, 0.5, i), tc);
    ramp(L.open.gain, sm(0.65, 1, i), tc);
    ramp(L.arp.gain, sm(0.65, 1, i), tc);
    ramp(L.fx.gain, 0.3 + 0.7 * sm(0.2, 0.7, i), tc);
  }
  function applyMute() {
    if (!nodes) return;
    ramp(nodes.master.gain, muted ? 0 : 1, 0.05);
  }

  // ---------- voices ----------
  function noise(t, dur, type, freq, q, vol, dest, atk = 0.002) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.loopStart = 0; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const e = g(0);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vol, t + atk);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(e); e.connect(dest);
    s.start(t, rng() * 0.5); s.stop(t + dur + 0.05);
  }
  function kick(t, vol = 1) {
    const o = ctx.createOscillator(), e = g(0);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vol * 0.95, t + 0.003);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(e); e.connect(nodes.L.drums);
    o.start(t); o.stop(t + 0.42);
    // click
    noise(t, 0.015, 'highpass', 3000, 0.7, 0.18 * vol, nodes.L.drums, 0.001);
    // side-chain duck
    const p = nodes.duck.gain;
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(0.35, t + 0.012);
    p.linearRampToValueAtTime(1, t + 0.26);
  }
  function snare(t, vol = 1) {
    noise(t, 0.2, 'bandpass', 1900, 0.8, 0.5 * vol, nodes.L.drums);
    noise(t, 0.12, 'highpass', 5000, 0.5, 0.18 * vol, nodes.L.drums);
    const o = ctx.createOscillator(), e = g(0);
    o.type = 'triangle';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.35 * vol, t + 0.002);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(e); e.connect(nodes.L.drums); o.start(t); o.stop(t + 0.18);
  }
  function clap(t, vol = 1) {
    for (let k = 0; k < 3; k++) noise(t + k * 0.011, 0.05 + (k === 2 ? 0.1 : 0), 'bandpass', 1300, 1.2, 0.22 * vol, nodes.L.drums);
  }
  function hat(t, vol, open) {
    if (open) noise(t, 0.22, 'highpass', 7500, 0.6, 0.16 * vol, nodes.L.open);
    else noise(t, 0.04, 'highpass', 8000, 0.6, 0.14 * vol, nodes.L.hat);
  }
  function bass(t, midi, len, vol) {
    const f = mtof(midi);
    const o = ctx.createOscillator(), s = ctx.createOscillator();
    o.type = 'sawtooth'; s.type = 'sine';
    o.frequency.value = f; s.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + len);
    const e = g(0), so = g(0.7);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vol * 0.5, t + 0.008);
    e.gain.setTargetAtTime(0.0001, t + len * 0.7, len * 0.12);
    o.connect(lp); lp.connect(e); s.connect(so); so.connect(e); e.connect(nodes.L.bass);
    o.start(t); s.start(t); o.stop(t + len + 0.2); s.stop(t + len + 0.2);
  }
  function pad(t, chord, dur) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(600, t + dur);
    const e = g(0);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.11, t + 0.5);
    e.gain.setValueAtTime(0.11, t + dur - 0.1);
    e.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    lp.connect(e); e.connect(nodes.L.pad);
    for (const m of chord.notes) {
      for (const det of [-9, 0, 8]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.7);
      }
    }
  }
  function pluck(t, midi, vol) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = mtof(midi); o2.frequency.value = mtof(midi); o2.detune.value = 6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const e = g(0);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vol * 0.12, t + 0.004);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(lp); o2.connect(lp); lp.connect(e); e.connect(nodes.L.arp);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
  }
  function riser(t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const e = g(0);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.28, t + dur);
    e.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    s.connect(f); f.connect(e); e.connect(nodes.L.fx);
    s.start(t); s.stop(t + dur + 0.1);
  }
  function impact(t) {
    const o = ctx.createOscillator(), e = g(0);
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.7, t + 0.005);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(e); e.connect(nodes.L.fx); o.start(t); o.stop(t + 1.7);
    noise(t, 1.2, 'lowpass', 2500, 0.5, 0.3, nodes.L.fx, 0.003);
  }

  // ---------- sequencer ----------
  function newArpPattern(phrase) {
    const r = mulberry32(1000 + phrase * 7919);
    const pats = [];
    for (let c = 0; c < 4; c++) {
      const p = [];
      for (let s = 0; s < 16; s++) {
        const on = (s % 4 === 0 && r() < 0.6) || (s % 2 === 1 && r() < 0.22) || (s % 4 === 2 && r() < 0.3);
        p.push(on ? Math.floor(r() * 5) : -1);
      }
      pats.push(p);
    }
    return pats;
  }

  function schedule(s16, t) {
    const sb = s16 % 16;
    const barIdx = Math.floor(s16 / 16);
    const chord = CHORDS[barIdx % 4];
    const phrase = Math.floor(barIdx / 8), cyc = barIdx % 16;
    if (sb === 0) {
      pad(t, chord, STEP * 16);
      if (barIdx % 8 === 0 || !arpPat.length) arpPat = newArpPattern(phrase);
      if (cyc === 15) riser(t, STEP * 16);
      if (cyc === 0 && barIdx > 0) impact(t);
      rng = mulberry32(barIdx * 31 + 7);
    }
    const fill = cyc === 15 || cyc === 7;
    // drums
    if (sb === 0 || sb === 10 || (sb === 7 && barIdx % 2 === 1) || (sb === 14 && barIdx % 4 === 3)) kick(t, sb === 0 ? 1 : 0.8);
    if (sb === 4 || sb === 12) { snare(t); clap(t, 0.7); }
    if (fill && sb >= 13 && sb !== 14 + 0) snare(t, 0.5 + (sb - 12) * 0.12);
    // hats
    if (sb % 2 === 0) hat(t, sb % 4 === 0 ? 1 : 0.65, false);
    else if (rng() < 0.35) hat(t, 0.4, false);
    if (sb === 2 || sb === 6 || sb === 10 || sb === 14) { if (sb % 4 === 2) hat(t, 0.9, true); }
    // bass
    const steps = barIdx % 4 === 3 ? BASS_ALT : BASS_STEPS;
    const bi = steps.indexOf(sb);
    if (bi >= 0) {
      const up = (bi % 3 === 2) ? 12 : 0;
      bass(t, chord.root + up + (sb === 14 && barIdx % 2 ? 7 : 0), STEP * (bi === 0 ? 2.6 : 1.6), sb === 0 ? 1 : 0.8);
    }
    // arp
    const ai = arpPat.length ? arpPat[barIdx % 4][sb] : -1;
    if (ai >= 0) pluck(t, chord.arp[ai], sb % 4 === 0 ? 1 : 0.7);
  }

  function pump() {
    if (!ctx || !nodes || hidden || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (nextTime < now) nextTime = now + 0.05;
    while (nextTime < now + LOOK) {
      schedule(step, nextTime);
      nextTime += STEP; step++;
    }
  }

  function onVis() {
    if (!ctx) return;
    hidden = typeof document !== 'undefined' && document.hidden;
    try {
      if (hidden) ctx.suspend(); else ctx.resume();
    } catch (e) { /* ignore */ }
  }

  return {
    async start(existing) {
      if (started) { try { if (ctx.state === 'suspended' && !hidden) await ctx.resume(); } catch (e) {} return; }
      try {
        const AC = (typeof globalThis !== 'undefined') && (globalThis.AudioContext || globalThis.webkitAudioContext);
        ctx = (existing && existing.createGain) ? existing : (AC ? new AC() : null);
        if (!ctx) return;
        build();
        started = true;
        if (ctx.state === 'suspended') await ctx.resume();
        nextTime = ctx.currentTime + 0.1; step = 0;
        timer = setInterval(pump, 30);
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVis);
          hidden = document.hidden; if (hidden) ctx.suspend();
        }
      } catch (e) { started = false; ctx = null; nodes = null; }
    },
    setMuted(b) { muted = !!b; applyMute(); },
    get muted() { return muted; },
    setIntensity(v) {
      v = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      if (Math.abs(v - intensity) < 0.01) return;
      intensity = v; applyIntensity(false);
    },
    update(dt) { if (started) pump(); },
  };
}
