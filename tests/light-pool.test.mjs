import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLightPool } from '../assets/gallery/light-pool.js';

const renderer = () => ({ shadowMap: { enabled: false, type: 0, autoUpdate: true } });
const count = (scene, pred) => { let n = 0; scene.traverse((o) => { if (o.isLight && pred(o)) n++; }); return n; };

test('the reserved light counts hold from boot to a full campus', () => {
  const scene = new THREE.Scene(); const pool = createLightPool(THREE, scene, renderer());
  const before = { hemi: count(scene, (l) => l.isHemisphereLight), dir: count(scene, (l) => l.isDirectionalLight) };
  const space = new THREE.Group(); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true; sun.name = 'sun';
  const sky = new THREE.HemisphereLight(0xffffff, 0x334455, 1); sky.position.set(0, 3, 60);
  const lamp = new THREE.PointLight(0xffcc88, 3, 8);
  space.add(sun, sky, lamp);
  pool.prepare(space); scene.add(space); pool.adoptScene();
  assert.equal(count(scene, (l) => l.isHemisphereLight), before.hemi);
  assert.equal(count(scene, (l) => l.isDirectionalLight), before.dir);
  assert.equal(lamp.visible, false, 'point lights are virtual');
});

test('an adopted hemisphere light leaves its space for the scene root, keeping its sky direction', () => {
  const scene = new THREE.Scene(); const pool = createLightPool(THREE, scene, renderer());
  const school = new THREE.Group(); school.position.set(10, 0, -4);
  const sky = new THREE.HemisphereLight(0xffffff, 0x334455, 1); sky.position.set(0, 3, 60); school.add(sky);
  scene.add(school); scene.updateMatrixWorld(true);
  const world = sky.getWorldPosition(new THREE.Vector3());
  pool.adoptScene();
  assert.equal(sky.parent, scene, 'a pass that hides the school group still counts the light');
  assert.ok(sky.getWorldPosition(new THREE.Vector3()).distanceTo(world) < 1e-9);
  school.visible = false;   // the hall-floor mirror hides every world group but the environment
  let visibleHemi = 0; scene.traverseVisible((o) => { if (o.isHemisphereLight) visibleHemi++; });
  assert.equal(visibleHemi, 2, 'the mirror pass sees the same two hemisphere lights as the main pass');
});
