import { reserveModuleVoice, finishModuleVoice } from './audio-lease.js';

export const FABINHE_LYRIC = 'Se as pingas da chuva fosse pingas de Bow-Seta, que chuva de Mer-dass seriaaa!';
export const FABINHE_REPLIES = Object.freeze(['Gostaste? É minha.', 'Faço concertos por MB Way.', 'Isto é um êxito, pá!']);
// An original phrase, A minor pentatonic, eighth notes at 96 BPM. No sampled song.
const MELODY = Object.freeze([69, 72, 76, 74, 72, 69, 67, 69, 72, 76, 79, 76, 74, 72, 69, 69]);
const BEAT = 60 / 96, SONG_SECONDS = MELODY.length * BEAT / 2 + 3.2;

export function createFabinhe(ctx, { npcs, say } = {}) {
  let actor = null;
  for (let i = 0; i < npcs.length; i++) if (npcs[i].S.name === 'fabinhe') { actor = npcs[i]; break; }
  const state = { active: false, paused: false, singing: false, phase: 'idle', clock: 0, elapsed: 0, lastSong: -Infinity, nextReply: 0, localVoice: '', generation: 0 };
  let camera = null, forcedPause = false, destroyed = false, songLease = null, songSource = null, whistleLease = null, utterance = null, ttsLease = null, ttsOwner = null, breathFinished = false;
  if (actor) actor.fabinhePerforming = false;
  const quiet = () => forcedPause || !!ctx.audio?.muted || !!ctx.scene?.userData?.questQuiet || !!ctx.scene?.userData?.npcStatues;
  function near() { return actor && camera && (actor.x - camera.position.x) ** 2 + (actor.z - camera.position.z) ** 2 < 1600; }
  function stopOwnedSpeech() {
    const owner = ttsOwner, token = ttsLease; ttsOwner = null; ttsLease = null; utterance = null;
    if (owner && ctx.scene.userData.ttsOwner === owner) { ctx.scene.userData.ttsOwner = null; try { owner.synth.cancel(); } catch {} }
    token?.release();
  }
  function cancel(reason = 'idle') {
    state.generation++; state.active = false; state.singing = false; state.elapsed = 0; state.phase = reason;
    if (actor) { actor.fabinhePerforming = false; if (!ctx.scene.userData.npcStatues) actor.rig?.setPreset?.(null); }
    // The broker owns the source stop/fade, including pending scheduled notes.
    songLease?.release(); songLease = null; songSource = null; whistleLease?.release(); whistleLease = null;
    stopOwnedSpeech();
  }
  function chooseLocalVoice(synth) {
    const voices = synth.getVoices(); let english = null;
    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i]; if (voice.localService !== true) continue;
      if (/^pt[-_]PT$/i.test(voice.lang || '')) return voice;
      if (!english && /^en(?:[-_]|$)/i.test(voice.lang || '')) english = voice;
    }
    return english;
  }
  function speakLyric() {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const synth = speechSynthesis;
    if (synth.speaking || synth.pending || ctx.scene.userData.ttsOwner) return;
    const voice = chooseLocalVoice(synth); if (!voice) return;
    const token = reserveModuleVoice(ctx, 3, true, SONG_SECONDS + .5, ctx.audio?.bus); if (!token) return;
    const generation = state.generation;
    try {
      const u = new SpeechSynthesisUtterance(FABINHE_LYRIC);
      u.voice = voice; u.lang = voice.lang; u.rate = /^pt/i.test(voice.lang) ? 1.03 : .94; u.pitch = 1.22;
      u.volume = Math.min(.6, .32 * energy()) * audibility();
      const owner = { utterance: u, lease: token, synth };
      ttsOwner = owner; ttsLease = token; utterance = u; ctx.scene.userData.ttsOwner = owner; state.localVoice = voice.lang;
      const done = () => {
        if (ctx.scene.userData.ttsOwner === owner) ctx.scene.userData.ttsOwner = null;
        if (ttsOwner === owner) { ttsOwner = null; ttsLease = null; utterance = null; }
        token.release(); if (generation === state.generation) breathFinished = true;
      };
      u.onend = done; u.onerror = done;
      token.onRelease = () => {
        if (ctx.scene.userData.ttsOwner !== owner) return;
        ctx.scene.userData.ttsOwner = null;
        if (ttsOwner === owner) { ttsOwner = null; ttsLease = null; utterance = null; }
        try { synth.cancel(); } catch {}
      };
      synth.speak(u);
    } catch { token.release(); stopOwnedSpeech(); }
  }
  function audibility() {
    if (!actor || !camera) return 0;
    const d = Math.hypot(actor.x - camera.position.x, actor.z - camera.position.z);
    return Math.max(0, 1 - d / 40) / Math.max(1, d / 3);
  }
  function placeSound(ac, lease, bus) {
    const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.maxDistance = 40; p.rolloffFactor = 1.5;
    p.positionX.value = actor.x; p.positionY.value = (actor.baseY || 0) + (actor.bodyY0 + actor.headY) * actor.sz; p.positionZ.value = actor.z;
    lease.gain.disconnect(); lease.gain.connect(p); p.connect(bus); return p;
  }
  function energy() {
    const weather = ctx.scene.userData.weather, fight = ctx.scene.userData.combatState;
    let e = weather?.mode === 'storm' || weather?.storm ? 1.5 : weather?.mode === 'rainbow' ? 1.25 : 1;
    if (fight?.active && actor && (actor.x - fight.ax) ** 2 + (actor.z - fight.az) ** 2 < 144) e = Math.max(e, 1.6);
    return e;
  }
  function melody() {
    const audio = ctx.audio, ac = audio?.context, lease = reserveModuleVoice(ctx, 2, true, SONG_SECONDS + .1, audio?.bus);
    if (!lease || !ac) return;
    songLease = lease;
    let panner = null;
    try {
      panner = placeSound(ac, lease, audio.bus);
      const osc = ac.createOscillator(), filter = ac.createBiquadFilter(), envelope = ac.createGain(); songSource = osc;
      const t = Math.max(ac.currentTime, lease.startAt), eighth = BEAT / 2, level = .048 * energy();
      osc.type = 'triangle'; filter.type = 'lowpass'; filter.frequency.value = 2200; filter.Q.value = .7;
      osc.connect(filter); filter.connect(envelope); envelope.connect(lease.gain); lease.track(osc); finishModuleVoice(lease, osc);
      for (let i = 0; i < MELODY.length; i++) {
        const start = t + i * eighth;
        osc.frequency.setValueAtTime(440 * 2 ** ((MELODY[i] - 69) / 12), start);
        envelope.gain.setValueAtTime(.0001, start); envelope.gain.linearRampToValueAtTime(level, start + .018);
        envelope.gain.exponentialRampToValueAtTime(.0001, start + eighth * .86);
      }
      const tail = t + MELODY.length * eighth;
      // Repeated last note loses breath and drifts sharp; finite, never an endless gag.
      for (let i = 0; i < 10; i++) {
        const start = tail + i * eighth, peak = Math.max(.0002, level * (1 - i / 10) ** 1.4);
        osc.frequency.setValueAtTime(440 * 2 ** ((i * 4.3) / 1200), start);
        envelope.gain.setValueAtTime(.0001, start); envelope.gain.linearRampToValueAtTime(peak, start + .02);
        envelope.gain.exponentialRampToValueAtTime(.0001, start + eighth * .8);
      }
      osc.addEventListener('ended', () => { osc.disconnect(); filter.disconnect(); envelope.disconnect(); panner?.disconnect(); if (songSource === osc) { songSource = null; songLease = null; } }, { once: true });
      osc.start(t); osc.stop(t + SONG_SECONDS);
    } catch { lease.release(); panner?.disconnect(); songLease = null; songSource = null; }
  }
  function whistle() {
    if (quiet()) return;
    const audio = ctx.audio, ac = audio?.context, lease = reserveModuleVoice(ctx, 3, true, .48, audio?.bus); if (!lease || !ac) return;
    whistleLease = lease;
    let panner = null;
    try {
      panner = placeSound(ac, lease, audio.bus);
      const osc = ac.createOscillator(), gain = ac.createGain(), t = Math.max(ac.currentTime, lease.startAt);
      osc.type = 'sine'; osc.frequency.setValueAtTime(1700, t); osc.frequency.exponentialRampToValueAtTime(420, t + .4);
      gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(.055, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .4);
      osc.connect(gain); gain.connect(lease.gain); lease.track(osc); finishModuleVoice(lease, osc);
      osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect(); panner?.disconnect(); if (whistleLease === lease) whistleLease = null; }, { once: true });
      osc.start(t); osc.stop(t + .43);
    } catch { lease.release(); panner?.disconnect(); whistleLease = null; }
  }
  function onTalk(n) {
    if (n !== actor) return false;
    if (ctx.audio?.muted && !ctx.scene.userData.questQuiet && !ctx.scene.userData.npcStatues) { say?.(actor, FABINHE_REPLIES[state.nextReply++ % FABINHE_REPLIES.length], false); return true; }
    if (destroyed || quiet() || !near() || n.combatControlled || n.combatHidden || n.sillyT >= 0) return true;
    if (state.active) return true;
    if (state.clock - state.lastSong < 600) { say?.(actor, FABINHE_REPLIES[state.nextReply++ % FABINHE_REPLIES.length], false); return true; }
    // Shared comedy has the final word, including identical captions still on screen.
    if (say?.(actor, FABINHE_LYRIC, false) !== true) return true;
    state.generation++; state.lastSong = state.clock; state.elapsed = 0; state.active = true; state.singing = true; state.phase = 'song'; breathFinished = false;
    actor.fabinhePerforming = true; actor.talkT = SONG_SECONDS + .1; actor.armUp = 1.1; actor.goOn = false; actor.rig?.setPreset?.('orgulho_fragil', .6);
    if (!ctx.audio?.muted) { ctx.audio?.duck?.(SONG_SECONDS); melody(); speakLyric(); }
    return true;
  }
  function onSlap(n) { if (n !== actor) return; cancel('interrupted'); whistle(); }
  function before(dt, frame) {
    camera = frame?.camera || camera;
    if (!actor || destroyed) return;
    if(ctx.scene.userData.questQuiet||ctx.audio?.muted){if(state.active)cancel('quiet');state.paused=true;return;}
    if(forcedPause||ctx.scene.userData.npcStatues){state.paused=true;return;}
    const paused = quiet();
    if (paused) { if (!state.paused || state.active) cancel('paused'); state.paused = true; return; }
    if (state.paused) { state.paused = false; } // No queue catch-up or automatic replay on thaw.
    if (!near()) { if (state.active) cancel('idle'); return; }
    const step = Math.min(.05, Math.max(0, dt || 0)); state.clock += step;
    if (!state.active) return;
    if (actor.combatControlled || actor.combatHidden || actor.sillyT >= 0) { cancel('interrupted'); return; }
    state.elapsed += step;
    if (state.elapsed >= SONG_SECONDS) {
      cancel('idle'); actor.rig?.setPreset?.(null);
      if (!ctx.scene.userData.questQuiet) say?.(actor, FABINHE_REPLIES[state.nextReply++ % FABINHE_REPLIES.length], false);
    } else if (state.elapsed >= MELODY.length * BEAT / 2) state.phase = 'out_of_breath';
  }
  function after() {
    if (!actor || !near() || quiet() || actor.combatControlled || actor.combatHidden || actor.sillyT >= 0) return;
    const time = state.active ? state.elapsed : state.clock, sway = ctx.reducedMotion ? 0 : Math.sin(time * Math.PI * 2 / (BEAT * 4));
    actor.body.rotation.z += sway * (state.active ? .065 : .018);
    if (!state.active) return;
    const breath = Math.max(0, (state.elapsed - MELODY.length * BEAT / 2) / 3.2);
    actor.arms[1].rotation.x = -.9 - (ctx.reducedMotion ? 0 : Math.sin(time * Math.PI * 2 / BEAT) * .13);
    actor.head.rotation.x += breath * .1;
    actor.rig?.setExpression?.((breathFinished ? .18 : .3) + Math.abs(Math.sin(time * 8)) * .14 * (1 - breath), .2);
  }
  const visibility = () => { if (typeof document !== 'undefined' && document.hidden) cancel('idle'); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  return { state, before, after, onTalk, onSlap,
    setPaused(value) { forcedPause = !!value;state.paused=forcedPause; },
    dispose() { destroyed = true; cancel('disposed'); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); }
  };
}
