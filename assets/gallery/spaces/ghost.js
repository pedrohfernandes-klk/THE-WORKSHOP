// O Fantasma de 8 bits: a flat pixel-art ghost that haunts the Ruins
// (spaces/ruins.js: x -64..-34, z -47..-18). BRIEF §6.2 space module.
//
// It is the attentive room turned inside out. Under the visitor's direct gaze it
// dithers away pixel by pixel. While they look elsewhere it drifts closer, but only
// while they are inside the ruins, and never past the ruins' footprint. It is barely
// there by day and clear, softly blooming, at night or in a storm
// (scene.userData.weather). Within 10 m it hums: two detuned, wavering square waves.
// Click it: "Buu." in a pixel speech bubble, a chromatic slide down, and it switches
// off like an old TV, then comes back somewhere else in the ruins a few seconds later.
//
// Cost: 1 draw call (2 while the bubble shows). update() is a few dozen scalar ops,
// allocates nothing, and does no work beyond 45 m. No files: the art is drawn into two
// tiny canvases and the sound is synthesised.

const PX = 0.045;                 // metres per sprite pixel
const FAR2 = 45 * 45;             // beyond this the ghost is neither drawn nor heard
const WANDER = 0.45, CREEP = 1.0; // m/s
const HUM = 0.04;                 // peak hum level into the bus (quiet)
const BUBBLE = 1.9;               // seconds the "Buu." bubble stays up
// Where the ghost may be (inside the ruins' footprint) and where the visitor counts as
// "in the ruins" (the forecourt, the roofless hall and the east strip; not the path out).
const HX0 = -62.4, HX1 = -35.4, HZ0 = -45.8, HZ1 = -18.8, HY0 = 0.95, HY1 = 3.1;
const VX0 = -62.5, VX1 = -34.8, VZ0 = -46.5, VZ1 = -17.9;
// Haunts between the ruined walls (x, y, z).
const WP = [
  -48.8, 1.6, -26.0,    // the south doorway (first sighting, from the forecourt)
  -54.6, 1.65, -39.6,   // behind the partition, under the flickering tube
  -49.5, 1.7, -43.0,    // just outside the north wall, seen through its windows
  -42.3, 1.55, -34.6,   // the east doorway
  -37.2, 1.9, -40.5,    // the east strip, outside the wall
  -44.2, 2.25, -22.9,   // above the wrecked car
  -60.4, 2.9, -22.7,    // up in the dead tree
  -55.4, 1.55, -28.8,   // by the rubble in the south-west corner
  -36.6, 1.5, -28.4,    // beside the overturned trolley
];
const NWP = WP.length / 3;

const VS = /* glsl */`
uniform vec2 uSquash;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uSquash, 0.0, 1.0);
}`;

