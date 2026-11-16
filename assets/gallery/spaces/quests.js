import { reserveModuleVoice, finishModuleVoice } from '../audio-lease.js';
// W2: opt-in, data-driven short quests. JSON is same-origin; one PBR marker.
// Original actors are separate, at most one visible. No per-frame allocations.
import { createQuestActors } from '../quest-actors.js';

const HOME_X = 8, HOME_Z = 41;
const TYPES = new Set(['chegar', 'gesto', 'chapadas', 'tempo', 'clicar', 'olhar']);
const words = (s) => typeof s === 'string' && s.trim().split(/\s+/u).length <= 6;
const finite = Number.isFinite;

export function validateMissions(data) {
  if (!Array.isArray(data) || data.length !== 5) throw new Error('Expected five missions');
  const ids = new Set();
  for (const m of data) {
    if (!m || typeof m.id !== 'string' || ids.has(m.id) || !words(m.título) || typeof m.zona !== 'string') throw new Error('Invalid mission identity');
    ids.add(m.id);
    if (!Array.isArray(m.passos) || m.passos.length < 1 || m.passos.length > 32 || !m.recompensa || !words(m.recompensa.fala)) throw new Error('Invalid mission steps/reward');
    if (m.seria && m.recompensa.som !== 'silencio') throw new Error('The quiet mission must stay quiet');
    for (const s of m.passos) {
      const a = s.alvo;
      if (!TYPES.has(s.gatilho) || !a || !words(s.fala)) throw new Error('Invalid trigger or toast');
      if (!a.favorita && (!finite(a.x) || !finite(a.z) || !finite(a.raio) || a.raio <= 0)) throw new Error('Every objective needs a reachable position');
      if (a.y !== undefined && !finite(a.y)) throw new Error('Invalid floor height');
      if (s.gatilho === 'gesto' && (typeof a.nome !== 'string' || (a.vezes !== undefined && (!Number.isInteger(a.vezes) || a.vezes < 1)))) throw new Error('Invalid gesture');
      if (s.gatilho === 'clicar' && (typeof a.modulo !== 'string' || typeof a.id !== 'string')) throw new Error('Invalid click target');
      if (s.gatilho === 'tempo' && typeof a.modo !== 'string') throw new Error('Invalid weather');
      if (s.gatilho === 'chapadas' && (!Number.isInteger(a.vezes) || a.vezes < 1)) throw new Error('Invalid slap delta');
      if (s.gatilho === 'olhar' && (!a.favorita || !finite(a.segundos) || a.segundos <= 0)) throw new Error('Invalid attention target');
    }
  }
  return data;
}

