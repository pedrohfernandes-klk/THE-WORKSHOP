// floppies.js — "Disquetes perdidas". Twelve pixel-art floppy disks lost around
// the campus, each slowly spinning with a pixel glint. Walk within ~1 m of one
// (or click it from close by) to pick it up: a chiptune arpeggio, a pixel burst
// and a toast with its absurd file name. All twelve → a giant pixel trophy,
// pixel fireworks and a fanfare; then the disks quietly get lost again.
// Progress lives for this visit only (no storage).
//
// Cost: one InstancedMesh for all twelve disks (1 draw call), one Points burst
// (drawn only while something is bursting) and the trophy (drawn only during
// the celebration). Two procedural CanvasTextures (128×64 and 32×32, nearest).
// update(): twelve matrix writes + twelve distance checks; no allocations.

const EYE = 1.62;            // eye above the floor (BRIEF §6.2)
const REACH2 = 1.15 * 1.15;  // horizontal pick-up radius, squared
const CLICK_REACH = 4.5;     // a click collects from this close (3D distance)
const SIZE = 0.3, THICK = 0.03;

// [x, y (disk centre), z, floor y the visitor stands on to reach it, file name]
const DISKS = [
  [0.0, 0.62, 23.8, 0, 'fotos_ferias_1997_NAO_APAGAR.zip'],          // plaza: pool coping, on the axis out of the hall door
  [-4.25, 0.42, 19.6, 0, 'codigo_do_cadeado_e_1234.txt'],             // plaza: parked in the bike rack
  [-13.0, 0.19, 35.0, 0, 'como_dobrar_lencois_de_elastico.pdf'],      // plaza: under the west bench
  [42.8, 0.67, 29.0, 0, 'receita_bacalhau_FINAL_final2.doc'],         // garden: on the fountain rim (de molho)
  [82.8, 0.52, 43.4, 0.35, 'desculpas_para_chegar_tarde.txt'],        // metro: the far end of the platform
  [17.28, 2.03, 44.0, 0, 'jogo_da_cobra_v0.0.1.exe'],                 // arcade: on top of a cabinet
  [-14.2, 0.57, 40.62, 0, 'musica_de_elevador_REMIX.mid'],            // studio: coffee table, beside the vinyl
  [14.62, 1.1, 63.4, 0, 'trabalho_de_casa_que_o_cao_comeu.doc'],     // school: Sala de Português, whiteboard tray
  [-56.45, -3.03, 37.3, -3.2, 'discurso_de_agradecimento_v3.doc'],   // amphitheatre: back corner of the stage
  [-50.0, 1.37, -30.82, 0, 'tese_v14_agora_e_que_e.doc'],            // ruins: on the fallen roof slab
  [1.72, 8.3, 11.0, 7.2, 'plantas_que_nao_reguei.txt'],              // roof terrace: on the skylight upstand
  [-4.2, 7.57, -16.1, 7.2, 'legendas_desalinhadas.srt'],             // cinema: stage lip under the screen
];
const N = DISKS.length;

// Retro palette (sRGB): four body colours, metal, label, ink.
const BODY = [
  ['#2f5fe0', '#1d3a99', '#6f95ff'],
  ['#e2453f', '#99252a', '#ff8a78'],
  ['#f3b81f', '#b47b0b', '#ffe07a'],
  ['#24b37f', '#127552', '#6fe0b5'],
];
const OUT = '#15161b', METAL = '#c3c9d4', METAL_HI = '#eef1f6', METAL_SH = '#868d9c', SLOT = '#2b2f38';
const LABEL = '#f5eedc', LABEL_SH = '#d6ccb3', INK = '#2f47b5', INK_RED = '#d4373a';
const SPARK = [0xffd34d, 0xff5fa2, 0x3fd8ff, 0x8cff5a, 0xffffff, 0xff8a3d];