// The quad is a 40x40 pixel grid: the 32x32 sprite plus a 4-pixel margin for the halo.
// Output is premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA), so the sprite blends
// normally while the halo, which has zero alpha, adds light. Both happen in one pass.
const FS = /* glsl */`
uniform sampler2D uMap;
uniform float uFrame, uAlpha, uDis, uBright, uGlow, uMouth, uGlitch, uTime;
uniform vec2 uLook;
uniform vec3 uGlowCol;
varying vec2 vUv;
float b2(vec2 p) { return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
float bayer(vec2 p) { return (4.0 * b2(mod(p, 2.0)) + b2(mod(floor(p * 0.5), 2.0)) + 0.5) / 16.0; }
float box(vec2 p, vec2 a, vec2 b) { return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }
vec3 toOut(vec3 c) {   // encode before blending, like stock materials (a no-op on the app's linear target)
#ifdef TONE_MAPPING
  c = toneMapping(c);
#endif
  return linearToOutputTexel(vec4(c, 1.0)).rgb;
}
void main() {
  vec2 g = vec2(floor(vUv.x * 40.0), 39.0 - floor(vUv.y * 40.0));      // pixel, y down
  if (uGlitch > 0.5) {                                                  // a rare scanline tear
    float h = fract(sin(g.y * 12.9898 + floor(uTime * 20.0) * 78.233) * 43758.5453);
    g.x += h > 0.72 ? 2.0 : (h < 0.18 ? -1.0 : 0.0);
  }
  vec2 s = g - 4.0;
  vec4 tex = vec4(0.0);
  if (s.x >= 0.0 && s.x <= 31.0 && s.y >= 0.0 && s.y <= 31.0)
    tex = texture2D(uMap, vec2((s.x + 0.5 + 32.0 * uFrame) / 64.0, 1.0 - (s.y + 0.5) / 32.0));
  vec3 col = tex.rgb; float a = tex.a;
  // eye glints, 2x2, looking where it drifts
  float gl = box(s, vec2(11.0, 13.0) + uLook, vec2(12.0, 14.0) + uLook) + box(s, vec2(19.0, 13.0) + uLook, vec2(20.0, 14.0) + uLook);
  col = mix(col, vec3(0.75, 1.0, 1.0) * 1.4, clamp(gl, 0.0, 1.0) * a);
  // the open "Buu." mouth
  float mo = uMouth * box(s, vec2(14.0, 18.0), vec2(17.0, 21.0));
  if ((s.x == 14.0 || s.x == 17.0) && (s.y == 18.0 || s.y == 21.0)) mo = 0.0;
  col = mix(col, vec3(0.012, 0.004, 0.03), mo); a = max(a, mo);
  // under a direct look the pixels drop out in Bayer order
  a *= step(bayer(s), uDis);
  // dithered pixel halo
  vec2 q = (g + 0.5 - vec2(20.0, 20.5)) / vec2(14.0, 14.5);
  float halo = clamp((1.42 - length(q)) / 0.42, 0.0, 1.0);
  halo *= clamp(min(min(g.x, 39.0 - g.x), min(g.y, 39.0 - g.y)) / 3.0, 0.0, 1.0);
  float dh = step(bayer(g + 2.0), halo * halo);
  float glow = uGlow * uDis * (0.3 * halo * halo + 0.7 * dh * halo) * (1.0 - 0.75 * a);
  float A = a * uAlpha;
  vec3 halo3 = glow > 0.0 ? toOut(uGlowCol * glow * uAlpha) : vec3(0.0);
  gl_FragColor = vec4((A > 0.0 ? toOut(col * uBright) * A : vec3(0.0)) + halo3, A);
}`;

// Two 32x32 frames side by side; the skirt's feet alternate (the wobble).
function spriteCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g2 = c.getContext('2d'), img = g2.createImageData(64, 32), D = img.data;
  const OUT = [29, 24, 56, 242], BODY = [238, 240, 255, 230], SHADE = [184, 189, 232, 230], HI = [255, 255, 255, 255];
  const EYE = [14, 10, 31, 255], MOUTH = [42, 28, 64, 255], BLUSH = [244, 166, 192, 220];
  const HILITE = new Set(['7,9', '7,10', '8,8', '9,7', '10,6', '11,6']);
  const eye = (x, y, x0) => x >= x0 && x <= x0 + 3 && y >= 12 && y <= 16 && !((x === x0 || x === x0 + 3) && (y === 12 || y === 16));
  for (let f = 0; f < 2; f++) {
    const inside = (x, y) => {
      if (x < 0 || x > 31 || y < 0 || y > 31) return false;
      const cx = x + 0.5 - 16;
      if (y < 15) { const cy = y + 0.5 - 15; return cx * cx + cy * cy <= 144; }   // dome
      if (Math.abs(cx) > (y >= 23 ? 13 : 12)) return false;                       // body, flared hem
      if (y <= 25) return true;
      const P = 6.5, ph = ((x - 3 + f * P / 2) % P) / P;                          // four feet
      return y <= 26 + Math.round(3 * (1 - Math.abs(ph * 2 - 1)));
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      let col = null;
      if (inside(x, y)) {
        col = (!inside(x + 2, y + 1) || !inside(x, y + 2)) ? SHADE : BODY;
        if (eye(x, y, 10) || eye(x, y, 18)) col = EYE;
        else if (x >= 15 && x <= 16 && y >= 19 && y <= 20) col = MOUTH;
        else if (y === 18 && (x === 8 || x === 9 || x === 22 || x === 23)) col = BLUSH;
        else if (HILITE.has(x + ',' + y)) col = HI;
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) col = OUT;
      if (col) { const i = (y * 64 + x + f * 32) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = col[3]; }
    }
  }
  g2.putImageData(img, 0, 0);
  return c;
}

