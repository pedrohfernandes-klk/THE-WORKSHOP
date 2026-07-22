import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGardenStudy, formatGardenStudyCaption } from '../assets/js/workshop-garden-study.js';

test('normalizes a captured Garden Study with local working fields', () => {
  const study = normalizeGardenStudy({
    imageDataUrl: 'data:image/png;base64,c3R1ZHk=',
    room: 'maze',
    camera: { position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 } }
  }, () => '2026-07-22T18:00:00.000Z', () => 'garden-study-fixed');

  assert.deepEqual(study, {
    id: 'garden-study-fixed',
    imageDataUrl: 'data:image/png;base64,c3R1ZHk=',
    room: 'maze',
    capturedAt: '2026-07-22T18:00:00.000Z',
    camera: { position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 } },
    title: '',
    notes: '',
    showCaption: true
  });
});

test('rejects a Garden Study without an image capture', () => {
  assert.throws(() => normalizeGardenStudy({ room: 'maze' }), /captured image/);
});

test('formats a removable location caption from the capture record', () => {
  assert.match(formatGardenStudyCaption({ room: 'maze', capturedAt: '2026-07-22T18:00:00.000Z' }), /^Experiment Garden · 22 Jul 2026\s+\d{2}:00$/);
  assert.equal(formatGardenStudyCaption({ room: 'maze', capturedAt: 'not-a-date' }), 'Experiment Garden');
});
