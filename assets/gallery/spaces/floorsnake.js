// floorsnake.js — "Cobra de chão": a giant pixel snake game projected onto the plaza paving.
//
// Where: the open forecourt beside the Studio door, west side of the plaza. Field x −10.75…−2.75,
//   z 44.25…51.25 (16 × 14 cells of 0.5 m), between the Studio wall (x −11), the axis band
//   (x −2.5), the chalk hopscotch (oddities.js, drawn to z 43.7) and the boundary wall (z 51.55).
//   The lamp post at (−4.5, 46) stands exactly in cell (12, 3): the game treats it as a pillar
//   the snake slithers round (no apples beside it). Flat light only: no colliders, no regions.
// Idle: a dim attract demo plays itself; now and then it scrolls "PISA PARA JOGAR".
// Play: step on and the snake leaves the far corner and steers for YOUR cell, a little slower
//   than walking (1.3 → 1.5 m/s; walking is 2.0), looking a little ahead as you score. Walk over
//   5 apples before its head reaches you → "GANHASTE!" + fanfare; caught → "APANHADO!" + a sad
//   trombone. Step off and the round pauses; 6 s later the snake gives up. Reduced motion: no
//   marquees (a still pixel face instead), nothing blinks.
// Cost: 1 draw call — one plane whose shader turns a 16 × 14 DataTexture (rewritten only on game
//   ticks, 896 bytes) into lit pixel blocks with eyes, a round apple, the projector frame and five
//   score pips. update() is a few dozen scalar ops, asleep beyond 40 m, no allocation per frame.
//   Sound: A-minor-pentatonic chiptune at 96 BPM from oscillators into ctx.audio.bus, placed at
//   the grid (pan + distance), only once audio exists and is unmuted. Palette: Sweetie-16.
// The game rules are pure functions (exported below build) so they can be tested in node.

export const COLS = 16, ROWS = 14, CELL = 0.5;
export const X0 = -10.75, Z0 = 44.25;
export const GOAL = 5;
export const EV_APPLE = 1, EV_GULP = 2, EV_CAUGHT = 4, EV_WIN = 8;
const X1 = X0 + COLS * CELL, Z1 = Z0 + ROWS * CELL;
const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
const N = COLS * ROWS;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];      // directions: 0 +x, 1 +z, 2 −x, 3 −z
const MAX_LEN = 60;
export const PILLAR = 3 * COLS + 12;               // the lamp post's cell
const BX = 0.2, BZN = 0.44, BZS = 0.25;            // plane margins (m): frame, + score pips on the north
const SCROLL = 11;                                 // marquee speed, cells per second
const DEMO_TICK = 0.42;
export const tickOf = (score) => 0.38 - 0.013 * score;   // s per cell: 1.32 → 1.52 m/s

// cells the snake may not enter, and cells apples avoid (the pillar and its neighbours)
const WALL = new Uint8Array(N), NOAPPLE = new Uint8Array(N);
WALL[PILLAR] = 1;
for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) NOAPPLE[PILLAR + dj * COLS + di] = 1;

