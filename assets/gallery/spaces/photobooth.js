// photobooth.js — "Cabine de fotos": a restored vintage photo booth on the plaza, its back to the
// south boundary hedge just west of the school gate, facing the hall (BRIEF §6.2).
// Click it: three beeps, a flash, and it develops a four-frame strip of the visitor's own view —
// the scene rendered once into a small target, ordered-dithered (Bayer 4×4) into four 4-colour
// palettes, set in a pixel frame with the date — handed over as a PNG download, while a little
// paper strip slides out of the delivery slot and develops from white. Idle cost: a few timers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// World placement: centre of the footprint, and yaw (local +z = front → world −z, toward the hall).
const CX = -6.6, CZ = 50.95, YAW = Math.PI;

// The photo: rendered at 2× and box-filtered down to SHOT_W × SHOT_H, then dithered.
const SHOT_W = 320, SHOT_H = 240;
const BEEP_GAP = 0.9;                       // s between countdown beeps; the flash follows the third
const GLOW = 1.65;                          // backlit sign/panels brightness (tone-mapped)

// Strip layout (base pixels; the PNG is this ×2, nearest-neighbour).
const SW = 348, SH = 1066, PX = 14, PY0 = 34, GAP = 10;

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL_HEX = [
  ['#15120e', '#57514a', '#a59f94', '#f4efe6'],   // prata (silver gelatin)
  ['#2a1c13', '#6e4a32', '#b98d63', '#f0e0c2'],   // sépia
  ['#0d1f3b', '#24538f', '#86acd3', '#eaf1f4'],   // cianótipo
  ['#0f2a1b', '#3b6a43', '#90b46a', '#dfe9b9'],   // musgo (the handheld-camera green)
];
const PAL = PAL_HEX.map((p) => p.map(rgb));
const PAPER = rgb('#f4efe6'), INK = rgb('#15120e'), OXB = rgb('#9c3d33');
const OX_HEX = '#8a2a22';
const SANS = '"Instrument Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// 3×5 pixel font: five rows, one octal digit per row (4 = left, 2 = middle, 1 = right pixel).
const FONT = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755',
  I: '72227', J: '11152', K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644',
  Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
  Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '71747', 3: '71317', 4: '55711', 5: '74717',
  6: '74757', 7: '71222', 8: '75757', 9: '75717', '.': '00002', ':': '02020', '·': '00200', '-': '00700', ' ': '00000',
};

const TONEMAP_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// Same ACES fit and exposure as the renderer's OutputPass, then sRGB — the photo matches the view.
const TONEMAP_FS = `
uniform sampler2D tSrc; uniform float uExposure; varying vec2 vUv;
vec3 fit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * (uExposure / 0.6);
  c = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
  c = clamp(mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * fit(c), 0.0, 1.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  gl_FragColor = vec4(c, 1.0);
}`;

