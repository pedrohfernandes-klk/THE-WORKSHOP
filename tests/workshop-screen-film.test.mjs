import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkshopFilmController, normaliseFilmRate, normaliseFilmVolume, WORKSHOP_FILM_RATES, WORKSHOP_FILM_SRC } from '../assets/js/workshop-screen-film.js';

test('film source is local and deployable', () => {
  assert.equal(WORKSHOP_FILM_SRC, 'assets/video/because-you-say-so.mp4');
});

test('film volume is clamped to a safe media range', () => {
  assert.equal(normaliseFilmVolume(-1), 0);
  assert.equal(normaliseFilmVolume(0.4), 0.4);
  assert.equal(normaliseFilmVolume(8), 1);
  assert.equal(normaliseFilmVolume('nonsense'), 1);
});

test('film speed choices are deliberate and invalid values normalize', () => {
  assert.deepEqual(WORKSHOP_FILM_RATES, [0.75, 1, 1.5]);
  for (const rate of WORKSHOP_FILM_RATES) assert.equal(normaliseFilmRate(rate), rate);
  assert.equal(normaliseFilmRate(99), 1);
  assert.equal(normaliseFilmRate('nonsense'), 1);
});

test('film starts muted and restore resets playback defaults', async () => {
  const previousDocument = globalThis.document;
  const video = {
    paused: true, muted: false, volume: 1, playbackRate: 1, currentTime: 0,
    style: {},
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener() {}
  };
  globalThis.document = {
    hidden: false,
    createElement(tag) { assert.equal(tag, 'video'); return video; },
    body: { appendChild() {} },
    addEventListener() {}
  };
  const THREE = {
    VideoTexture: class {}, SRGBColorSpace: 'srgb', LinearFilter: 'linear',
    DoubleSide: 'double', MeshBasicMaterial: class { dispose() {} }
  };
  try {
    const controller = createWorkshopFilmController({ THREE, screens: [] });
    await controller.enable();
    assert.equal(controller.state().active, true);
    assert.equal(controller.state().audible, false);
    assert.equal(video.muted, true);
    controller.setRate(1.5);
    controller.setVolume(0.4);
    controller.toggleSound();
    assert.equal(controller.state().audible, true);
    controller.disable();
    assert.deepEqual({ paused: video.paused, muted: video.muted, rate: video.playbackRate, volume: video.volume, time: video.currentTime },
      { paused: true, muted: true, rate: 1, volume: 1, time: 0 });
  } finally {
    globalThis.document = previousDocument;
  }
});

test('document exposes explicit film sound, volume and speed controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="filmQuickSoundBtn"/);
  assert.match(html, /id="filmVolume"[^>]+type="range"/);
  assert.match(html, /<select class="btn" id="filmQuickRateBtn"/);
  assert.match(html, /enable\(\{sound:false\}\)/);
  assert.match(html, /const roomScreen = screens\.find/,
    'Projection falls back to the current room screen instead of falsely reporting none nearby');
});
