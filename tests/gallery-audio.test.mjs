import { createAudio } from '../assets/gallery/audio.js';
import assert from 'node:assert';
const a = createAudio();
a.setMotion({ speed: 1.6, moving: true }); a.update(0.016); a.lightsOn(0, 5); a.reveal(); a.setMuted(true);
assert.strictEqual(a.muted, true); a.setMuted(false);
await a.start(); await a.start(); a.update(0.016); a.lightsOn(1, 5); a.reveal();
console.log('gallery-audio ok');
