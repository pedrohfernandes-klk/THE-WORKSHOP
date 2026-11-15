// Mercado: neighbourhood stalls east of the tram. Seven material batches, no lights.
// The level crossing joins the existing platform at z40–43; no train collider exists.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low', Y = 0.35;
  const group = new THREE.Group(); group.name = 'mercado';
  const colliders = [], pickables = [], seats = [];
  const regions = [
    { minX: 83.8, maxX: 93, minZ: 40, maxZ: 43, y: Y },
    { minX: 92, maxX: 112, minZ: 20, maxZ: 44, y: Y },
  ];
  const mats = [
    M.get('paving', { color: 0xd9cbb3, roughness: 0.85 }).clone(),
    M.get('oak', { color: 0xc59a64, roughness: 0.75 }).clone(),
    M.get('steel', { color: 0xb9c5c7, roughness: 0.32 }).clone(),
    M.get('plaster', { color: 0xffffff, roughness: 0.48 }).clone(),
    M.get('fabric', { color: 0xffffff, roughness: 0.9 }).clone(),
    M.get('steel', { color: 0x253438, roughness: 0.65 }).clone(),
    M.get('plaster', { color: 0xffe5b3, roughness: 0.35 }).clone(),
  ];
  mats[6].emissive.set(0xffbc70); mats[6].emissiveIntensity = 0.05;
  const parts = mats.map(() => []);
  const colour = new THREE.Color();
  function add(k, g, x, y, z, tint = 0xffffff) {
    g.translate(x, y, z); M.boxUV(g);
    const c = new Float32Array(g.attributes.position.count * 3); colour.set(tint);
    for (let i = 0; i < c.length; i += 3) { c[i] = colour.r; c[i + 1] = colour.g; c[i + 2] = colour.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts[k].push(g);
  }
  function box(k, w, h, d, x, y, z, tint) { add(k, new THREE.BoxGeometry(w, h, d), x, y, z, tint); }
  function ball(k, rx, ry, rz, x, y, z, tint) {
    const g = new THREE.SphereGeometry(1, low ? 8 : 10, low ? 5 : 6); g.scale(rx, ry, rz); add(k, g, x, y, z, tint);
  }
  function col(x, z, w, d, h) { colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: Y, maxY: Y + h }); }
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  function proxy(id, label, x, y, z, w, h, d) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
    p.position.set(x, y, z); p.name = 'mercado-' + id;
    p.userData.action = { type: 'custom', id, label }; group.add(p); pickables.push(p); return p;
  }
  // Self-supported stone apron and a flush crossing, with pale tactile bands.
  box(0, 20, 0.8, 24, 102, Y - 0.4, 32);
  box(0, 7.42, 0.18, 3, 88.29, Y - 0.09, 41.5);
  for (const x of [84.5, 88.2]) for (let z = 40.2; z < 43; z += 0.3) box(3, 0.35, 0.012, 0.14, x, Y + 0.006, z, 0xffcd75);
  // Four open stalls: circulation is a broad loop, never a corridor of props.
  const stalls = [[96, 24], [106, 24], [96, 35], [106, 35]];
  for (let n = 0; n < stalls.length; n++) {
    const [x, z] = stalls[n];
    box(1, 4.2, 0.13, 1.5, x, Y + 0.95, z);
    for (const dx of [-1.85, 1.85]) {
      box(1, 0.12, 0.9, 1.25, x + dx, Y + 0.45, z);
      for (const dz of [-0.75, 0.75]) box(5, 0.055, 2.75, 0.055, x + dx, Y + 1.375, z + dz);
    }
    box(1, 4.1, 0.42, 0.07, x, Y + 0.65, z - 0.7);
    col(x, z, 4.2, 1.6, 1.1);
    // Real woven stripes, all canopies one batch. Wind flexes only the free hem.
    for (let stripe = 0; stripe < 10; stripe++) {
      const g = new THREE.BoxGeometry(0.46, 0.04, 2.4, 1, 1, 6); g.rotateX(-0.08);
      add(4, g, x - 2.07 + stripe * 0.46, Y + 2.65, z, stripe % 2 ? 0xfff3d6 : n % 2 ? 0x578678 : 0xb85f46);
    }
    box(6, 0.75, 0.07, 0.12, x, Y + 2.48, z);
    if (n !== 1) {
      for (let c = 0; c < 3; c++) {
        const cx = x - 1.3 + c * 1.3;
        box(1, 1.08, 0.045, 0.95, cx, Y + 1.04, z);
        for (const dz of [-0.46, 0.46]) for (const dy of [1.1, 1.22]) box(1, 1.1, 0.075, 0.035, cx, Y + dy, z + dz);
        for (const dx of [-0.54, 0.54]) box(1, 0.035, 0.27, 0.95, cx + dx, Y + 1.15, z);
        if (n === 2 && c === 1) {
          // A little pastry box shared with W2; its stable action id is 'nata'.
          box(3, 0.9, 0.07, 0.7, cx, Y + 1.11, z, 0xfff3d6);
          for (let f = 0; f < 4; f++) {
            const fx = cx - 0.22 + (f % 2) * 0.44, fz = z - 0.18 + ((f / 2) | 0) * 0.36;
            add(3, new THREE.CylinderGeometry(0.13, 0.1, 0.08, 10), fx, Y + 1.18, fz, 0xb77c38);
            add(3, new THREE.CylinderGeometry(0.105, 0.105, 0.012, 10), fx, Y + 1.225, fz, 0xffcd75);
          }
          continue;
        }
        const count = low ? 3 : 6;
        for (let f = 0; f < count; f++) {
          const fx = cx - 0.32 + (f % 3) * 0.32, fz = z - 0.21 + ((f / 3) | 0) * 0.4;
          ball(3, 0.145, n === 2 ? 0.2 : 0.14, 0.145, fx, Y + 1.22, fz, n === 0 ? 0xd58431 : n === 2 ? 0x91a24e : 0xb84539);
          box(5, 0.02, 0.055, 0.02, fx, Y + (n === 2 ? 1.43 : 1.37), fz);
        }
      }
    } else {
      // Fishmonger: brushed steel tray, crushed ice and rounded silver fish.
      box(2, 3.6, 0.12, 1.2, x, Y + 1.06, z);
      box(3, 3.45, 0.07, 1.05, x, Y + 1.15, z, 0xe9eff0);
      for (let f = 0; f < (low ? 4 : 7); f++) {
        const fx = x - 1.45 + f * (low ? 0.9 : 0.48);
        ball(2, 0.11, 0.07, 0.32, fx, Y + 1.23, z);
        const tail = new THREE.ConeGeometry(0.13, 0.2, 3); tail.rotateX(Math.PI / 2); tail.scale(1, 0.35, 1);
        add(2, tail, fx, Y + 1.23, z + 0.36);
        ball(5, 0.018, 0.018, 0.018, fx + 0.07, Y + 1.26, z - 0.19);
      }
    }
  }
  // Mechanical balance on a separate plinth, with a deadpan answer on click.
  box(1, 0.9, 0.85, 0.8, 101, Y + 0.425, 29);
  box(2, 0.6, 0.08, 0.5, 101, Y + 0.9, 29);
  box(5, 0.08, 0.5, 0.08, 101, Y + 1.16, 29);
  box(2, 0.8, 0.03, 0.42, 101, Y + 1.43, 29);
  col(101, 29, 0.9, 0.8, 1.5);
  proxy('balanca', 'PESAR', 101, Y + 1.1, 29, 1, 0.9, 0.9);
  proxy('fruta', 'REGATEAR', 96, Y + 1.15, 24, 4.3, 0.5, 1.7);
  proxy('peixe', 'PERGUNTAR', 106, Y + 1.17, 24, 4.3, 0.5, 1.7);
  proxy('nata', 'RECOLHER', 96, Y + 1.19, 35, 1.15, 0.4, 1.05);
  // Pigeons: smooth bodies, iridescent collars, beaks, eyes and paired feet.
  for (let i = 0; i < (low ? 3 : 5); i++) {
    const x = 100 + i * 0.65, z = 39.1 + (i % 2) * 0.45;
    ball(3, 0.11, 0.15, 0.19, x, Y + 0.22, z, 0x77848a);
    ball(3, 0.065, 0.08, 0.07, x, Y + 0.4, z - 0.1, 0x506d66);
    ball(5, 0.008, 0.008, 0.008, x + 0.055, Y + 0.415, z - 0.13);
    box(3, 0.025, 0.018, 0.06, x, Y + 0.38, z - 0.18, 0xb29471);
    for (const dx of [-0.04, 0.04]) box(3, 0.018, 0.09, 0.045, x + dx, Y + 0.045, z, 0xa76c61);
  }
  proxy('pombos', 'NEGOCIAR', 101.3, Y + 0.24, 39.3, 3.2, 0.5, 1.2);
  // Bench faces the market; its front remains clear when standing up.
  box(1, 2.4, 0.09, 0.55, 109, Y + 0.46, 41.8);
  box(1, 2.4, 0.45, 0.07, 109, Y + 0.73, 42.04);
  for (const x of [108.1, 109.9]) box(5, 0.08, 0.46, 0.5, x, Y + 0.23, 41.8);
  col(109, 41.8, 2.4, 0.6, 1);
  const seat = { x: 109, y: Y + 0.505, z: 41.76, facing: [0, -1] }; seats.push(seat);
  const bench = proxy('banco', 'SENTAR', 109, Y + 0.5, 41.8, 2.45, 1, 0.65);
  bench.userData.action = { type: 'sit', label: 'SENTAR', seats };
  const wind = { value: 0 }, time = { value: 0 };
  mats[4].onBeforeCompile = shader => {
    shader.uniforms.marketWind = wind; shader.uniforms.marketTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float marketWind, marketTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += marketWind * sin(position.x * 3.1 + marketTime * 5.0) * sin(position.z * 2.7 + marketTime * 3.0);');
  };
  mats[4].customProgramCacheKey = () => 'mercado-wind-v1';
  for (let k = 0; k < mats.length; k++) {
    mats[k].vertexColors = true;
    const geo = mergeGeometries(parts[k], false); for (const p of parts[k]) p.dispose();
    const mesh = new THREE.Mesh(geo, mats[k]); mesh.name = 'mercado-batch-' + k;
    mesh.castShadow = k !== 4 && k !== 6; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  let clock = 0, lastPick = -10;
  function update(dt, frame) {
    if (!frame || !frame.camera) return;
    const p = frame.camera.position, dx = p.x - 102, dz = p.z - 32;
    if (dx * dx + dz * dz > 1600) return;
    clock += Math.min(0.1, Math.max(0, dt || 0));
    const weather = ctx.scene?.userData?.weather || frame.weather;
    const mode = typeof weather === 'string' ? weather : weather?.mode;
    const night = weather ? Math.max(0, Math.min(1, weather.nightK ?? (weather.night || mode === 'night' ? 1 : 0))) : 0;
    const storm = weather ? Math.max(0, Math.min(1, weather.rainK ?? (weather.storm || mode === 'storm' ? 1 : 0))) : 0;
    time.value = clock; wind.value = ctx.reducedMotion ? 0 : storm * 0.065;
    mats[6].emissiveIntensity = 0.05 + night * 2.2;
  }
  const lines = {
    fruta: ['Leve três. Decida amanhã.', 'Está madura. A decisão também.'],
    peixe: ['Fresco. Sem opinião sobre reuniões.', 'Hoje ninguém vende conversa fiada.'],
    balanca: ['Pesa fruta. Não pesa decisões.', 'A pressa não vem ao quilo.'],
    pombos: ['A comissão exige mais migalhas.', 'Reunião adiada. Falta o pão.'],
    nata: ['Vai depressa. Arrefece a coragem.', 'Uma nata. Zero reuniões.'],
  };
  const turns = { fruta: 0, peixe: 0, balanca: 0, pombos: 0, nata: 0 };
  function onPick(object) {
    const id = object?.userData?.action?.id;
    if (!lines[id] || clock - lastPick < 0.25) return;
    lastPick = clock; ctx.ui?.toast?.(lines[id][turns[id]++ % 2]);
  }
  return { group, regions, colliders, pickables, seats, update, onPick };
}