// The speech bubble, 32x18, with "Buu." in a 5x7 pixel font (site ink on paper).
function bubbleCanvas() {
  const rows = ['..' + '#'.repeat(28) + '..', '.#' + 'o'.repeat(28) + '#.'];
  for (let i = 0; i < 9; i++) rows.push('#' + 'o'.repeat(30) + '#');
  rows.push('.#' + 'o'.repeat(28) + '#.', '..###ooo' + '#'.repeat(22) + '..');
  for (const r of ['....#oo#', '...#oo#', '...#o#', '..#o#', '..##']) rows.push(r.padEnd(32, '.'));
  const c = document.createElement('canvas'); c.width = 32; c.height = 18;
  const g2 = c.getContext('2d');
  for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    g2.fillStyle = ch === '#' ? '#15120e' : '#f4efe6'; g2.fillRect(x, y, 1, 1);
  }
  const B = ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'];
  const U = ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'];
  const DOT = ['..', '..', '..', '..', '..', '##', '##'];
  g2.fillStyle = '#15120e';
  for (const [glyph, x0] of [[B, 6], [U, 12], [U, 18], [DOT, 24]]) {
    glyph.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') g2.fillRect(x0 + x, 3 + y, 1, 1); });
  }
  return c;
}

export function build(ctx) {
  const { THREE } = ctx;
  const still = !!ctx.reducedMotion;
  const group = new THREE.Group(); group.name = 'ghost';
  let seed = 8008;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pixelTex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // ---- the ghost: one premultiplied quad (sprite + dissolve + halo) ----
  const U = {
    uMap: { value: pixelTex(spriteCanvas()) }, uFrame: { value: 0 }, uAlpha: { value: 0.24 }, uDis: { value: 1 },
    uBright: { value: 1 }, uGlow: { value: 0.1 }, uMouth: { value: 0 }, uGlitch: { value: 0 }, uTime: { value: 0 },
    uLook: { value: new THREE.Vector2() }, uSquash: { value: new THREE.Vector2(1, 1) },
    uGlowCol: { value: new THREE.Color(0.45, 0.75, 1.0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(40 * PX, 40 * PX), mat);
  sprite.name = 'ghost-sprite';
  sprite.userData.action = { type: 'custom', id: 'ghost' };   // stays clickable while faint
  sprite.position.set(WP[0], WP[1], WP[2]);
  group.add(sprite);                                           // a ghost casts no shadow

  const bubbleM = new THREE.MeshBasicMaterial({ map: pixelTex(bubbleCanvas()), transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const bubble = new THREE.Mesh(new THREE.PlaneGeometry(32 * PX, 18 * PX), bubbleM);
  bubble.name = 'ghost-bubble'; bubble.visible = false; bubble.renderOrder = 1;
  bubble.raycast = () => {};                                   // never blocks a click
  group.add(bubble);

  // ---- state (scalars only: nothing is allocated per frame) ----
  let x = WP[0], y = WP[1], z = WP[2], vx = 0, vz = 0, px = x, py = y, pz = z;
  let wp = 0, dwell = 9;                    // first it waits in the south doorway
  let state = 0, st = 0, goneFor = 4;       // 0 haunting, 1 "Buu.", 2 gone, 3 coming back
  let seen = 0, gaze = 0, life = 1, wk = 0, creeping = false;
  let t = 0, frameT = 0, fr = 0, glitchT = 5 + rnd() * 8, glitch = 0;
  let ang = 0, dist = 99, rX = 1, rZ = 0;
  let bubbleT = 0, bx = 0, by = 0, bz = 0, bs = 1;
  let audioT = 0, humFar = 0, hum = null;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const level = (v) => (v === true ? 1 : typeof v === 'number' && v > 0 ? (v < 1 ? v : 1) : 0);
  // 0 = plain day … 1 = night or storm. Read defensively: the weather may not publish.
  function weatherLevel() {
    const ud = ctx.scene && ctx.scene.userData;
    const w = ud && ud.weather;
    if (!w || typeof w !== 'object') return 0;
    let n = level(w.night), s = level(w.storm);
    if (w.night == null && w.storm == null) { n = w.mode === 'night' ? 1 : 0; s = w.mode === 'storm' ? 1 : 0; }
    return Math.max(n, s * 0.85);
  }

  // A haunt other than `avoid`: at least minD m from the visitor and not straight ahead
  // of them, else the farthest one tried. minD = 0 picks any other haunt.
  function pickHaunt(cx, cz, hfx, hfz, avoid, minD) {
    let best = avoid, bd = -1;
    for (let k = 0; k < 14; k++) {
      const i = (rnd() * NWP) | 0;
      if (i === avoid) continue;
      if (minD <= 0) return i;
      const ex = WP[i * 3] - cx, ez = WP[i * 3 + 2] - cz, ed = Math.sqrt(ex * ex + ez * ez) + 1e-6;
      if (ed >= minD && (ex * hfx + ez * hfz) / ed < 0.5) return i;
      if (ed > bd) { bd = ed; best = i; }
    }
    return best;
  }

  function move(dt, cx, cy, cz, look, inRuins, hfx, hfz) {
    const hx = x - cx, hz = z - cz, hd = Math.sqrt(hx * hx + hz * hz) + 1e-6;
    creeping = state === 0 && inRuins && look < 0.42 && hd > 2.2;
    if (creeping) {                         // unseen: it creeps up on you
      const k = Math.min(CREEP * dt, hd - 2.2) / hd;
      x -= hx * k; z -= hz * k;
      y += (clamp(cy - 0.2, HY0, HY1) - y) * (1 - Math.exp(-dt / 1.2));
      vx = -hx / hd * 0.2; vz = -hz / hd * 0.2;
      gaze = 0; dwell = 2;
    } else {
      // stared at from close by: it gives up and drifts off to a far haunt
      if (seen > 0.55 && inRuins) { gaze += dt; if (gaze > 2.4 && hd < 8) { gaze = 0; wp = pickHaunt(cx, cz, hfx, hfz, wp, 10); } }
      else if (gaze > 0) gaze -= dt * 0.5;
      const ex = WP[wp * 3] - x, ez = WP[wp * 3 + 2] - z, ed = Math.sqrt(ex * ex + ez * ez) + 1e-6;
      const sp = WANDER * (ed < 1.6 ? ed / 1.6 : 1), a = 1 - Math.exp(-dt / 0.8), slow = 1 - 0.6 * seen;
      vx += (ex / ed * sp - vx) * a; vz += (ez / ed * sp - vz) * a;
      x += vx * dt * slow; z += vz * dt * slow;
      y += (WP[wp * 3 + 1] - y) * (1 - Math.exp(-dt / 2.5));
      if (ed < 0.4) { dwell -= dt; if (dwell <= 0) { wp = pickHaunt(cx, cz, hfx, hfz, wp, 0); dwell = 3 + rnd() * 5; } }
    }
    x = clamp(x, HX0, HX1); z = clamp(z, HZ0, HZ1); y = clamp(y, HY0, HY1);
  }

  // ---- sound: everything goes into ctx.audio.bus, read lazily ----
  function humStart(ac, bus) {
    try {
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), wob = ac.createOscillator(), trem = ac.createOscillator();
      const wobG = ac.createGain(), tremG = ac.createGain(), am = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
      const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
      o1.type = o2.type = 'square';
      o1.frequency.value = o2.frequency.value = 92.5;   // F#2, one voice 19 cents sharp: a slow beat
      o2.detune.value = 19;
      wob.frequency.value = 0.17; wobG.gain.value = 28; // the pitch wavers ±28 cents
      wob.connect(wobG); wobG.connect(o1.detune); wobG.connect(o2.detune);
      trem.frequency.value = 0.47; tremG.gain.value = 0.35; am.gain.value = 0.65;
      trem.connect(tremG); tremG.connect(am.gain);
      f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 4;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(am); am.connect(g);
      if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
      const t0 = ac.currentTime;
      o1.start(t0); o2.start(t0); wob.start(t0); trem.start(t0);
      hum = { ac, o1, o2, wob, trem, g, f, p, out: p || g };
    } catch (e) { hum = null; }
  }
  function humStop() {
    const h = hum; hum = null; humFar = 0;
    if (!h) return;
    try {
      const t0 = h.ac.currentTime;
      h.g.gain.setTargetAtTime(0, t0, 0.06);
      h.o1.stop(t0 + 0.5); h.o2.stop(t0 + 0.5); h.wob.stop(t0 + 0.5); h.trem.stop(t0 + 0.5);
      h.o1.onended = () => { try { h.out.disconnect(); } catch (e) { /* already gone */ } };
    } catch (e) { /* context closed */ }
  }
  function audioOut() {
    const A = ctx.audio;
    if (!A) return null;
    try {
      const ac = A.context, bus = A.bus;
      return ac && bus && !A.muted && ac.state === 'running' ? A : null;
    } catch (e) { return null; }
  }
  function humTick(d, dx, dz) {               // ~10 Hz
    const A = state !== 2 ? audioOut() : null;
    if (!A) { if (hum) humStop(); return; }
    const ac = A.context;
    if (hum && hum.ac !== ac) humStop();
    if (d > 14) { if (hum) { humFar += 0.1; if (humFar > 1) humStop(); } return; }
    humFar = 0;
    if (!hum) { if (d > 11) return; humStart(ac, A.bus); if (!hum) return; }
    const near = d < 10 ? 1 - d / 10 : 0, t0 = ac.currentTime;
    const lvl = HUM * near * near * (state === 3 ? life : state === 1 ? 0.4 : 1);
    hum.g.gain.setTargetAtTime(lvl, t0, 0.25);
    hum.f.frequency.setTargetAtTime(260 + 760 * near, t0, 0.3);
    if (hum.p) hum.p.pan.setTargetAtTime(clamp((dx * rX + dz * rZ) / (d + 0.6), -0.85, 0.85), t0, 0.2);
  }
  function booSound() {
    const A = audioOut();
    if (!A) return;
    try {
      const ac = A.context, t0 = ac.currentTime + 0.01, t1 = t0 + 0.1;
      const o = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'square'; f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7;
      o.frequency.setValueAtTime(392, t0);                                     // "Bu"
      for (let i = 0; i <= 30; i++) o.frequency.setValueAtTime(523.25 * Math.pow(2, -i / 12), t1 + i * 0.026); // "uu…" stepping down
      vib.frequency.value = 8; vg.gain.setValueAtTime(0, t1); vg.gain.linearRampToValueAtTime(35, t1 + 0.5);
      vib.connect(vg); vg.connect(o.detune);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.006);
      g.gain.setValueAtTime(0.09, t0 + 0.07); g.gain.linearRampToValueAtTime(0, t0 + 0.088);
      g.gain.linearRampToValueAtTime(0.1, t1 + 0.01); g.gain.setValueAtTime(0.1, t1 + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0008, t1 + 0.95);
      o.connect(f); f.connect(g); g.connect(A.bus);
      o.start(t0); vib.start(t0); o.stop(t1 + 1); vib.stop(t1 + 1);
    } catch (e) { /* audio unavailable */ }
  }

  // ---- per frame ----
  function update(dt, frame) {
    const cam = frame && frame.camera;
    if (!cam) return;
    dt = dt > 0 ? (dt < 0.1 ? dt : 0.1) : 0;
    const e = cam.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
    const dx = px - cx, dy = py - cy, dz = pz - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > FAR2) {                                  // far away: nothing to draw or hear
      if (sprite.visible) sprite.visible = false;
      if (bubble.visible) { bubble.visible = false; bubbleT = 0; }
      if (hum) humStop();
      return;
    }
    t += dt;
    const d = Math.sqrt(d2) + 1e-6;
    dist = d;
    const fx = -e[8], fy = -e[9], fz = -e[10], fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    const look = (fx * dx + fy * dy + fz * dz) / (fl * d);   // 1 = dead centre of the view
    const rl = Math.sqrt(e[0] * e[0] + e[2] * e[2]) || 1; rX = e[0] / rl; rZ = e[2] / rl;
    wk += (weatherLevel() - wk) * (1 - Math.exp(-dt / 1.5));
    // the gaze dissolves it slowly; looking away restores it quickly
    let sT = (look - 0.866) / 0.124;
    sT = sT <= 0 ? 0 : sT >= 1 ? 1 : sT * sT * (3 - 2 * sT);
    seen += (sT - seen) * (1 - Math.exp(-dt / (sT > seen ? 0.6 : 0.3)));
    const inRuins = cx > VX0 && cx < VX1 && cz > VZ0 && cz < VZ1 && cy < 6;

    if (state === 1) {                                 // "Buu.", then switch off
      st += dt;
      if (st >= (still ? 1.2 : 0.75)) { state = 2; st = 0; goneFor = 3 + rnd() * 3; }
    } else if (state === 2) {                          // gone; back elsewhere soon
      st += dt;
      if (st >= goneFor) {
        wp = pickHaunt(cx, cz, fx / fl, fz / fl, wp, 8);
        x = WP[wp * 3]; y = WP[wp * 3 + 1]; z = WP[wp * 3 + 2]; vx = vz = 0;
        dwell = 3 + rnd() * 4; state = 3; st = 0; life = 0; seen = 0;
      }
    } else {
      if (state === 3) { life += dt / 1.4; if (life >= 1) { life = 1; state = 0; } }
      move(dt, cx, cy, cz, look, inRuins, fx / fl, fz / fl);
    }

    if (state === 2) {
      if (sprite.visible) sprite.visible = false;
    } else {
      px = x + Math.sin(t * 0.63) * 0.12; pz = z + Math.cos(t * 0.51) * 0.12;
      py = y + Math.sin(t * 1.7) * (still ? 0.025 : 0.07);
      let alpha = 0.24 + 0.76 * wk, dis = (1 - 0.82 * seen) * life, br = 0.95 + 0.65 * wk;
      let sx = 1, sy = 1, sc = 1, mouth = 0;
      if (state === 1) {                               // caught: it shows itself fully to say it
        mouth = 1; dis = 1; alpha = alpha > 0.9 ? alpha : 0.9;
        if (still) { if (st > 0.5) dis = Math.max(0, 1 - (st - 0.5) / 0.7); }
        else if (st < 0.45) { sc = 1 + 0.12 * Math.min(1, st / 0.08); py += 0.12 * Math.sin(st / 0.45 * Math.PI); }
        else if (st < 0.63) { const k = (st - 0.45) / 0.18; sc = 1.12; sy = 1 - 0.96 * k; sx = 1 + 0.35 * k; br *= 1 + k; }
        else { sc = 1.12; sy = 0.04; sx = 1.35 * (1 - Math.min(1, (st - 0.63) / 0.12)); br *= 2; }
      }
      sprite.visible = dis * alpha > 0.004 && sx > 0.01;
      sprite.position.set(px, py, pz);
      ang = Math.atan2(cx - px, cz - pz);
      sprite.rotation.y = ang;                         // upright billboard
      sprite.scale.setScalar(sc);
      U.uSquash.value.set(sx, sy);
      U.uAlpha.value = alpha; U.uDis.value = dis; U.uBright.value = br; U.uMouth.value = mouth;
      U.uGlow.value = (0.03 + 0.55 * wk) * (1 - 0.5 * seen);
      if (!still) {                                    // two-frame wobble and a rare tear
        frameT += dt; if (frameT > 0.32) { frameT = 0; fr = 1 - fr; }
        glitchT -= dt; if (glitchT <= 0) { glitch = 0.12 + rnd() * 0.1; glitchT = 6 + rnd() * 14; }
        if (glitch > 0) glitch -= dt;
      }
      U.uFrame.value = fr; U.uGlitch.value = glitch > 0 ? 1 : 0; U.uTime.value = t;
      // eyes: on you when near or creeping, otherwise where it drifts; down when above you
      let lx = 0;
      if (!creeping && state === 0 && d > 4) {
        const side = vx * Math.cos(ang) - vz * Math.sin(ang);
        lx = side > 0.06 ? 1 : side < -0.06 ? -1 : 0;
      }
      U.uLook.value.set(lx, py - cy > 0.7 ? 1 : 0);
    }

    if (bubbleT > 0) {
      bubbleT -= dt;
      if (bubbleT <= 0) bubble.visible = false;
      else {
        bubble.rotation.y = Math.atan2(cx - bx, cz - bz);
        bubble.scale.setScalar(bs * (still ? 1 : Math.min(1, 0.6 + (BUBBLE - bubbleT) / 0.25)));
        bubbleM.opacity = bubbleT < 0.35 ? bubbleT / 0.35 : 1;
      }
    }

    audioT -= dt;
    if (audioT <= 0) { audioT = 0.1; humTick(d, dx, dz); }
  }

  function onPick(target) {
    if (target !== sprite || (state !== 0 && state !== 3)) return;
    state = 1; st = 0; seen = 0; life = 1;
    bs = clamp(dist / 9, 1, 3);                        // stays legible from afar
    const off = 0.36 + 0.61 * bs;                      // tail tip at the ghost's head
    bx = px + Math.cos(ang) * off; by = py + 0.54 + 0.38 * bs; bz = pz - Math.sin(ang) * off;
    bubble.position.set(bx, by, bz); bubble.rotation.y = ang;
    bubble.scale.setScalar(bs * (still ? 1 : 0.6)); bubbleM.opacity = 1;
    bubble.visible = true; bubbleT = BUBBLE;
    booSound();
  }

  return { group, regions: [], colliders: [], pickables: [sprite], update, onPick };
}
