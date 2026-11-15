// Original physical props for W2. One merged PBR mesh per actor; no new lights,
// images or per-frame allocations. Only the current quest's actor is visible.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createQuestActors(ctx) {
  const { THREE, M } = ctx;
  const group = new THREE.Group(); group.name = 'quest-actors';
  const material = M.get('plaster', { color: 0xffffff, roughness: 0.85 }).clone();
  material.vertexColors = true;
  // A single draw can still distinguish cotton, skin, horn, leather and paper.
  // Object-space micrograin is filtered out before it becomes a sparkling pixel.
  material.map = material.normalMap = material.roughnessMap = material.bumpMap = null;
  material.roughness = 1; material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 questFinish; varying vec2 vQuestFinish; varying vec3 vQuestP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvQuestFinish = questFinish; vQuestP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vQuestFinish; varying vec3 vQuestP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float footprint = max(length(dFdx(vQuestP)), length(dFdy(vQuestP)));
        float grainFade = 1.0 - smoothstep(0.0008, 0.002, footprint);
        float grain = sin(dot(vQuestP, vec3(1731.0, 419.0, 967.0)))
          * sin(dot(vQuestP, vec3(271.0, 1459.0, 653.0)));
        diffuseColor.rgb *= 1.0 + grain * grainFade * vQuestFinish.y * 0.055;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(vQuestFinish.x + grain * grainFade * vQuestFinish.y * 0.06, 0.12, 1.0);`);
  };
  material.customProgramCacheKey = () => 'quest-physical-finishes-v2';
  const finishes = new Map([
    [0xc78f6d, [0.48, 0.14]], // skin
    [0x41a6f6, [0.94, 0.8]], [0x687d6c, [0.93, 0.8]], // cotton
    [0xfff3d6, [0.88, 0.6]], [0xd1bc88, [0.96, 0.8]], // socks, hat
    [0x77553a, [0.58, 0.3]], [0x31312c, [0.96, 0.25]], // sandal straps, rubber
    [0xb48a5d, [0.98, 1]], [0xc49b6e, [0.98, 1]], [0xa97e53, [0.97, 1]], // card
    [0xd8bb86, [0.5, 0.12]], // paper tape
    [0x4b716b, [0.42, 0.25]], [0x4f5664, [0.8, 0.4]], // neck sheen, wing feathers
    [0x1a1c2c, [0.32, 0]], [0xd5cab0, [0.4, 0.12]], // eyes, beak
  ]);
  const tint = new THREE.Color();
  let parts = [];
  function part(g, x, y, z, color, sx = 1, sy = 1, sz = 1, roughness, grain) {
    g.scale(sx, sy, sz); g.translate(x, y, z); M.boxUV(g);
    tint.setHex(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b;
    }
    const profile = finishes.get(color), finishData = new Float32Array(g.attributes.position.count * 2);
    for (let i = 0; i < finishData.length; i += 2) {
      finishData[i] = roughness ?? profile?.[0] ?? 0.8;
      finishData[i + 1] = grain ?? profile?.[1] ?? 0.25;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('questFinish', new THREE.BufferAttribute(finishData, 2)); parts.push(g);
  }
  function box(w, h, d, x, y, z, color, roughness, grain) { part(new THREE.BoxGeometry(w, h, d), x, y, z, color, 1, 1, 1, roughness, grain); }
  function ball(r, x, y, z, color, sx = 1, sy = 1, sz = 1, roughness, grain) {
    part(new THREE.SphereGeometry(r, ctx.quality === 'low' ? 10 : 14, 8), x, y, z, color, sx, sy, sz, roughness, grain);
  }
  function finish(id, label) {
    const geometry = mergeGeometries(parts, false);
    for (let i = 0; i < parts.length; i++) parts[i].dispose();
    parts = [];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'quest-' + id; mesh.visible = false;
    mesh.receiveShadow = true; mesh.castShadow = false; // moving actors, static world shadow map
    mesh.userData.action = { type: 'custom', id, label };
    group.add(mesh); return mesh;
  }

  // Feather volumes, iridescent neck, folded wings; a stolen pastry in its beak.
  ball(0.22, 0, 0.25, 0, 0x777d88, 0.8, 1, 1.4);
  ball(0.12, 0, 0.48, 0.13, 0x4b716b, 0.75, 1.35, 0.85);
  ball(0.115, 0, 0.62, 0.17, 0x777989);
  for (const side of [-1, 1]) {
    ball(0.16, side * 0.14, 0.27, -0.025, 0x4f5664, 0.35, 0.8, 1.5);
    // Overlapping primaries: long, narrow, smooth volumes rather than a painted
    // zigzag. Their pale worn rims and two darker coverts read at arm's length.
    const featherCount = ctx.quality === 'low' ? 4 : 6;
    for (let i = 0; i < featherCount; i++) {
      const feather = new THREE.SphereGeometry(0.035, 8, 4);
      feather.scale(0.3, 0.5, 4.2 - i * 0.18); feather.rotateY(side * (0.12 + i * 0.045));
      part(feather, side * (0.17 + i * 0.009), 0.23 + i * 0.014, -0.13 + i * 0.026,
        i % 2 ? 0x626b78 : 0x89909a, 1, 1, 1, 0.82, 0.45);
    }
    ball(0.125, side * 0.177, 0.31, -0.045, 0x343b47, 0.18, 0.23, 1.05, 0.84, 0.3);
    ball(0.022, side * 0.09, 0.64, 0.23, 0xffcd75);
    ball(0.012, side * 0.1, 0.64, 0.242, 0x1a1c2c, 1, 1, 1, 0.17, 0);
    box(0.018, 0.12, 0.018, side * 0.075, 0.08, 0.03, 0x935d61);
    box(0.04, 0.012, 0.1, side * 0.075, 0.025, 0.06, 0x935d61);
  }
  const beak = new THREE.ConeGeometry(0.035, 0.135, 10);
  beak.rotateX(Math.PI / 2);
  part(beak, 0, 0.6, 0.31, 0xd5cab0, 1, 0.7, 1);
  ball(0.032, 0, 0.627, 0.263, 0xe3dfd3, 0.85, 0.55, 1, 0.64, 0.1); // cere
  box(0.044, 0.002, 0.06, 0, 0.594, 0.295, 0x53504b, 0.64, 0);
  part(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 12), 0, 0.56, 0.35, 0xb98242);
  part(new THREE.CylinderGeometry(0.077, 0.077, 0.008, 12), 0, 0.59, 0.35, 0xffcd75);
  const pigeon = finish('pombo', 'RECUPERAR');

  // A cut sheet, not a solid toy: one continuous shoulder/head silhouette,
  // 18 mm laminated stock, dark exposed cut edges and a scored fold channel.
  const silhouette = new THREE.Shape();
  silhouette.moveTo(-0.54, 0.49);
  for (const [x, y] of [[-0.57, 0.97], [-0.51, 1.17], [-0.3, 1.2], [0.35, 1.16],
    [0.43, 1.28], [0.48, 1.51], [0.54, 1.34], [0.66, 1.31], [0.76, 1.49],
    [0.75, 1.23], [0.83, 1.13], [0.86, 0.96], [0.98, 0.9], [0.95, 0.76],
    [0.66, 0.77], [0.45, 0.66], [0.35, 0.48], [-0.54, 0.49]]) silhouette.lineTo(x, y);
  silhouette.closePath();
  const board = new THREE.ExtrudeGeometry(silhouette, { depth: 0.018, bevelEnabled: false, steps: 1, curveSegments: 1 });
  const boardIndices = new Uint16Array(board.attributes.position.count);
  for (let i = 0; i < boardIndices.length; i++) boardIndices[i] = i;
  board.setIndex(new THREE.BufferAttribute(boardIndices, 1));
  part(board, 0, 0, -0.009, 0xb48a5d);
  const boardColors = board.attributes.color, boardNormals = board.attributes.normal;
  for (let i = 0; i < boardColors.count; i++) {
    if (Math.abs(boardNormals.getZ(i)) < 0.5) {
      boardColors.setXYZ(i, boardColors.getX(i) * 0.7, boardColors.getY(i) * 0.67, boardColors.getZ(i) * 0.63);
    }
  }
  for (let i = 0; i < (ctx.quality === 'low' ? 12 : 24); i++) {
    const x = -0.29 + i * (ctx.quality === 'low' ? 0.05 : 0.025);
    const y = 1.2 - (x + 0.3) / 0.65 * 0.04;
    box(0.008, 0.0018, 0.012, x, y, 0, 0x82603f, 1, 0.6); // cut flute openings
  }
  for (const side of [-1, 1]) {
    box(0.12, 0.5, 0.018, side * 0.37, 0.27, 0, 0xb48a5d);
    box(0.3, 0.018, 0.55, side * 0.37, 0.02, 0, 0xa97e53);
    box(0.024, 0.002, 0.3, side * 0.37, 0.03, 0, 0x82603f, 0.98, 0.6); // slot in foot
    ball(0.045, 0.71, 1.08, side * 0.01, 0xfff3d6, 1, 1, 0.035, 0.9, 0.25);
    ball(0.018, 0.72, 1.08, side * 0.012, 0x1a1c2c, 1, 1, 0.06, 0.85, 0.1);
    box(0.003, 0.64, 0.0018, -0.22, 0.84, side * 0.0097, 0x82603f, 1, 0.8);
    box(0.045, 0.62, 0.001, -0.249, 0.84, side * 0.01, 0xd8bb86);
    box(0.045, 0.62, 0.001, -0.191, 0.84, side * 0.01, 0xd8bb86);
  }
  const bull = finish('touro-cartao', 'SEGURAR');

  // A fictional traveller: cotton shirt, shorts, white socks, sandals, soft hat.
  // The face is invented and the joke is navigation, never the visitor's body.
  part(new THREE.CylinderGeometry(0.21, 0.24, 0.58, 16), 0, 1.08, 0, 0x41a6f6, 1, 1, 0.76);
  part(new THREE.CylinderGeometry(0.225, 0.22, 0.17, 16), 0, 0.81, 0, 0x687d6c, 1, 1, 0.74);
  box(0.024, 0.45, 0.007, 0, 1.075, 0.179, 0x489bbd, 0.94, 0.8); // sewn placket
  box(0.087, 0.005, 0.007, -0.105, 1.17, 0.17, 0x31738d, 0.95, 0.8); // pocket opening
  for (let i = 0; i < 4; i++) ball(0.009, 0, 0.94 + i * 0.1, 0.185, 0xe5e2d2, 1, 1, 0.4, 0.38, 0);
  for (const side of [-1, 1]) {
    const collar = new THREE.BoxGeometry(0.1, 0.08, 0.012);
    collar.rotateZ(side * 0.45);
    part(collar, side * 0.065, 1.345, 0.13, 0x55a7c7, 1, 1, 1, 0.95, 0.8);
  }
  ball(0.18, 0, 1.56, 0, 0xc78f6d, 0.9, 1.14, 0.95);
  ball(0.055, 0, 1.55, 0.17, 0xc78f6d, 0.75, 0.8, 1);
  part(new THREE.CylinderGeometry(0.21, 0.23, 0.025, 16), 0, 1.74, 0, 0xd1bc88);
  part(new THREE.CylinderGeometry(0.14, 0.17, 0.13, 16), 0, 1.81, 0, 0xd1bc88);
  for (const side of [-1, 1]) {
    ball(0.08, side * 0.29, 1.1, 0, 0x41a6f6, 1, 1.6, 1);
    ball(0.055, side * 0.32, 0.88, 0.015, 0xc78f6d, 1, 2.2, 1);
    part(new THREE.CylinderGeometry(0.113, 0.105, 0.29, 12), side * 0.115, 0.68, 0, 0x687d6c, 1, 1, 1.2);
    part(new THREE.CylinderGeometry(0.107, 0.107, 0.018, 12), side * 0.115, 0.542, 0, 0x596d5d, 1, 1, 1.2, 0.96, 0.8); // folded hem
    ball(0.07, side * 0.12, 0.46, 0, 0xc78f6d, 1, 2, 1);
    part(new THREE.CylinderGeometry(0.071, 0.061, 0.2, 12), side * 0.12, 0.2, 0, 0xfff3d6);
    part(new THREE.CylinderGeometry(0.074, 0.074, 0.022, 12), side * 0.12, 0.29, 0, 0xe1dece, 1, 1, 1, 0.96, 1); // ribbed cuff
    ball(0.09, side * 0.12, 0.078, 0.05, 0xfff3d6, 0.8, 0.55, 1.55);
    ball(0.09, side * 0.12, 0.026, 0.05, 0x31312c, 0.92, 0.18, 1.65); // curved rubber sole
    ball(0.085, side * 0.12, 0.045, 0.05, 0x77553a, 0.9, 0.13, 1.62); // leather footbed
    box(0.165, 0.045, 0.07, side * 0.12, 0.105, 0.11, 0x77553a);
    box(0.155, 0.035, 0.04, side * 0.12, 0.13, -0.008, 0x77553a);
    box(0.018, 0.047, 0.038, side * 0.202, 0.112, 0.11, 0xb3ac91, 0.3, 0); // buckle
    ball(0.035, side * 0.07, 1.61, 0.15, 0xfff3d6, 1, 1, 0.5, 0.25, 0);
    ball(0.016, side * 0.07, 1.61, 0.168, 0x1a1c2c, 1, 1, 0.5, 0.16, 0);
  }
  box(0.08, 0.025, 0.016, 0, 1.46, 0.162, 0x825147);
  box(0.2, 0.15, 0.08, 0, 1.07, 0.2, 0x1a1c2c);
  const tourist = finish('turista', 'AJUDAR');

  // Breadcrumbs are the visitor's actual path, including height on the ramp.
  // No straight-line shortcut through the fountain or through hedges.
  const CAP = 512, trail = new Float32Array(CAP * 3);
  let head = 0, tail = 0, follow = false, lastX = 8, lastZ = 41;
  let birdMoving = false, bullFall = 0, current = '';
  function reset() {
    pigeon.visible = bull.visible = tourist.visible = false;
    follow = birdMoving = false; bullFall = 0; current = '';
    bull.rotation.set(0, 0, 0); tourist.rotation.set(0, 0, 0);
  }
  function effect(name, camera) {
    if (name === 'roubar-nata') {
      pigeon.visible = true; pigeon.position.set(68, 0.75, 29); birdMoving = true; current = 'pombo';
    } else if (name === 'recuperar-nata') { pigeon.visible = false; current = ''; }
    else if (name === 'touro') { bull.visible = true; bull.position.set(14, 0, 36); current = 'touro'; }
    else if (name === 'touro-cai') bullFall = 0.001;
    else if (name === 'turista') { tourist.visible = true; tourist.position.set(8, 0, 41); current = 'turista'; }
    else if (name === 'acompanhar' && camera) {
      follow = true; head = tail = 0;
      lastX = tourist.position.x; lastZ = tourist.position.z;
    }
  }
  function update(dt, camera) {
    const p = camera.position;
    if (current === 'pombo') {
      const dx = p.x - pigeon.position.x, dz = p.z - pigeon.position.z;
      if (dx * dx + dz * dz > 1600) return;
      if (birdMoving) {
        pigeon.position.x = Math.max(60, pigeon.position.x - dt * 2.6);
        pigeon.rotation.y = -Math.PI / 2;
        if (pigeon.position.x <= 60) birdMoving = false;
      }
    } else if (current === 'touro' && bullFall > 0) {
      const dx = p.x - 14, dz = p.z - 36;
      if (dx * dx + dz * dz > 1600) return;
      bullFall = Math.min(1, bullFall + dt * 1.8);
      bull.rotation.x = ctx.reducedMotion ? 0.12 : -bullFall * 1.25;
    } else if (current === 'turista' && follow) {
      const tx = p.x - tourist.position.x, tz = p.z - tourist.position.z;
      if (tx * tx + tz * tz > 1600) return;
      const dx = p.x - lastX, dz = p.z - lastZ;
      if (dx * dx + dz * dz >= 0.36 && dx * dx + dz * dz < 64) {
        const next = (tail + 1) % CAP;
        if (next !== head) {
          trail[tail * 3] = p.x; trail[tail * 3 + 1] = Math.max(-0.2, p.y - 1.62);
          trail[tail * 3 + 2] = p.z; tail = next;
          lastX = p.x; lastZ = p.z;
        }
      }
      if (head !== tail) {
        const i = head * 3, ax = trail[i] - tourist.position.x, az = trail[i + 2] - tourist.position.z;
        const d = Math.sqrt(ax * ax + az * az);
        const step = Math.min(d, dt * 1.75);
        if (d > 0.001) {
          tourist.position.x += ax / d * step; tourist.position.z += az / d * step;
          tourist.rotation.y = Math.atan2(ax, az);
          tourist.position.y += (trail[i + 1] - tourist.position.y) * Math.min(1, dt * 8);
        }
        if (d <= step + 0.03) head = (head + 1) % CAP;
      }
    }
  }
  function near(x, z, radius) {
    const dx = tourist.position.x - x, dz = tourist.position.z - z;
    return tourist.visible && dx * dx + dz * dz <= radius * radius;
  }
  return { group, pigeon, bull, tourist, pickables: [pigeon, bull, tourist], reset, effect, update, near };
}
