import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORKS } from '../assets/gallery/catalogue.js';

const ROOT = new URL('../', import.meta.url);
const HEX = /^#[0-9a-f]{6}$/;
const FAMILIES = new Set(['matter', 'signal', 'archive']);
const FRAMES = new Set(['canvas', 'frame', 'mat']);

test('ids are unique and well-formed', () => {
  const ids = WORKS.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+$/, `bad id ${id}`);
  }
});

test('every src exists on disk', () => {
  for (const w of WORKS) {
    const path = fileURLToPath(new URL(w.src, ROOT));
    assert.ok(existsSync(path), `missing image for ${w.id}: ${w.src}`);
  }
});

test('family and frame are valid', () => {
  for (const w of WORKS) {
    assert.ok(FAMILIES.has(w.family), `${w.id} family ${w.family}`);
    assert.ok(FRAMES.has(w.frame), `${w.id} frame ${w.frame}`);
  }
});

test('metadata fields have the right types', () => {
  for (const w of WORKS) {
    for (const key of ['id', 'src', 'title', 'no', 'family', 'frame', 'medium', 'note']) {
      assert.equal(typeof w[key], 'string', `${w.id}.${key}`);
    }
    for (const key of ['series', 'artist']) {
      assert.ok(w[key] === null || typeof w[key] === 'string', `${w.id}.${key}`);
      assert.ok(key in w, `${w.id} missing ${key}`);
    }
  }
});

test('measured fields are present with the right types', () => {
  for (const w of WORKS) {
    assert.equal(typeof w.w, 'number', `${w.id}.w`);
    assert.equal(typeof w.h, 'number', `${w.id}.h`);
    assert.ok(w.w > 0 && w.h > 0, `${w.id} size`);
    assert.equal(typeof w.aspect, 'number', `${w.id}.aspect`);
    assert.match(w.accent, HEX, `${w.id} accent`);
    for (const key of ['L', 'Lsd', 'C', 'a', 'b', 'edge']) {
      assert.equal(typeof w.f[key], 'number', `${w.id}.f.${key}`);
      assert.ok(Number.isFinite(w.f[key]), `${w.id}.f.${key} finite`);
    }
    assert.ok(Array.isArray(w.f.hue), `${w.id}.f.hue`);
  }
});

test('aspect matches w / h', () => {
  for (const w of WORKS) {
    assert.ok(Math.abs(w.aspect - w.w / w.h) <= 0.001, `${w.id} aspect ${w.aspect} vs ${w.w / w.h}`);
  }
});

test('palette has 5 valid colours with shares summing to 1', () => {
  for (const w of WORKS) {
    assert.equal(w.palette.length, 5, `${w.id} palette length`);
    for (const entry of w.palette) {
      assert.match(entry.hex, HEX, `${w.id} palette hex`);
      assert.equal(typeof entry.share, 'number', `${w.id} share`);
    }
    const sum = w.palette.reduce((s, e) => s + e.share, 0);
    assert.ok(Math.abs(sum - 1) <= 0.01, `${w.id} shares sum ${sum}`);
  }
});

test('hue histogram has 12 bins summing to 1, or is all zero', () => {
  for (const w of WORKS) {
    assert.equal(w.f.hue.length, 12, `${w.id} hue length`);
    for (const v of w.f.hue) {
      assert.equal(typeof v, 'number', `${w.id} hue value`);
      assert.ok(v >= 0, `${w.id} hue non-negative`);
    }
    const sum = w.f.hue.reduce((s, v) => s + v, 0);
    const allZero = w.f.hue.every((v) => v === 0);
    assert.ok(allZero || Math.abs(sum - 1) <= 0.02, `${w.id} hue sum ${sum}`);
  }
});

test('every family is represented', () => {
  for (const family of FAMILIES) {
    assert.ok(WORKS.some((w) => w.family === family), `no ${family} work`);
  }
});

test('there is a matter work wide enough for the hero wall', () => {
  assert.ok(
    WORKS.some((w) => w.family === 'matter' && w.aspect >= 1.15),
    'no matter work with aspect >= 1.15',
  );
});

test('work ce1 exists', () => {
  assert.ok(WORKS.some((w) => w.id === 'ce1'));
});