export function build(ctx) {
  const { M, quality } = ctx;
  const low = quality === 'low';
  const reduced = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'photobooth';
  const booth = new THREE.Group();            // local frame: origin at floor centre, front = +z
  booth.position.set(CX, 0, CZ);
  booth.rotation.y = YAW;
  group.add(booth);

  // ---------- body: enamel cabinet, one vertex-coloured material ----------
  const C = (h) => new THREE.Color(h);       // sRGB hex → linear working space
  const CREAM = C('#e4d9c2'), OX = C('#7d2620'), PLINTH = C('#191613'), LINER = C('#8a8378');
  const FLOOR = C('#2b2723'), SEAT = C('#141111'), SLOT = C('#060606'), GLASS = C('#0b0c0e');
  const paint = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const boxG = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  };
  const bodyG = [];
  const bb = (c, x0, x1, y0, y1, z0, z1) => bodyG.push(paint(boxG(x0, x1, y0, y1, z0, z1), c));
  const bp = (c, w, h, x, y, z, rx = 0, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    bodyG.push(paint(g, c));
  };
  const BELT = 0.55;
  bb(PLINTH, -0.72, 0.72, 0, 0.07, -0.40, 0.40);
  // machine block (right half seen from the front)
  bb(OX, 0.02, 0.75, 0.07, BELT, -0.425, 0.425);
  bb(CREAM, 0.02, 0.75, BELT, 1.95, -0.425, 0.425);
  // cabin shell: back, left side, roof, front jambs, header, step
  bb(OX, -0.75, 0.02, 0.07, BELT, -0.425, -0.395); bb(CREAM, -0.75, 0.02, BELT, 1.95, -0.425, -0.395);
  bb(OX, -0.75, -0.72, 0.07, BELT, -0.395, 0.425); bb(CREAM, -0.75, -0.72, BELT, 1.95, -0.395, 0.425);
  bb(CREAM, -0.75, 0.02, 1.92, 1.95, -0.395, 0.425);
  bb(OX, -0.72, -0.68, 0.07, BELT, 0.385, 0.425); bb(CREAM, -0.72, -0.68, BELT, 1.92, 0.385, 0.425);
  bb(OX, -0.05, 0.02, 0.07, BELT, 0.385, 0.425); bb(CREAM, -0.05, 0.02, BELT, 1.92, 0.385, 0.425);
  bb(CREAM, -0.68, -0.05, 1.80, 1.92, 0.385, 0.425);
  bb(OX, -0.68, -0.05, 0.07, 0.13, 0.385, 0.425);
  bb(FLOOR, -0.72, 0.02, 0.07, 0.125, -0.395, 0.385);
  // marquee housing
  bb(OX, -0.75, 0.75, 1.985, 2.335, -0.14, 0.30);
  // coin slot, delivery slot
  bb(SLOT, 0.197, 0.203, 0.735, 0.775, 0.437, 0.4385);
  bb(SLOT, 0.44, 0.60, 0.744, 0.752, 0.425, 0.4265);
  // interior: liner, camera window, stool seat
  if (!low) {
    const IY = (0.125 + 1.92) / 2, IH = 1.92 - 0.125;
    bp(LINER, 0.74, IH, -0.35, IY, -0.3935);
    bp(LINER, 0.78, IH, -0.7185, IY, -0.005, 0, Math.PI / 2);
    bp(LINER, 0.78, IH, 0.0185, IY, -0.005, 0, -Math.PI / 2);
    bp(LINER, 0.74, 0.78, -0.35, 1.9185, -0.005, Math.PI / 2);
    bb(GLASS, -0.50, -0.22, 1.02, 1.22, -0.3935, -0.391);
    const seat = new THREE.CylinderGeometry(0.17, 0.17, 0.055, 24);
    seat.translate(-0.36, 0.545, -0.06);
    bodyG.push(paint(seat, SEAT));
    // ventilation louvres on the machine's outer side
    for (let k = 0; k < 6; k++) bb(SLOT, 0.75, 0.752, 1.60 + k * 0.028, 1.612 + k * 0.028, -0.2, 0.2);
  }
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.34, metalness: 0 });
  bodyMat.name = 'photobooth-enamel';
  const body = new THREE.Mesh(mergeGeometries(bodyG), bodyMat);
  body.castShadow = true; body.receiveShadow = true;
  booth.add(body);
  for (const g of bodyG) g.dispose();

  // ---------- trim: chrome — the photographed plate's roughness/normal, without its dark albedo ----------
  const steel = M.get('steel', { color: 0xe6e9ec, roughness: 0.22, tile: 0.35 }).clone();
  steel.map = null; steel.metalnessMap = null;
  steel.metalness = 1; steel.roughness = 0.3; steel.color.set(0xd2d5d9);
  steel.name = 'photobooth-chrome';
  const trimG = [];
  const tb = (x0, x1, y0, y1, z0, z1) => trimG.push(boxG(x0, x1, y0, y1, z0, z1));
  const tc = (r, h, x, y, z, axis = 'y', seg = 16) => {
    const g = new THREE.CylinderGeometry(r, r, h, low ? 8 : seg);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    trimG.push(g);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb(sx * 0.75 - 0.011, sx * 0.75 + 0.011, 0.07, 1.95, sz * 0.425 - 0.011, sz * 0.425 + 0.011);
  // belt line
  const b0 = BELT - 0.01, b1 = BELT + 0.01;
  tb(0.02, 0.739, b0, b1, 0.425, 0.433); tb(-0.739, -0.68, b0, b1, 0.425, 0.433); tb(-0.05, 0.02, b0, b1, 0.425, 0.433);
  tb(0.75, 0.758, b0, b1, -0.414, 0.414); tb(-0.758, -0.75, b0, b1, -0.414, 0.414); tb(-0.739, 0.739, b0, b1, -0.433, -0.425);
  // roof lip and marquee frame
  tb(-0.765, 0.765, 1.95, 1.985, -0.44, 0.44);
  tb(-0.765, 0.765, 2.335, 2.355, -0.155, 0.315);
  tb(-0.75, 0.75, 2.30, 2.335, 0.30, 0.312); tb(-0.75, 0.75, 1.985, 2.02, 0.30, 0.312);
  tb(-0.75, -0.715, 2.02, 2.30, 0.30, 0.312); tb(0.715, 0.75, 2.02, 2.30, 0.30, 0.312);
  // curtain rod
  tc(0.009, 0.63, -0.365, 1.785, 0.398, 'x');
  // panel bezels (sample display, instructions)
  for (const [y0, y1] of [[1.27, 1.61], [0.86, 1.20]]) {
    tb(0.087, 0.683, y1, y1 + 0.018, 0.425, 0.437); tb(0.087, 0.683, y0 - 0.018, y0, 0.425, 0.437);
    tb(0.087, 0.105, y0, y1, 0.425, 0.437); tb(0.665, 0.683, y0, y1, 0.425, 0.437);
  }
  // countdown lamp bezels, coin plate + return button, delivery hood, grab bar
  for (let i = 0; i < 3; i++) tc(0.03, 0.014, 0.24 + i * 0.145, 1.755, 0.432, 'z', 24);
  tb(0.13, 0.27, 0.66, 0.82, 0.425, 0.437);
  tc(0.013, 0.012, 0.2, 0.69, 0.443, 'z');
  tb(0.43, 0.61, 0.752, 0.79, 0.425, 0.462);
  tc(0.011, 0.5, -0.015, 1.15, 0.452);
  tc(0.007, 0.03, -0.015, 0.93, 0.437, 'z'); tc(0.007, 0.03, -0.015, 1.37, 0.437, 'z');
  if (!low) {
    // stool: post and foot
    tc(0.025, 0.40, -0.36, 0.32, -0.06);
    tc(0.16, 0.02, -0.36, 0.135, -0.06, 'y', 24);
  }
  for (const g of trimG) M.boxUV(g);
  const trim = new THREE.Mesh(mergeGeometries(trimG), steel);
  trim.castShadow = true; trim.receiveShadow = true;
  booth.add(trim);
  for (const g of trimG) g.dispose();

  // ---------- curtain: pleated red velvet, drawn most of the way across ----------
  {
    const x0 = -0.665, x1 = -0.17, y0 = 0.40, y1 = 1.775, pleats = 7;
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, low ? 28 : 72, low ? 2 : 8);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const u = (x - x0) / (x1 - x0), h = (y - y0) / (y1 - y0);
      const amp = 0.013 + 0.011 * h;                                  // gathered more at the rod
      const z = 0.397 + amp * Math.sin(u * pleats * Math.PI * 2) + 0.012 * (1 - h) * (1 - h) - 0.01 * u * u * (1 - h);
      p.setXYZ(i, x, h < 0.001 ? y + 0.008 * Math.sin(u * 23) : y, z);
    }
    g.computeVertexNormals();
    M.boxUV(g);
    const curtain = new THREE.Mesh(g, M.get('velvet', { side: THREE.DoubleSide }));
    curtain.castShadow = true; curtain.receiveShadow = true;
    booth.add(curtain);
  }

  // ---------- backlit graphics: one 256×128 atlas (marquee, sample strips, instructions) ----------
  const atlasCv = document.createElement('canvas');
  atlasCv.width = 256; atlasCv.height = 128;
  const atlas = new THREE.CanvasTexture(atlasCv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  drawAtlas(atlasCv.getContext('2d'));
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load(`700 30px ${SANS}`), document.fonts.load(`500 11px ${SANS}`)])
      .then(() => { drawAtlas(atlasCv.getContext('2d')); atlas.needsUpdate = true; }).catch(() => {});
  }
  const gfxMat = new THREE.MeshBasicMaterial({ map: atlas });
  gfxMat.color.setScalar(GLOW);
  {
    const quadUV = (g, cx0, cy0, cx1, cy1) => {      // canvas pixel rect → atlas UVs (inset ½ px)
      const uv = g.attributes.uv, u0 = (cx0 + 0.5) / 256, u1 = (cx1 - 0.5) / 256;
      const v0 = 1 - (cy1 - 0.5) / 128, v1 = 1 - (cy0 + 0.5) / 128;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      return g;
    };
    const sign = quadUV(new THREE.PlaneGeometry(1.43, 0.28), 0, 0, 256, 50); sign.translate(0, 2.16, 0.3015);
    const samples = quadUV(new THREE.PlaneGeometry(0.56, 0.34), 0, 50, 128, 128); samples.translate(0.385, 1.44, 0.4265);
    const instr = quadUV(new THREE.PlaneGeometry(0.56, 0.34), 128, 50, 256, 128); instr.translate(0.385, 1.03, 0.4265);
    booth.add(new THREE.Mesh(mergeGeometries([sign, samples, instr]), gfxMat));
  }

  // ---------- lamps: countdown lamps, interior light, flash panel (vertex colours, one draw) ----------
  const LAMP_OFF = [0.09, 0.012, 0.01], LAMP_ON = [3.2, 0.42, 0.12], WHITE = [7, 7, 7], BLAST = [14, 14, 14];
  const INNER = [1.25, 1.12, 0.92], PANEL = [0.35, 0.33, 0.3];
  const lampParts = [];
  let lampsGeo;
  {
    const parts = [];
    for (let i = 0; i < 3; i++) { const g = new THREE.CircleGeometry(0.021, 20); g.translate(0.24 + i * 0.145, 1.755, 0.4395); parts.push(g); }
    const ceil = new THREE.PlaneGeometry(0.5, 0.56); ceil.rotateX(Math.PI / 2); ceil.translate(-0.35, 1.916, -0.02); parts.push(ceil);
    const flash = new THREE.PlaneGeometry(0.4, 0.1); flash.translate(-0.36, 1.36, -0.3915); parts.push(flash);
    let start = 0;
    for (const g of parts) { lampParts.push([start, g.attributes.position.count]); start += g.attributes.position.count; paint(g, C('#000000')); }
    lampsGeo = mergeGeometries(parts);
    for (const g of parts) g.dispose();
  }
  const lampCol = lampsGeo.attributes.color;
  const setPart = (k, c) => {
    const [s, n] = lampParts[k];
    for (let i = s; i < s + n; i++) lampCol.setXYZ(i, c[0], c[1], c[2]);
    lampCol.needsUpdate = true;
  };
  const lampsIdle = () => { for (let i = 0; i < 3; i++) setPart(i, LAMP_OFF); setPart(3, INNER); setPart(4, PANEL); };
  const lampsFlash = () => { for (let i = 0; i < 3; i++) setPart(i, WHITE); setPart(3, BLAST); setPart(4, BLAST); };
  lampsIdle();
  booth.add(new THREE.Mesh(lampsGeo, new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ---------- the paper strip that slides out of the delivery slot (hidden until the first photo) ----------
  const thumbCv = document.createElement('canvas');
  thumbCv.width = 42; thumbCv.height = 128;
  const stripTex = new THREE.CanvasTexture(thumbCv);
  stripTex.colorSpace = THREE.SRGBColorSpace;
  const stripMat = new THREE.MeshStandardMaterial({ map: stripTex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 });
  const stripGeo = new THREE.PlaneGeometry(0.05, 0.153);
  stripGeo.translate(0, -0.0765, 0);                    // hangs from its top edge
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.position.set(0.52, 0.752, 0.4475);
  strip.visible = false;
  strip.receiveShadow = true;
  booth.add(strip);

  // ---------- pick proxy + collider ----------
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.56, 2.36, 0.92), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(0, 1.18, 0.01);
  proxy.name = 'photobooth-pick';
  proxy.userData.action = { type: 'custom', id: 'photobooth', title: 'Tirar uma foto' };
  booth.add(proxy);
  const pickables = [proxy];
  const colliders = [{ minX: CX - 0.78, maxX: CX + 0.78, minZ: CZ - 0.47, maxZ: CZ + 0.45, minY: 0, maxY: 2.36 }];

  // ---------- sound (Web Audio, read lazily: the context exists only after Enter) ----------
  let noiseBuf = null;
  function out() {
    const a = ctx.audio;
    if (!a || a.muted) return null;
    const ac = a.context, bus = a.bus;
    if (!ac || !bus || ac.state === 'closed') return null;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignore */ } }
    return ac;
  }
  function tone(type, f0, f1, dur, gain, lp, delay = 0) {
    const ac = out(); if (!ac) return;
    try {
      const t = ac.currentTime + 0.005 + delay;
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      f.type = 'lowpass'; f.frequency.value = lp;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.setValueAtTime(gain, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(ctx.audio.bus);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* audio unavailable */ }
  }
  function noise(dur, freq, gain, delay = 0) {
    const ac = out(); if (!ac) return;
    try {
      if (!noiseBuf) {
        const n = (ac.sampleRate * 0.2) | 0;
        noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = ac.currentTime + 0.005 + delay;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(ctx.audio.bus);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const beep = (last) => tone('square', last ? 1320 : 880, last ? 1320 : 880, 0.12, 0.08, 2600);
  // click + mirror clunk at the flash, then the flash capacitor's thin recharge whine
  const shutter = () => { noise(0.05, 2600, 0.32); tone('sine', 170, 55, 0.12, 0.22, 600, 0.01); tone('sine', 2200, 5200, 0.55, 0.018, 8000, 0.06); };
  const motor = () => { tone('sawtooth', 92, 104, 1.5, 0.045, 520); noise(0.03, 3200, 0.12, 1.55); };

  // ---------- the white flash (a DOM veil, so it never touches the render) ----------
  let veil = null;
  function flashScreen() {
    if (reduced || typeof document === 'undefined' || !document.body) return;
    if (!veil) {
      veil = document.createElement('div');
      const s = veil.style;
      s.position = 'fixed'; s.left = '0'; s.top = '0'; s.width = '100%'; s.height = '100%';
      s.background = '#fffdf8'; s.pointerEvents = 'none'; s.zIndex = '2147483646'; s.opacity = '0'; s.display = 'none';
      veil.setAttribute('aria-hidden', 'true');
      document.body.appendChild(veil);
    }
    veil.style.display = 'block';
    if (veil.animate) {
      const a = veil.animate([{ opacity: 0.94 }, { opacity: 0.94, offset: 0.12 }, { opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.2,.7,.1,1)' });
      a.onfinish = () => { veil.style.display = 'none'; };
    } else veil.style.display = 'none';
  }

  // ---------- capture: one render of the visitor's view into a small target ----------
  const shotCam = new THREE.PerspectiveCamera(55, SHOT_W / SHOT_H, 0.05, 2000);
  let quad = null;
  function capture(cam) {
    const r = ctx.renderer;
    const hdr = new THREE.WebGLRenderTarget(SHOT_W * 2, SHOT_H * 2, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    const ldr = new THREE.WebGLRenderTarget(SHOT_W, SHOT_H, { depthBuffer: false });
    if (!quad) {
      quad = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, uExposure: { value: 1 } },
        vertexShader: TONEMAP_VS, fragmentShader: TONEMAP_FS, depthTest: false, depthWrite: false,
      }));
    }
    cam.updateMatrixWorld();
    cam.matrixWorld.decompose(shotCam.position, shotCam.quaternion, shotCam.scale);
    shotCam.fov = cam.isPerspectiveCamera ? cam.fov : 55;
    shotCam.zoom = cam.zoom || 1;
    shotCam.near = cam.near || 0.05; shotCam.far = cam.far || 2000;
    shotCam.updateProjectionMatrix();
    shotCam.layers.mask = cam.layers.mask;
    shotCam.updateMatrixWorld(true);
    const px = new Uint8Array(SHOT_W * SHOT_H * 4);
    const prev = r.getRenderTarget(), face = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel(), auto = r.autoClear;
    try {
      r.autoClear = true;
      r.setRenderTarget(hdr); r.clear(); r.render(ctx.scene, shotCam);
      quad.material.uniforms.tSrc.value = hdr.texture;
      quad.material.uniforms.uExposure.value = r.toneMappingExposure;
      r.setRenderTarget(ldr); r.clear(); quad.render(r);
      r.readRenderTargetPixels(ldr, 0, 0, SHOT_W, SHOT_H, px);
    } finally {
      r.setRenderTarget(prev, face, mip);
      r.autoClear = auto;
      quad.material.uniforms.tSrc.value = null;
      hdr.dispose(); ldr.dispose();
    }
    return px;
  }

  // Luminance → auto levels (1st–99th percentile) → ordered dither to 4 levels.
  function dither(px) {
    const N = SHOT_W * SHOT_H, lum = new Uint8Array(N), hist = new Uint32Array(256);
    for (let y = 0; y < SHOT_H; y++) {
      const row = (SHOT_H - 1 - y) * SHOT_W;           // GL rows run bottom-up
      for (let x = 0; x < SHOT_W; x++) {
        const i = (row + x) * 4, l = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
        lum[y * SHOT_W + x] = l; hist[l]++;
      }
    }
    let lo = 0, hi = 255, acc = 0;
    while (lo < 254 && (acc += hist[lo]) < N * 0.01) lo++;
    acc = 0;
    while (hi > lo + 1 && (acc += hist[hi]) < N * 0.01) hi--;
    if (hi - lo < 32) { const m = (hi + lo) / 2; lo = Math.max(0, m - 16); hi = Math.min(255, m + 16); }
    const idx = new Uint8Array(N), k = 1 / (hi - lo);
    for (let y = 0; y < SHOT_H; y++) {
      for (let x = 0; x < SHOT_W; x++) {
        const p = y * SHOT_W + x;
        let t = (lum[p] - lo) * k;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        t = t * 0.7 + t * t * (3 - 2 * t) * 0.3;        // a little print contrast
        const q = Math.floor(t * 3 + (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16);
        idx[p] = q > 3 ? 3 : q;
      }
    }
    return idx;
  }

  // The strip: paper, a pixel frame, the house name, four palettes of one moment, the date.
  function compose(idx, when) {
    const cv = document.createElement('canvas');
    cv.width = SW; cv.height = SH;
    const g = cv.getContext('2d');
    const im = g.createImageData(SW, SH), d = im.data;
    const rect = (x, y, w, h, c) => {
      for (let yy = y; yy < y + h; yy++) {
        let i = (yy * SW + x) * 4;
        for (let xx = 0; xx < w; xx++, i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
      }
    };
    const text = (s, x, y, k, c) => {
      for (const ch of s) {
        const gl = FONT[ch] || FONT[' '];
        for (let r = 0; r < 5; r++) {
          const bits = gl.charCodeAt(r) - 48;
          for (let q = 0; q < 3; q++) if (bits & (4 >> q)) rect(x + q * k, y + r * k, k, k, c);
        }
        x += 4 * k;
      }
    };
    const centred = (s, y, k, c) => text(s, Math.round((SW - (s.length * 4 - 1) * k) / 2), y, k, c);
    rect(0, 0, SW, SH, PAPER);
    rect(4, 4, SW - 8, 2, INK); rect(4, SH - 6, SW - 8, 2, INK); rect(4, 4, 2, SH - 8, INK); rect(SW - 6, 4, 2, SH - 8, INK);
    for (let x = 10; x < SW - 10; x += 2) { rect(x, 8, 1, 1, INK); rect(x, SH - 9, 1, 1, INK); }
    for (let y = 10; y < SH - 10; y += 2) { rect(8, y, 1, 1, INK); rect(SW - 9, y, 1, 1, INK); }
    for (const [x, y] of [[4, 4], [SW - 10, 4], [4, SH - 10], [SW - 10, SH - 10]]) rect(x, y, 6, 6, INK);
    centred('THE WORKSHOP', 14, 2, INK);
    for (let f = 0; f < 4; f++) {
      const y0 = PY0 + f * (SHOT_H + GAP), pal = PAL[f];
      rect(PX - 2, y0 - 2, SHOT_W + 4, SHOT_H + 4, INK);
      for (let y = 0; y < SHOT_H; y++) {
        let o = ((y0 + y) * SW + PX) * 4, p = y * SHOT_W;
        for (let x = 0; x < SHOT_W; x++, o += 4, p++) { const c = pal[idx[p]]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
      }
    }
    const pad = (n) => String(n).padStart(2, '0');
    centred(`${pad(when.getDate())}.${pad(when.getMonth() + 1)}.${when.getFullYear()} · ${pad(when.getHours())}:${pad(when.getMinutes())}`, 1034, 2, INK);
    centred('CABINE DE FOTOS', 1049, 1, OXB);
    g.putImageData(im, 0, 0);
    return cv;
  }

  function deliver(cv) {
    // the little strip in the world
    const tg = thumbCv.getContext('2d');
    tg.imageSmoothingEnabled = true;
    tg.drawImage(cv, 0, 0, thumbCv.width, thumbCv.height);
    stripTex.needsUpdate = true;
    // the PNG, at 2× with crisp pixels
    const big = document.createElement('canvas');
    big.width = SW * 2; big.height = SH * 2;
    const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = false;
    bg.drawImage(cv, 0, 0, big.width, big.height);
    big.toBlob((blob) => {
      if (!blob) { ctx.ui.toast('A cabine encravou. Tente outra vez daqui a nada.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'workshop-foto.png'; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      ctx.ui.toast('Revelado! A foto está nas transferências.');
    }, 'image/png');
  }

  // ---------- behaviour ----------
  const IDLE = 0, COUNT = 1, SHOOT = 2, DEVELOP = 3;
  let state = IDLE, t = 0, beeps = 0, cooldown = 0, flashT = -1, devT = 0;
  let cam = null;
  let flickerIn = 14 + Math.random() * 20, flickerT = -1;

  function reset() {
    state = IDLE; cooldown = 0.8; flashT = -1;
    lampsIdle(); gfxMat.color.setScalar(GLOW);
  }

  function shoot() {
    if (!cam) throw new Error('no camera yet');
    const cv = compose(dither(capture(cam)), new Date());
    deliver(cv);
    strip.visible = true;
    strip.scale.y = 0.001; stripTex.repeat.y = 0.001;
    stripMat.emissiveIntensity = 0.9;
    motor();
  }

  function update(dt, frame) {
    if (frame && frame.camera) cam = frame.camera;
    if (cooldown > 0) cooldown -= dt;
    if (state === IDLE) {
      if (reduced) return;
      // now and then the old sign's tube stutters
      if (flickerT < 0) { flickerIn -= dt; if (flickerIn <= 0) flickerT = 0; return; }
      flickerT += dt;
      const ft = flickerT;
      gfxMat.color.setScalar(GLOW * (ft < 0.05 ? 0.35 : ft < 0.11 ? 1 : ft < 0.19 ? 0.55 : ft < 0.23 ? 1 : ft < 0.29 ? 0.72 : 1));
      if (ft > 0.31) { flickerT = -1; flickerIn = 18 + Math.random() * 30; gfxMat.color.setScalar(GLOW); }
      return;
    }
    t += dt;
    if (flashT >= 0 && (flashT += dt) > 0.16) { flashT = -1; lampsIdle(); gfxMat.color.setScalar(GLOW); }
    if (state === COUNT) {
      while (beeps < 3 && t >= beeps * BEEP_GAP) { setPart(beeps, LAMP_ON); beep(beeps === 2); beeps++; }
      if (t >= 3 * BEEP_GAP) {
        shutter();
        if (!reduced) { flashScreen(); lampsFlash(); }
        flashT = 0;
        state = SHOOT;                      // capture next frame, behind the veil
      }
      return;
    }
    if (state === SHOOT) {
      try { shoot(); state = DEVELOP; devT = 0; } catch (err) {
        console.warn('[photobooth] capture failed', err);
        ctx.ui.toast('A cabine encravou. Tente outra vez daqui a nada.');
        reset();
      }
      return;
    }
    if (state === DEVELOP) {
      devT += dt;
      const s = Math.min(1, devT / 1.5), e = 1 - (1 - s) * (1 - s) * (1 - s);
      strip.scale.y = Math.max(0.001, e);
      stripTex.repeat.y = strip.scale.y;    // the leading edge (the strip's foot) comes out first
      stripMat.emissiveIntensity = 0.9 * Math.exp(-devT * 0.85);
      if (devT > 5) { stripMat.emissiveIntensity = 0; reset(); }
    }
  }

  function onPick() {
    if (state !== IDLE || cooldown > 0) return;
    state = COUNT; t = 0; beeps = 0;
    flickerT = -1; gfxMat.color.setScalar(GLOW);
    lampsIdle();
    ctx.ui.toast('Enquadre a vista que quer guardar… 3 · 2 · 1');
  }

  return { group, regions: [], colliders, pickables, update, onPick };

  // ---------- atlas drawing ----------
  function drawAtlas(c) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 256, 128);
    // A — marquee sign (256×50): cream light box, oxblood rule, bulbs, FOTOS
    const gA = c.createLinearGradient(0, 0, 0, 50);
    gA.addColorStop(0, '#fff8e8'); gA.addColorStop(1, '#eddfc2');
    c.fillStyle = gA; c.fillRect(0, 0, 256, 50);
    c.strokeStyle = OX_HEX; c.lineWidth = 2; c.strokeRect(5, 5, 246, 40);
    for (const x of [18, 238]) for (const y of [15, 25, 35]) bulb(c, x, y, 2.5);
    c.fillStyle = OX_HEX; c.font = `700 30px ${SANS}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    spaced(c, 'FOTOS', 128, 27, 8);
    // B — sample strips behind glass (128×78)
    c.fillStyle = '#1d1915'; c.fillRect(0, 50, 128, 78);
    const gB = c.createLinearGradient(0, 50, 0, 128);
    gB.addColorStop(0, 'rgba(255,238,210,0.10)'); gB.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = gB; c.fillRect(0, 50, 128, 78);
    for (let s = 0; s < 3; s++) sampleStrip(c, 13 + s * 37, 55, s);
    // C — instructions (128×78)
    c.fillStyle = '#f3ead7'; c.fillRect(128, 50, 128, 78);
    c.strokeStyle = OX_HEX; c.lineWidth = 1.5; c.strokeRect(131.5, 53.5, 121, 71);
    c.textAlign = 'center'; c.fillStyle = OX_HEX; c.font = `700 19px ${SANS}`;
    c.fillText('GRÁTIS', 192, 68);
    c.fillStyle = '#15120e'; c.fillRect(150, 79, 84, 1);
    c.font = `500 10.5px ${SANS}`;
    c.fillText('Clique, enquadre', 192, 90);
    c.fillText('a vista e sorria.', 192, 102);
    c.fillStyle = OX_HEX; c.font = `700 9.5px ${SANS}`;
    c.fillText('3 · 2 · 1 · FLASH', 192, 115);
  }
  function bulb(c, x, y, r) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(255,250,232,1)'); g.addColorStop(0.42, 'rgba(255,224,150,0.92)'); g.addColorStop(1, 'rgba(255,196,110,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, Math.PI * 2); c.fill();
  }
  function spaced(c, s, cx, cy, gap) {
    const ws = [...s].map((ch) => c.measureText(ch).width);
    let x = cx - (ws.reduce((a, b) => a + b, 0) + gap * (s.length - 1)) / 2;
    [...s].forEach((ch, i) => { c.fillText(ch, x, cy); x += ws[i] + gap; });
  }
  function sampleStrip(c, sx, sy, s) {
    const sw = 28, sh = 68, p = PAL_HEX[s];
    c.save();
    c.translate(sx + sw / 2, sy + sh / 2); c.rotate((s - 1) * 0.035); c.translate(-sw / 2, -sh / 2);
    c.fillStyle = '#f4efe6'; c.fillRect(0, 0, sw, sh);
    for (let f = 0; f < 4; f++) {
      const fx = 2, fy = 2 + f * 16, fw = sw - 4, fh = 14;
      c.save();
      c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
      c.fillStyle = p[2]; c.fillRect(fx, fy, fw, fh);
      c.fillStyle = p[1]; c.fillRect(fx, fy + fh - 3, fw, 3);
      const hx = fx + fw / 2 + [-3, 2, 0, 4][(f + s) % 4], hy = fy + 5.5 + [0, 1, -0.5, 0.5][(f + s * 2) % 4];
      c.fillStyle = p[0];
      c.beginPath(); c.ellipse(hx, fy + fh + 1, 7, 5, 0, Math.PI, 0); c.fill();
      c.beginPath(); c.arc(hx, hy, 3.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = p[3]; c.fillRect(hx - 2, hy - 2, 1, 1);
      c.restore();
    }
    c.restore();
  }
}
