import { reserveModuleVoice, finishModuleVoice } from '../audio-lease.js';
// vending.js — "Máquina de vending existencial" (BRIEF §6.2 space module).
// A believable retro snack machine against the arcade's west wall, just south of
// its door: enamelled steel body, lit interior behind glass, coin slot, pickup tray.
// It sells immaterial goods with pixel-art labels and prices in euros. Click a
// product (or anywhere on the machine for a surprise): coin clink, motor whirr, the
// coil turns, the item drops into the tray with a thunk and a deadpan toast. One
// time in four it sticks halfway ("Bate-lhe.") and the next click shakes it loose.
// Footprint x 10.14–10.96, z 40.13–41.07, front facing −x. At most 5 draw calls:
// enamel body, pixel panels + products (one 256² canvas), glass, coils (instanced),
// and the dropped item. No lights, no per-frame allocation, idle beyond 40 m.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WX = 10.56, WZ = 40.6, YAW = -Math.PI / 2;  // local +z (the front) faces world −x
const COLX = [-0.3167, -0.13, 0.0567];             // slot centres across the window
const SHELF = [1.37, 1.12, 0.87, 0.62];            // shelf tops, rows A..D
const COIL_Y = 0.072, COIL_Z = -0.01, COIL_R = 0.07, COIL_L = 0.53, TURNS = 6;
const FRONT = 0.248;                               // products' front faces
const ADV = 0.075;                                 // how far one coil turn pushes an item
const TRAY_Y = 0.18;                               // tray floor
const EM = 0.5;                                    // backlight (emissive) of the pixel panels
const GRAV = 9.8;
const IDLE = 0, VEND = 1, STUCK = 2, SHAKE = 3, FALL = 4;

// ---------- the goods ----------
const ITEMS = [
  { name: 'Saudade', top: 'SAUDADE', bot: '0 GRAMAS', col: '#4f63a8', icon: 'heart', ic: '#f2b8c6', shape: 'box', w: 0.12, h: 0.15, d: 0.045,
    line: 'Saiu-lhe: Saudade. Ainda nem a abriu e já tem saudades dela.' },
  { name: 'Paciência', top: 'PACIÊNCIA', bot: 'INFINITA', col: '#c9a35a', icon: 'hourglass', ic: '#3b2d18', shape: 'box', w: 0.11, h: 0.14, d: 0.05, empty: true,
    line: 'Saiu-lhe: Paciência. Não estava esgotada afinal.' },
  { name: 'Coragem', top: 'CORAGEM', bot: '330 ML', col: '#cf4a35', icon: 'bolt', ic: '#ffd84a', shape: 'can', r: 0.034, h: 0.12,
    line: 'Saiu-lhe: Coragem. É terça-feira: aproveite.' },
  { name: 'Wi-Fi do vizinho', top: 'WI-FI', bot: 'VIZINHO', col: '#3f9bd0', icon: 'wifi', ic: '#ffffff', shape: 'box', w: 0.13, h: 0.10, d: 0.04,
    line: 'Saiu-lhe: Wi-Fi do vizinho. A palavra-passe vende-se à parte.' },
  { name: 'Silêncio', top: 'SILÊNCIO', bot: '...', col: '#e6e2d8', band: '#1d1b1a', ink: '#f4efe3', bc: '#1d1b1a', icon: 'mute', ic: '#2a2a2a', shape: 'box', w: 0.10, h: 0.15, d: 0.05,
    line: 'Saiu-lhe: Silêncio. Nem se ouviu cair.' },
  { name: 'Segunda-feira', top: 'SEGUNDA', bot: 'FEIRA', col: '#7d838b', icon: 'calendar', ic: '#e9e6df', shape: 'box', w: 0.12, h: 0.14, d: 0.04,
    line: 'Saiu-lhe: Segunda-feira. Grátis. Percebe-se porquê.' },
  { name: 'Sesta', top: 'SESTA', bot: '20 MIN', col: '#2c3b6b', icon: 'moon', ic: '#f3e3a0', shape: 'can', r: 0.034, h: 0.12,
    line: 'Saiu-lhe: Sesta. Consumir de preferência deitado.' },
  { name: 'A outra meia', top: 'A OUTRA', bot: 'MEIA', col: '#6fbf95', icon: 'sock', ic: '#f4efe3', shape: 'box', w: 0.11, h: 0.16, d: 0.03,
    line: 'Saiu-lhe: A outra meia. Agora perdeu a primeira.' },
  { name: 'Cinco minutinhos', top: '5 MIN.', bot: '+/- 20', col: '#e0a526', icon: 'clock', ic: '#3b2d18', bc: '#3b2d18', shape: 'box', w: 0.12, h: 0.12, d: 0.045,
    line: 'Saiu-lhe: Cinco minutinhos. Duram sempre vinte.' },
  { name: 'Troco certo', top: 'TROCO', bot: 'CERTO', col: '#b8923a', icon: 'coin', ic: '#fff1b0', shape: 'can', r: 0.03, h: 0.11,
    line: 'Saiu-lhe: Troco certo. Pagou 1 €, recebeu 1 €. Negócio redondo.' },
  { name: 'Desculpa esfarrapada', top: 'DESCULPA', bot: 'ESFARRAP.', col: '#e06d97', icon: 'bandaid', ic: '#f6d7b8', shape: 'box', w: 0.12, h: 0.15, d: 0.035,
    line: 'Saiu-lhe: Desculpa esfarrapada. Serve para tudo, não convence ninguém.' },
  { name: 'Domingo à tarde', top: 'DOMINGO', bot: 'À TARDE', col: '#e9874a', icon: 'sunset', ic: '#fff0c8', shape: 'box', w: 0.13, h: 0.13, d: 0.05,
    line: 'Saiu-lhe: Domingo à tarde. Já traz um bocadinho de melancolia.' },
];
const MENU = [
  ['A1', 'SAUDADE', '0,50€'], ['A2', 'PACIÊNCIA', 'ESGOTADO'], ['A3', 'CORAGEM', 'SÓ TERÇAS'],
  ['B1', 'WI-FI VIZINHO', '2€'], ['B2', 'SILÊNCIO', '5€'], ['B3', 'SEGUNDA', 'GRÁTIS*'],
  ['C1', 'SESTA', '1,20€'], ['C2', 'A OUTRA MEIA', '0,80€'], ['C3', '5 MINUTINHOS', '3€'],
  ['D1', 'TROCO CERTO', '1€'], ['D2', 'DESCULPA', '0,10€'], ['D3', 'DOMINGO À TARDE', '4€'],
];
const STRIPS = [['A1 0,50€', 'A2 ESGOT.', 'A3 TERÇAS'], ['B1 2€', 'B2 5€', 'B3 GRÁTIS'],
  ['C1 1,20€', 'C2 0,80€', 'C3 3€'], ['D1 1€', 'D2 0,10€', 'D3 4€']];

