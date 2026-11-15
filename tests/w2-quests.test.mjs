// Supplied for Claude/integrator. Not executed by the package author.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQuestEngine, validateMissions } from '../assets/gallery/spaces/quests.js';

const missions = JSON.parse(await readFile(new URL('../assets/data/missions.json', import.meta.url), 'utf8'));
function harness() {
  let locks = 0, released = 0, completions = 0;
  const data = {
    weather: { mode: 'golden' }, stats: { slaps: 17 },
    questSilence: { requested: true, confirmed: true },
    questArt: {
      select(out) { out.id = 'work-one'; out.x = 2; out.y = 0; out.z = 3; return true; },
      lock() { locks++; }, release() { released++; }, isLooking(id) { return id === 'work-one'; },
    },
  };
  const engine = createQuestEngine(missions, data, { actorNear: () => true, complete: () => { completions++; } });
  const frame = { time: 1, camera: { position: { x: 8, y: 1.62, z: 41 } } };
  function tick(dt = 0.1) { frame.time += dt; engine.tick(dt, frame); }
  function arrive() { frame.camera.position.x = engine.state.x; frame.camera.position.y = engine.state.y + 1.62; frame.camera.position.z = engine.state.z; }
  return { engine, data, frame, tick, arrive, get locks() { return locks; }, get released() { return released; }, get completions() { return completions; } };
}

test('authored data is valid, with six-word toasts and silent serious reward', () => {
  assert.equal(validateMissions(missions), missions);
  assert.equal(missions.find((m) => m.seria).recompensa.som, 'silencio');
});

test('all five state machines finish through their actual trigger types', () => {
  for (const mission of missions) {
    const h = harness();
    assert.equal(h.engine.start(mission.id, h.frame.time), true);
    let guard = 0;
    while (h.engine.state.active && guard++ < 2000) {
      const s = mission.passos[h.engine.state.index], a = s.alvo;
      h.arrive();
      if (s.gatilho === 'gesto') {
        h.frame.time += Math.max(1.3, a.intervalo || 0);
        h.data.lastGesture = { name: a.nome, time: h.frame.time };
      } else if (s.gatilho === 'clicar') {
        h.frame.time += 0.2;
        h.data.lastModulePick = { module: a.modulo, id: a.id, time: h.frame.time };
      } else if (s.gatilho === 'tempo' || s.gatilho === 'olhar') h.data.weather.mode = a.modo;
      else if (s.gatilho === 'chapadas') h.data.stats.slaps += a.vezes;
      h.tick();
    }
    assert.equal(h.engine.state.active, false, mission.id + ' did not finish');
    assert.equal(h.completions, 1);
    assert.equal(h.data.questQuiet, false);
    assert.equal(h.released, mission.seria ? 1 : 0);
  }
});

test('no mission starts, emits UI, or completes without an explicit start', () => {
  const h = harness();
  for (let i = 0; i < 100; i++) h.tick();
  assert.equal(h.engine.state.active, false);
  assert.equal(h.completions, 0);
  assert.equal(h.engine.start('not-a-mission', h.frame.time), false);
});

test('old clicks never satisfy a newly entered step', () => {
  const h = harness();
  h.data.lastModulePick = { module: 'mercado', id: 'nata', time: 0.5 };
  h.engine.start('nata-expresso', 1); h.arrive(); h.tick();
  assert.equal(h.engine.state.index, 1);
  for (let i = 0; i < 10; i++) h.tick();
  assert.equal(h.engine.state.index, 1);
  h.data.lastModulePick.time = h.frame.time;
  h.tick();
  assert.equal(h.engine.state.index, 2);
});

test('wrong target, wrong level and clicks outside objective do not count', () => {
  const h = harness(); h.engine.start('nata-expresso', 1); h.arrive(); h.tick();
  h.data.lastModulePick = { module: 'mercado', id: 'fruta', time: h.frame.time };
  h.tick(); assert.equal(h.engine.state.index, 1);
  h.frame.camera.position.y = 9;
  h.data.lastModulePick = { module: 'mercado', id: 'nata', time: h.frame.time };
  h.tick(); h.arrive(); h.tick(); assert.equal(h.engine.state.index, 1);
  h.data.lastModulePick.time = h.frame.time; h.tick(); assert.equal(h.engine.state.index, 2);
});