// Pure state machine: tests can supply a scene-data object, camera and clock.
// callbacks run only on explicit starts, step changes and completions.
export function createQuestEngine(missions, data, callbacks = {}) {
  validateMissions(missions);
  const state = { active: false, mission: null, index: 0, count: 0, held: 0, completed: 0, points: 0,
    started: 0, since: 0, duration: 0, x: HOME_X, y: 0, z: HOME_Z, radius: 2,
    favourite: { id: null, x: 0, y: 0, z: 0 }, carrying: false, result: null };
  let lastGesture = -Infinity, lastPick = -Infinity, countAt = -Infinity, slapBase = 0;
  let ownTime = -Infinity, ownId = '', ownModule = '';
  function enterStep(now) {
    const s = state.mission.passos[state.index], a = s.alvo;
    state.since = now; state.count = state.held = 0; countAt = -Infinity;
    lastGesture = data.lastGesture?.time ?? -Infinity;
    lastPick = Math.max(data.lastModulePick?.time ?? -Infinity, ownTime);
    slapBase = data.stats?.slaps || 0;
    state.x = a.favorita ? state.favourite.x : a.x;
    state.y = a.favorita ? state.favourite.y : (a.y || 0);
    state.z = a.favorita ? state.favourite.z : a.z;
    state.radius = a.raio || 2;
    if (s.efeito === 'levar-nata' || s.efeito === 'recuperar-nata') state.carrying = true;
    if (s.efeito === 'roubar-nata') state.carrying = false;
    data.questQuiet = !!state.mission.seria;
    callbacks.step?.(s, state);
  }
  function start(id, now = 0) {
    if (state.active) return false;
    let m = null;
    for (let i = 0; i < missions.length; i++) if (missions[i].id === id) { m = missions[i]; break; }
    if (!m) return false;
    if (m.seria && !data.questArt?.select?.(state.favourite)) return false;
    if (m.seria) data.questArt.lock?.();
    state.active = true; state.mission = m; state.index = 0; state.started = now;
    state.duration = 0; state.carrying = false; state.result = null;
    callbacks.start?.(m, state); enterStep(now); return true;
  }
  function cancel() {
    if (!state.active) return;
    if (state.mission.seria) data.questArt?.release?.();
    state.active = false; state.carrying = false; data.questQuiet = false;
    callbacks.cancel?.(state);
  }
  function signal(module, id, time) { ownModule = module; ownId = id; ownTime = time; }
  function near(camera) {
    const p = camera.position, dx = p.x - state.x, dz = p.z - state.z;
    return dx * dx + dz * dz <= state.radius * state.radius && Math.abs(p.y - 1.62 - state.y) < 1.3;
  }
  function tick(dt, frame) {
    if (!state.active || !frame?.camera || !(dt > 0) || !finite(frame.time)) return;
    const s = state.mission.passos[state.index], a = s.alvo, now = frame.time;
    const silenceConfirmed = data.questQuiet === true && data.questSilence?.requested === true && data.questSilence?.confirmed === true;
    if (state.mission.seria && !silenceConfirmed) state.held = 0;
    if (!near(frame.camera)) {
      // A gesture/click performed elsewhere must not become valid on arrival.
      lastGesture = Math.max(lastGesture, data.lastGesture?.time ?? -Infinity);
      lastPick = Math.max(lastPick, data.lastModulePick?.time ?? -Infinity, ownTime);
      return;
    }
    let ok = false;
    if (s.gatilho === 'chegar') ok = !a.acompanhar || !!callbacks.actorNear?.(a.x, a.z, a.raio);
    else if (s.gatilho === 'tempo') ok = (data.weather?.mode || frame.weather?.mode || frame.weather) === a.modo;
    else if (s.gatilho === 'chapadas') ok = (data.stats?.slaps || 0) - slapBase >= a.vezes;
    else if (s.gatilho === 'gesto') {
      const e = data.lastGesture;
      if (e && finite(e.time) && e.time > lastGesture && e.time >= state.since && e.time <= now && now - e.time < 2) {
        lastGesture = e.time;
        if (e.name === a.nome && e.time - countAt >= (a.intervalo || 0)) { state.count++; countAt = e.time; }
      }
      ok = state.count >= (a.vezes || 1);
    } else if (s.gatilho === 'clicar') {
      const e = data.lastModulePick;
      const useOwn = ownTime > (e?.time ?? -Infinity);
      const time = useOwn ? ownTime : e?.time;
      if (finite(time) && time > lastPick && time >= state.since && time <= now && now - time < 2) {
        lastPick = time;
        ok = (useOwn ? ownModule : e.module) === a.modulo && (useOwn ? ownId : e.id) === a.id;
      }
    } else if (s.gatilho === 'olhar') {
      if (silenceConfirmed && (data.weather?.mode || frame.weather?.mode || frame.weather) === a.modo && data.questArt?.isLooking?.(state.favourite.id)) {
        state.held += Math.min(dt, 0.1);
      }
      ok = state.held >= a.segundos;
    }
    if (!ok) return;
    state.index++;
    if (state.index < state.mission.passos.length) enterStep(now);
    else {
      state.active = false; state.carrying = false; data.questQuiet = false;
      if (state.mission.seria) data.questArt?.release?.();
      state.completed++; state.duration = now - state.started; state.result = state.mission.recompensa;
      state.points += state.result.pontos || 0;
      callbacks.complete?.(state.mission, state);
    }
  }
  return { state, start, cancel, signal, tick };
}