// ---------- a 3×5 pixel font (8-row cells: 2 accent rows, 5 cap rows, 1 descender) ----------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', ',': '000000000010100', '.': '000000000000010', '-': '000000111000000',
  '€': '011100111100011', ':': '000010000010000', '!': '010010010000010', '?': '110001010000010', '(': '010100100100010',
  ')': '010001001001010', '/': '001001010100100', '+': '000010111010000', '*': '000101010101000', '·': '000000010000000',
};
const ACCENT = { 'Á': ['A', 'acute'], 'À': ['A', 'grave'], 'Â': ['A', 'circ'], 'Ã': ['A', 'tilde'], 'É': ['E', 'acute'],
  'Ê': ['E', 'circ'], 'Í': ['I', 'acute'], 'Ó': ['O', 'acute'], 'Ô': ['O', 'circ'], 'Õ': ['O', 'tilde'], 'Ú': ['U', 'acute'], 'Ç': ['C', 'ced'] };
const MARKS = { acute: [[2, 0], [1, 1]], grave: [[0, 0], [1, 1]], circ: [[1, 0], [0, 1], [2, 1]], tilde: [[1, 0], [2, 0], [0, 1]], ced: [[1, 7]] };
// 8×8 icons, '#' = ink
const ICONS = {
  heart: '.##..##.########################.######...####.....##...........',
  hourglass: '########.#....#...#..#.....##......##.....#..#...#.##.#.########',
  bolt: '....###....###....###....######....###....###....##.....#.......',
  wifi: '.######.#......#..####...#....#....##..............##......##...',
  mute: '...#......##....####.#.#####..#.####.#.#..##.......#............',
  calendar: '.#....#.#################......##.#.#.###......##.#.#..#########',
  moon: '..##.###.##...#.##...#..##..###.##.......##.......###...........',
  sock: '..###.....###.....###.....###.....####....#####....####.........',
  clock: '..####...#....#.#..#...##..#...##..###.##......#.#....#...####..',
  coin: '..####...#....#.#..##..##.#....##.###..##.#....#.#.##.#...####..',
  bandaid: '.................######.##.##.####.##.##.######.................',
  sunset: '...........##....######.########........########.........######.',
  shake: '#.####.##.#..#.#..#..#..#.####.##.#.##.#..####..#.#..#.##.####.#',
};

