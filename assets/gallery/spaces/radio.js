import { reserveModuleVoice, finishModuleVoice, releaseModuleVoices } from '../audio-lease.js';
// radio.js — "Rádio Pirata 8-bit". A battered boombox someone left on the steel
// cap of the skylight lantern, roof terrace (level 1), facing the walk from the
// lift. Click: static, then a procedural chiptune station tuned in mid-song —
// pulse lead (25 %), pulse echo/arpeggio (12.5 %), triangle bass, noise drums,
// every song generated from a seed (no borrowed melodies) — spatialised with a
// PannerNode, quiet, and silent off the terrace. Its LCD shows a pixel equaliser.
// Between songs (about once a minute) a DJ says something absurd: speechSynthesis
// with a Portuguese voice when there is one, otherwise a chirpy voice of formant
// blips. Click again: vinyl-stop pitch-down. BRIEF §6.2 module, owns nothing else.
//
// Budgets: 3 draw calls (body, chrome, LCD), all static; the update is a few
// comparisons + the panner (a 64×32 canvas redraw ≤ 15 Hz only while on and in
// view); no per-frame allocation. Audio nodes exist only while it plays on the
// terrace: four persistent "chip" channels whose notes are AudioParam events
// (no node per note), scheduled 200 ms ahead by a 100 ms timer.
// Debug/QA: group.userData.radio = { toggle(), dj(), on }.

function pentMidi(m){const pc=((m%12)+12)%12;const allowed=[0,2,4,7,9];let best=0,dist=99;for(const p of allowed){let d=p-pc;if(d>6)d-=12;if(d< -6)d+=12;if(Math.abs(d)<dist){dist=Math.abs(d);best=d;}}return m+best;}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGS_MAJ = [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 0, 4], [3, 4, 0, 5]];
const PROGS_MIN = [[0, 5, 2, 6], [0, 6, 5, 4], [5, 6, 0, 0], [0, 3, 5, 6]];
// 4-step rhythm cells: 1 onset, 0 hold, 2 rest. Verses busier, choruses longer.
const CELLS_A = [[1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 0, 1], [1, 0, 1, 1], [0, 0, 1, 0], [1, 0, 2, 0], [1, 1, 1, 0]];
const CELLS_B = [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 1, 0], [0, 0, 1, 0], [1, 0, 0, 1]];
const ARP = [0, 2, 4, 7];
const FORM = [0, 1, 0, 1];                 // verse, chorus, verse, chorus (80 s a song at 96 BPM)
const STEPS = 512;                         // 4 sections × 8 bars × 16 steps
const KICK = 1, SNARE = 2, HAT = 4, OHAT = 8;
const JINGLE = [79, 84, 88, 91];
const VOW = 'aáàâãeéêiíoóôõuú';
const VCLS = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4];
const FORMANT = [1250, 1850, 2450, 950, 720];

const LINES = [
  'Bom dia, ouvintes. O trânsito está ótimo para quem está parado.',
  'Previsão do tempo: vai estar tempo.',
  'Notícia de última hora: a hora anterior já passou.',
  'Está a ouvir a Rádio Pirata. Se não está a ouvir, avise-nos.',
  'Hora certa: agora. Repito: agora.',
  'Previsão para amanhã: amanhã.',
  'Esta música foi composta por um robô que nunca ouviu música. Nota-se.',
  'Linha aberta: ninguém ligou. Agradecemos a compreensão.',
  'Os nossos estúdios ficam num telhado. Somos uma rádio de alto nível.',
  'Estado do mar: molhado.',
  'Trânsito no elevador: sobe e desce, como de costume.',
  'Dedicatória especial para quem está a ler isto. Sim, para si.',
  'A seguir: mais música. Depois disso: ainda mais música.',
  'Rádio Pirata: a única rádio que funciona a pilhas e a otimismo.',
  'Pausa para publicidade: não temos publicidade. Fim da pausa.',
  'Desporto: a bola continua redonda. Mais pormenores a qualquer momento.',
  'Temperatura no terraço: agradável. Sensação térmica: também.',
  'Aviso aos ouvintes: este terraço não é um barco. Não icem as velas.',
];
const WELCOME = 'Bem-vindos de volta ao terraço. Nós não saímos daqui.';

// LCD palette and 3×5 pixel font (rows top→bottom, 3 bits each, MSB left)
const BG = '#06120b', GHOST = '#0f2618', LIME = '#5ef25a', YEL = '#f4d23a', RED = '#ff4d36';
const PEAK = '#e6ffe0', TXT = '#8cff78', AMBER = '#ffb340';
const LED_ON = '#ff3b2b', LED_DIM = '#5a120c', OFF_BG = '#030805', OFF_GHOST = '#0a170f', LED_OFF = '#2a0907';
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001111', F: '111100110100100', M: '101111111101101',
  D: '110101101101110', J: '001001001101010',
};