export function build(ctx) {
  const { THREE } = ctx;
  const reduced = !!ctx.reducedMotion;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'floppies';

  // ------------------------------------------------------------ textures ---
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function pixelTexture(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    return t;
  }

  // Atlas 128×64: four colour variants side by side; top row = label side,
  // bottom row = hub side. Each face is 32×32 pixels.
  const atlas = canvas(128, 64);
  {
    const g = atlas.getContext('2d');
    for (let v = 0; v < 4; v++) {
      const [body, dark, light] = BODY[v];
      for (let side = 0; side < 2; side++) {
        const ox = v * 32, oy = side * 32;
        const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); };
        r(0, 0, 32, 32, body);
        r(1, 1, 30, 1, light); r(1, 1, 1, 30, light);       // pixel bevel
        r(1, 30, 30, 1, dark); r(30, 1, 1, 30, dark);
        // metal shutter, top centre
        r(9, 0, 14, 12, METAL); r(9, 0, 1, 12, METAL_HI); r(22, 0, 1, 12, METAL_SH); r(9, 11, 14, 1, METAL_SH);
        r(14, 2, 4, 8, SLOT); r(14, 9, 4, 1, '#454b57');
        if (side === 0) {
          // label with scribbled file name
          r(5, 15, 22, 15, LABEL); r(5, 15, 22, 2, light); r(5, 17, 22, 1, body);
          r(26, 15, 1, 15, LABEL_SH); r(5, 29, 22, 1, LABEL_SH);
          r(7, 20, 13, 1, INK); r(21, 20, 3, 1, INK);
          r(7, 23, 9, 1, INK); r(17, 23, 6, 1, INK);
          r(7, 26, 6, 1, INK_RED); r(14, 26, 2, 1, INK_RED);
          r(3, 3, 1, 3, dark); r(4, 4, 1, 1, dark);            // insert arrow
        } else {
          // metal hub with drive holes
          for (let y = 13; y < 27; y++) for (let x = 9; x < 23; x++) {
            const d = Math.hypot(x + 0.5 - 15.5, y + 0.5 - 19.5);
            if (d <= 5.6) r(x, y, 1, 1, d > 4.4 ? METAL_SH : d > 3.2 ? METAL : METAL_HI);
          }
          r(15, 19, 2, 2, SLOT); r(18, 18, 2, 3, SLOT);
          r(3, 26, 3, 3, OUT); r(3, 26, 3, 1, METAL);           // write-protect slider
          r(26, 26, 3, 3, OUT);                                 // HD hole
        }
        // outline
        r(0, 0, 32, 1, OUT); r(0, 31, 32, 1, OUT); r(0, 0, 1, 32, OUT); r(31, 0, 1, 32, OUT);
        // chamfered corner (label side: top right; hub side mirrors it: top left)
        for (let k = 0; k < 3; k++) {
          const xs = side === 0 ? 29 + k : 0, w = side === 0 ? 3 - k : 3 - k;
          g.clearRect(ox + xs, oy + k, w, 1);
          r(side === 0 ? 28 + k : 3 - k, k, 1, 1, OUT);
        }
      }
    }
  }
  const atlasTex = pixelTexture(atlas);

  // Trophy 32×32: a gold cup with a floppy emblem on a wooden plinth that says 12.
  const trophyCanvas = canvas(32, 32);
  {
    const g = trophyCanvas.getContext('2d');
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const GOLD = '#f6c343', GOLD_SH = '#c98d17', GOLD_HI = '#fff2a8';
    r(8, 1, 16, 8, GOLD); r(9, 9, 14, 3, GOLD); r(11, 12, 10, 2, GOLD); r(13, 14, 6, 1, GOLD_SH);   // cup
    r(8, 1, 16, 1, GOLD_HI); r(9, 2, 2, 8, GOLD_HI); r(21, 2, 2, 10, GOLD_SH);
    r(4, 3, 4, 2, GOLD); r(4, 5, 2, 4, GOLD); r(4, 9, 5, 2, GOLD);                                 // handles
    r(24, 3, 4, 2, GOLD); r(26, 5, 2, 4, GOLD_SH); r(23, 9, 5, 2, GOLD_SH);
    r(13, 3, 6, 7, '#2f5fe0'); r(14, 3, 4, 2, METAL); r(14, 6, 4, 3, LABEL);                       // floppy emblem
    r(14, 15, 4, 4, GOLD); r(17, 15, 1, 4, GOLD_SH);                                                // stem
    r(11, 19, 10, 2, GOLD); r(11, 19, 10, 1, GOLD_HI); r(10, 21, 12, 1, GOLD_SH);                   // foot
    r(8, 22, 16, 9, '#6b3f22'); r(8, 30, 16, 1, '#4a2a15'); r(10, 23, 12, 7, '#e9d9a6');            // plinth + plate
    const D = '#3b2a0e';                                                                            // "12", 3×5 pixel font
    r(13, 24, 1, 5, D); r(12, 25, 1, 1, D); r(12, 28, 3, 1, D);
    r(17, 24, 3, 1, D); r(19, 25, 1, 1, D); r(17, 26, 3, 1, D); r(17, 27, 1, 1, D); r(17, 28, 3, 1, D);
    // one-pixel dark outline around everything opaque
    const img = g.getImageData(0, 0, 32, 32), a = img.data, src = new Uint8Array(32 * 32);
    for (let i = 0; i < 1024; i++) src[i] = a[i * 4 + 3] > 0 ? 1 : 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (src[y * 32 + x]) continue;
      const n = (x > 0 && src[y * 32 + x - 1]) || (x < 31 && src[y * 32 + x + 1]) || (y > 0 && src[(y - 1) * 32 + x]) || (y < 31 && src[(y + 1) * 32 + x]);
      if (n) { const o = (y * 32 + x) * 4; a[o] = 0x3b; a[o + 1] = 0x2a; a[o + 2] = 0x0e; a[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    for (const [x, y] of [[2, 1], [29, 15], [1, 18], [28, 1]]) { r(x, y, 1, 1, '#ffffff'); }
  }
  const trophyTex = pixelTexture(trophyCanvas);

  // ---------------------------------------------------------------- disks ---
  const geo = new THREE.BoxGeometry(SIZE, SIZE, THICK);
  {
    // Box faces: +x, −x, +y, −y (edges → one body pixel), +z label side, −z hub side.
    const uv = geo.attributes.uv;
    const eu = 2.5 / 128, ev = 1 - 14.5 / 64;          // a body-coloured pixel of variant 0
    for (let i = 0; i < 16; i++) uv.setXY(i, eu, ev);
    for (let i = 16; i < 20; i++) uv.setXY(i, uv.getX(i) * 0.25, 0.5 + uv.getY(i) * 0.5);
    for (let i = 20; i < 24; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.5);
  }
  const aVariant = new Float32Array(N), aPhase = new Float32Array(N);
  for (let i = 0; i < N; i++) { aVariant[i] = i % 4; aPhase[i] = (i * 0.618) % 1; }
  geo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(aVariant, 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));

  const uTime = { value: 0 };
  const uShine = { value: reduced ? 0 : 1 };
  const diskMat = new THREE.MeshBasicMaterial({ map: atlasTex, alphaTest: 0.5, toneMapped: false });
  diskMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uShine = uShine;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aVariant;\nattribute float aPhase;\nuniform float uTime;\nvarying float vSweep;\nvarying vec2 vFace;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x += aVariant * 0.25;\nvFace = uv * vec2(4.0, 2.0);\nvSweep = fract(uTime * 0.3 + aPhase);');
    // A pixel-stepped diagonal shine sweeps across each disk every ~3.3 s.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uShine;\nvarying float vSweep;\nvarying vec2 vFace;')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '{',
        '  vec2 px = floor(fract(vFace) * 16.0) / 16.0;',
        '  float d = (px.x + 1.0 - px.y) * 0.5;',
        '  float c = vSweep * 8.0 - 0.5;',
        '  float b = (1.0 - step(0.075, abs(d - c))) * uShine;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), b * 0.7);',
        '}',
      ].join('\n'));
  };
  diskMat.customProgramCacheKey = () => 'floppies-disk';

  const disks = new THREE.InstancedMesh(geo, diskMat, N);
  disks.name = 'floppies-disks';
  disks.castShadow = false; disks.receiveShadow = false;
  disks.userData.action = { type: 'custom', id: 'floppy' };
  group.add(disks);
  const mtx = disks.instanceMatrix.array;
  disks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), F = new Float32Array(N);
  const got = new Uint8Array(N);            // collected this round
  const pop = new Float32Array(N).fill(-1); // pick-up animation clock (−1 idle)
  const grow = new Float32Array(N).fill(1); // respawn animation (1 = fully there)
  const armed = new Uint8Array(N).fill(1);  // 0 until the visitor has stepped away (no re-pick on respawn)
  for (let i = 0; i < N; i++) { X[i] = DISKS[i][0]; Y[i] = DISKS[i][1]; Z[i] = DISKS[i][2]; F[i] = DISKS[i][3]; }
  let collected = 0;

  function writeMatrix(i, x, y, z, yaw, s) {
    const o = i * 16, c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s;
    mtx[o] = c; mtx[o + 1] = 0; mtx[o + 2] = -sn; mtx[o + 3] = 0;
    mtx[o + 4] = 0; mtx[o + 5] = s; mtx[o + 6] = 0; mtx[o + 7] = 0;
    mtx[o + 8] = sn; mtx[o + 9] = 0; mtx[o + 10] = c; mtx[o + 11] = 0;
    mtx[o + 12] = x; mtx[o + 13] = y; mtx[o + 14] = z; mtx[o + 15] = 1;
  }
  const hide = (i) => writeMatrix(i, X[i], -500, Z[i], 0, 1e-4);
  const steps = (k, n) => Math.ceil(Math.min(1, Math.max(0, k)) * n) / n;
  for (let i = 0; i < N; i++) writeMatrix(i, X[i], Y[i], Z[i], aPhase[i] * 6.283, 1);
  disks.instanceMatrix.needsUpdate = true;
  disks.computeBoundingSphere();

  // Remember which disk a click ray met (the pick hands back only the mesh).
  let lastHit = -1;
  const baseRaycast = THREE.InstancedMesh.prototype.raycast;
  disks.raycast = function (raycaster, intersects) {
    const n0 = intersects.length;
    baseRaycast.call(this, raycaster, intersects);
    let bd = Infinity;
    for (let k = n0; k < intersects.length; k++) {
      const h = intersects[k];
      if (got[h.instanceId]) { intersects.splice(k, 1); k--; continue; }
      if (h.distance < bd) { bd = h.distance; lastHit = h.instanceId; }
    }
  };

  // ------------------------------------------------------- pixel bursts ---
  const PN = low ? 130 : 200;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pBase = new Float32Array(PN);
  const pGrav = new Float32Array(PN);
  let pNext = 0, alive = 0, colDirty = false;
  const pGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', posAttr); pGeo.setAttribute('aColor', colAttr); pGeo.setAttribute('aSize', sizeAttr);
  const uHalfH = { value: 400 };
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uHalfH },
    vertexShader: [
      'attribute float aSize;', 'attribute vec3 aColor;', 'uniform float uHalfH;', 'varying vec3 vC;',
      'void main() {',
      '  vC = aColor;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  if (aSize <= 0.0 || mv.z > -0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; return; }',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = clamp(floor(aSize * projectionMatrix[1][1] * uHalfH / -mv.z), 2.0, 72.0);',
      '}',
    ].join('\n'),
    fragmentShader: ['varying vec3 vC;', 'void main() {', '  gl_FragColor = vec4(vC, 1.0);', '  #include <colorspace_fragment>', '}'].join('\n'),
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.name = 'floppies-burst';
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 1001;
  points.raycast = () => {};
  group.add(points);

  const tmpC = new THREE.Color();
  function spawn(x, y, z, vx, vy, vz, hex, size, life, grav) {
    const i = pNext; pNext = (pNext + 1) % PN;
    if (pLife[i] <= 0) alive++;
    const o = i * 3;
    pPos[o] = x; pPos[o + 1] = y; pPos[o + 2] = z;
    pVel[o] = vx; pVel[o + 1] = vy; pVel[o + 2] = vz;
    tmpC.setHex(hex);
    pCol[o] = tmpC.r; pCol[o + 1] = tmpC.g; pCol[o + 2] = tmpC.b; colDirty = true;
    pBase[i] = size; pSize[i] = size; pLife[i] = life; pMax[i] = life; pGrav[i] = grav;
    points.visible = true;
  }
  const BODY_HEX = BODY.map((b) => [parseInt(b[0].slice(1), 16), parseInt(b[2].slice(1), 16)]);
  function diskBurst(i) {
    const [c0, c1] = BODY_HEX[i % 4];
    const n = reduced ? 8 : 22;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + Math.random() * 0.3;
      const sp = reduced ? 0.25 : 1.1 + Math.random() * 1.2;
      const hex = k % 4 === 0 ? 0xffffff : k % 4 === 1 ? 0xffd34d : k % 2 ? c0 : c1;
      spawn(X[i], Y[i], Z[i], Math.cos(a) * sp, reduced ? 0.35 : 1.4 + Math.random() * 1.4, Math.sin(a) * sp,
        hex, reduced ? 0.035 : 0.04, reduced ? 1.2 : 0.55 + Math.random() * 0.35, reduced ? 0 : 5.5);
    }
  }
  function firework(x, y, z) {
    const hexA = SPARK[(Math.random() * SPARK.length) | 0], hexB = SPARK[(Math.random() * SPARK.length) | 0];
    const n = low ? 14 : 20;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u);
      const sp = 3.2 + Math.random() * 1.8;
      spawn(x, y, z, Math.cos(a) * s * sp, u * sp + 0.6, Math.sin(a) * s * sp, k & 1 ? hexA : hexB, 0.2, 1.0 + Math.random() * 0.6, 3.2);
    }
    spawn(x, y, z, 0, 0, 0, 0xffffff, 0.55, 0.09, 0);
  }

  // -------------------------------------------------------------- trophy ---
  const TROPHY = 3.6;
  const trophy = new THREE.Mesh(new THREE.PlaneGeometry(TROPHY, TROPHY), new THREE.MeshBasicMaterial({
    map: trophyTex, transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false,
    toneMapped: false, fog: false,   // front side only: it is billboarded, and a double-sided transparent mesh costs two draws
  }));
  trophy.name = 'floppies-trophy';
  trophy.visible = false;
  trophy.renderOrder = 1000;
  trophy.raycast = () => {};
  group.add(trophy);

  // ---------------------------------------------------------------- sound ---
  let pulseWave = null, pulseCtx = null, noiseBuf = null, noiseCtx = null;
  function audioOut() {
    const A = ctx.audio;
    if (!A || A.muted) return null;
    const ac = A.context, bus = A.bus;
    if (!ac || !bus || ac.state !== 'running') return null;
    return { ac, bus };
  }
  function chain(o, vol, ms) {
    const lp = o.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const out = o.ac.createGain(); out.gain.value = vol;
    lp.connect(out); out.connect(o.bus);
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, ms);
    return lp;
  }
  function pulse(ac) {
    if (pulseWave && pulseCtx === ac) return pulseWave;
    const H = 24, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25); // 25 % duty, NES-ish
    pulseWave = ac.createPeriodicWave(re, im); pulseCtx = ac;
    return pulseWave;
  }
  function note(ac, dest, t0, f, dur, peak, type) {
    const o = ac.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(pulse(ac)); else o.type = type;
    o.frequency.setValueAtTime(f, t0);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
    g.gain.setValueAtTime(peak, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  function playPickup(n) {
    const o = audioOut(); if (!o) return;
    const dest = chain(o, 1, 900), t0 = o.ac.currentTime + 0.01;
    const root = 523.25 * Math.pow(2, (MAJ[(n - 1) % 7] + (n > 7 ? 12 : 0)) / 12);
    const arp = [0, 4, 7, 12];
    for (let k = 0; k < 4; k++) note(o.ac, dest, t0 + k * 0.052, root * Math.pow(2, arp[k] / 12), k === 3 ? 0.2 : 0.085, 0.045, 'pulse');
    note(o.ac, dest, t0 + 0.3, root * 2, 0.16, 0.016, 'pulse');            // little echo
  }
  function playFanfare() {
    const o = audioOut(); if (!o) return;
    const dest = chain(o, 1, 2600), t0 = o.ac.currentTime + 0.02, C5 = 523.25;
    const lead = [[0, 0, 0.11], [0.12, 4, 0.11], [0.24, 7, 0.11], [0.36, 12, 0.3], [0.7, 9, 0.11], [0.82, 11, 0.11], [0.94, 12, 0.11], [1.06, 16, 0.62]];
    for (const [t, s, d] of lead) note(o.ac, dest, t0 + t, C5 * Math.pow(2, s / 12), d, 0.045, 'pulse');
    for (const [t, f, d] of [[0, 130.81, 0.62], [0.7, 98, 0.34], [1.06, 130.81, 0.72]]) note(o.ac, dest, t0 + t, f, d, 0.09, 'triangle');
  }
  function playPop() {
    const o = audioOut(); if (!o) return;
    const ac = o.ac;
    if (!noiseBuf || noiseCtx !== ac) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.25), ac.sampleRate); noiseCtx = ac;
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    const dest = chain(o, 1, 700), t0 = ac.currentTime + 0.01;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1400; bp.Q.value = 0.9;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + 0.25);
    note(ac, dest, t0, 92, 0.1, 0.035, 'sine');
  }

  // ------------------------------------------------------------ gameplay ---
  const toast = (s) => { try { ctx.ui && ctx.ui.toast && ctx.ui.toast(s); } catch (e) { /* ui gone */ } };
  let t = 0, cam = null, celeb = -1, fwNext = 0, hintAt = -10;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), base = new THREE.Vector3();
  const FW_X = [-3.6, 3.1, -2.2, 3.9, -4.0, 2.3, 0.4, -1.3, 1.8];
  const FW_Y = [2.6, 3.6, 4.4, 2.2, 3.9, 4.8, 5.2, 2.9, 3.4];

  function collect(i) {
    if (got[i] || celeb >= 0) return;
    got[i] = 1; collected++;
    pop[i] = reduced ? 1 : 0;
    if (reduced) hide(i);
    diskBurst(i);
    const name = DISKS[i][4];
    if (collected < N) {
      playPickup(collected);
      toast(collected === 1
        ? `Disquete 1/${N} — ${name} · há mais ${N - 1} perdidas pelo campus`
        : `Disquete ${collected}/${N} — ${name}`);
    } else {
      toast(`Disquete ${N}/${N} — ${name}`);
      startCelebration();
    }
  }

  function startCelebration() {
    celeb = 0; fwNext = 0;
    playFanfare();
    setTimeout(() => toast(`Coleção completa! 12 disquetes, 17,28 MB de pura nostalgia. O troféu é teu (não cabe no bolso).`), 900);
    if (cam) {
      cam.getWorldDirection(fwd);
      base.copy(cam.position);
    } else { fwd.set(0, 0, -1); base.set(0, EYE, 30); }
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    base.set(base.x + fwd.x * 9, base.y - EYE + 3.0, base.z + fwd.z * 9);   // 9 m ahead, centre 3 m above the floor
    trophy.position.copy(base);
    trophy.scale.setScalar(1e-3);
  }

  function endCelebration() {
    celeb = -1; trophy.visible = false; collected = 0;
    for (let i = 0; i < N; i++) {
      got[i] = 0; pop[i] = -1; grow[i] = reduced ? 1 : 0;
      armed[i] = cam && (cam.position.x - X[i]) ** 2 + (cam.position.z - Z[i]) ** 2 < 9 ? 0 : 1;
    }
    toast('As disquetes perderam-se outra vez. Clássico.');
  }

  function update(dt, frame) {
    if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
    t += dt;
    cam = frame && frame.camera;
    uTime.value = t;
    const p = cam ? cam.position : null;
    const floor = p ? p.y - EYE : -1e6;

    // disks: spin, bob, pop when picked, grow back after a reset
    for (let i = 0; i < N; i++) {
      if (got[i]) {
        if (pop[i] >= 0 && pop[i] < 1) {
          pop[i] += dt / 0.3;
          const k = Math.min(1, pop[i]);
          if (k >= 1) hide(i);
          else writeMatrix(i, X[i], Y[i] + k * 0.35, Z[i], t * 1.1 + aPhase[i] * 6.283 + k * 9, 1 - steps(k, 4) + 0.001);
        }
        continue;
      }
      let s = 1;
      if (grow[i] < 1) { grow[i] = Math.min(1, grow[i] + dt / 0.45); s = steps(grow[i], 5) + 0.001; }
      if (reduced) writeMatrix(i, X[i], Y[i], Z[i], aPhase[i] * 6.283, s);
      else writeMatrix(i, X[i], Y[i] + Math.sin(t * 1.7 + aPhase[i] * 6.283) * (i === 2 ? 0.012 : 0.03), Z[i], t * 1.1 + aPhase[i] * 6.283, s); // #2 bobs less: it sits under a bench
      if (p && celeb < 0) {
        const dx = p.x - X[i], dz = p.z - Z[i], dy = floor - F[i], d2 = dx * dx + dz * dz;
        if (!armed[i]) { if (d2 > 9) armed[i] = 1; }
        else if (d2 < REACH2 && dy > -0.9 && dy < 0.9) collect(i);
      }
    }
    disks.instanceMatrix.needsUpdate = true;

    // celebration: trophy pops in, floats, fireworks around it, pops out, reset
    if (celeb >= 0) {
      celeb += dt;
      const T = celeb;
      if (T >= 0.5 && T < 7.0) {
        trophy.visible = true;
        const k = reduced ? 1 : (T < 1.0 ? steps((T - 0.5) / 0.5, 6) : T > 6.6 ? 1 - steps((T - 6.6) / 0.4, 6) : 1);
        trophy.scale.setScalar(Math.max(1e-3, k));
        trophy.position.y = base.y + (reduced ? 0 : Math.min(1, (T - 0.5) / 6) * 1.0 + Math.sin(T * 2.2) * 0.12);
        if (cam) trophy.rotation.y = Math.atan2(cam.position.x - trophy.position.x, cam.position.z - trophy.position.z);
        if (!reduced && fwNext < FW_X.length && T > 0.8 + fwNext * 0.5) {
          const ox = FW_X[fwNext], oy = FW_Y[fwNext];
          firework(base.x + right.x * ox, base.y - 3.0 + oy + 1.2, base.z + right.z * ox);
          if (fwNext % 2 === 0) playPop();
          fwNext++;
        }
      } else if (T >= 7.0) {
        trophy.visible = false;
        if (T >= 7.4) endCelebration();
      }
    }

    // pixel bursts
    if (alive > 0) {
      uHalfH.value = (ctx.renderer && ctx.renderer.domElement ? ctx.renderer.domElement.height : 800) * 0.5;
      const drag = Math.max(0, 1 - 1.3 * dt);
      for (let i = 0; i < PN; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        const o = i * 3;
        if (pLife[i] <= 0) { pSize[i] = 0; pPos[o + 1] = -1e4; alive--; continue; }
        pVel[o] *= drag; pVel[o + 2] *= drag;
        pVel[o + 1] = pVel[o + 1] * drag - pGrav[i] * dt;
        pPos[o] += pVel[o] * dt; pPos[o + 1] += pVel[o + 1] * dt; pPos[o + 2] += pVel[o + 2] * dt;
        pSize[i] = pBase[i] * steps(pLife[i] / pMax[i], 4);
      }
      posAttr.needsUpdate = true; sizeAttr.needsUpdate = true;
      if (colDirty) { colAttr.needsUpdate = true; colDirty = false; }
      if (alive <= 0) { alive = 0; points.visible = false; }
    }
  }

  function onPick(target) {
    if (target !== disks || celeb >= 0) return;
    let i = lastHit;
    if (i < 0 || got[i]) {               // fall back to the nearest disk still out there
      let bd = Infinity; i = -1;
      if (cam) for (let k = 0; k < N; k++) {
        if (got[k]) continue;
        const d = (cam.position.x - X[k]) ** 2 + (cam.position.y - Y[k]) ** 2 + (cam.position.z - Z[k]) ** 2;
        if (d < bd) { bd = d; i = k; }
      }
    }
    lastHit = -1;
    if (i < 0 || !cam) return;
    const d = Math.hypot(cam.position.x - X[i], cam.position.y - Y[i], cam.position.z - Z[i]);
    if (d <= CLICK_REACH) collect(i);
    else if (t - hintAt > 2.5) { hintAt = t; toast('Uma disquete perdida! Chega-te mais perto para a apanhar.'); }
  }

  // Small handle for QA tools (no effect on the visit).
  group.userData.floppies = { collect, update, get collected() { return collected; }, count: N };

  return { group, regions: [], colliders: [], pickables: [disks], update, onPick };
}
