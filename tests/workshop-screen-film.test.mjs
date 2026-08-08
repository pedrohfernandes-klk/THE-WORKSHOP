import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseFilmRate, WORKSHOP_FILM_RATES, WORKSHOP_FILM_SRC } from '../assets/js/workshop-screen-film.js';

test('film source is local and deployable', () => {
  assert.equal(WORKSHOP_FILM_SRC, 'assets/video/because-you-say-so.mp4');
});

test('film speed choices are deliberate and invalid values normalize', () => {
  assert.deepEqual(WORKSHOP_FILM_RATES, [0.75, 1, 1.5]);
  for (const rate of WORKSHOP_FILM_RATES) assert.equal(normaliseFilmRate(rate), rate);
  assert.equal(normaliseFilmRate(99), 1);
  assert.equal(normaliseFilmRate('nonsense'), 1);
});