// ---------- atlas regions [x, y, w, h] in the 256² canvas ----------
const RG = {
  marq: [0, 0, 164, 32], led: [168, 0, 64, 16], sold: [168, 18, 40, 12], menu: [0, 32, 88, 160],
  back: [236, 32, 16, 64], keys: [92, 192, 64, 64], coin: [160, 192, 64, 48], sticker: [0, 196, 84, 24],
};
const cellOf = (i) => [92 + (i % 4) * 36, 32 + ((i / 4) | 0) * 40, 36, 40];
const stripOf = (r) => [92, 154 + r * 9, 112, 9];
const PATCH = { white: [244, 104], silver: [244, 112], dark: [244, 120] };
const rectUV = ([x, y, w, h]) => [x / 256, 1 - (y + h) / 256, (x + w) / 256, 1 - y / 256];
const ptUV = ([x, y]) => [(x + 0.5) / 256, 1 - (y + 0.5) / 256];

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const rm = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'vending';
  const root = new THREE.Group();
  root.name = 'vending-machine';
  root.position.set(WX, 0, WZ);
  root.rotation.y = YAW;
  root.userData.action = { type: 'custom', id: 'vending' };   // anywhere on the machine: a surprise
  group.add(root);

  // ================= the pixel atlas =================
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const PX = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const tw = (s, k = 1) => (s.length * 4 - 1) * k;
  function glyph(ch, x, y, k) {
    let base = ch, mark = null;
    const a = ACCENT[ch];
    if (a) { base = a[0]; mark = a[1]; }
    const f = FONT[base];
    if (!f) return;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (f.charCodeAt(r * 3 + c) === 49) g.fillRect(x + c * k, y + (r + 2) * k, k, k);
    if (mark) for (const [c, r] of MARKS[mark]) g.fillRect(x + c * k, y + r * k, k, k);
  }
  function txt(s, x, y, c, k = 1) { g.fillStyle = c; for (const ch of s) { glyph(ch, x, y, k); x += 4 * k; } }
  function icon(name, x, y, k, c) {
    const m = ICONS[name];
    g.fillStyle = c;
    for (let i = 0; i < 64; i++) if (m.charCodeAt(i) === 35) g.fillRect(x + (i & 7) * k, y + (i >> 3) * k, k, k);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;

  function led(msg) {
    const [x, y, w, h] = RG.led;
    PX(x, y, w, h, '#170804');
    g.fillStyle = '#2d120a';
    for (let yy = y + 1; yy < y + h; yy += 2) for (let xx = x + 1; xx < x + w; xx += 2) g.fillRect(xx, yy, 1, 1);
    txt(msg, x + ((w - tw(msg)) >> 1), y + 4, '#ffb347');
    tex.needsUpdate = true;
  }
  (function drawAtlas() {
    PX(0, 0, 256, 256, '#26282c');
    // marquee
    { const [x, y, w, h] = RG.marq;
      PX(x, y, w, h, '#f1e6c8'); PX(x, y, w, 2, '#2f7c78'); PX(x, y + h - 2, w, 2, '#2f7c78');
      const t = 'BENS IMATERIAIS';
      txt(t, x + ((w - tw(t, 2)) >> 1), y + 1, '#1f4f4c', 2);
      PX(x + 6, y + 18, w - 12, 2, '#cf4a35'); PX(x + 6, y + 21, w - 12, 1, '#e0a526');
      const s = 'SÓ MOEDAS · NÃO DÁ TROCO';
      txt(s, x + ((w - tw(s)) >> 1), y + 22, '#1f4f4c'); }
    // menu card
    { const [x, y, w, h] = RG.menu;
      PX(x, y, w, h, '#efe4c8'); PX(x, y, w, 12, '#1f4f4c'); PX(x, y + h - 1, w, 1, '#1f4f4c');
      const t = 'O QUE DESEJA?';
      txt(t, x + ((w - tw(t)) >> 1), y + 2, '#f1e6c8');
      MENU.forEach(([code, name, price], k) => {
        const yy = y + 15 + k * 10, px = x + w - 2 - tw(price);
        txt(code, x + 2, yy, '#cf4a35');
        txt(name, x + 12, yy, '#1d1b1a');
        txt(price, px, yy, k === 1 ? '#cf4a35' : '#1f6f6a');
        g.fillStyle = '#b9ad90';
        for (let dx = x + 12 + tw(name) + 3; dx < px - 2; dx += 2) g.fillRect(dx, yy + 6, 1, 1);
      });
      txt('* NINGUÉM QUER', x + 2, y + 136, '#6b6355');
      txt('SUJEITO A HUMOR', x + 2, y + 147, '#6b6355'); }
    // product labels
    ITEMS.forEach((p, i) => {
      const [x, y] = cellOf(i);
      PX(x, y, 36, 40, p.col); PX(x, y + 3, 36, 10, p.band || '#f4efe3');
      txt(p.top, x + ((36 - tw(p.top)) >> 1), y + 4, p.ink || '#1d1b1a');
      icon(p.icon, x + 10, y + 14, 2, p.ic);
      txt(p.bot, x + ((36 - tw(p.bot)) >> 1), y + 30, p.bc || '#f4efe3');
      PX(x + 35, y, 1, 40, 'rgba(0,0,0,0.28)'); PX(x, y + 39, 36, 1, 'rgba(0,0,0,0.28)');
    });
    // price strips on the shelf lips
    STRIPS.forEach((row, r) => {
      const [x, y, w, h] = stripOf(r);
      PX(x, y, w, h, '#f4f1e8'); PX(x, y + h - 1, w, 1, '#9a9488');
      row.forEach((s, c) => {
        const cx = x + Math.round(c * w / 3);
        if (c) PX(cx, y, 1, h - 1, '#c9c2b2');
        txt(s, cx + ((Math.round(w / 3) - tw(s)) >> 1), y, r === 0 && c === 1 ? '#cf4a35' : '#1d1b1a');
      });
    });
    // "ESGOTADO" card standing in the empty slot
    { const [x, y] = RG.sold; PX(x, y, 40, 12, '#a8331f'); PX(x + 1, y + 1, 38, 10, '#d84a33'); txt('ESGOTADO', x + 4, y + 2, '#fff4e0'); }
    // lit back wall of the interior: warm tube light fading downwards
    { const [x, y, w, h] = RG.back;
      for (let k = 0; k < h; k++) { const t = k / (h - 1); PX(x, y + k, w, 1, `rgb(${255 - t * 112 | 0},${243 - t * 110 | 0},${214 - t * 100 | 0})`); }
      PX(x + 7, y, 2, h, 'rgba(255,255,255,0.18)'); }
    // keypad
    { const [x, y] = RG.keys;
      PX(x, y, 64, 64, '#26282c');
      ['A', 'B', 'C', 'D', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', 'OK'].forEach((k, n) => {
        const bx = x + 4 + (n % 4) * 15, by = y + 4 + ((n / 4) | 0) * 15;
        PX(bx, by, 12, 12, '#d8d4cb'); PX(bx, by + 11, 12, 1, '#8f8a80'); PX(bx + 11, by, 1, 12, '#8f8a80');
        txt(k, bx + ((12 - tw(k)) >> 1), by + 1, n === 15 ? '#1f6f6a' : '#1d1b1a');
      }); }
    // coin slot + coin return
    { const [x, y] = RG.coin;
      PX(x, y, 64, 48, '#26282c');
      PX(x + 8, y + 4, 14, 22, '#c3c8ce'); PX(x + 9, y + 5, 12, 20, '#8d939a'); PX(x + 14, y + 8, 2, 14, '#050505');
      txt('MOEDAS', x + 3, y + 27, '#e9e4d8');
      PX(x + 38, y + 4, 20, 20, '#c3c8ce'); PX(x + 40, y + 6, 16, 16, '#0b0b0b');
      txt('TROCO', x + 39, y + 27, '#e9e4d8');
      const s = 'NÃO DÁ TROCO';
      txt(s, x + ((64 - tw(s)) >> 1), y + 38, '#e0a526'); }
    // the sticker every machine has
    { const [x, y, w, h] = RG.sticker;
      PX(x, y, w, h, '#1d1b1a'); PX(x + 1, y + 1, w - 2, h - 2, '#f2c12e');
      icon('shake', x + 4, y + 4, 2, '#1d1b1a');
      txt('NÃO ABANE', x + 26, y + 3, '#1d1b1a'); txt('A MÁQUINA', x + 26, y + 12, '#1d1b1a'); }
    PX(240, 100, 8, 8, '#fffaf0'); PX(240, 108, 8, 8, '#c9ccd0'); PX(240, 116, 8, 8, '#151515');
  })();
  led('INSIRA MOEDA');

  // ================= enamel body (one mesh, vertex-coloured) =================
  const TEAL = 0x23847c, TEAL_D = 0x1a5e58, CREAM = 0xf2e0b0, GRAPH = 0x2a2c30, DARK = 0x141414, LINER = 0x4a4d52, SHELFC = 0x8a8e94;
  const bodyGeos = [];
  const tint = new THREE.Color();
  function bb(x0, x1, y0, y1, z0, z1, hex) {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    M.boxUV(geo);
    tint.set(hex);
    const n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = tint.r; a[i * 3 + 1] = tint.g; a[i * 3 + 2] = tint.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bodyGeos.push(geo);
  }
  // carcass
  bb(-0.45, -0.43, 0.06, 1.84, -0.40, 0.38, TEAL); bb(0.43, 0.45, 0.06, 1.84, -0.40, 0.38, TEAL);
  bb(-0.43, 0.43, 0.06, 1.84, -0.40, -0.38, TEAL_D);
  bb(-0.455, 0.455, 1.84, 1.87, -0.405, 0.425, CREAM);
  bb(-0.42, 0.42, 0, 0.06, -0.37, 0.37, 0x101010);
  bb(-0.452, -0.45, 1.63, 1.81, -0.40, 0.38, CREAM); bb(0.45, 0.452, 1.63, 1.81, -0.40, 0.38, CREAM);
  bb(-0.452, -0.45, 0.10, 0.13, -0.40, 0.38, CREAM); bb(0.45, 0.452, 0.10, 0.13, -0.40, 0.38, CREAM);
  // door: stiles, header, rails, mullion, control column
  bb(-0.45, -0.41, 0.06, 1.84, 0.38, 0.42, CREAM); bb(0.41, 0.45, 0.06, 1.84, 0.38, 0.42, CREAM);
  bb(-0.41, 0.41, 1.60, 1.84, 0.38, 0.42, CREAM);
  bb(-0.41, 0.15, 0.44, 0.60, 0.38, 0.42, CREAM);
  bb(-0.41, -0.36, 0.18, 0.44, 0.38, 0.42, CREAM); bb(0.10, 0.15, 0.18, 0.44, 0.38, 0.42, CREAM);
  bb(-0.41, 0.15, 0.06, 0.18, 0.38, 0.42, TEAL_D);
  bb(0.15, 0.19, 0.06, 1.60, 0.38, 0.42, CREAM);
  bb(0.19, 0.41, 0.06, 1.60, 0.38, 0.415, GRAPH);
  bb(0.215, 0.385, 0.735, 0.865, 0.415, 0.4215, 0x3a3d42);           // coin panel bezel
  bb(0.36, 0.385, 0.60, 0.64, 0.415, 0.428, 0xb9bec4);               // door lock
  // pickup tray recess and its lip
  bb(-0.37, 0.11, 0.155, 0.18, 0.10, 0.38, DARK); bb(-0.37, 0.11, 0.18, 0.60, 0.10, 0.12, DARK);
  bb(-0.37, -0.36, 0.18, 0.44, 0.12, 0.38, DARK); bb(0.10, 0.11, 0.18, 0.44, 0.12, 0.38, DARK);
  bb(-0.36, 0.10, 0.18, 0.205, 0.395, 0.412, CREAM);
  // interior liner and shelves (seen through the glass)
  bb(-0.43, -0.41, 0.60, 1.60, -0.30, 0.38, LINER); bb(0.15, 0.17, 0.60, 1.60, -0.30, 0.38, LINER);
  bb(-0.41, 0.15, 1.60, 1.62, -0.30, 0.38, LINER);
  for (const s of SHELF) bb(-0.41, 0.15, s - 0.012, s, -0.30, 0.28, SHELFC);
  const enamel = M.get('plaster', { color: 0xffffff, roughness: 0.38 }).clone();
  enamel.vertexColors = true;
  enamel.needsUpdate = true;
  const body = new THREE.Mesh(mergeGeometries(bodyGeos, false), enamel);
  body.name = 'vending-body';
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  for (const geo of bodyGeos) geo.dispose();

  // ================= pixel panels + products (one mesh, the atlas) =================
  const parts = [];
  let vtx = 0;
  const addPart = (geo) => { const r = [vtx, geo.attributes.position.count]; parts.push(geo); vtx += r[1]; return r; };
  function plane(rgn, x0, x1, y0, y1, z) {
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    const [u0, v0, u1, v1] = rectUV(rgn), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return addPart(geo);
  }
  function solid(pt, x0, x1, y0, y1, z0, z1) {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const [u, v] = ptUV(pt), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
    return addPart(geo);
  }
  // A product centred at its own origin: label on +z, sides in the label's base colour.
  function productGeo(i) {
    const p = ITEMS[i], c = cellOf(i);
    const [u0, v0, u1, v1] = rectUV(c), [su, sv] = ptUV([c[0] + 1, c[1] + 1]);
    let geo;
    if (p.shape === 'can') {
      geo = new THREE.CylinderGeometry(p.r, p.r, p.h, low ? 10 : 16, 1);
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, [cu, cvv] = ptUV(PATCH.silver);
      for (let k = 0; k < uv.count; k++) {
        if (Math.abs(nor.getY(k)) > 0.5) uv.setXY(k, cu, cvv);
        else uv.setXY(k, u0 + (pos.getX(k) / (2 * p.r) + 0.5) * (u1 - u0), v0 + (pos.getY(k) / p.h + 0.5) * (v1 - v0));
      }
    } else {
      geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        if (k >= 16 && k < 20) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
        else uv.setXY(k, su, sv);
      }
    }
    return geo;
  }
  const depthOf = (p) => (p.shape === 'can' ? p.r * 2 : p.d);
  const prodGeos = ITEMS.map((p, i) => productGeo(i));
  plane(RG.back, -0.41, 0.15, 0.60, 1.60, -0.299);
  SHELF.forEach((s, r) => plane(stripOf(r), -0.41, 0.15, s - 0.04, s, 0.2805));
  solid(PATCH.white, -0.40, 0.14, 1.572, 1.592, 0.33, 0.35);                  // fluorescent tube
  plane(RG.marq, -0.40, 0.40, 1.64, 1.80, 0.4215);
  plane(RG.led, 0.22, 0.38, 1.53, 1.57, 0.4162);
  plane(RG.menu, 0.195, 0.405, 1.105, 1.505, 0.4162);
  plane(RG.keys, 0.22, 0.38, 0.90, 1.06, 0.4162);
  plane(RG.coin, 0.22, 0.38, 0.74, 0.86, 0.4222);
  plane(RG.sticker, 0.20, 0.40, 0.33, 0.39, 0.4162);
  plane(RG.sold, COLX[1] - 0.06, COLX[1] + 0.06, SHELF[0] + 0.03, SHELF[0] + 0.066, 0.16);
  const shelfRange = [];
  ITEMS.forEach((p, i) => {
    if (p.empty) return;
    const r = (i / 3) | 0, x = COLX[i % 3], y = SHELF[r] + p.h / 2 + 0.001, z = FRONT - depthOf(p) / 2;
    shelfRange[i] = addPart(prodGeos[i].clone().translate(x, y, z));
    if (!low) addPart(prodGeos[i].clone().translate(x, y, z - 0.088));
  });
  const panelMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: EM, roughness: 0.5, metalness: 0 });
  panelMat.name = 'vending-pixels';
  const panelGeo = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  const panels = new THREE.Mesh(panelGeo, panelMat);
  panels.name = 'vending-panels';
  panels.receiveShadow = true;
  root.add(panels);
  const ppos = panelGeo.attributes.position, porig = ppos.array.slice();
  function setShelf(i, show) {   // hide/restore the front product of slot i (the coil delivers it)
    const r = shelfRange[i];
    if (!r) return;
    const a = ppos.array, s = r[0] * 3, e = (r[0] + r[1]) * 3;
    for (let k = s; k < e; k++) a[k] = show ? porig[k] : porig[s + (k - s) % 3];
    ppos.addUpdateRange(s, e - s);
    ppos.needsUpdate = true;
  }

  // ================= glass =================
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.0), new THREE.MeshStandardMaterial({
    color: 0xd8e6ea, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.5,
  }));
  glass.position.set(-0.13, 1.10, 0.395);
  glass.name = 'vending-glass';
  root.add(glass);

  // ================= coils (one instanced mesh) =================
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * TURNS * Math.PI * 2;
      return target.set(Math.cos(a) * COIL_R, Math.sin(a) * COIL_R, -COIL_L / 2 + t * COIL_L);
    }
  }
  const coilGeo = M.boxUV(new THREE.TubeGeometry(new Helix(), low ? 48 : 96, 0.0035, low ? 4 : 6, false));
  const coils = new THREE.InstancedMesh(coilGeo, M.get('steel', { color: 0xe2e5e8, roughness: 0.25 }), 12);
  coils.name = 'vending-coils';
  const tmpM = new THREE.Matrix4();
  const coilBase = ITEMS.map((p, i) => i * 0.7);
  function setCoil(i, a) {
    tmpM.makeRotationZ(coilBase[i] + a);
    tmpM.setPosition(COLX[i % 3], SHELF[(i / 3) | 0] + COIL_Y, COIL_Z);
    coils.setMatrixAt(i, tmpM);
    coils.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < 12; i++) setCoil(i, 0);
  coils.computeBoundingSphere();
  root.add(coils);

  // ================= the item that comes out =================
  const drop = new THREE.Mesh(prodGeos[0], panelMat);
  drop.name = 'vending-item';
  drop.visible = false;
  root.add(drop);

  // ================= clickable parts =================
  const pickables = [root];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const slotGeo = new THREE.BoxGeometry(0.18, 0.24, 0.03);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(slotGeo, proxyMat);
    m.position.set(COLX[i % 3], SHELF[(i / 3) | 0] + 0.1, 0.415);
    m.name = 'vending-slot-' + i;
    m.userData.action = { type: 'custom', id: 'vending-slot' };
    m.userData.vendSlot = i;
    root.add(m);
    pickables.push(m);
  }
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.03), proxyMat);
  tray.position.set(-0.13, 0.31, 0.415);
  tray.name = 'vending-tray';
  tray.userData.action = { type: 'custom', id: 'vending-tray' };
  tray.userData.vendTray = true;
  root.add(tray);
  pickables.push(tray);

  const colliders = [{ minX: WX - 0.44, maxX: 11.0, minZ: WZ - 0.47, maxZ: WZ + 0.47, minY: 0, maxY: 1.9 }];

  // ================= sound (Web Audio, routed into the shared bus) =================
  let dist2 = 0, noiseBuf = null;
  function voice(len) {
    const a = ctx.audio;
    if (!a || a.muted) return null;
    const ac = a.context, bus = a.bus;
    if (!ac || !bus || ac.state === 'closed') return null;
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const out = ac.createGain();
    out.gain.value = Math.min(1, 3.5 / Math.max(3.5, Math.sqrt(dist2)));
    out.connect(bus);
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* already gone */ } }, (len + 0.6) * 1000);
    return { ac, out, t: ac.currentTime + 0.02 };
  }
  function env(v, t, peak, a, d, destination) {
    const gn = v.ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(peak, t + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    gn.connect(destination || v.out);
    return gn;
  }
  function tone(v, t, type, f0, f1, peak, a, d) {
    const lease = reserveModuleVoice(ctx, 1, false, a + d + .06, v.out, t); if (!lease) return; t = Math.max(t, lease.startAt);
    const o = v.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    o.connect(env(v, t, peak, a, d, lease.gain));
    lease.track(o); finishModuleVoice(lease, o);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(v, t, type, f, q, peak, a, d) {
    const lease = reserveModuleVoice(ctx, 1, false, a + d + .06, v.out, t); if (!lease) return; t = Math.max(t, lease.startAt);
    const s = v.ac.createBufferSource();
    s.buffer = noiseBuf;
    const bq = v.ac.createBiquadFilter();
    bq.type = type; bq.frequency.value = f; bq.Q.value = q;
    s.connect(bq); bq.connect(env(v, t, peak, a, d, lease.gain));
    lease.track(s); finishModuleVoice(lease, s);
    s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
  }
  function sndCoin() {
    const v = voice(0.8); if (!v) return;
    const t = v.t;
    tone(v, t, 'sine', 3150, 3150, 0.07, 0.002, 0.12); tone(v, t, 'sine', 4720, 4700, 0.04, 0.002, 0.09);
    hiss(v, t, 'highpass', 5000, 0.7, 0.03, 0.001, 0.03);
    for (let k = 0; k < 4; k++) tone(v, t + 0.12 + k * 0.05 - k * k * 0.005, 'triangle', 2500 - k * 180, 2400 - k * 180, 0.025, 0.001, 0.03);
    tone(v, t + 0.38, 'sine', 240, 110, 0.12, 0.003, 0.08); hiss(v, t + 0.38, 'lowpass', 900, 0.7, 0.06, 0.002, 0.05);
  }
  function sndWhirr(delay, dur) {
    const v = voice(delay + dur + 0.3); if (!v) return;
    const lease = reserveModuleVoice(ctx, 1, false, dur + .06, v.out, v.t + delay); if (!lease) return;
    const ac = v.ac, t = Math.max(v.t + delay, lease.startAt);
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
    const lfo = ac.createOscillator(); lfo.frequency.value = 11;
    const lg = ac.createGain(); lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 3;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.08, t + 0.07);
    gn.gain.setValueAtTime(0.08, t + dur - 0.12); gn.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(gn); gn.connect(lease.gain);
    const w = ac.createOscillator(); w.frequency.setValueAtTime(820, t); w.frequency.linearRampToValueAtTime(900, t + dur);
    const wg = ac.createGain();
    wg.gain.setValueAtTime(0.0001, t); wg.gain.linearRampToValueAtTime(0.012, t + 0.1);
    wg.gain.setValueAtTime(0.012, t + dur - 0.12); wg.gain.linearRampToValueAtTime(0.0001, t + dur);
    w.connect(wg); wg.connect(lease.gain);
    finishModuleVoice(lease, w);
    for (const n of [o, lfo, w]) { lease.track(n); n.start(t); n.stop(t + dur + 0.05); }
    tone(v, t + dur - 0.02, 'square', 190, 95, 0.03, 0.002, 0.04);   // relay clack
  }
  function sndThunk() {
    const v = voice(0.6); if (!v) return;
    tone(v, v.t, 'sine', 150, 48, 0.25, 0.003, 0.22); hiss(v, v.t, 'lowpass', 420, 0.8, 0.18, 0.002, 0.08);
    tone(v, v.t + 0.01, 'triangle', 900, 650, 0.03, 0.001, 0.03);
  }
  function sndBang() {
    const v = voice(0.9); if (!v) return;
    tone(v, v.t, 'sine', 85, 38, 0.3, 0.002, 0.28); hiss(v, v.t, 'bandpass', 700, 1.1, 0.22, 0.002, 0.3);
    for (let k = 0; k < 6; k++) hiss(v, v.t + 0.05 + k * 0.045 + Math.random() * 0.02, 'bandpass', 2400 + k * 260, 6, 0.05, 0.001, 0.03);
  }
  function sndBuzz() {
    const v = voice(0.6); if (!v) return;
    tone(v, v.t, 'square', 98, 98, 0.04, 0.01, 0.12); tone(v, v.t + 0.2, 'square', 98, 98, 0.04, 0.01, 0.16);
  }

  // ================= behaviour =================
  let phase = IDLE, pt = 0, item = -1, stuck = false, inTray = false, busyToast = false, patience = 0;
  let note = null, whirrDur = 1.3, z0 = 0, z1 = 0, tx = 0, restY = 0, vy = 0, flick = 6 + Math.random() * 8;

  function startVend(i, n) {
    const p = ITEMS[i], d = depthOf(p);
    item = i; note = n; stuck = Math.random() < 0.25; busyToast = false; inTray = false;
    z1 = FRONT - d / 2 + ADV;
    z0 = p.empty ? -0.16 : FRONT - d / 2;           // a sold-out slot: it comes from far back
    whirrDur = p.empty ? 2.2 : 1.3;
    tx = Math.min(0.03, Math.max(-0.29, COLX[i % 3]));
    restY = p.shape === 'can' ? p.r : d / 2;
    drop.geometry = prodGeos[i];
    drop.position.set(COLX[i % 3], SHELF[(i / 3) | 0] + p.h / 2 + 0.001, z0);
    drop.rotation.set(0, 0, 0);
    drop.visible = true;
    setShelf(i, false);
    phase = VEND; pt = 0;
    sndCoin(); sndWhirr(0.45, whirrDur);
    led(n ? 'SÓ ÀS TERÇAS' : 'A PENSAR...');
  }
  function land() {
    phase = IDLE; inTray = true; busyToast = false;
    drop.position.set(tx, TRAY_Y + restY, 0.27);
    drop.rotation.set(Math.PI * 1.5, 0, rm ? 0 : (Math.random() - 0.5) * 0.5);
    if (ITEMS[item].name !== 'Silêncio') sndThunk();   // silence lands silently
    setShelf(item, true);                               // the next one in the coil moves up
    ctx.ui.toast(note ? 'Coragem só às terças. Saiu-lhe: Segunda-feira. Era grátis.' : ITEMS[item].line);
    led('OBRIGADO');
  }
  function fall() { phase = FALL; pt = 0; vy = 0; }

  function onPick(target) {
    const ud = (target && target.userData) || {};
    if (phase === STUCK) { phase = SHAKE; pt = 0; sndBang(); return; }
    if (phase !== IDLE) { if (!busyToast) { busyToast = true; ctx.ui.toast('Calma. Está a pensar.'); } return; }
    if (ud.vendTray) {
      if (inTray) {
        inTray = false; drop.visible = false;
        ctx.ui.toast(`No bolso: ${ITEMS[item].name}. Não pesa nada.`);
        led('INSIRA MOEDA');
      } else ctx.ui.toast('A gaveta está vazia. Escolha algo no vidro.');
      return;
    }
    const chosen = Number.isInteger(ud.vendSlot);
    let i = chosen ? ud.vendSlot : Math.floor(Math.random() * ITEMS.length);
    if (i === 1 && chosen && patience < 2) {          // patience is earned by asking three times
      ctx.ui.toast(patience ? 'Ainda esgotada. Mais um bocadinho…' : 'Paciência: esgotada. Tenha paciência.');
      led(patience ? 'TENHA PACIÊNCIA' : 'ESGOTADO');
      patience++;
      sndBuzz();
      return;
    }
    if (i === 1) patience = 0;
    let n = null;
    if (i === 2 && new Date().getDay() !== 2) { i = 5; n = 'coragem'; }   // not Tuesday: you get Monday
    startVend(i, n);
  }

  function update(dt, frame) {
    const cam = frame && frame.camera;
    if (cam) {
      const dx = cam.position.x - WX, dz = cam.position.z - WZ;
      dist2 = dx * dx + dz * dz;
      if (dist2 > 1600) return;
    }
    if (dt > 0.1) dt = 0.1;
    if (!rm) {            // the tube, now and then, blinks twice
      flick -= dt;
      if (flick < 0) {
        const k = -flick;
        panelMat.emissiveIntensity = k < 0.05 || (k > 0.11 && k < 0.15) ? EM * 0.3 : EM;
        if (k > 0.22) { flick = 7 + Math.random() * 11; panelMat.emissiveIntensity = EM; }
      }
    }
    if (phase === IDLE) return;
    pt += dt;
    if (phase === VEND) {
      let u = (pt - 0.45) / whirrDur;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const e = u * u * (3 - 2 * u);
      setCoil(item, e * Math.PI * 2);
      drop.position.z = z0 + e * (z1 - z0);
      if (u >= 1) {
        if (stuck) {
          phase = STUCK; pt = 0;
          drop.rotation.x = 0.45; drop.position.y -= 0.012;
          ctx.ui.toast('Bate-lhe.');
          led('BATE-LHE');
        } else if (rm) land(); else fall();
      }
    } else if (phase === STUCK) {
      if (!rm) drop.rotation.x = 0.45 + Math.sin(pt * 3.1) * 0.03;
    } else if (phase === SHAKE) {
      const k = 1 - pt / 0.45;
      if (k <= 0) {
        root.position.x = WX; root.position.z = WZ; root.rotation.z = 0;
        if (rm) land(); else fall();
      } else if (!rm) {
        root.position.x = WX + Math.sin(pt * 93) * 0.009 * k;
        root.position.z = WZ + Math.sin(pt * 71 + 1) * 0.007 * k;
        root.rotation.z = Math.sin(pt * 57) * 0.006 * k;
      }
    } else if (phase === FALL) {
      vy += GRAV * dt;
      drop.position.y -= vy * dt;
      drop.rotation.x += 7 * dt;
      const f = dt * 6 < 1 ? dt * 6 : 1;
      drop.position.x += (tx - drop.position.x) * f;
      drop.position.z += (0.31 - drop.position.z) * f;
      if (drop.position.y <= TRAY_Y + restY) land();
    }
  }

  return { group, regions: [], colliders, pickables, update, onPick };
}