export function build(ctx) {
  const { THREE, M, quality, reducedMotion } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'radio';

  // ------------------------------------------------------------- placement
  // terrace.js: deck 7.2, lantern upstand 0.9 + steel cap 0.03, east cap
  // x 1.53…1.83; glazing rafters at z 13.52 and 14.78. The set sits between
  // them, inside the lantern's collider (blocks nothing, needs no collider),
  // its front toward the lift (+x), turned a little toward the benches.
  const LEDGE = 7.2 + 0.9 + 0.03;
  const PX = 1.70, PZ = 14.15, YAW = Math.PI / 2 - 0.14;
  const set = new THREE.Group();
  set.name = 'radio-set';
  set.position.set(PX, LEDGE, PZ);
  set.rotation.y = YAW;
  group.add(set);
  const NX = Math.sin(YAW), NZ = Math.cos(YAW);            // front normal (world)
  const SX = PX + NX * 0.07, SY = LEDGE + 0.12, SZ = PZ + NZ * 0.07;   // speakers' centre

  // ------------------------------------------------------------- geometry
  // Local frame: front +z, bottom at y 0. Everything merges into one body mesh
  // (vertex colours over painted plaster), one chrome mesh and one LCD mesh.
  const W = 0.40, H = 0.21, D = 0.12, FOOT = 0.008, TOP = FOOT + H, FZ = D / 2;
  const seg = low ? 14 : 24, segT = low ? 16 : 28;
  const tint = new THREE.Color();
  const bodyParts = [], metalParts = [];
  function add(list, g, hex, x, y, z, rx, ry, rz) {
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    if (hex !== undefined) {
      tint.set(hex);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = tint.r; c[i * 3 + 1] = tint.g; c[i * 3 + 2] = tint.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    list.push(g);
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s) => new THREE.CylinderGeometry(r, r, h, s);
  function merge(list, names) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const size = list[0].attributes[name].itemSize, arr = new Float32Array(nv * size);
      let off = 0;
      for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let io = 0, vo = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
      else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      vo += n;
      g.dispose();
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  const TEAL = 0x3b8279, CREAM = 0xd3c9b0, CHAR = 0x1b1c1e, RUBBER = 0x121212, SMOKE = 0x2a2522;
  const KEY = 0xb5b1a8, REC = 0xa3302a, TAPE = 0x8e8b84, STICKER = 0xe0b93a, REEL = 0xd6d2c9;
  add(bodyParts, box(W, H, D), TEAL, 0, FOOT + H / 2, 0);                        // sun-faded shell
  for (const fx of [-0.15, 0.15]) for (const fz of [-0.035, 0.035]) add(bodyParts, box(0.036, FOOT, 0.024), RUBBER, fx, FOOT / 2, fz);
  add(bodyParts, box(W - 0.02, H - 0.025, 0.004), CREAM, 0, FOOT + H / 2 - 0.002, FZ + 0.002);
  const GX = 0.118, GY = FOOT + 0.098, GR = 0.064;
  for (const s of [-1, 1]) add(bodyParts, cyl(GR, 0.004, seg), CHAR, s * GX, GY, FZ + 0.005, Math.PI / 2);
  add(bodyParts, box(0.09, 0.05, 0.004), CHAR, 0, FOOT + 0.152, FZ + 0.005);    // LCD bezel
  add(bodyParts, box(0.09, 0.062, 0.004), SMOKE, 0, FOOT + 0.072, FZ + 0.005);  // cassette door
  for (const s of [-1, 1]) add(bodyParts, cyl(0.0105, 0.003, 12), REEL, s * 0.022, FOOT + 0.075, FZ + 0.0075, Math.PI / 2);
  for (let i = 0; i < 5; i++) add(bodyParts, box(0.019, 0.01, 0.03), i === 0 ? REC : KEY, -0.075 + i * 0.022, TOP + 0.005, FZ - 0.024);
  add(bodyParts, cyl(0.011, 0.12, 12), RUBBER, 0, TOP + 0.056, -0.015, 0, 0, Math.PI / 2);   // handle grip
  // it has had a life: duct tape over the top-left corner, a faded sticker
  add(bodyParts, box(0.032, 0.002, 0.075), TAPE, -0.165, TOP + 0.001, FZ - 0.0365);
  add(bodyParts, box(0.032, 0.046, 0.002), TAPE, -0.165, TOP - 0.022, FZ + 0.005);
  add(bodyParts, box(0.002, 0.034, 0.034), STICKER, -W / 2 - 0.001, FOOT + 0.12, 0.012, 0.3);

  for (const s of [-1, 1]) {
    add(metalParts, new THREE.TorusGeometry(GR + 0.002, 0.0045, 6, segT), undefined, s * GX, GY, FZ + 0.007);
    add(metalParts, new THREE.TorusGeometry(0.045, 0.0022, 4, segT), undefined, s * GX, GY, FZ + 0.0072);
    add(metalParts, new THREE.TorusGeometry(0.025, 0.0022, 4, segT), undefined, s * GX, GY, FZ + 0.0072);
    add(metalParts, cyl(0.0095, 0.006, 12), undefined, s * GX, GY, FZ + 0.008, Math.PI / 2);
    add(metalParts, cyl(0.0065, 0.056, 10), undefined, s * 0.125, TOP + 0.028, -0.015);     // handle posts
  }
  add(metalParts, cyl(0.0075, 0.262, 12), undefined, 0, TOP + 0.056, -0.015, 0, 0, Math.PI / 2);
  add(metalParts, new THREE.CylinderGeometry(0.012, 0.0135, 0.012, 16), undefined, 0.105, TOP + 0.006, FZ - 0.03);
  add(metalParts, new THREE.CylinderGeometry(0.009, 0.0105, 0.01, 16), undefined, 0.14, TOP + 0.005, FZ - 0.03);
  add(metalParts, cyl(0.008, 0.012, 10), undefined, 0.17, TOP + 0.006, -0.04);               // antenna hinge
  {
    // telescopic antenna, the upper section bent
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), dir = new THREE.Vector3();
    let x = 0.17, y = TOP + 0.01, z = -0.04;
    for (const [dx, dy, dz, len, r] of [[0.12, 1, -0.28, 0.2, 0.0034], [0.62, 0.78, -0.06, 0.15, 0.0024]]) {
      dir.set(dx, dy, dz).normalize();
      const g = cyl(r, len, 8);
      g.applyQuaternion(q.setFromUnitVectors(up, dir));
      add(metalParts, g, undefined, x + dir.x * len / 2, y + dir.y * len / 2, z + dir.z * len / 2);
      x += dir.x * len; y += dir.y * len; z += dir.z * len;
    }
    add(metalParts, new THREE.SphereGeometry(0.0045, 8, 6), undefined, x, y, z);
  }

  const bodyMat = M.get('plaster', { tile: 0.45, roughness: 0.62 }).clone();   // own copy: vertex colours
  bodyMat.vertexColors = true;
  bodyMat.color.setRGB(1, 1, 1);
  bodyMat.name = 'radio-body';
  const metalMat = M.get('steel', { roughness: 0.28, color: 0xdfe3e6 });      // the terrace's own steel
  const body = new THREE.Mesh(M.boxUV(merge(bodyParts, ['position', 'normal', 'color'])), bodyMat);
  const chrome = new THREE.Mesh(M.boxUV(merge(metalParts, ['position', 'normal'])), metalMat);
  body.castShadow = body.receiveShadow = chrome.castShadow = chrome.receiveShadow = true;
  set.add(body, chrome);

  // LCD + power LED: one mesh, one 64×32 canvas (display 56×32, LED at 58,26)
  const CW = 64, CH = 32;
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  function uvRect(g, x, y, w, h) {                 // canvas pixels → UVs (v = 1 at the canvas top)
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / CW, 1 - (y + (1 - uv.getY(i)) * h) / CH);
  }
  const lcdGeo = new THREE.PlaneGeometry(0.08, 0.0425);
  uvRect(lcdGeo, 0, 0, 56, 32);
  lcdGeo.translate(0, FOOT + 0.152, FZ + 0.0074);
  const ledGeo = new THREE.PlaneGeometry(0.0065, 0.0065);
  uvRect(ledGeo, 58, 26, 4, 4);
  ledGeo.translate(-0.034, FOOT + 0.19, FZ + 0.0045);
  const lcd = new THREE.Mesh(merge([lcdGeo, ledGeo], ['position', 'normal', 'uv']), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  lcd.name = 'radio-lcd';
  set.add(lcd);

  // invisible pick proxy around set + handle (0 draw calls); the set carries the
  // same action so a hit on the antenna resolves too
  const action = { type: 'custom', id: 'radio', label: 'Ligar o rádio', title: 'Ligar o rádio' };
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.name = 'radio-pick';
  proxy.position.set(0, 0.17, 0);
  proxy.userData.action = action;
  set.userData.action = action;
  set.add(proxy);

  // ------------------------------------------------------------- the station
  let seed = (Math.random() * 0x7fffffff) | 0;     // songs
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let vseed = 0x2545f491;                          // visuals and blips (never disturbs the songs)
  const rv = () => ((vseed = (Math.imul(vseed, 1103515245) + 12345) >>> 0) / 4294967296);
  const LEAD = new Int8Array(256), BASS = new Int8Array(256), DRUM = new Uint8Array(256), PROG = new Int8Array(8);
  const MR = new Int8Array(32), MD = new Int8Array(32), BEAT = new Int8Array(8);
  const FREQ = new Float32Array(128);
  for (let m = 0; m < 128; m++) FREQ[m] = 440 * Math.pow(2, (pentMidi(m) - 69) / 12);
  let SCALE = MINOR, ROOT = 57, BPM = 96, STEP = 15 / BPM;

  const midi = (d) => ROOT + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
  function pick(list, mustStart) {
    for (let k = 0; k < 8; k++) { const i = (rnd() * list.length) | 0; if (!mustStart || list[i][0] === 1) return i; }
    return 0;
  }
  function tone(target, c, lo, hi) {               // chord tone of degree c nearest target, in range
    let best = c, bd = 1e9;
    for (let oct = -14; oct <= 21; oct += 7) for (let k = 0; k <= 4; k += 2) {
      const d = c + k + oct;
      if (d < lo || d > hi) continue;
      const dd = Math.abs(d - target) + rnd() * 1.2;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  // A section = a 2-bar motif, the motif sequenced onto the next chords, the
  // motif again, a cadence: repetition is what makes it hum-able.
  function genSection(sec, chorus) {
    const o = sec * 128, P = sec * 4, cells = chorus ? CELLS_B : CELLS_A;
    const lo = chorus ? 4 : 1, hi = chorus ? 12 : 10;
    for (let b = 0; b < 4; b++) BEAT[b] = pick(cells, b === 0);
    for (let b = 4; b < 8; b++) BEAT[b] = rnd() < 0.55 ? BEAT[b - 4] : pick(cells, false);
    for (let s = 0; s < 32; s++) MR[s] = cells[BEAT[s >> 2]][s & 3];
    if (rnd() < 0.5) { MR[28] = 1; MR[29] = 0; MR[30] = 0; MR[31] = 0; }
    let prev = tone((lo + hi) >> 1, PROG[P], lo, hi);
    for (let s = 0; s < 32; s++) {
      if (MR[s] !== 1) { MD[s] = prev; continue; }
      const c = PROG[P + (s >> 4)];
      let d;
      if ((s & 3) === 0) d = tone(prev + ((rnd() * 5) | 0) - 2, c, lo, hi);
      else { const r = rnd(); d = prev + (r < 0.36 ? 1 : r < 0.72 ? -1 : r < 0.84 ? 2 : r < 0.94 ? -2 : 0); }
      if (d < lo) d = lo + 1; else if (d > hi) d = hi - 1;
      MD[s] = prev = d;
    }
    let last = prev;
    for (let bar = 0; bar < 7; bar++) {
      const src = bar & 1, slot = bar & 3;
      let shift = slot >= 2 ? PROG[P + slot] - PROG[P + src] : 0;
      if (shift > 3) shift -= 7; else if (shift < -3) shift += 7;
      for (let k = 0; k < 16; k++) {
        const s = src * 16 + k, i = o + bar * 16 + k, code = MR[s];
        if (code === 2) LEAD[i] = -1;
        else if (code === 0) LEAD[i] = 0;
        else { last = MD[s] + shift; LEAD[i] = midi(last); }
      }
    }
    const i7 = o + 112, c7 = PROG[P + 3], d7 = tone(last, c7, lo, hi);
    for (let k = 0; k < 16; k++) LEAD[i7 + k] = 0;
    LEAD[i7] = midi(d7);
    if (chorus) { LEAD[i7 + 12] = -1; LEAD[i7 + 14] = midi(d7 + 1); LEAD[i7 + 15] = midi(d7 + 2); }
    else { LEAD[i7 + 8] = midi(tone(d7 + 2, c7, lo, hi)); LEAD[i7 + 11] = -1; LEAD[i7 + 14] = midi(d7 - 1); }
    // bass and drums
    const bt = (rnd() * 3) | 0, kv = (rnd() * 3) | 0;
    for (let bar = 0; bar < 8; bar++) {
      let r = midi(PROG[P + (bar & 3)]) - 12;
      if (r > 57) r -= 12;
      for (let k = 0; k < 16; k++) {
        let n;
        if (bt === 0) n = (k & 1) ? -1 : ((k & 2) ? r + 12 : r);
        else if (bt === 1) n = (k & 1) ? -1 : (k === 6 || k === 14 ? r + 7 : r);
        else n = (k === 0 || k === 3 || k === 8 || k === 11) ? r : k === 6 ? r + 7 : k === 14 ? r + 12 : (k === 2 || k === 10) ? -1 : 0;
        if (bar === 7 && k === 14) { n = midi(PROG[P] + (rnd() < 0.5 ? -1 : 1)) - 12; if (n > 57) n -= 12; }
        BASS[o + bar * 16 + k] = n;
        let d = 0;
        if (k === 0 || k === 8 || (kv === 1 && k === 10) || (kv === 2 && k === 6) || (chorus && kv === 0 && k === 14)) d |= KICK;
        if (k === 4 || k === 12) d |= SNARE;
        if (chorus ? (k & 1) === 0 : (k & 3) === 2) d |= HAT;
        if (chorus && (k === 6 || k === 14)) d |= OHAT;
        if (bar === 7 && k >= 12) d = (!chorus && k === 13) ? 0 : SNARE;     // fill
        DRUM[o + bar * 16 + k] = d;
      }
    }
  }
  function newSong() {
    BPM = 96;
    STEP = 15 / BPM;
    SCALE = MINOR;
    ROOT = 57;
    const progs = SCALE === MAJOR ? PROGS_MAJ : PROGS_MIN;
    const pa = (rnd() * progs.length) | 0;
    let pb = (rnd() * (progs.length - 1)) | 0;
    if (pb >= pa) pb++;
    for (let i = 0; i < 4; i++) { PROG[i] = progs[pa][i]; PROG[4 + i] = progs[pb][i]; }
    genSection(0, false);
    genSection(1, true);
  }

  // ------------------------------------------------------------- audio graph
  const LEVEL = 0.15, STOP = 1.0;
  const SHAPE = new Float32Array(256);              // a little speaker, pushed a little
  for (let i = 0; i < 256; i++) SHAPE[i] = Math.tanh(1.7 * (i / 127.5 - 1)) / Math.tanh(1.7);
  const VCENTS = new Float32Array(32);              // vinyl brake: speed 1 → 0.06
  for (let i = 0; i < 32; i++) VCENTS[i] = 1200 * Math.log2(Math.max(0.06, 1 - Math.pow(i / 31, 1.6)));
  let shAC = null, W25 = null, W125 = null, NOISE = null;
  function shared(a) {
    if (shAC === a) return;
    shAC = a;
    W25 = pulse(a, 0.25);
    W125 = pulse(a, 0.125);
    const n = (a.sampleRate * 0.5) | 0;
    NOISE = a.createBuffer(1, n, a.sampleRate);
    const ch = NOISE.getChannelData(0);
    let x = 0x1234567;
    for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; ch[i] = x / 2147483648 - 1; }
  }
  function pulse(a, duty) {
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) re[k] = (4 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return a.createPeriodicWave(re, im);
  }

  let ac = null, live = false, stopping = false, stopT0 = 0, killAt = 0, timer = 0;
  let pos = 0, nextT = 0, quietIntro = false, presOn = false;
  let musicLeases = [];
  let oL = null, oA = null, oB = null, nS = null, wow = null;
  let gL = null, gA = null, gB = null, gN = null, music = null, speaker = null, out = null, panner = null;
  let power = false, T = 0, here = false, dist2 = 1e9, awayT = 0, awaySince = 0, camE = null;

  function goLive(fresh) {
    const A = ctx.audio;
    ac = A.context;
    shared(ac);
    const now = ac.currentTime;
    const gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
    panner = ac.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.4; panner.rolloffFactor = 1.5; panner.maxDistance = 40;
    out = gain(0);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.7;
    const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1500; pk.gain.value = 5; pk.Q.value = 0.9;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.7;
    const sh = ac.createWaveShaper(); sh.curve = SHAPE;
    music = gain(1);
    speaker = hp;
    music.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(sh); sh.connect(out); out.connect(panner); panner.connect(A.bus);
    gL = gain(0); gA = gain(0); gB = gain(0); gN = gain(0);
    musicLeases = [];
    for (let i = 0; i < 4; i++) {
      const lease = reserveModuleVoice(ctx, 0, false, 1, music);
      if (!lease) { for (const held of musicLeases) held.release(); musicLeases.length = 0; panner.disconnect(); return; }
      musicLeases.push(lease);
    }
    gL.connect(musicLeases[0].gain); gA.connect(musicLeases[1].gain); gB.connect(musicLeases[2].gain); gN.connect(musicLeases[3].gain);
    oL = ac.createOscillator(); oL.setPeriodicWave(W25); oL.connect(gL);
    oA = ac.createOscillator(); oA.setPeriodicWave(W125); oA.connect(gA);
    oB = ac.createOscillator(); oB.type = 'triangle'; oB.connect(gB);
    nS = ac.createBufferSource(); nS.buffer = NOISE; nS.loop = true; nS.connect(gN);
    wow = ac.createOscillator(); wow.frequency.value = 0.55;     // tired tape-motor wobble
    const wd = gain(7);
    wow.connect(wd); wd.connect(oL.detune); wd.connect(oA.detune); wd.connect(oB.detune);
    const t0 = Math.max(now + .02, musicLeases[0].startAt, musicLeases[1].startAt, musicLeases[2].startAt, musicLeases[3].startAt);
    musicLeases[0].track(oL); musicLeases[0].track(wow); musicLeases[1].track(oA); musicLeases[2].track(oB); musicLeases[3].track(nS);
    oL.start(t0); oA.start(t0); oB.start(t0); nS.start(t0); wow.start(t0);
    live = true; stopping = false; killAt = 0; awayT = 0;
    if (fresh) { tuneStatic(now + 0.01); nextT = now + 0.42; } else nextT = now + 0.06;
    setPresence(here, now, fresh ? 0.03 : 0.4);
    placePanner(camE);
    tick();
  }
  function setPresence(v, now, tau) {
    presOn = v;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(v ? LEVEL : 0, now, tau);
  }
  function kill() {
    const retiringLeases = musicLeases; musicLeases = [];
    if (timer) { clearTimeout(timer); timer = 0; }
    // Leases stop all tracked sources; avoid bypassing their fade envelope.
    const retiredPanner = panner; releaseModuleVoices(retiringLeases, () => { try { retiredPanner?.disconnect(); } catch {} }, !!ctx.audio?.muted || !!ctx.scene.userData.questQuiet);
    oL = oA = oB = nS = wow = null;
    gL = gA = gB = gN = music = speaker = out = panner = null;
    live = false; stopping = false; killAt = 0; djAt = 0; quietIntro = false;
    if (talking) endTalk(true);
  }
  function fadeKill(after) {
    if (killAt) return;
    const now = ac.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(0, now, 0.04);
    killAt = now + after;
  }
  function brake(p, now) {
    try { p.cancelScheduledValues(now); p.setValueCurveAtTime(VCENTS, now, STOP); } catch (e) { /* no pitch-down here */ }
  }
  function vinylStop() {
    const now = ac.currentTime;
    stopping = true; stopT0 = now; killAt = now + STOP + 0.15;
    brake(oL.detune, now); brake(oA.detune, now); brake(oB.detune, now);
    if (nS.detune) brake(nS.detune, now);
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(0, now + STOP * 0.55, 0.12);
  }
  function tuneStatic(t) {
    const lease = reserveModuleVoice(ctx, 1, false, .75, speaker, t); if (!lease) return; t = Math.max(t, lease.startAt);
    const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = NOISE; s.loop = true; s.playbackRate.value = 0.8;
    bp.type = 'bandpass'; bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(800, t + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.03); g.gain.setTargetAtTime(0, t + 0.32, 0.05);
    s.connect(bp); bp.connect(g); g.connect(lease.gain);
    lease.track(s); finishModuleVoice(lease, s); s.start(t); s.stop(t + 0.7);
    const w = ac.createOscillator(), wg = ac.createGain();    // the heterodyne whistle
    w.frequency.setValueAtTime(2900, t); w.frequency.exponentialRampToValueAtTime(600, t + 0.36);
    wg.gain.setValueAtTime(0.035, t); wg.gain.setTargetAtTime(0, t + 0.3, 0.04);
    w.connect(wg); wg.connect(lease.gain);
    lease.track(w); w.start(t); w.stop(t + 0.6);
  }

  // ------------------------------------------------------------- scheduler
  function tick() {
    timer = 0;
    if (!live) return;
    for (let i = 0; i < musicLeases.length; i++) if (!musicLeases[i].renew(1000)) { kill(); return; }
    const now = ac.currentTime;
    if (!stopping && nextT < now) nextT = now + 0.03;      // stalled: skip ahead, never burst
    while (nextT < now + 0.2) {
      let dur = STEP;
      if (stopping) {
        const u = (nextT - stopT0) / STOP;
        if (u >= 0.9) { nextT = 1e9; break; }
        dur = STEP / Math.max(0.15, 1 - Math.pow(u, 1.6));    // the record slows down too
      }
      playStep(nextT);
      nextT += dur;
      if (++pos >= STEPS) {
        pos = 0;
        newSong();
        quietIntro = false;
        // between songs, rarely, the DJ (only for someone near enough to hear)
        if (!stopping && power && here && dist2 < 110 && !talking && T - lastDj > 30 &&
            !(typeof document !== 'undefined' && document.hidden)) { quietIntro = true; djAt = nextT; }
      }
    }
    timer = setTimeout(tick, 100);
  }
  function note(osc, gn, code, t, peak, sus, tau) {
    if (code > 0) {
      const g = gn.gain;
      osc.frequency.setValueAtTime(FREQ[code], t);
      g.setTargetAtTime(0, t - 0.007, 0.0015);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(peak, t + 0.003);
      g.setTargetAtTime(sus, t + 0.003, tau);
    } else if (code < 0) gn.gain.setTargetAtTime(0, t, 0.012);
  }
  function playStep(t) {
    const sec = pos >> 7, s = pos & 127, part = FORM[sec], o = part * 128 + s, bar = s >> 4;
    const quiet = quietIntro && pos < 32;               // two bars of room for the DJ
    const ln = quiet ? (s === 0 ? -1 : 0) : LEAD[o];
    note(oL, gL, ln, t, 0.15, 0.1, 0.16);
    if (ln > 0) onset(ln < 69 ? 2 : ln < 76 ? 3 : 4, t, 0.95);
    if (part === 0) {                                    // verse: the classic 3-step echo
      const en = quiet ? (s === 0 ? -1 : 0) : (s >= 3 ? LEAD[o - 3] : 0);
      note(oA, gA, en, t, 0.05, 0.034, 0.12);
      if (en > 0) onset(4, t, 0.5);
    } else {                                             // chorus: 16th-note arpeggio
      oA.frequency.setValueAtTime(FREQ[midi(PROG[4 + (bar & 3)] + ARP[s & 3]) + 12], t);
      gA.gain.setValueAtTime(0.042, t);
      gA.gain.setTargetAtTime(0.004, t + 0.002, 0.03);
      onset(4, t, 0.6);
    }
    const bn = BASS[o];
    note(oB, gB, bn, t, 0.3, 0.27, 0.5);
    if (bn > 0) onset(0, t, 0.9);
    const d = DRUM[o];
    if (d) {
      let rate = 1, peak = 0.08, tau = 0.014, b = 6, v = 0.55;
      if (d & KICK) { rate = 0.08; peak = 0.5; tau = 0.045; b = 1; v = 1; }
      else if (d & SNARE) { rate = 0.42; peak = 0.3; tau = 0.055; b = 5; v = 0.85; }
      else if (d & OHAT) { peak = 0.1; tau = 0.075; v = 0.7; }
      nS.playbackRate.setValueAtTime(rate, t);
      gN.gain.setValueAtTime(peak, t);
      gN.gain.setTargetAtTime(0, t + 0.002, tau);
      onset(b, t, v);
    }
  }

  // ------------------------------------------------------------- the DJ
  const synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
  let talking = false, talkTTS = false, talkEnd = 0, djAt = 0, lastDj = -1e9, pendingLine = null;
  let utter = null, voice = null, voiceChecked = false, ttsBroken = false, bag = LINES.length;
  const ORDER = new Uint8Array(LINES.length);
  for (let i = 0; i < ORDER.length; i++) ORDER[i] = i;
  function nextLine() {
    if (bag >= ORDER.length) {
      for (let i = ORDER.length - 1; i > 0; i--) { const j = (rv() * (i + 1)) | 0, x = ORDER[i]; ORDER[i] = ORDER[j]; ORDER[j] = x; }
      bag = 0;
    }
    return LINES[ORDER[bag++]];
  }
  function ttsVoice() {
    if (!synth || ttsBroken || typeof SpeechSynthesisUtterance === 'undefined') return null;
    if (synth.speaking || synth.pending) return null;     // never queue behind (or cut) anyone else
    if (!voiceChecked) {
      const list = synth.getVoices();
      if (list && list.length) {
        voiceChecked = true;
        for (const v of list) {
          const l = String(v.lang || '').replace('_', '-').toLowerCase();
          if (l === 'pt-pt') { voice = v; break; }
          if (!voice && l.slice(0, 2) === 'pt') voice = v;
        }
      }
    }
    return voice;
  }
  function prox() { const d = Math.sqrt(dist2); return d < 1.5 ? 1 : d > 9.5 ? 0 : 1 - (d - 1.5) / 8; }
  function startTalk(line) {
    if (!live || talking || ctx.scene.userData.questQuiet) return;
    const now = ac.currentTime;
    talking = true; lastDj = T;
    music.gain.setTargetAtTime(0.3, now, 0.08);
    jingle(now + 0.02);
    if (ctx.ui && ctx.ui.toast) ctx.ui.toast(`Rádio Pirata 8-bit: «${line}»`);
    const v = null; // Radio uses the broker-managed formant voice; NPC signature TTS remains supported.
    if (v) {
      try {
        const u = new SpeechSynthesisUtterance(line);
        u.voice = v; u.lang = v.lang || 'pt-PT'; u.rate = 1.08; u.pitch = 0.95;
        u.volume = 0.06 + 0.16 * prox();                   // a little radio, not a stadium
        u.onend = onUtterEnd; u.onerror = onUtterError;
        utter = u; talkTTS = true;
        synth.speak(u);
        talkEnd = T + 1.5 + line.length * 0.08;
        return;
      } catch (e) { talkTTS = false; utter = null; }
    }
    talkEnd = T + 0.5 + blips(line, now + 0.4);
  }
  function onUtterEnd() { if (talking && talkTTS) endTalk(false); }
  function onUtterError(e) { if (e && e.error === 'not-allowed') ttsBroken = true; onUtterEnd(); }
  function endTalk(cut) {
    if (cut && talkTTS && utter) {
      utter.onend = utter.onerror = null;
      try { if (synth.speaking) synth.cancel(); } catch (e) { /* ignore */ }
    }
    talking = false; talkTTS = false; utter = null; talkEnd = 0;
    if (live && music) music.gain.setTargetAtTime(1, ac.currentTime, 0.3);
  }
  function jingle(t) {
    const lease = reserveModuleVoice(ctx, 3, true, .5, speaker, t); if (!lease) return; t = Math.max(t, lease.startAt);
    const o = ac.createOscillator(), g = ac.createGain();
    o.setPeriodicWave(W125); g.gain.value = 0;
    o.connect(g); g.connect(lease.gain);
    for (let i = 0; i < 4; i++) {
      const ti = t + i * 0.075;
      o.frequency.setValueAtTime(FREQ[JINGLE[i]], ti);
      g.gain.setValueAtTime(0.07, ti);
      g.gain.setTargetAtTime(0, ti + 0.03, 0.02);
    }
    lease.track(o); finishModuleVoice(lease, o); o.start(t); o.stop(t + 0.45);
  }
  // a chirpy voice: one square blip per vowel, through that vowel's formant
  function blips(text, t0) {
    const lease = reserveModuleVoice(ctx, 2, true, Math.max(1, text.length * .25 + 1), speaker, t0); if (!lease) return 0; t0 = Math.max(t0, lease.startAt);
    const o = ac.createOscillator(), bp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'square'; bp.type = 'bandpass'; bp.Q.value = 4.5; g.gain.value = 0;
    o.connect(bp); bp.connect(g); g.connect(lease.gain);
    let t = t0, f0 = 290 + rv() * 50, n = 0;
    const s = text.toLowerCase();
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i), k = VOW.indexOf(ch);
      if (k >= 0) {
        o.frequency.setValueAtTime(f0 * (1 + 0.1 * Math.sin(n * 1.9) + (rv() - 0.5) * 0.08), t);
        bp.frequency.setValueAtTime(FORMANT[VCLS[k]], t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.012);
        g.gain.setTargetAtTime(0, t + 0.045, 0.016);
        t += 0.072 + rv() * 0.022; n++;
      } else if (ch === ' ') t += 0.025;
      else if (ch === ',' || ch === ':' || ch === ';') t += 0.15;
      else if (ch === '.' || ch === '!' || ch === '?') { t += 0.24; f0 *= 0.96; }
    }
    lease.track(o); finishModuleVoice(lease, o); o.start(t0); o.stop(t + 0.1);
    return t - t0;
  }

  // ------------------------------------------------------------- spatialisation
  // The panner is placed where the radio is relative to the camera, expressed in
  // the listener's own frame — correct whether or not anyone drives the listener
  // (nobody does today), and this module never touches it.
  function placePanner(e) {
    if (!panner || !e) return;
    const px = SX - e[12], py = SY - e[13], pz = SZ - e[14];
    const rx = px * e[0] + py * e[1] + pz * e[2];
    const ry = px * e[4] + py * e[5] + pz * e[6];
    const rz = px * e[8] + py * e[9] + pz * e[10];
    const L = ac.listener;
    let X = rx, Y = ry, Z = rz;
    if (L.forwardX) {
      let fx = L.forwardX.value, fy = L.forwardY.value, fz = L.forwardZ.value;
      const ux = L.upX.value, uy = L.upY.value, uz = L.upZ.value;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      let qx = fy * uz - fz * uy, qy = fz * ux - fx * uz, qz = fx * uy - fy * ux;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      qx /= ql; qy /= ql; qz /= ql;
      const wx = qy * fz - qz * fy, wy = qz * fx - qx * fz, wz = qx * fy - qy * fx;
      X = L.positionX.value + rx * qx + ry * wx - rz * fx;
      Y = L.positionY.value + rx * qy + ry * wy - rz * fy;
      Z = L.positionZ.value + rx * qz + ry * wz - rz * fz;
    }
    if (panner.positionX) { panner.positionX.value = X; panner.positionY.value = Y; panner.positionZ.value = Z; }
    else panner.setPosition(X, Y, Z);
  }

  // ------------------------------------------------------------- the LCD
  const GLYPH = new Uint16Array(128);
  for (const k in FONT) GLYPH[String(k).charCodeAt(0)] = parseInt(FONT[k], 2);
  const LEV = new Float32Array(7), PK = new Float32Array(7);
  const ONT = new Float64Array(28), ONV = new Float32Array(28), ONW = new Uint8Array(7);
  const EQ_DT = reducedMotion ? 1 / 6 : 1 / 15;
  let eqClock = 0, textKey = -1, ledKey = -1, screenOn = true, tuneUntil = 0, fakePh = -1;
  function onset(b, t, v) { const w = (ONW[b] + 1) & 3; ONW[b] = w; ONT[b * 4 + w] = t; ONV[b * 4 + w] = v; }
  function glyph(code, x, y) {
    const bits = GLYPH[code];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((bits >> (14 - r * 3 - c)) & 1) g2.fillRect(x + c, y + r, 1, 1);
  }
  function num(n, x, y) {
    glyph(48 + (((n / 100) | 0) % 10), x, y);
    glyph(48 + (((n / 10) | 0) % 10), x + 4, y);
    g2.fillRect(x + 8, y + 4, 1, 1);
    glyph(48 + (n % 10), x + 10, y);
  }
  const segs = (l) => (l <= 0.04 ? 0 : l >= 1 ? 5 : Math.ceil(l * 5));
  function paintOn(el) {
    const now = live ? ac.currentTime : 0;
    const k = Math.exp(-el * (stopping ? 3 : 6.5));
    if (!live) {                                         // on but silent (muted / no audio yet): mime it
      const ph = (T * BPM / 15) | 0;
      if (ph !== fakePh) {
        fakePh = ph;
        const s = ph & 15;
        if ((s & 3) === 0) { LEV[0] = 0.85; LEV[1] = 0.95; }
        if ((s & 3) === 2) LEV[6] = 0.55;
        if (s === 4 || s === 12) LEV[5] = 0.8;
        if (rv() < 0.6) LEV[2 + ((rv() * 3) | 0)] = 0.6 + 0.35 * rv();
        if (rv() < 0.4) LEV[4] = 0.5;
      }
    }
    for (let b = 0; b < 7; b++) {
      let l = LEV[b] * k;
      if (live) for (let j = 0; j < 4; j++) {
        const i = b * 4 + j;
        if (ONT[i] > 0 && ONT[i] <= now) { if (ONV[i] > l) l = ONV[i]; ONT[i] = 0; }
      }
      if (talking && b > 0 && b < 6) { const sp = 0.2 + 0.7 * rv(); if (sp > l) l = sp; }
      LEV[b] = l;
      const p = PK[b] - el * 0.9;
      PK[b] = p > l ? p : l;
    }
    // header: frequency (sweeps in on power-on) and a blinking DJ tag
    const freq = T < tuneUntil ? 875 + Math.min(13, ((1 - (tuneUntil - T) / 0.45) * 13) | 0) : 888;
    const dj = talking && (((T * 3) | 0) & 1) === 0;
    const key = freq * 2 + (dj ? 1 : 0);
    if (key !== textKey) {
      textKey = key;
      g2.fillStyle = BG; g2.fillRect(0, 0, 56, 9);
      g2.fillStyle = TXT; num(freq, 3, 2); glyph(70, 19, 2); glyph(77, 23, 2);
      if (dj) { g2.fillStyle = AMBER; glyph(68, 44, 2); glyph(74, 48, 2); }
    }
    // equaliser: ghost segments, lit segments by colour, peak marks, gaps
    g2.fillStyle = BG; g2.fillRect(0, 9, 56, 23);
    g2.fillStyle = GHOST;
    for (let b = 0; b < 7; b++) g2.fillRect(1 + b * 8, 12, 6, 19);
    g2.fillStyle = LIME;
    for (let b = 0; b < 7; b++) { const n = segs(LEV[b]), m = n < 3 ? n : 3; if (m) g2.fillRect(1 + b * 8, 31 - 4 * m, 6, 4 * m); }
    g2.fillStyle = YEL;
    for (let b = 0; b < 7; b++) if (segs(LEV[b]) >= 4) g2.fillRect(1 + b * 8, 16, 6, 3);
    g2.fillStyle = RED;
    for (let b = 0; b < 7; b++) if (segs(LEV[b]) >= 5) g2.fillRect(1 + b * 8, 12, 6, 3);
    g2.fillStyle = PEAK;
    for (let b = 0; b < 7; b++) { const p = segs(PK[b]) - 1; if (p >= 0 && p >= segs(LEV[b])) g2.fillRect(1 + b * 8, 28 - 4 * p, 6, 1); }
    g2.fillStyle = BG;
    for (let y = 15; y < 28; y += 4) g2.fillRect(0, y, 56, 1);
    paintLed();
    tex.needsUpdate = true;
  }
  function paintLed() {
    const s = talking ? ((((T * 5) | 0) & 1) ? 2 : 1) : 1;
    if (s === ledKey) return;
    ledKey = s;
    g2.fillStyle = s === 1 ? LED_ON : LED_DIM;
    g2.fillRect(58, 26, 4, 4);
    tex.needsUpdate = true;
  }
  function paintOff() {
    screenOn = false; textKey = ledKey = -1;
    g2.fillStyle = OFF_BG; g2.fillRect(0, 0, CW, CH);
    g2.fillStyle = OFF_GHOST;
    for (let b = 0; b < 7; b++) g2.fillRect(1 + b * 8, 12, 6, 19);
    g2.fillStyle = OFF_BG;
    for (let y = 15; y < 28; y += 4) g2.fillRect(0, y, 56, 1);
    g2.fillStyle = LED_OFF; g2.fillRect(58, 26, 4, 4);
    LEV.fill(0); PK.fill(0); ONT.fill(0);
    tex.needsUpdate = true;
  }
  paintOff();
  newSong();

  // ------------------------------------------------------------- contract
  function onPick() {
    if (power) {                                         // off: the record brakes
      power = false;
      action.label = action.title = 'Ligar o rádio';
      djAt = 0; pendingLine = null;
      if (talking) endTalk(true);
      if (live && !stopping) vinylStop();
      return;
    }
    power = true;
    action.label = action.title = 'Desligar o rádio';
    tuneUntil = T + 0.45;
    if (synth && !voiceChecked) { try { synth.getVoices(); } catch (e) { /* warms the voice list */ } }
    if (live) kill();                                    // clicked during the brake: start over
    const A = ctx.audio;
    if (A && A.context && A.bus && !A.muted && A.context.state === 'running' && here) {
      // tune in near the end of a song, so the first DJ break is seconds away
      pos = Math.max(0, STEPS - Math.round((11 + rnd() * 4) / STEP));
      goLive(true);
    }
    if (ctx.ui && ctx.ui.toast) ctx.ui.toast(A && A.muted ? 'Rádio Pirata 8-bit · o som está desligado: toca só por dentro.' : 'Rádio Pirata 8-bit · 88,8 FM');
  }

  function update(dt, frame) {
    T += dt;
    const cam = frame && frame.camera;
    if (!cam) return;
    const e = cam.matrixWorld.elements;
    camE = e;
    const cx = e[12], cy = e[13], cz = e[14];
    here = frame.level === 1 && cx > -7 && cx < 7 && cz > 5.2 && cz < 17.6 && cy > 7.5 && cy < 12;
    const vx = SX - cx, vy = SY - cy, vz = SZ - cz;
    dist2 = vx * vx + vy * vy + vz * vz;
    const A = ctx.audio;
    const muted = !A || !!A.muted || !!ctx.scene.userData.questQuiet;
    if (live) {
      const now = ac.currentTime;
      if (muted || A.context !== ac) { if (talking) endTalk(true); fadeKill(0.15); }
      else if (!stopping) {
        if (here !== presOn) setPresence(here, now, here ? 0.4 : 0.25);
        if (here) awayT = 0;
        else if ((awayT += dt) > 2) { awaySince = T; kill(); }
        if (talking && !here) endTalk(true);
      }
      if (live) {
        if (killAt && now >= killAt) kill();
        else {
          placePanner(e);
          if (djAt && now >= djAt) {
            djAt = 0;
            if (here && dist2 < 110 && !muted && !killAt) startTalk(pendingLine || nextLine());
            pendingLine = null;
          }
          if (talking && talkEnd && T >= talkEnd) endTalk(false);
        }
      }
    } else if (power && here && !muted && A.bus && A.context && A.context.state === 'running') {
      goLive(false);
      if (awaySince && T - awaySince > 25) { pendingLine = WELCOME; djAt = ac.currentTime + 2; }
      awaySince = 0;
    }
    if (power || stopping) {
      if (!screenOn) { screenOn = true; textKey = ledKey = -1; }
      eqClock += dt;
      if (eqClock >= EQ_DT && here && dist2 < 196 && vx * NX + vz * NZ < 0 && vx * e[8] + vy * e[9] + vz * e[10] < 0) {
        paintOn(eqClock);
        eqClock = 0;
      } else if (eqClock > 1) eqClock = 1;
    } else if (screenOn) paintOff();
  }

  group.userData.radio = {
    toggle: onPick,
    dj() { if (live) startTalk(nextLine()); },
    get on() { return power; },
  };

  return { group, regions: [], colliders: [], pickables: [proxy, set], update, onPick };
}
