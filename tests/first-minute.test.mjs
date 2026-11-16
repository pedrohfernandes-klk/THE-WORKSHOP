import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstMinute, FIRST_MINUTE_HINTS } from '../assets/gallery/first-minute.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }

test('hints wait for the moment, show one at a time and never repeat', () => {
  let t = 0; const shown = []; const storage = memory();
  const fm = createFirstMinute({ toast: (s) => shown.push(s), storage, now: () => t });
  fm.update({ entered: false }); assert.equal(shown.length, 0);
  t = 1; fm.update({ entered: true, inHall: true }); assert.equal(shown.length, 0);
  t = 8; fm.update({ entered: true, inHall: true }); assert.deepEqual(shown, [FIRST_MINUTE_HINTS.look]);
  t = 9; fm.update({ entered: true, inHall: false });
  t = 12; fm.update({ entered: true, inHall: false }); assert.equal(shown.length, 1, 'keeps a gap between hints');
  t = 16; fm.update({ entered: true, inHall: false }); assert.equal(shown[1], FIRST_MINUTE_HINTS.people);
  t = 24; fm.update({ entered: true, inHall: false, slaps: 1, busy: true }); assert.equal(shown.length, 2, 'never over a fight or dialogue');
  t = 25; fm.update({ entered: true, inHall: false, slaps: 1 }); assert.equal(shown[2], FIRST_MINUTE_HINTS.porrada);
  for (t = 26; t < 120; t += 1) fm.update({ entered: true, inHall: false, slaps: 1 });
  assert.deepEqual(new Set(shown), new Set(Object.values(FIRST_MINUTE_HINTS)));
  assert.equal(shown.length, 5);
  // A second visit in the same browser shows nothing.
  const again = []; let t2 = 0; const fm2 = createFirstMinute({ toast: (s) => again.push(s), storage, now: () => t2 });
  for (t2 = 0; t2 < 120; t2 += 1) fm2.update({ entered: true, inHall: t2 < 10, slaps: 1 });
  assert.equal(again.length, 0);
});

test('a broken store never stops the hints', () => {
  let t = 0; const shown = [];
  const fm = createFirstMinute({ toast: (s) => shown.push(s), storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, now: () => t });
  for (t = 0; t < 30; t += 1) fm.update({ entered: true, inHall: true });
  assert.ok(shown.includes(FIRST_MINUTE_HINTS.look));
});