export function build(ctx) {
  const { THREE, M } = ctx;
  const group = new THREE.Group(); group.name = 'quests';
  const markerMaterial = M.get('steel', { color: 0xffcd75, roughness: 0.5 }).clone();
  const geo = new THREE.TorusGeometry(0.23, 0.045, 6, 20);
  M.boxUV(geo);
  const marker = new THREE.Mesh(geo, markerMaterial);
  marker.name = 'quest-marker'; marker.position.set(HOME_X, 0.9, HOME_Z);
  marker.receiveShadow = true; marker.castShadow = false;
  marker.userData.action = { type: 'custom', id: 'pedir-missao', label: 'PEDIR MISSÃO' };
  group.add(marker);
  const actors = createQuestActors(ctx); group.add(actors.group);
  const pickables = [marker, ...actors.pickables];
  const data = ctx.scene.userData;
  let engine = null, missions = null, next = 0, disposed = false, failed = false;
  let camera = null, lastPickAt = -Infinity;
  let audioContext = null, audioBus = null, oscillator = null, gain = null;
  const toast = (s) => { ctx.ui?.toast?.(s); };
  const now = () => performance.now() / 1000;

  // Initialise only on a visitor action. The reward reuses these nodes and
  // schedules values without allocating a node or closure inside update().
  function armAudio() { audioContext = ctx.audio?.context || null; audioBus = ctx.audio?.bus || null; }
  function reward(m) {
    if (m.seria || m.recompensa.som !== 'fanfarra') return;
    armAudio(); const lease = reserveModuleVoice(ctx, 3, true, 1.35, audioBus); if (!lease) return;
    try {
      const ac = audioContext, t = Math.max(ac.currentTime, lease.startAt), beat = 60 / 96 / 2;
      if (oscillator) { try { oscillator.stop(); } catch {} }
      const o = ac.createOscillator(), g = ac.createGain(); oscillator = o; gain = g; o.type = 'triangle';
      o.connect(g); g.connect(lease.gain); lease.track(o); finishModuleVoice(lease, o);
      for (let i = 0; i < 4; i++) {
        o.frequency.setValueAtTime(i === 0 ? 440 : i === 1 ? 523.251 : i === 2 ? 659.255 : 880, t + i * beat);
        g.gain.setValueAtTime(.0001, t + i * beat); g.gain.linearRampToValueAtTime(.055, t + i * beat + .008);
        g.gain.exponentialRampToValueAtTime(.0001, t + i * beat + beat * .8);
      }
      o.addEventListener('ended', () => { o.disconnect(); g.disconnect(); if (oscillator === o) { oscillator = null; gain = null; } }, { once: true });
      o.start(t); o.stop(t + 4 * beat + .02);
    } catch { lease.release(); }
  }
  function home() {
    actors.reset(); marker.visible = true;
    marker.position.set(HOME_X, 0.9, HOME_Z); marker.rotation.set(0, 0, 0);
    marker.userData.action.id = 'pedir-missao'; marker.userData.action.label = 'PEDIR MISSÃO';
  }
  const ready = fetch(new URL('../../data/missions.json', import.meta.url))
    .then((r) => { if (!r.ok) throw new Error('Mission data unavailable'); return r.json(); })
    .then((json) => {
      if (disposed) return;
      missions = validateMissions(json);
      engine = createQuestEngine(missions, data, {
        start() { actors.reset(); },
        actorNear: actors.near,
        step(s, state) {
          marker.position.set(state.x, state.y + 0.08, state.z);
          marker.rotation.x = -Math.PI / 2;
          marker.userData.action.id = s.gatilho === 'clicar' && s.alvo.modulo === 'quests' && s.alvo.id === 'entrega' ? 'entrega' : 'objetivo';
          marker.userData.action.label = marker.userData.action.id === 'entrega' ? 'ENTREGAR' : 'OBJETIVO';
          marker.visible = true;
          actors.effect(s.efeito, camera);
          toast(s.fala);
        },
        complete(m) { reward(m); toast(m.recompensa.fala); next = (missions.indexOf(m) + 1) % missions.length; home(); },
        cancel: home,
      });
    }).catch(() => { failed = true; }); // no unsolicited warning/toast before interaction

  function start(id) {
    if (!engine) { toast(failed ? 'Missões indisponíveis. Tenta recarregar.' : 'A preparar os recados.'); return false; }
    if (engine.state.active) { toast(engine.state.mission.passos[engine.state.index].fala); return false; }
    armAudio();
    if (!engine.start(id, now())) { toast('Olha uma obra primeiro.'); return false; }
    return true;
  }
  function onPick(obj) {
    if (!obj?.userData?.action) return;
    const t = now();
    if (t - lastPickAt < 0.25) return;
    if (camera) {
      const p = obj.position, c = camera.position, dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz > 16) { toast('Chega um pouco mais perto.'); return; }
    }
    lastPickAt = t; armAudio();
    if (!engine || !engine.state.active) { if (missions) start(missions[next].id); else toast(failed ? 'Missões indisponíveis. Tenta recarregar.' : 'A preparar os recados.'); return; }
    const id = obj.userData.action.id;
    if (id === 'objetivo') toast(engine.state.mission.passos[engine.state.index].fala);
    else engine.signal('quests', id, t);
  }
  function update(dt, frame) {
    if (!frame?.camera) return;
    camera = frame.camera;
    if (gain && ctx.audio?.muted && gain.gain.value > 0) {
      try { gain.gain.cancelScheduledValues(audioContext.currentTime); gain.gain.value = 0; } catch { /* context closed */ }
    }
    if (!engine?.state.active || !(dt > 0)) return;
    actors.update(Math.min(dt, 0.1), camera);
    const s = engine.state, p = camera.position, dx = p.x - s.x, dz = p.z - s.z;
    if (dx * dx + dz * dz > 1600) return;
    engine.tick(dt, frame);
    if (s.active && s.mission.seria && s.held > 0) marker.visible = false;
  }
  function dispose() {
    disposed = true; engine?.cancel();
    if (oscillator) { try { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } catch { /* context closed */ } }
    marker.geometry.dispose(); markerMaterial.dispose();
    actors.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    actors.pigeon.material.dispose();
  }
  return { group, regions: [], colliders: [], pickables, update, onPick, ready, start,
    cancel() { engine?.cancel(); }, get state() { return engine?.state || null; }, dispose };
}