// ---------------------------------------------------------------- game rules (pure) ---
export function createGame(seed = 1) {
  return { body: new Int16Array(N), head: 0, len: 0, grow: 0, occ: new Uint8Array(N), dir: 0, apple: -1, score: 0, seed: seed | 0 };
}
export function rand(g) {                          // mulberry32
  let t = (g.seed = (g.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const headOf = (g) => g.body[g.head];
const tailOf = (g) => g.body[(g.head - g.len + 1 + N) % N];

/** Lay a straight snake from its tail (ti, tj) along `dir`; the head is the last cell. */
export function placeSnake(g, ti, tj, dir, len) {
  g.occ.fill(0);
  for (let k = 0; k < len; k++) { const c = (tj + DZ[dir] * k) * COLS + ti + DX[dir] * k; g.body[k] = c; g.occ[c]++; }
  g.head = len - 1; g.len = len; g.grow = 0; g.dir = dir;
}

/** The best next direction toward (ti, tj) (fractional cells): never back, never off the grid or
 *  into the pillar, its own body only when nothing else is left. */
export function chooseDir(g, ti, tj, jitter) {
  const h = g.body[g.head], hi = h % COLS, hj = (h / COLS) | 0;
  const tail = g.grow > 0 ? -1 : tailOf(g);
  let best = -1, bestS = Infinity;
  for (let k = 0; k < 4; k++) {
    if (g.len > 1 && k === ((g.dir + 2) & 3)) continue;
    const i = hi + DX[k], j = hj + DZ[k];
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
    const c = j * COLS + i;
    if (WALL[c]) continue;
    const di = ti - i, dj = tj - j;
    let s = Math.sqrt(di * di + dj * dj);
    if (g.occ[c] && c !== tail) s += 40;
    if (k === g.dir) s -= 0.15;
    s += rand(g) * jitter;
    if (s < bestS) { bestS = s; best = k; }
  }
  return best;
}

export function advance(g, d) {
  const c = g.body[g.head] + DZ[d] * COLS + DX[d];
  if (g.grow > 0 && g.len < MAX_LEN) { g.grow--; g.len++; }
  else { g.grow = 0; g.occ[tailOf(g)]--; }
  g.head = (g.head + 1) % N;
  g.body[g.head] = c; g.occ[c]++; g.dir = d;
  return c;
}

/** A random free cell, `ring` cells in from the edge, ≥ 4 from the head and ≥ minV from (vi, vj). */
export function spawnApple(g, vi, vj, minV, ring) {
  const h = g.body[g.head], hi = h % COLS, hj = (h / COLS) | 0;
  for (let n = 0; n < 80; n++) {
    const i = ring + ((rand(g) * (COLS - 2 * ring)) | 0), j = ring + ((rand(g) * (ROWS - 2 * ring)) | 0);
    const c = j * COLS + i;
    if (g.occ[c] || NOAPPLE[c] || Math.abs(i - hi) + Math.abs(j - hj) < 4) continue;
    if (vi >= 0 && Math.abs(i - vi) + Math.abs(j - vj) < minV) continue;
    return (g.apple = c);
  }
  for (let c = 0; c < N; c++) if (!g.occ[c] && !NOAPPLE[c]) return (g.apple = c);
  return (g.apple = -1);
}

/** A round: the snake's tail in the corner farthest from the visitor, running along that edge. */
export function newRound(g, vi, vj) {
  const ci = vi < COLS / 2 ? COLS - 1 : 0, cj = vj < ROWS / 2 ? ROWS - 1 : 0;
  placeSnake(g, ci, cj, ci === 0 ? 0 : 2, 5);
  g.score = 0;
  spawnApple(g, vi, vj, 5, 1);
}

/** The visitor has just entered cell vc. */
export function visitorStep(g, vc) {
  if (vc < 0) return 0;
  let ev = 0;
  if (vc === g.apple) {
    g.score++; g.grow++; ev |= EV_APPLE;
    if (g.score >= GOAL) { g.apple = -1; return ev | EV_WIN; }
    spawnApple(g, vc % COLS, (vc / COLS) | 0, 5, 1);
  }
  if (vc === g.body[g.head]) ev |= EV_CAUGHT;
  return ev;
}

/** One move of the hunting snake toward (ti, tj); vc is the visitor's cell. */
export function snakeStep(g, ti, tj, vc) {
  const c = advance(g, chooseDir(g, ti, tj, 0.35));
  let ev = 0;
  if (c === g.apple) { g.grow++; ev |= EV_GULP; spawnApple(g, vc >= 0 ? vc % COLS : -1, vc >= 0 ? (vc / COLS) | 0 : -1, 5, 1); }
  if (c === vc) ev |= EV_CAUGHT;
  return ev;
}

export function resetDemo(g) {
  placeSnake(g, 1, 1 + ((rand(g) * (ROWS - 2)) | 0), 0, 4);
  g.score = 0;
  spawnApple(g, -1, -1, 0, 1);
}

/** Attract mode: classic snake that hunts apples; it starts over when boxed in or too long. */
export function demoStep(g) {
  if (g.apple < 0) spawnApple(g, -1, -1, 0, 1);
  const a = g.apple, d = chooseDir(g, a % COLS, (a / COLS) | 0, 0.6);
  const c = g.body[g.head] + DZ[d] * COLS + DX[d];
  if ((g.occ[c] && c !== (g.grow > 0 ? -1 : tailOf(g))) || g.len >= 26) { resetDemo(g); return; }
  advance(g, d);
  if (c === g.apple) { g.grow++; spawnApple(g, -1, -1, 0, 1); }
}

// ---------------------------------------------------------------- pixels (pure) ---
// The texture holds linear colour × 0.5 in rgb (the shader doubles it) and how much of the paving
// the light covers in alpha. Light stays ≤ ~1 over a well-covered base, so it reads saturated on
// sunlit stone (no wash to white) and glows at night. Colours: Sweetie-16, as the canon asks.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const rgb = (hex, k) => [0, 8, 16].map((s) => Math.min(255, Math.round(lin(((hex >> (16 - s)) & 255) / 255) * k * 127.5)));
const C_HEAD = rgb(0xa7f070, 1.1), C_NECK = rgb(0xa7f070, 0.85), C_TAIL = rgb(0x38b764, 1.35);
const C_APPLE = rgb(0xb13e53, 1.9), C_WALL = rgb(0x566c86, 0.35);
export const C_WIN = rgb(0xffcd75, 1.0), C_LOSE = rgb(0xef7d57, 1.1), C_INVITE = rgb(0x41a6f6, 0.9);

function put(data, c, r, g, b, a) { const o = c << 2; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a; }

export function paintGame(g, data) {
  data.fill(0);
  put(data, PILLAR, C_WALL[0], C_WALL[1], C_WALL[2], 140);
  if (g.apple >= 0) put(data, g.apple, C_APPLE[0], C_APPLE[1], C_APPLE[2], 215);
  const L = g.len, span = Math.max(1, L - 2);
  for (let k = L - 1; k > 0; k--) {               // tail first, so nearer segments win overlaps
    const s = (k - 1) / span, u = 1 - s;           // 0 at the neck, 1 at the tail
    put(data, g.body[(g.head - k + N) % N],
      (C_NECK[0] * u + C_TAIL[0] * s) | 0, (C_NECK[1] * u + C_TAIL[1] * s) | 0, (C_NECK[2] * u + C_TAIL[2] * s) | 0,
      (215 - 60 * s) | 0);
  }
  if (L > 0) put(data, g.body[g.head], C_HEAD[0], C_HEAD[1], C_HEAD[2], 225);
}

// 3 × 5 pixel font (N is 4 wide so it can have its diagonal), plus two faces for reduced motion.
function glyph(rows) {
  const w = rows[0].length, h = rows.length, m = new Uint16Array(h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (rows[r][c] === '#') m[r] |= 1 << (w - 1 - c);
  return { w, h, m };
}
const FONT = new Map(Object.entries({
  A: ['###', '#.#', '###', '#.#', '#.#'], D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'],
  G: ['###', '#..', '#.#', '#.#', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'], '!': ['#', '#', '#', '.', '#'],
  ' ': ['..', '..', '..', '..', '..'],
}).map(([k, v]) => [k.charCodeAt(0), glyph(v)]));
export const SMILE = glyph(['..#####..', '.#.....#.', '#..#.#..#', '#.......#', '#.#...#.#', '#..###..#', '.#.....#.', '..#####..']);
export const FROWN = glyph(['..#####..', '.#.....#.', '#..#.#..#', '#.......#', '#..###..#', '#.#...#.#', '.#.....#.', '..#####..']);

export function textWidth(str) {
  let w = -1;
  for (let n = 0; n < str.length; n++) { const gl = FONT.get(str.charCodeAt(n)); if (gl) w += gl.w + 1; }
  return Math.max(0, w);
}

// Text space (tx right, ty away from the visitor) → grid cell, for a visitor facing
// 0 −z, 1 +x, 2 +z, 3 −x, so the words always read the right way up from where they stand.
function blit(data, gl, tx0, ty0, face, col, a) {
  const W = face & 1 ? ROWS : COLS, H = face & 1 ? COLS : ROWS;
  for (let row = 0; row < gl.h; row++) {
    const ty = ty0 + gl.h - 1 - row, bits = gl.m[row];
    if (ty < 0 || ty >= H) continue;
    for (let c = 0; c < gl.w; c++) {
      if (!((bits >> (gl.w - 1 - c)) & 1)) continue;
      const tx = tx0 + c;
      if (tx < 0 || tx >= W) continue;
      let i, j;
      if (face === 0) { i = tx; j = ROWS - 1 - ty; } else if (face === 2) { i = COLS - 1 - tx; j = ty; }
      else if (face === 1) { i = ty; j = tx; } else { i = COLS - 1 - ty; j = ROWS - 1 - tx; }
      put(data, j * COLS + i, col[0], col[1], col[2], a);
    }
  }
}
export function paintText(data, str, off, face, col, a) {
  const ty0 = ((face & 1 ? COLS : ROWS) - 5) >> 1;
  let x = off;
  for (let n = 0; n < str.length; n++) {
    const gl = FONT.get(str.charCodeAt(n));
    if (gl) { blit(data, gl, x, ty0, face, col, a); x += gl.w + 1; }
  }
}
export function paintIcon(data, gl, face, col, a) {
  const W = face & 1 ? ROWS : COLS, H = face & 1 ? COLS : ROWS;
  blit(data, gl, (W - gl.w) >> 1, (H - gl.h) >> 1, face, col, a);
}

// ---------------------------------------------------------------- the projection ---
const VERT = /* glsl */`
  varying vec2 vP;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
// Premultiplied light: rgb is added, alpha is how much of the paving under it is covered.
const FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec4 uField;      // x0, z0, 1 / cell
  uniform vec2 uSize;       // cols, rows
  uniform vec4 uYou;        // visitor cell i, j, shown, danger 0..1
  uniform vec4 uHead;       // head cell i, j, direction, shown
  uniform vec4 uApple;      // apple cell i, j, shown
  uniform vec2 uState;      // brightness, apples collected
  varying vec2 vP;
  void main() {
    vec2 g = (vP - uField.xy) * uField.z;
    float aa = max(fwidth(g.x), fwidth(g.y)) + 1e-4;
    vec2 c = clamp(floor(g), vec2(0.0), uSize - 1.0);
    vec4 tx = texture2D(uMap, (c + 0.5) / uSize);
    vec2 q = max(-g, g - uSize);
    float outside = max(q.x, q.y);
    vec3 col; float cover;
    if (outside <= 0.0) {
      vec2 l = fract(g) - 0.5;
      float e = max(abs(l.x), abs(l.y));
      float shape = 1.0 - smoothstep(0.40 - aa, 0.40 + aa, e);                 // a pixel block
      if (uApple.z > 0.5 && c == uApple.xy) {                                   // ...or a round apple
        shape = 1.0 - smoothstep(0.33 - aa, 0.33 + aa, length(l - vec2(0.0, 0.03)));
      }
      float line = (1.0 - smoothstep(0.0, aa * 1.5, 0.5 - e)) * clamp(1.6 - aa * 5.0, 0.0, 1.0);
      col = vec3(0.053, 0.381, 0.922) * (0.045 * line + 0.01) + tx.rgb * 2.0 * shape;
      cover = tx.a * shape;
      if (uApple.z > 0.5 && c == uApple.xy) {                                   // its leaf
        vec2 lp = (l - vec2(0.13, -0.36)) * mat2(0.8, 0.6, -0.6, 0.8);
        float leaf = 1.0 - smoothstep(1.0 - aa * 8.0, 1.0, length(lp / vec2(0.13, 0.06)));
        col = mix(col, vec3(0.05, 0.62, 0.17), leaf); cover = max(cover, leaf * 0.75);
      }
      if (uHead.w > 0.5 && c == uHead.xy) {                                     // two eyes
        float a = uHead.z * 1.5707963;
        vec2 F = vec2(cos(a), sin(a)), S = vec2(-F.y, F.x);
        float d = min(length(l - F * 0.14 - S * 0.17), length(l - F * 0.14 + S * 0.17));
        float eye = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, d);
        col *= 1.0 - eye; cover = mix(cover, 0.92, eye);
      }
      if (uYou.z > 0.5 && c == uYou.xy) {                                       // you are here
        float ring = smoothstep(0.42 - aa, 0.42 + aa, e) * (1.0 - smoothstep(0.485 - aa, 0.485 + aa, e));
        col += mix(vec3(0.17, 0.86, 0.93), vec3(0.95, 0.23, 0.1), uYou.w) * ring;
        cover = max(cover, ring * 0.7);
      }
    } else {
      float fr = 1.0 - smoothstep(0.035, 0.035 + aa, abs(outside - 0.2));      // projector frame
      col = vec3(0.053, 0.381, 0.922) * 0.7 * fr;
      cover = 0.35 * fr;
      if (g.y < 0.0 && q.x <= 0.0) {                                            // score pips (north)
        float u = (g.x - uSize.x * 0.5) / 0.8 + 2.5, k = floor(u);
        if (k >= 0.0 && k <= 4.0) {
          vec2 pd = abs(vec2((fract(u) - 0.5) * 0.8, q.y - 0.62));
          float pip = 1.0 - smoothstep(0.19 - aa, 0.19 + aa, max(pd.x, pd.y));
          bool lit = k < uState.y - 0.5;
          col += (lit ? vec3(0.39, 0.87, 0.16) : vec3(0.09, 0.15, 0.24) * 0.6) * pip;
          cover = max(cover, pip * (lit ? 0.8 : 0.15));
        }
      }
    }
    gl_FragColor = vec4(col * uState.x, cover * uState.x);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function build(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'floorsnake';

  const data = new Uint8Array(N * 4);
  const tex = new THREE.DataTexture(data, COLS, ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const uYou = new THREE.Vector4(0, 0, 0, 0), uHead = new THREE.Vector4(0, 0, 0, 0), uApple = new THREE.Vector4(0, 0, 0, 0);
  const uState = new THREE.Vector2(0.42, 0);
  const mat = new THREE.ShaderMaterial({
    name: 'floorsnake',
    uniforms: {
      uMap: { value: tex }, uField: { value: new THREE.Vector4(X0, Z0, 1 / CELL, 0) },
      uSize: { value: new THREE.Vector2(COLS, ROWS) }, uYou: { value: uYou }, uHead: { value: uHead },
      uApple: { value: uApple }, uState: { value: uState },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const geo = new THREE.PlaneGeometry(X1 - X0 + 2 * BX, Z1 - Z0 + BZN + BZS);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CX, 0.012, (Z0 - BZN + Z1 + BZS) / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'floorsnake-grid';
  mesh.raycast = () => {};                       // light, not a thing: clicks fall through to the paving
  mesh.matrixAutoUpdate = false;
  group.add(mesh);

  // ---- chiptune: oscillators into ctx.audio.bus, read lazily (null until the visitor enters) ----
  let ac = null, sIn = null, sPan = null, sOut = null, sBus = null, tickAlt = 0;
  function voice(cam, x, z) {
    const A = ctx.audio;
    if (!A) return null;
    let c = null, bus = null;
    try { if (A.muted) return null; c = A.context; bus = A.bus; } catch (e) { return null; }
    if (!c || !bus || c.state !== 'running') return null;
    try {
      if (c !== ac || !sIn) {
        ac = c;
        sIn = c.createBiquadFilter(); sIn.type = 'lowpass'; sIn.Q.value = 0.5; sIn.frequency.value = 4000;
        sOut = c.createGain(); sOut.gain.value = 0;
        sPan = c.createStereoPanner ? c.createStereoPanner() : null;
        if (sPan) { sIn.connect(sPan); sPan.connect(sOut); } else sIn.connect(sOut);
        sOut.connect(bus); sBus = bus;
      } else if (bus !== sBus) { sOut.disconnect(); sOut.connect(bus); sBus = bus; }
      // placed: the sound comes from (x, z), dulls and fades with distance
      const p = cam.position, e = cam.matrixWorld.elements;
      const dx = x - p.x, dz = z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      const t = c.currentTime;
      const att = Math.max(0, 1 - d / 30);
      sOut.gain.setTargetAtTime(0.13 * att * att, t, 0.01);
      sIn.frequency.setTargetAtTime(Math.max(900, 4200 - d * 140), t, 0.01);
      if (sPan) sPan.pan.setTargetAtTime(d > 0.8 ? Math.max(-0.7, Math.min(0.7, (dx * e[0] + dz * e[2]) / d)) : 0, t, 0.01);
    } catch (e) { sIn = null; return null; }
    return c;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function tone(c, t, f, dur, type, vol, f2, att) {
    const o = c.createOscillator(), g = c.createGain(), a = att || 0.006;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sIn);
    o.start(t); o.stop(t + dur + 0.03);
    return o;
  }
  // A minor pentatonic (A C D E G), 96 BPM: a sixteenth is 0.156 s
  const S16 = 60 / 96 / 4;
  const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];
  const WIN_LEAD = [69, 0, 1, 72, 1, 1, 76, 2, 1, 79, 3, 1, 76, 4, 0.5, 79, 4.5, 0.5, 81, 5, 4];
  const WIN_BASS = [45, 0, 2, 52, 2, 3, 57, 5, 4];
  function sfx(kind, cam, x, z, n) {
    const c = voice(cam, x, z);
    if (!c) return;
    try {
      const t = c.currentTime + 0.01;
      if (kind === 'ready') { for (let k = 0; k < 3; k++) tone(c, t + k * S16 * 0.5, hz(PENTA[5 + k * 2]), S16 * 0.5, 'square', 0.32); }
      else if (kind === 'go') tone(c, t, hz(81), S16 * 0.6, 'square', 0.3);
      else if (kind === 'apple') {
        const k = Math.min(n, 5);
        tone(c, t, hz(PENTA[6 + k]), S16 * 0.45, 'square', 0.34);
        tone(c, t + S16 * 0.45, hz(PENTA[8 + k]), S16 * 0.8, 'square', 0.34);
      } else if (kind === 'gulp') {
        tone(c, t, hz(64), 0.24, 'triangle', 0.8, hz(45));
        tone(c, t + 0.02, hz(52), 0.12, 'square', 0.14, hz(40));
      } else if (kind === 'tick') { tickAlt ^= 1; tone(c, t, hz(tickAlt ? 45 : 40), 0.045, 'triangle', n); }
      else if (kind === 'win') {
        for (let k = 0; k < WIN_LEAD.length; k += 3) tone(c, t + WIN_LEAD[k + 1] * S16, hz(WIN_LEAD[k]), WIN_LEAD[k + 2] * S16 * 0.92, 'square', 0.3);
        for (let k = 0; k < WIN_BASS.length; k += 3) tone(c, t + WIN_BASS[k + 1] * S16, hz(WIN_BASS[k]), WIN_BASS[k + 2] * S16 * 0.95, 'triangle', 0.55);
      } else if (kind === 'lose') {                // wah, wah, wah, waaah (E D C … A)
        const m = [64, 62, 60];
        for (let k = 0; k < 3; k++) tone(c, t + k * 2 * S16, hz(m[k]), 1.8 * S16, 'sawtooth', 0.26, hz(m[k] - 0.3), 0.05);
        const o = tone(c, t + 6 * S16, hz(57), 6 * S16, 'sawtooth', 0.28, hz(55), 0.05);
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 5.5; lg.gain.value = 7;
        lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t + 7 * S16); lfo.stop(t + 12.2 * S16);
      } else if (kind === 'pause') tone(c, t, hz(64), 0.16, 'triangle', 0.5, hz(57));
      else if (kind === 'resume') tone(c, t, hz(57), 0.12, 'triangle', 0.5, hz(64));
      else if (kind === 'bye') tone(c, t, hz(57), 0.3, 'square', 0.18, hz(45));
    } catch (e) { /* sound is optional */ }
  }
  const toast = (s) => { try { if (ctx.ui && ctx.ui.toast) ctx.ui.toast(s); } catch (e) { /* ignore */ } };

  // ---- the machine ----
  const DEMO = 0, READY = 1, PLAY = 2, PAUSE = 3, END = 4;
  const G = createGame(0x5a7e);
  resetDemo(G);
  let mode = DEMO, t = 0, acc = 0, lvl = 0.42, readyMin = 0.5;
  let on = false, vc = -1, moved = false, px = NaN, pz = NaN, vx = 0, vz = 0;
  let attract = 12, danger = 0, roundT = 0, rounds = 0, gulped = false, won = false, best = 0;
  let msgStr = null, msgIcon = null, msgFace = 0, msgT = 0, msgDur = 0, msgLast = 0, msgCol = C_WIN, msgA = 0;

  function show() {
    paintGame(G, data); tex.needsUpdate = true;
    const h = G.body[G.head];
    uHead.set(h % COLS, (h / COLS) | 0, G.dir, G.len > 0 ? 1 : 0);
    if (G.apple >= 0) uApple.set(G.apple % COLS, (G.apple / COLS) | 0, 1, 0); else uApple.z = 0;
  }
  show();
  function faceOf(cam) {
    const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10];
    return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz < 0 ? 0 : 2);
  }
  function message(str, icon, face, col, a, hold) {
    msgStr = str; msgIcon = icon; msgFace = face; msgCol = col; msgA = a; msgT = -hold; msgLast = 1e9;
    msgDur = icon ? 3.2 : ((face & 1 ? ROWS : COLS) + textWidth(str)) / SCROLL;
  }
  function runMessage(dt) {                       // false once the message is over
    msgT += dt;
    if (msgT < 0) return true;                    // hold the last game frame a moment
    if (msgT >= msgDur) { msgStr = msgIcon = null; return false; }
    const off = msgIcon ? 0 : (msgFace & 1 ? ROWS : COLS) - Math.floor(msgT * SCROLL);
    if (off !== msgLast) {
      msgLast = off; data.fill(0); uHead.w = 0; uApple.z = 0;
      if (msgIcon) paintIcon(data, msgIcon, msgFace, msgCol, msgA); else paintText(data, msgStr, off, msgFace, msgCol, msgA);
      tex.needsUpdate = true;
    }
    return true;
  }
  function startRound(i, j, cam) {
    newRound(G, i, j);
    mode = READY; t = 0; acc = 0; readyMin = rounds ? 0.8 : 0.5; moved = false; vc = j * COLS + i;
    roundT = 0; gulped = false; won = false; danger = 0; msgStr = msgIcon = null;
    if (!rounds) toast('Apanha 5 maçãs. Foge da cobra!');
    rounds++;
    show(); sfx('ready', cam, CX, CZ);
  }
  function toDemo(cam, bye) {
    mode = DEMO; t = 0; acc = 0; attract = 12; danger = 0; msgStr = msgIcon = null;
    resetDemo(G); show();
    if (bye) sfx('bye', cam, CX, CZ);
  }
  function finish(win, cam) {
    mode = END; won = win; show();
    const reduced = !!ctx.reducedMotion, face = faceOf(cam), p = cam.position;
    if (win) {
      danger = 0;
      message('GANHASTE!', reduced ? SMILE : null, face, C_WIN, 225, 0.5);
      sfx('win', cam, p.x, p.z);
      const tm = Math.round(roundT * 10) / 10, s = tm.toFixed(1).replace('.', ',');
      toast(best && tm < best ? `GANHASTE! Recorde: ${s} s` : `GANHASTE! 5 maçãs em ${s} s`);
      if (!best || tm < best) best = tm;
    } else {
      danger = 1;
      message('APANHADO!', reduced ? FROWN : null, face, C_LOSE, 225, 0.7);
      sfx('lose', cam, p.x, p.z);
      toast(G.score === 0 ? 'APANHADO! A cobra foi mais rápida.' : G.score === GOAL - 1 ? 'APANHADO! Por uma maçã…' : `APANHADO! ${G.score} de ${GOAL} maçãs.`);
    }
  }
  function handle(ev, cam) {                      // true when the round is over
    if (ev & EV_WIN) { finish(true, cam); return true; }
    if (ev & EV_CAUGHT) { finish(false, cam); return true; }
    const p = cam.position;
    if (ev & EV_APPLE) sfx('apple', cam, p.x, p.z, G.score);
    if (ev & EV_GULP) {
      const h = G.body[G.head];
      sfx('gulp', cam, X0 + (h % COLS + 0.5) * CELL, Z0 + (((h / COLS) | 0) + 0.5) * CELL);
      if (!gulped) { gulped = true; toast('A cobra comeu a tua maçã!'); }
    }
    return false;
  }

  function update(dt, frame) {
    if (!(dt > 0) || !frame || !frame.camera) return;
    if (dt > 0.1) dt = 0.1;
    const cam = frame.camera, p = cam.position;
    const ex = p.x - CX, ez = p.z - CZ, d2 = ex * ex + ez * ez;
    if (d2 > 1600) { if (mode !== DEMO) toDemo(cam, false); px = NaN; return; }   // asleep beyond 40 m

    // the visitor: on the grid (on at its edge, off 0.3 m beyond it), cell, smoothed velocity
    const m = on ? 0.3 : 0;
    on = p.y < 3.6 && p.x > X0 - m && p.x < X1 + m && p.z > Z0 - m && p.z < Z1 + m;
    if (px === px) {
      const k = Math.min(1, dt * 5);
      const ux = (p.x - px) / dt, uz = (p.z - pz) / dt;
      vx += ((ux > 4 ? 4 : ux < -4 ? -4 : ux) - vx) * k; vz += ((uz > 4 ? 4 : uz < -4 ? -4 : uz) - vz) * k;
    }
    px = p.x; pz = p.z;
    const fi = (p.x - X0) / CELL, fj = (p.z - Z0) / CELL;
    const ii = fi < 0 ? 0 : fi >= COLS ? COLS - 1 : fi | 0, jj = fj < 0 ? 0 : fj >= ROWS ? ROWS - 1 : fj | 0;
    const cell = on ? jj * COLS + ii : -1;

    if (mode === DEMO) {
      if (on) startRound(ii, jj, cam);
      else if (msgStr) { if (!runMessage(dt)) { attract = 30; show(); } }
      else {
        attract -= dt;
        if (attract <= 0 && d2 < 196 && !ctx.reducedMotion) message('PISA PARA JOGAR', null, faceOf(cam), C_INVITE, 170, 0);
        acc += dt;
        const T = ctx.reducedMotion ? DEMO_TICK * 1.5 : DEMO_TICK;
        if (acc >= T) { acc = Math.min(acc - T, T); demoStep(G); show(); }
      }
    } else if (mode === READY) {
      t += dt;
      if (!on) { mode = PAUSE; t = 0; sfx('pause', cam, CX, CZ); }
      else {
        if (cell !== vc) { vc = cell; moved = true; }
        if (moved && t >= readyMin) {             // the snake wakes once you move
          mode = PLAY; acc = 0; sfx('go', cam, CX, CZ);
          const ev = visitorStep(G, vc);
          if (ev && !handle(ev, cam)) show();
        }
      }
    } else if (mode === PLAY) {
      if (!on) { mode = PAUSE; t = 0; sfx('pause', cam, CX, CZ); }
      else {
        roundT += dt;
        let over = false;
        if (cell !== vc) { vc = cell; const ev = visitorStep(G, cell); if (ev) { over = handle(ev, cam); if (!over) show(); } }
        acc += dt;
        const T = tickOf(G.score);
        if (!over && acc >= T) {
          acc = Math.min(acc - T, T);
          const lead = 0.05 * G.score / CELL;     // it learns to cut you off as you score
          const li = vx * lead, lj = vz * lead;
          const ev = snakeStep(G, fi - 0.5 + (li > 3 ? 3 : li < -3 ? -3 : li), fj - 0.5 + (lj > 3 ? 3 : lj < -3 ? -3 : lj), vc);
          const h = G.body[G.head], hi = h % COLS, hj = (h / COLS) | 0, di = hi - ii, dj = hj - jj;
          const dist = Math.sqrt(di * di + dj * dj);
          danger = dist < 4 ? 1 - dist / 4 : 0;
          if (!(ev && handle(ev, cam))) {
            show();
            if (dist < 5) sfx('tick', cam, X0 + (hi + 0.5) * CELL, Z0 + (hj + 0.5) * CELL, 0.12 + 0.4 * (1 - dist / 5));
          }
        }
      }
    } else if (mode === PAUSE) {
      t += dt;
      if (on) { mode = READY; t = 0; readyMin = 0.6; moved = false; vc = cell; sfx('resume', cam, CX, CZ); }
      else if (t > 6) toDemo(cam, true);
    } else if (!runMessage(dt)) {                 // END: when the words have gone by
      if (on) startRound(ii, jj, cam); else toDemo(cam, false);
    }

    // dim demo, bright game; the "you are here" cell (orange as the head closes in)
    const target = mode === DEMO ? (d2 < 400 ? 0.6 : 0.42) : mode === PAUSE ? 0.7 : 1;
    lvl += (target - lvl) * Math.min(1, dt * 2.5);
    uState.set(lvl, mode === DEMO ? 0 : mode === END && won ? GOAL : G.score);
    uYou.set(ii, jj, on && (mode === READY || mode === PLAY || (mode === END && msgT < 0)) ? 1 : 0, danger);
  }

  return { group, regions: [], colliders: [], pickables: [], update, onPick() {} };
}