test('one gesture event cannot be counted three times', () => {
  const h = harness(); h.engine.start('bombo', 1); h.arrive(); h.tick();
  h.arrive(); h.data.lastModulePick = { module: 'arraial', id: 'rosa', time: h.frame.time }; h.tick();
  h.arrive(); h.data.lastGesture = { name: 'dance', time: h.frame.time }; h.tick();
  for (let i = 0; i < 40; i++) h.tick();
  assert.equal(h.engine.state.index, 2);
  assert.equal(h.engine.state.count, 1);
});

test('serious mission requires attention, pauses out of gaze, restores curator lock', () => {
  const h = harness(); h.data.questArt.select = () => false;
  assert.equal(h.engine.start('ficar', 1), false);
  assert.equal(h.locks, 0);
  h.data.questArt.select = (out) => { Object.assign(out, { id: 'work-one', x: 2, y: 0, z: 3 }); return true; };
  assert.equal(h.engine.start('ficar', 1), true);
  h.arrive(); h.tick(); h.data.weather.mode = 'night'; h.arrive(); h.tick(); h.arrive(); h.tick();
  h.arrive(); h.data.questArt.isLooking = () => false;
  for (let i = 0; i < 30; i++) h.tick();
  assert.equal(h.engine.state.held, 0);
  h.data.questArt.isLooking = () => true; h.tick();
  assert.ok(h.engine.state.held > 0);
  h.engine.cancel();
  assert.equal(h.released, 1); assert.equal(h.data.questQuiet, false);
});

test('missing optional world data does not throw or fabricate completion', () => {
  const e = createQuestEngine(missions, {});
  assert.equal(e.start('ficar', 1), false);
  assert.equal(e.start('bombo', 1), true);
  assert.doesNotThrow(() => { e.tick(0.1, null); e.tick(0.1, { time: 2 }); e.tick(0, {}); });
  assert.equal(e.state.active, true);
});

test('slap trigger counts a delta, never the pre-existing visit total', () => {
  const altered = structuredClone(missions);
  altered[0].passos[0] = { gatilho: 'chapadas', alvo: { x: 8, z: 41, raio: 2, vezes: 2 }, fala: 'Duas ações novas.' };
  const data = { stats: { slaps: 20 } }, e = createQuestEngine(altered, data);
  const frame = { time: 2, camera: { position: { x: 8, y: 1.62, z: 41 } } };
  e.start('nata-expresso', 1); e.tick(0.1, frame);
  assert.equal(e.state.index, 0);
  data.stats.slaps = 21; e.tick(0.1, frame); assert.equal(e.state.index, 0);
  data.stats.slaps = 22; e.tick(0.1, frame); assert.equal(e.state.index, 1);
});

test('future timestamps cannot satisfy objectives early', () => {
  const h = harness(); h.engine.start('nata-expresso', 1); h.arrive(); h.tick();
  h.data.lastModulePick = { module: 'mercado', id: 'nata', time: 1000 };
  h.tick(); assert.equal(h.engine.state.index, 1);
});

// Integration acknowledgement is distinct from merely requesting quiet.
test('serious attention requires confirmed silence and resets if it is lost', () => {
  const h = harness(); h.engine.start('ficar', 1);
  h.arrive(); h.tick(); h.data.weather.mode = 'night'; h.arrive(); h.tick(); h.arrive(); h.tick(); h.arrive();
  h.data.questSilence.confirmed = false;
  for (let i = 0; i < 30; i++) h.tick();
  assert.equal(h.engine.state.held, 0);
  h.data.questSilence.confirmed = true; h.tick();
  assert.ok(h.engine.state.held > 0);
  delete h.data.questSilence; h.tick();
  assert.equal(h.engine.state.held, 0);
});
