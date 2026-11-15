// arraial.js — a summer popular-festival corner east of the garden, beside the
// path to the metro stop (BRIEF §6.2). Two wooden masts carry strings of warm
// bulbs and paper pennants over a beaten-gravel floor; on a little plank stage
// Zé da Concertina (accordion) and Dona Rosa do Bombo (bass drum) trade silly
// verses about the campus, call and response, and she always has the last word.
// Three cabeçudos (huge papier-mâché heads on small bodies) dance badly in front.
// A sardine grill smokes at the side. Click Zé or Rosa: a "bomba" (firecracker).
//
// Footprint x 65.6…77.4, z 19.4…27.6 (floor y 0); the garden path region at
// z 27.6…30.4 is the threshold. Draw calls: floor 1, wood 1, metal 1, bulbs 1,
// pennants 1, performers 1 (one SkinnedMesh, 14 bones), FX points 1, bubble 1
// (only while someone sings) = 8. No lights, no image/audio files, one 256×128
// CanvasTexture. update(): returns at once beyond 40 m; otherwise ~14 bone
// sets, 72 particles and a Web Audio look-ahead scheduler, no allocations.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CX = 71.5, CZ = 23.4;                 // centre of the corner
const FAR2 = 40 * 40, PLAY_IN = 12, PLAY_OUT = 16;
const BPM = 96, S16 = 60 / BPM / 4;         // the campus clock (canon: 96 BPM)

// ---- words (original) ------------------------------------------------------------
const VERSES = [
  { ze: ['O anão do jardim', 'nunca está no mesmo lugar!'], rosa: ['Pudera, ó Zé,', 'foge de te ouvir cantar!'], big: 1 },
  { ze: ['No lago há um pato', 'do tamanho de um camião!'], rosa: ['E mesmo assim, ó Zé,', 'afina mais que o teu acordeão!'], big: 0 },
  { ze: ['Há um gato crítico de arte', 'que dá estrelas a quem passa!'], rosa: ['Ao Zé deu meia estrela', 'e foi só por ter graça!'], big: 1 },
  { ze: ['Na praça anda uma cobra', 'feita de quadradinhos!'], rosa: ['Já comeu três maçãs', 'e o lanche dos vizinhos!'], big: 0 },
  { ze: ['Há um mano no campus', 'que só fala em MB Way!'], rosa: ['Manda-lhe a conta das sardinhas,', 'que eu cá já paguei!'], big: 0 },
  { ze: ['O forcado do campus', 'só diz "Tá bueno!" e mais nada!'], rosa: ['Ouviu o Zé a cantar', 'e ficou de boca fechada!'], big: 1 },
  { ze: ['A sardinha está no ponto,', 'o carvão já está a arder!'], rosa: ['Só falta o pão, ó Zé,', 'que comeste sem eu ver!'], big: 0 },
  { ze: ['Lá vem o metro', 'com o apito a tocar!'], rosa: ['É o único no arraial', 'que sabe a hora de parar!'], big: 0 },
  { ze: ['Aqui no campus, amigos,', 'há quem leve um estalo!'], rosa: ['Se o Zé desafinar,', 'olhem que eu não me calo!'], big: 0 },
  { ze: ['A galeria troca os quadros', 'quando ninguém está a olhar!'], rosa: ['Era o que eu fazia ao Zé,', 'se o pudesse pendurar!'], big: 1 },
];
const NIGHT_VERSES = [
  { ze: ['Acendem-se as lampadinhas,', 'a noite está um primor!'], rosa: ['Com esta luz toda, Zé,', 'até pareces um cantor!'], big: 1 },
  { ze: ['Já há estrelas no céu', 'e grilos no jardim!'], rosa: ['Até os grilos se queixam', 'do teu dó, ré, mi!'], big: 0 },
];
const STORM_VERSES = [
  { ze: ['Ai, a chuva, ai, a chuva,', 'encharcou-me a concertina!'], rosa: ['Toca a valsa, ó Zé,', 'que ao menos a chuva afina!'], big: 0 },
  { ze: ['Trovoada no arraial,', 'caiu-me o boné no grelhador!'], rosa: ['Deixa estar, ó Zé:', 'assim já tem mais sabor!'], big: 1 },
  { ze: ['Chove nas sardinhas,', 'já estão a nadar outra vez!'], rosa: ['Antes nadar no prato', 'do que ouvir-te mais um mês!'], big: 0 },
];
const ZE_BOMBAS = [
  'Comi tanta sardinha que já nado de costas!',
  'Esta concertina é como eu: velhinha, mas com muito fole!',
  'A minha voz é como o caldo verde: aquece, mas ninguém repete!',
  'Toquei tão bem que o anão mudou de jardim!',
  'Pum! Esta é de borla. A próxima é por MB Way!',
  'O pato gigante pediu-me um autógrafo… no bico!',
  'O gato crítico deu-me cinco estrelas. Estavam todas apagadas!',
];
const ROSA_LAST = [
  'E ninguém te pediu, Zé!', 'Bomba é a tua afinação!', 'Ó Zé, toca e cala-te!',
  'Isso foi pior que sardinha crua!', 'Ai, Zé, ainda te troco pelo pato!', 'Até o forcado disse que não tá bueno!',
];
const ROSA_BOMBAS = [
  'Pum! Esta foi para acordar o Zé!',
  'Quem bate no bombo sou eu. O resto é conversa!',
  'O bombo é como o Zé: oco, mas faz um barulhão!',
  'Sardinha que salta do prato é porque ouviu o Zé!',
  'Mais uma bomba e o anão foge para o metro!',
];
const CAB_LINES = [
  '(abafado) Não vejo nada cá de dentro!', '(abafado) Quem é que me pisou o pé?',
  '(abafado) Esta cabeça pesa mais do que eu!', '(abafado) Estou a dançar ou a cair?',
  '(abafado) Cheira-me a sardinha… ou sou eu?',
];
const STORM_MOAN = ['Ai, que tempo! Valsa triste, então…', 'Chove-me no fole! Isto não é vida!'];
const HELLO = ['Chega-te, chega-te! Há sardinha e cantoria!', 'Olha quem chegou! Toca a dançar!'];

// ---- music (original) ---------------------------------------------------------------
// Chords: [bass root, bass fifth, three reed notes] (MIDI).
const CH = {
  C: [48, 43, 60, 64, 67], G: [43, 50, 59, 62, 67], G7: [43, 50, 59, 65, 67], F: [41, 48, 60, 65, 69],
  Am: [45, 52, 60, 64, 69], Dm: [50, 45, 62, 65, 69], C7: [48, 43, 58, 64, 67], Fm: [41, 48, 60, 65, 68],
  E: [40, 47, 59, 64, 68], E7: [40, 47, 59, 62, 68],
};
// Melodies: flat [midi, sixteenths, …] (0 = rest). Marchas in 2/4 (8 per bar), the waltz in 3/4 (12).
const TUNES = [
  { bar: 8, ch: 'C C G G G G C C F F C C G G C C', mel: [
    67, 2, 72, 2, 72, 1, 74, 1, 76, 2, 76, 2, 74, 1, 72, 1, 76, 2, 79, 2, 77, 2, 76, 1, 74, 1, 71, 2, 74, 2, 67, 4, 0, 2, 67, 1, 67, 1,
    74, 2, 74, 1, 76, 1, 77, 2, 74, 2, 71, 2, 72, 1, 74, 1, 79, 2, 77, 2, 76, 2, 74, 1, 72, 1, 67, 2, 76, 2, 72, 4, 0, 2, 67, 1, 69, 1,
    69, 2, 72, 1, 77, 1, 77, 2, 76, 1, 77, 1, 79, 2, 77, 1, 76, 1, 74, 2, 72, 2, 76, 2, 79, 2, 76, 1, 74, 1, 72, 2, 67, 2, 69, 1, 71, 1, 72, 2, 76, 2,
    74, 2, 71, 1, 74, 1, 79, 2, 77, 1, 74, 1, 71, 2, 74, 1, 71, 1, 67, 2, 71, 2, 72, 2, 76, 1, 79, 1, 76, 2, 74, 1, 71, 1, 72, 4, 0, 4] },
  { bar: 8, ch: 'C Am F G C Am Dm G C C7 F Fm C G C C', mel: [
    76, 1, 77, 1, 79, 2, 76, 2, 72, 2, 69, 2, 72, 1, 76, 1, 81, 2, 79, 2, 77, 2, 81, 1, 77, 1, 72, 2, 69, 2, 71, 2, 74, 1, 79, 1, 77, 2, 74, 2,
    76, 1, 77, 1, 79, 2, 76, 2, 72, 2, 72, 2, 76, 1, 81, 1, 79, 2, 76, 2, 77, 2, 74, 1, 77, 1, 81, 2, 77, 2, 79, 3, 77, 1, 76, 2, 74, 2,
    72, 2, 76, 2, 79, 2, 81, 1, 79, 1, 79, 2, 70, 1, 72, 1, 76, 2, 79, 2, 81, 2, 79, 1, 77, 1, 72, 2, 77, 2, 80, 2, 79, 1, 77, 1, 72, 2, 68, 2,
    67, 2, 72, 1, 76, 1, 79, 2, 76, 2, 74, 2, 77, 1, 74, 1, 71, 2, 67, 2, 72, 1, 74, 1, 76, 1, 79, 1, 76, 2, 74, 2, 72, 4, 0, 4] },
  { bar: 12, ch: 'Am Am E E E7 E Am Am Dm Dm Am Am E E E7 Am', waltz: 1, mel: [
    69, 4, 72, 4, 76, 4, 76, 8, 74, 2, 72, 2, 71, 4, 68, 4, 71, 4, 74, 8, 72, 2, 71, 2, 71, 4, 74, 4, 77, 4, 76, 8, 74, 2, 71, 2, 72, 4, 71, 2, 69, 2, 64, 4, 69, 12,
    74, 4, 77, 4, 81, 4, 81, 8, 79, 2, 77, 2, 76, 4, 72, 4, 69, 4, 76, 8, 74, 2, 72, 2, 71, 4, 72, 2, 71, 2, 68, 4, 64, 4, 68, 4, 71, 4, 71, 4, 74, 4, 71, 4, 69, 12] },
];
for (const T of TUNES) {
  T.chords = T.ch.split(' ').map((k) => CH[k]);
  let len = 0; for (let i = 1; i < T.mel.length; i += 2) len += T.mel[i];
  T.len = len;
  T.at = new Int16Array(len).fill(-1);
  for (let i = 0, s = 0; i < T.mel.length; i += 2) { if (T.mel[i]) T.at[s] = i; s += T.mel[i + 1]; }
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const RM = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'arraial';
  const regions = [{ minX: 65.6, maxX: 77.4, minZ: 19.4, maxZ: 28.0, y: 0 }];
  const colliders = [], pickables = [];
  const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  // warm night fill on PBR surfaces: emissive x albedo (vertex or instance colour)
  const tintByColour = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    m.customProgramCacheKey = () => 'arraial-tint';
  };

  // ---- floor: beaten gravel ---------------------------------------------------------
  const floorMat = M.get('gravel', { color: 0xcdb89a }).clone();
  floorMat.polygonOffset = true; floorMat.polygonOffsetFactor = -2; floorMat.polygonOffsetUnits = -2;
  floorMat.emissive = new THREE.Color(0xffb36b); floorMat.emissiveMap = floorMat.map; floorMat.emissiveIntensity = 0;
  const floor = new THREE.Mesh(M.boxUV(box(11.8, 0.03, 8.0, 71.5, -0.012, 23.4)), floorMat);
  floor.receiveShadow = true; group.add(floor);

  // ---- wood: stage, steps, masts, crossbars, crates -----------------------------------
  const woodMat = M.get('oakPlanks').clone();
  woodMat.emissive = new THREE.Color(0xffb36b); woodMat.emissiveMap = woodMat.map; woodMat.emissiveIntensity = 0;
  const wood = [
    box(6.0, 0.06, 2.8, 71.6, 0.39, 21.2), box(5.85, 0.36, 2.65, 71.6, 0.18, 21.2),
    box(1.3, 0.2, 0.42, 71.6, 0.1, 22.81),
    box(0.55, 0.32, 0.38, 67.4, 0.16, 20.6), box(0.55, 0.32, 0.38, 67.45, 0.48, 20.62), box(0.55, 0.32, 0.38, 67.95, 0.16, 20.7),
  ];
  for (const x of [66.3, 76.7]) {
    wood.push(new THREE.CylinderGeometry(0.085, 0.11, 5.0, 10).translate(x, 2.5, 23.4));
    wood.push(box(0.09, 0.09, 3.8, x, 4.72, 23.4));
    colliders.push({ minX: x - 0.16, maxX: x + 0.16, minZ: 23.24, maxZ: 23.56, minY: 0, maxY: 5.0 });
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood.map((g) => M.boxUV(g))), woodMat);
  woodMesh.castShadow = woodMesh.receiveShadow = true; group.add(woodMesh);
  colliders.push({ minX: 68.6, maxX: 74.6, minZ: 19.8, maxZ: 23.05, minY: 0, maxY: 2.5 });   // stage + step + performers
  colliders.push({ minX: 67.1, maxX: 68.25, minZ: 20.4, maxZ: 20.9, minY: 0, maxY: 0.65 });    // crates

  // ---- metal: grill, wires -------------------------------------------------------------
  const metalMat = M.get('steel', { color: 0x3a3d42 }).clone();
  const STR = [];                                   // strands: [z at mast A, z at mast B, top y, sag]
  STR.push([21.7, 25.1, 4.66, 0.95], [25.1, 21.7, 4.66, 0.95], [22.9, 22.9, 4.5, 0.75], [23.9, 23.9, 4.5, 0.8]);
  const strandAt = (k, s, out) => {
    const S = STR[k]; out.x = 66.3 + s * 10.4; out.z = S[0] + (S[1] - S[0]) * s; out.y = S[2] - S[3] * 4 * s * (1 - s); return out;
  };
  const metal = [box(1.0, 0.26, 0.5, 76.0, 0.72, 21.0), box(1.04, 0.02, 0.54, 76.0, 0.86, 21.0)];
  for (const [dx, dz] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) metal.push(box(0.035, 0.62, 0.035, 76.0 + dx, 0.3, 21.0 + dz));
  const pt = new THREE.Vector3();
  for (let k = 0; k < STR.length; k++) {
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(strandAt(k, i / 16, new THREE.Vector3()));
    metal.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.007, 3, false));
  }
  const metalMesh = new THREE.Mesh(mergeGeometries(metal.map((g) => { g.deleteAttribute('uv'); return M.boxUV(g); })), metalMat);
  metalMesh.castShadow = true; metalMesh.receiveShadow = true; group.add(metalMesh);
  colliders.push({ minX: 75.4, maxX: 76.6, minZ: 20.65, maxZ: 21.35, minY: 0, maxY: 1.0 });

  // ---- bulbs (+ grill coals): one InstancedMesh ---------------------------------------
  const NB = low ? 12 : 18, NCOAL = 7;
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.22, metalness: 0, emissive: 0xffc27a, emissiveIntensity: 0.15 });
  tintByColour(bulbMat);
  const bulbGeo = new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1.25, 1);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, NB * 2 + NCOAL);
  const BULB_COL = [0xfff0c8, 0xffd27a, 0xff8a6a, 0xa7f070, 0x7cc4ff, 0xffcd75];
  const d = new THREE.Object3D();
  let bi = 0;
  for (let k = 0; k < 2; k++) for (let i = 0; i < NB; i++) {
    strandAt(k, (i + 0.5) / NB, pt); d.position.set(pt.x, pt.y - 0.07, pt.z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
    bulbs.setMatrixAt(bi, d.matrix); bulbs.setColorAt(bi++, _c.setHex(BULB_COL[(i + k * 3) % BULB_COL.length]));
  }
  for (let i = 0; i < NCOAL; i++) {
    d.position.set(75.62 + i * 0.125, 0.8, 21.0 + ((i * 37) % 5 - 2) * 0.05); d.scale.set(1.3, 0.5, 1.2); d.rotation.set(0, i, 0); d.updateMatrix();
    bulbs.setMatrixAt(bi, d.matrix); bulbs.setColorAt(bi++, _c.setHex(i % 2 ? 0xff5a1e : 0xc23a12));
  }
  bulbs.raycast = () => {}; group.add(bulbs);

  // ---- paper pennants (bandeirinhas) ---------------------------------------------------
  const NP = low ? 16 : 26;
  const penGeo = new THREE.BufferGeometry();
  penGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.27, 0], 3));
  penGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const penMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const pennants = new THREE.InstancedMesh(penGeo, penMat, NP * 2);
  const PEN_COL = [0xef7d57, 0xffcd75, 0x41a6f6, 0xa7f070, 0xfff3d6, 0xd9454a];
  for (let k = 0; k < 2; k++) for (let i = 0; i < NP; i++) {
    strandAt(k + 2, (i + 0.5) / NP, pt); d.position.copy(pt); d.scale.setScalar(1); d.rotation.set((((i * 13) % 7) - 3) * 0.05, 0, 0); d.updateMatrix();
    pennants.setMatrixAt(k * NP + i, d.matrix); pennants.setColorAt(k * NP + i, _c.setHex(PEN_COL[(i + k * 2) % PEN_COL.length]));
  }
  pennants.raycast = () => {}; group.add(pennants);

  // ---- the performers: one SkinnedMesh ---------------------------------------------------
  const bones = [new THREE.Bone()];
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); bones[parent].add(b); bones.push(b); return bones.length - 1; };
  const parts = [];
  let OX = 0, OY = 0, OZ = 0;
  function cp(geo, hex, b, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    if (rx || ry || rz) { _e.set(rx, ry, rz); geo.applyMatrix4(_m.makeRotationFromEuler(_e)); }
    geo.translate(OX + x, OY + y, OZ + z);
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    const n = geo.attributes.position.count; _c.setHex(hex);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; si[i * 4] = b; sw[i * 4] = 1; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(geo);
  }
  const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const Cy = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
  const Ca = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 10);
  const B = (w, h, dd) => new THREE.BoxGeometry(w, h, dd);
  const To = (R, r, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 6, 14, arc);
  const SKIN = 0xe9b08f;

  // Zé da Concertina: flat cap, curled moustache, mustard waistcoat, red accordion on his belly.
  const zA = bone(0, 70.6, 0.42, 21.3), zH = bone(zA, 0, 1.5, 0), zBell = bone(zA, -0.11, 1.24, 0.42), zBass = bone(zA, 0.17, 1.24, 0.42);
  OX = 70.6; OY = 0.42; OZ = 21.3;
  for (const x of [-0.11, 0.11]) { cp(Cy(0.085, 0.08, 0.84), 0x2d2f36, zA, x, 0.48, 0); cp(Ca(0.06, 0.14), 0x5a3420, zA, x, 0.06, 0.06, 1, 1, 1, Math.PI / 2); }
  cp(S(0.27), 0x2d2f36, zA, 0, 0.98, 0.02, 1, 0.9, 0.9);
  cp(S(0.28), 0xd39a2b, zA, 0, 1.18, 0.04, 1, 1.22, 0.92);
  cp(S(0.25), 0xd39a2b, zA, 0, 1.06, 0.11);
  cp(S(0.2), 0xf1e7d2, zA, 0, 1.4, 0, 1.35, 0.7, 0.9);
  cp(To(0.085, 0.03), 0xc0392b, zA, 0, 1.46, 0.02, 1, 1, 1, Math.PI / 2);
  for (const sx of [-1, 1]) {
    cp(Ca(0.062, 0.2), 0xf1e7d2, sx > 0 ? zBass : zA, sx * 0.25, 1.3, 0.12, 1, 1, 1, 0.9, 0, sx * 0.25);
    cp(Ca(0.05, 0.16), SKIN, sx > 0 ? zBass : zA, sx * 0.25, 1.22, 0.3, 1, 1, 1, 1.4, 0, 0);
    cp(S(0.055), SKIN, sx > 0 ? zBass : zA, sx * 0.25, 1.22, 0.4);
  }
  OX = 70.6; OY = 0.42; OZ = 21.3;
  cp(B(0.12, 0.34, 0.2), 0xb51f2e, zA, -0.17, 1.24, 0.42);
  cp(B(0.1, 0.26, 0.012), 0xd6d8dc, zA, -0.17, 1.24, 0.526);
  for (let i = 0; i < 5; i++) for (const zz of [0.37, 0.46]) cp(S(0.014, 6, 4), 0xf4efe6, zA, -0.235, 1.12 + i * 0.06, zz);
  for (let i = 0; i < 8; i++) cp(B(0.0275, i % 2 ? 0.3 : 0.33, i % 2 ? 0.17 : 0.19), i % 2 ? 0xf2efe8 : 0x1f3d7a, zBell, 0.01375 + i * 0.0275 - 0.11 + 0.11, 1.24 - 1.24, 0.42 - 0.42);
  cp(B(0.12, 0.34, 0.2), 0xb51f2e, zBass, 0.17, 1.24, 0.42);
  cp(B(0.1, 0.26, 0.012), 0xd6d8dc, zBass, 0.17, 1.24, 0.526);
  // head
  cp(S(0.17, 18, 14), SKIN, zH, 0, 1.66, 0.02, 1, 1.08, 1);
  cp(S(0.046), 0xe39a7a, zH, 0, 1.65, 0.19, 1, 0.9, 1.2);
  for (const sx of [-1, 1]) {
    cp(S(0.04), SKIN, zH, sx * 0.17, 1.66, 0.0, 0.5, 1, 0.8);
    cp(S(0.028), 0xffffff, zH, sx * 0.06, 1.71, 0.15); cp(S(0.016, 8, 6), 0x161616, zH, sx * 0.058, 1.712, 0.172);
    cp(B(0.075, 0.018, 0.02), 0x2a1d14, zH, sx * 0.06, 1.762, 0.16, 1, 1, 1, 0, 0, -sx * 0.22);
    cp(Ca(0.024, 0.08), 0x1d1612, zH, sx * 0.055, 1.612, 0.178, 1, 1, 1, 0, 0, sx * 1.2);
    cp(To(0.022, 0.009), 0x1d1612, zH, sx * 0.115, 1.628, 0.165);
    cp(S(0.035), 0xe8937c, zH, sx * 0.1, 1.63, 0.13, 1, 0.8, 0.6);
    cp(B(0.02, 0.07, 0.05), 0x2a1d14, zH, sx * 0.163, 1.665, 0.05);
  }
  cp(To(0.035, 0.008, Math.PI), 0x6b1e1e, zH, 0, 1.582, 0.165, 1, 1, 1, 0, 0, Math.PI);
  cp(S(0.18), 0x5e4630, zH, 0, 1.79, -0.005, 1.06, 0.38, 1.12);
  cp(S(0.12), 0x4e3a28, zH, 0, 1.768, 0.15, 1, 0.12, 0.7);

  // Dona Rosa do Bombo: yellow shawl, flower in her bun, gold hoops, the bass drum at her front.
  const rA = bone(0, 72.8, 0.42, 21.3), rH = bone(rA, 0, 1.47, 0.02), rArm = bone(rA, -0.22, 1.36, 0.02);
  OX = 72.8; OY = 0.42; OZ = 21.3;
  for (const x of [-0.08, 0.08]) { cp(Cy(0.05, 0.045, 0.38), 0xf3efe9, rA, x, 0.22, 0); cp(Ca(0.05, 0.1), 0x1a1a1a, rA, x, 0.05, 0.04, 1, 1, 1, Math.PI / 2); }
  cp(Cy(0.2, 0.38, 0.62, 18), 0xd9454a, rA, 0, 0.66, 0);
  cp(S(0.215), 0x26222c, rA, 0, 1.08, 0, 1.02, 0.8, 0.94);
  cp(S(0.22), 0xf6f0e4, rA, 0, 1.2, 0, 1, 1.2, 0.9);
  cp(S(0.24), 0xefb92f, rA, 0, 1.33, 0, 1.15, 0.5, 0.95);
  cp(Cy(0.27, 0.27, 0.26, 20), 0x2457a8, rA, 0, 0.98, 0.32, 1, 1, 1, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    cp(Cy(0.262, 0.262, 0.01, 20), 0xefe3c6, rA, sx * 0.133, 0.98, 0.32, 1, 1, 1, 0, 0, Math.PI / 2);
    cp(To(0.268, 0.018), 0xb3202a, rA, sx * 0.135, 0.98, 0.32, 1, 1, 1, 0, Math.PI / 2, 0);
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cp(B(0.27, 0.012, 0.012), 0xf2e6c8, rA, 0, 0.98 + Math.sin(a) * 0.272, 0.32 + Math.cos(a) * 0.272, 1, 1, 1, a, 0, 0.5); }
  cp(B(0.05, 0.62, 0.02), 0x5a3a22, rA, 0.08, 1.2, 0.16, 1, 1, 1, -0.3, 0, -0.35);
  cp(Ca(0.055, 0.2), 0xf6f0e4, rA, 0.25, 1.22, 0.12, 1, 1, 1, 0.6, 0, -0.2);
  cp(S(0.05), SKIN, rA, 0.24, 1.15, 0.3);
  cp(Ca(0.055, 0.2), 0xf6f0e4, rArm, -0.24, 1.2, 0.08, 1, 1, 1, 0.5, 0, 0.15);
  cp(Ca(0.045, 0.14), SKIN, rArm, -0.27, 1.06, 0.2, 1, 1, 1, 1.0, 0, 0);
  cp(S(0.05), SKIN, rArm, -0.28, 1.02, 0.28);
  cp(Cy(0.012, 0.012, 0.3), 0x8a6a44, rArm, -0.23, 1.0, 0.31, 1, 1, 1, 0, 0, Math.PI / 2 - 0.25);
  cp(S(0.055), 0x3a2a2a, rArm, -0.16, 0.98, 0.32);
  cp(S(0.16, 18, 14), 0xe7ad8c, rH, 0, 1.6, 0.02);
  cp(S(0.168, 18, 14), 0x3a2418, rH, 0, 1.635, -0.025);
  cp(S(0.08), 0x3a2418, rH, 0, 1.79, -0.05);
  cp(S(0.045), 0xe0303a, rH, 0.08, 1.77, 0.0); cp(S(0.025), 0x2f8f3b, rH, 0.12, 1.75, 0.02, 1.6, 0.6, 1);
  for (const sx of [-1, 1]) {
    cp(To(0.025, 0.006), 0xd9a93a, rH, sx * 0.158, 1.53, 0.03, 1, 1, 1, 0, Math.PI / 2, 0);
    cp(S(0.027), 0xffffff, rH, sx * 0.058, 1.64, 0.145); cp(S(0.016, 8, 6), 0x2a1a10, rH, sx * 0.056, 1.642, 0.167);
    cp(B(0.065, 0.012, 0.02), 0x2a1a10, rH, sx * 0.058, 1.69, 0.15, 1, 1, 1, 0, 0, -sx * 0.25);
    cp(S(0.034), 0xec8c80, rH, sx * 0.095, 1.575, 0.12, 1, 0.8, 0.6);
  }
  cp(S(0.022), 0xd88a74, rH, 0, 1.59, 0.17);
  cp(S(0.04), 0xc2262e, rH, 0, 1.535, 0.145, 1.1, 0.45, 0.6);

  // Three cabeçudos: small bodies, enormous papier-mâché heads, original cartoon faces.
  const CABS = [[69.0, 24.4, 0x2f8f5b, 0xe9a67f], [71.7, 25.0, 0x6c3d9a, 0xf1c4a6], [74.4, 24.4, 0xe0752b, 0xe6b98f]];
  const cabA = [], cabH = [];
  CABS.forEach(([x, z, suit, face], k) => {
    const a = bone(0, x, 0, z), h = bone(a, 0, 1.12, 0); cabA.push(a); cabH.push(h);
    OX = x; OY = 0; OZ = z;
    for (const sx of [-1, 1]) {
      cp(Cy(0.07, 0.065, 0.55), 0x2b2b33, a, sx * 0.09, 0.3, 0); cp(Ca(0.055, 0.1), 0x111111, a, sx * 0.09, 0.05, 0.04, 1, 1, 1, Math.PI / 2);
      cp(Ca(0.05, 0.36), suit, a, sx * 0.24, 0.86, 0.02, 1, 1, 1, 0, 0, sx * 0.25);
      cp(S(0.06), 0xf4f1ea, a, sx * 0.3, 0.64, 0.04);
    }
    cp(Cy(0.2, 0.3, 0.66, 16), suit, a, 0, 0.84, 0);
    cp(Cy(0.305, 0.305, 0.05, 16), 0xffcd75, a, 0, 0.53, 0);
    cp(S(0.46, 22, 16), face, h, 0, 1.62, 0, 1, k === 2 ? 1.22 : 1.1, 0.95);
    if (k === 0) {        // "O Bigodes": cross-eyed, bulb nose, tiny top hat
      cp(S(0.13), 0xe0806a, h, 0, 1.6, 0.44);
      for (const sx of [-1, 1]) {
        cp(S(0.075), 0xffffff, h, sx * 0.15, 1.76, 0.37); cp(S(0.04, 8, 6), 0x161616, h, sx * 0.13, 1.76, 0.44);
        cp(Ca(0.05, 0.22), 0x1d1612, h, sx * 0.16, 1.48, 0.38, 1, 1, 1, 0, 0, sx * 1.25);
        cp(B(0.14, 0.04, 0.05), 0x1d1612, h, sx * 0.15, 1.86, 0.37, 1, 1, 1, 0, 0, sx * 0.2);
        cp(S(0.09), face, h, sx * 0.45, 1.65, 0, 0.5, 1, 0.8);
      }
      cp(Cy(0.11, 0.12, 0.17, 14), 0x1a1a1a, h, 0.06, 2.18, -0.02); cp(Cy(0.17, 0.17, 0.015, 14), 0x1a1a1a, h, 0.06, 2.1, -0.02);
      cp(Cy(0.115, 0.115, 0.035, 14), 0xc0392b, h, 0.06, 2.13, -0.02);
    } else if (k === 1) { // "A Comadre": giant cheeks, yellow headscarf, gold hoops
      for (const sx of [-1, 1]) {
        cp(S(0.12), 0xef8f8f, h, sx * 0.25, 1.52, 0.33);
        cp(S(0.06), 0xffffff, h, sx * 0.14, 1.72, 0.39); cp(S(0.033, 8, 6), 0x2a1a10, h, sx * 0.14, 1.72, 0.445);
        cp(B(0.1, 0.02, 0.03), 0x2a1a10, h, sx * 0.14, 1.8, 0.4, 1, 1, 1, 0, 0, -sx * 0.3);
        cp(To(0.07, 0.012), 0xd9a93a, h, sx * 0.44, 1.42, 0.05, 1, 1, 1, 0, Math.PI / 2, 0);
      }
      cp(S(0.05), 0xe3a08a, h, 0, 1.6, 0.45);
      cp(To(0.11, 0.022, Math.PI), 0xc2262e, h, 0, 1.47, 0.39, 1, 1, 1, 0.2, 0, Math.PI);
      cp(S(0.48, 22, 12), 0xf2c23b, h, 0, 1.86, -0.03, 1.02, 0.55, 1.0);
      cp(S(0.09), 0xf2c23b, h, 0, 2.15, -0.12);
    } else {              // "O Sabichão": egg head, round glasses, gap tooth, beret
      for (const sx of [-1, 1]) {
        cp(S(0.06), 0xffffff, h, sx * 0.15, 1.78, 0.4); cp(S(0.03, 8, 6), 0x161616, h, sx * 0.15, 1.81, 0.455);
        cp(To(0.11, 0.018), 0x161616, h, sx * 0.15, 1.78, 0.44);
      }
      cp(B(0.1, 0.02, 0.02), 0x161616, h, 0, 1.79, 0.46);
      cp(S(0.07), 0xd9a07c, h, 0, 1.64, 0.46, 1, 1.1, 1);
      cp(To(0.13, 0.02, Math.PI), 0x5a1e1e, h, 0, 1.47, 0.4, 1, 1, 1, 0.25, 0, Math.PI);
      cp(B(0.05, 0.05, 0.02), 0xfaf6ee, h, 0.03, 1.36, 0.43);
      cp(S(0.25), 0x23324f, h, 0.08, 2.22, 0, 1.2, 0.32, 1.2, 0, 0, 0.18);
      cp(Cy(0.012, 0.012, 0.06), 0x23324f, h, 0.1, 2.31, 0);
    }
  });
  // props on the root: basil pots on the stage, sardines on the grill
  OX = 0; OY = 0; OZ = 0;
  for (const x of [68.9, 74.3]) {
    cp(Cy(0.09, 0.065, 0.14, 12), 0xb5573a, 0, x, 0.49, 22.4);
    cp(S(0.13, 12, 8), 0x3f8f3a, 0, x, 0.64, 22.4, 1, 0.9, 1);
    cp(S(0.035), 0xe0303a, 0, x + 0.05, 0.76, 22.44);
    cp(B(0.08, 0.06, 0.004), 0xfff3d6, 0, x - 0.06, 0.8, 22.42);
  }
  for (let i = 0; i < 6; i++) cp(S(0.03, 8, 6), 0x9fb3c4, 0, 75.68 + i * 0.13, 0.885, 21.0, 0.6, 0.45, 3.6, 0, 0.12 * (i % 2 ? 1 : -1), 0);

  const perfGeo = mergeGeometries(parts);
  const perfMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, emissive: 0xffc58a, emissiveIntensity: 0 });
  tintByColour(perfMat);
  const performers = new THREE.SkinnedMesh(perfGeo, perfMat);
  performers.name = 'arraial-performers';
  performers.add(bones[0]);
  performers.updateMatrixWorld(true);
  performers.bind(new THREE.Skeleton(bones));
  performers.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, 1.4, 22.6), 6.5);
  performers.castShadow = true; performers.receiveShadow = true;
  performers.raycast = () => {};
  group.add(performers);
  const rest = new Float32Array(bones.length * 3);
  bones.forEach((b, i) => { rest[i * 3] = b.position.x; rest[i * 3 + 1] = b.position.y; rest[i * 3 + 2] = b.position.z; });

  // pick proxies (invisible: no draw call)
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxy = (w, h, dd, x, y, z, id, label) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), proxyMat);
    p.position.set(x, y, z); p.name = 'arraial-' + id; p.userData.action = { type: 'custom', id, label };
    group.add(p); pickables.push(p); return p;
  };
  proxy(0.75, 1.95, 0.8, 70.6, 1.4, 21.45, 'ze', 'Ask Zé for a bomba');
  proxy(0.8, 1.9, 0.85, 72.8, 1.37, 21.45, 'rosa', 'Ask Rosa for a bomba');
  CABS.forEach(([x, z], k) => {
    proxy(1.0, 2.3, 1.0, x, 1.15, z, 'cab' + k, 'Dance with the cabeçudo');
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, minY: 0, maxY: 2.3 });
  });

  // ---- FX: grill smoke + bomba sparks, one Points --------------------------------------
  const NSM = 20, NFX = 72;
  const fxPos = new Float32Array(NFX * 3), fxCol = new Float32Array(NFX * 4), fxVel = new Float32Array(NFX * 3);
  const fxAge = new Float32Array(NFX), fxLife = new Float32Array(NFX);
  for (let i = 0; i < NSM; i++) { fxLife[i] = 3.6; fxAge[i] = (i / NSM) * 3.6; }
  const fxGeo = new THREE.BufferGeometry();
  const fxPA = new THREE.BufferAttribute(fxPos, 3), fxCA = new THREE.BufferAttribute(fxCol, 4);
  fxPA.setUsage(THREE.DynamicDrawUsage); fxCA.setUsage(THREE.DynamicDrawUsage);
  fxGeo.setAttribute('position', fxPA); fxGeo.setAttribute('color', fxCA);
  const fxMat = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const fx = new THREE.Points(fxGeo, fxMat);
  fx.frustumCulled = false; fx.raycast = () => {}; fx.renderOrder = 2; fx.visible = false;
  group.add(fx);
  const SPARK = [[0.94, 0.49, 0.34], [1, 0.8, 0.46], [1, 0.95, 0.84], [0.65, 0.94, 0.44], [0.25, 0.65, 0.96]];
  function burst(x, y, z, big) {
    const n = big ? NFX - NSM : 28;
    for (let j = 0; j < n; j++) {
      const i = NSM + j, u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
      const v = RM ? 0.6 + Math.random() * 0.6 : 2.4 + Math.random() * 2.2;
      fxPos[i * 3] = x; fxPos[i * 3 + 1] = y; fxPos[i * 3 + 2] = z;
      fxVel[i * 3] = r * Math.cos(a) * v; fxVel[i * 3 + 1] = Math.abs(u) * v * 0.8 + (RM ? 0.2 : 1.2); fxVel[i * 3 + 2] = r * Math.sin(a) * v;
      fxAge[i] = 0; fxLife[i] = RM ? 2.2 + Math.random() : 0.8 + Math.random() * 0.6;
      const c = SPARK[(Math.random() * SPARK.length) | 0];
      fxCol[i * 4] = c[0]; fxCol[i * 4 + 1] = c[1]; fxCol[i * 4 + 2] = c[2]; fxCol[i * 4 + 3] = 1;
    }
  }

  // ---- the speech bubble: one Sprite, 256×128 pixel canvas ------------------------------
  const BW = 256, BH = 128;
  const bc = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let bg = null, btex = null;
  if (bc) { bc.width = BW; bc.height = BH; bg = bc.getContext('2d'); }
  if (bg) { btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.magFilter = THREE.NearestFilter; btex.minFilter = THREE.NearestFilter; btex.generateMipmaps = false; }
  const bubMat = new THREE.SpriteMaterial({ map: btex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const bubble = new THREE.Sprite(bubMat);
  bubble.center.set(0.5, 0); bubble.scale.set(2.3, 1.15, 1); bubble.renderOrder = 6; bubble.visible = false;
  bubble.raycast = () => {}; group.add(bubble);
  const wrap = [];
  function drawBubble(who, text) {
    if (!bg) return;
    const INK = '#1a1c2c', PAPER = '#fff3d6';
    bg.clearRect(0, 0, BW, BH);
    let size = 15;
    for (const s of [15, 13, 11]) {
      size = s; bg.font = `bold ${s}px "Silkscreen", "DejaVu Sans Mono", Menlo, monospace`;
      wrap.length = 0;
      for (const para of text.split('\n')) {
        let cur = '';
        for (const w of para.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && bg.measureText(t).width > BW - 28) { wrap.push(cur); cur = w; } else cur = t; }
        if (cur) wrap.push(cur);
      }
      if (wrap.length * (s + 3) <= BH - 44) break;
    }
    const lh = size + 3, h = wrap.length * lh + 26, y0 = BH - 12 - h;
    bg.fillStyle = 'rgba(26,28,44,0.9)'; bg.fillRect(7, y0 + 3, BW - 10, h);
    bg.fillStyle = INK; bg.fillRect(3, y0 - 1, BW - 8, h + 2);
    bg.fillStyle = PAPER; bg.fillRect(5, y0 + 1, BW - 12, h - 2);
    for (let r = 0; r < 8; r++) { bg.fillStyle = INK; bg.fillRect(BW / 2 - 9 + r, y0 + h + r, 18 - 2 * r, 1); if (r < 7) { bg.fillStyle = PAPER; bg.fillRect(BW / 2 - 8 + r, y0 + h - 1 + r, 16 - 2 * r, 1); } }
    bg.fillStyle = INK; bg.textBaseline = 'top'; bg.textAlign = 'left';
    bg.font = 'bold 11px "Silkscreen", "DejaVu Sans Mono", Menlo, monospace';
    bg.fillRect(12, y0 + 7, 2, 8); bg.fillRect(14, y0 + 7, 5, 2); bg.fillRect(9, y0 + 12, 4, 4);   // a pixel note
    bg.fillText(who, 24, y0 + 6);
    bg.font = `bold ${size}px "Silkscreen", "DejaVu Sans Mono", Menlo, monospace`; bg.textAlign = 'center';
    for (let i = 0; i < wrap.length; i++) bg.fillText(wrap[i], BW / 2, y0 + 21 + i * lh);
    btex.needsUpdate = true;
  }
  let bubT = 0;
  function say(who, text, x, y, z, secs) {
    drawBubble(who, text); bubble.position.set(x, y, z); bubble.visible = !!bg; bubT = secs; bubMat.opacity = 1;
    ctx.audio?.duck?.(Math.min(secs, 4));
  }
  const SPOT = { ze: [70.6, 2.5, 21.4], rosa: [72.8, 2.45, 21.4] };

  // ---- sound: everything into ctx.audio.bus, read lazily ---------------------------------
  let A = null, cur = 0, want = 0, punch = 0, strikeAt = 0, burstAt = 0, burstBig = 0;
  function audioOut() {
    const au = ctx.audio; if (!au) return null;
    try { const ac = au.context, bus = au.bus; return ac && bus && !au.muted && ac.state === 'running' ? au : null; } catch (e) { return null; }
  }
  function startAudio(au) {
    const ac = au.context;
    try {
      const out = ac.createGain(), lp = ac.createBiquadFilter(), pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      out.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 7000;
      out.connect(lp); if (pan) { lp.connect(pan); pan.connect(au.bus); } else lp.connect(au.bus);
      const acc = ac.createGain(), reed = ac.createBiquadFilter(), trem = ac.createOscillator(), tremG = ac.createGain();
      reed.type = 'lowpass'; reed.frequency.value = 2600; reed.Q.value = 0.7; acc.connect(reed); reed.connect(out);
      trem.frequency.value = 5.3; tremG.gain.value = 0.13; trem.connect(tremG); tremG.connect(acc.gain);
      const m1 = ac.createOscillator(), m2 = ac.createOscillator(), mg = ac.createGain();
      m1.type = m2.type = 'sawtooth'; m1.detune.value = -5; m2.detune.value = 12; mg.gain.value = 0;
      m1.connect(mg); m2.connect(mg); mg.connect(acc);
      const cg = ac.createGain(), co = []; cg.gain.value = 0; cg.connect(acc);
      for (let i = 0; i < 3; i++) { const o = ac.createOscillator(); o.type = 'square'; o.detune.value = i * 6 - 6; o.connect(cg); co.push(o); }
      const b1 = ac.createOscillator(), bf = ac.createBiquadFilter(), bgn = ac.createGain();
      b1.type = 'sawtooth'; bf.type = 'lowpass'; bf.frequency.value = 380; bgn.gain.value = 0; b1.connect(bf); bf.connect(bgn); bgn.connect(out);
      const dr = ac.createOscillator(), dg = ac.createGain(); dr.type = 'sine'; dr.frequency.value = 50; dg.gain.value = 0; dr.connect(dg); dg.connect(out);
      const dl = ac.createDelay(1), dlg = ac.createGain(); dl.delayTime.value = 0.23; dlg.gain.value = 0.3; dl.connect(dlg); dlg.connect(dl); dlg.connect(out);
      const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
      const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const oscs = [trem, m1, m2, co[0], co[1], co[2], b1, dr];
      const t0 = ac.currentTime + 0.03;
      for (const o of oscs) o.start(t0);
      A = { ac, au, out, lp, pan, mg, m1, m2, cg, co, bgn, b1, dr, dg, dl, noise, oscs, step: 0, stepT: t0 + 0.05, panT: 0 };
    } catch (e) { A = null; }
  }
  function stopAudio() {
    const a = A; A = null; if (!a) return;
    try {
      const t = a.ac.currentTime; a.out.gain.cancelScheduledValues(t); a.out.gain.setTargetAtTime(0, t, 0.08);
      for (const o of a.oscs) o.stop(t + 0.6);
      a.oscs[0].onended = () => { try { a.lp.disconnect(); if (a.pan) a.pan.disconnect(); } catch (e) { /* gone */ } };
    } catch (e) { /* context closed */ }
  }
  function boom(t, v) {
    const f = A.dr.frequency, g = A.dg.gain;
    f.cancelScheduledValues(t); f.setValueAtTime(105, t); f.exponentialRampToValueAtTime(43, t + 0.24);
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(v, t + 0.006); g.exponentialRampToValueAtTime(0.0005, t + 0.55);
  }
  function crack(t, big) {
    const ac = A.ac;
    try {
      const n1 = ac.createBufferSource(), f1 = ac.createBiquadFilter(), g1 = ac.createGain();
      n1.buffer = A.noise; f1.type = 'bandpass'; f1.frequency.value = 5200; f1.Q.value = 1.5;
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.04, t + 0.04); g1.gain.linearRampToValueAtTime(0, t + 0.3);
      n1.connect(f1); f1.connect(g1); g1.connect(A.out); n1.start(t, 0, 0.32);
      const tb = t + 0.3, n2 = ac.createBufferSource(), f2 = ac.createBiquadFilter(), g2 = ac.createGain();
      n2.buffer = A.noise; f2.type = 'highpass'; f2.frequency.value = 450;
      g2.gain.setValueAtTime(0.0001, tb); g2.gain.exponentialRampToValueAtTime(big ? 0.55 : 0.4, tb + 0.004); g2.gain.exponentialRampToValueAtTime(0.0008, tb + 0.24);
      n2.connect(f2); f2.connect(g2); g2.connect(A.out); g2.connect(A.dl); n2.start(tb, 0.2, 0.3);
      boom(tb, big ? 0.5 : 0.35);
      n2.onended = () => { try { g1.disconnect(); g2.disconnect(); } catch (e) { /* gone */ } };
      return tb;
    } catch (e) { return t; }
  }
  function schedStep(t) {
    let T = TUNES[cur];
    if (A.step % T.len === 0 && want !== cur) { cur = want; T = TUNES[cur]; A.step = 0; }
    const s = A.step % T.len, inBar = s % T.bar, chord = T.chords[(s / T.bar) | 0];
    const mi = T.at[s];
    if (mi >= 0) {
      const f = mtof(T.mel[mi]), dur = T.mel[mi + 1] * S16, g = A.mg.gain;
      A.m1.frequency.setValueAtTime(f, t); A.m2.frequency.setValueAtTime(f, t);
      g.setTargetAtTime(T.waltz ? 0.06 : 0.075, t, 0.014); g.setTargetAtTime(0, t + dur - 0.05, 0.03);
    }
    const bass = inBar === 0 ? chord[0] : (!T.waltz && inBar === 4) ? chord[1] : 0;
    if (bass) { const g = A.bgn.gain; A.b1.frequency.setValueAtTime(mtof(bass), t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(0.15, t + 0.012); g.setTargetAtTime(0, t + 0.07, 0.1); }
    const pah = T.waltz ? (inBar === 4 || inBar === 8) : (inBar === 2 || inBar === 6);
    if (pah) {
      for (let i = 0; i < 3; i++) A.co[i].frequency.setValueAtTime(mtof(chord[2 + i]), t);
      const g = A.cg.gain; g.setValueAtTime(0, t); g.linearRampToValueAtTime(T.waltz ? 0.018 : 0.026, t + 0.012); g.setTargetAtTime(0, t + 0.05, 0.07);
    }
    if (inBar === 0) {
      const now = A.ac.currentTime;
      if (punch) {
        boom(t, 0.5); strikeAt = clock + (t - now);
        if (punch === 2) { const tb = crack(t + 4 * S16, true); burstAt = clock + (tb - now); burstBig = 1; }
        punch = 0;
      } else if (!T.waltz) boom(t, 0.14);
    }
    A.step++;
  }

  // ---- show state ---------------------------------------------------------------------
  let clock = 0, pos = 0, playing = false, showT = 3, stage = 0, verse = null, nk = 0, greeted = false, coolT = 0;
  let lastV = -1, rosaHit = 0;
  const cabSpin = new Float32Array(3), cabLag = new Float32Array(3);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  function nextVerse(storm, night) {
    const pool = storm ? STORM_VERSES : (night && Math.random() < 0.4) ? NIGHT_VERSES : VERSES;
    let i = (Math.random() * pool.length) | 0;
    if (pool.length > 1 && pool === VERSES && i === lastV) i = (i + 1) % pool.length;
    if (pool === VERSES) lastV = i;
    return pool[i];
  }
  function bomba(who) {
    if (coolT > 0) return;
    coolT = 1.4;
    const sp = SPOT[who];
    if (who === 'ze') { say('ZÉ', pick(ZE_BOMBAS), sp[0], sp[1], sp[2], 3.6); stage = 4; showT = 3.6; }
    else { say('ROSA', pick(ROSA_BOMBAS), sp[0], sp[1], sp[2], 3.8); rosaHit = 1; stage = 3; showT = 4.2; }
    ctx.ui?.toast?.(who === 'ze' ? 'PUM! Bomba do Zé!' : 'PUM! Bomba da Rosa!');
    const au = audioOut();
    if (au && !A) startAudio(au);
    if (A) { const now = A.ac.currentTime, tb = crack(now + 0.02, true); burstAt = clock + (tb - now); }
    else burstAt = clock + 0.3;
    burstBig = 1;
  }

  const _dir = new THREE.Vector3();
  function update(dt, frame) {
    const cam = frame && frame.camera; if (!cam) return;
    const p = cam.position, dx = p.x - CX, dz = p.z - CZ, d2 = dx * dx + dz * dz;
    if (d2 > FAR2 || p.y > 6) { if (A) stopAudio(); if (fx.visible) fx.visible = false; if (bubble.visible) bubble.visible = false; playing = false; return; }
    dt = Math.min(dt || 0, 0.1); clock += dt; coolT -= dt;
    const dist = Math.sqrt(d2);
    const W = ctx.scene && ctx.scene.userData && ctx.scene.userData.weather;
    const mode = (frame.weather) || (W && W.mode) || 'golden';
    const storm = mode === 'storm' || !!(W && W.storm && mode !== 'rainbow');
    const nightT = W && typeof W.nightK === 'number' ? W.nightK : (mode === 'night' || (W && W.night)) ? 1 : 0;
    nk += (nightT - nk) * Math.min(1, dt * 1.5);
    const night = nk > 0.5;
    want = storm ? 2 : (cur === 2 ? 0 : cur);

    // performing within ~12 m (hysteresis to 16 m)
    const wasPlaying = playing;
    playing = dist < (playing ? PLAY_OUT : PLAY_IN);
    if (playing && !wasPlaying) { stage = 0; showT = 1.2; if (!greeted) { greeted = true; say('ZÉ', storm ? pick(STORM_MOAN) : pick(HELLO), SPOT.ze[0], SPOT.ze[1], SPOT.ze[2], 2.6); } }
    if (!playing && bubble.visible && dist > 20) bubble.visible = false;

    // audio graph: lazily, only while performing
    const au = playing ? audioOut() : null;
    if (au && (!A || A.ac !== au.context)) { if (A) stopAudio(); startAudio(au); }
    if (A && (!au || !playing)) stopAudio();
    if (A) {
      const now = A.ac.currentTime;
      if (A.stepT < now) A.stepT = now + 0.03;
      while (A.stepT < now + 0.14) { schedStep(A.stepT); A.stepT += S16; }
      pos = A.step - (A.stepT - now) / S16;
      A.panT -= dt;
      if (A.panT <= 0) {
        A.panT = 0.1;
        const near = Math.max(0, Math.min(1, 1 - (dist - 2) / 14));
        A.out.gain.setTargetAtTime(0.5 * near * near, now, 0.2);
        A.lp.frequency.setTargetAtTime(1200 + 7000 * near, now, 0.2);
        if (A.pan) { cam.getWorldDirection(_dir); const ix = -dx / (dist || 1), iz = -dz / (dist || 1); A.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, ix * -_dir.z + iz * _dir.x)), now, 0.15); }
        if (playing) au.duck?.(2.2);
      }
    } else pos += dt / S16 * (playing ? 1 : 0.35);

    // verses: Zé calls, Rosa answers with the last (cheekier) line
    if (playing) {
      showT -= dt;
      if (showT <= 0) {
        if (stage === 0 || stage === 3 || stage === 4) {
          verse = nextVerse(storm, night); stage = 1; showT = 4.6;
          say('ZÉ', verse.ze.join('\n'), SPOT.ze[0], SPOT.ze[1], SPOT.ze[2], 4.4);
        } else if (stage === 1) {
          stage = 2; showT = 4.8; punch = verse.big ? 2 : 1;
          say('ROSA', verse.rosa.join('\n'), SPOT.rosa[0], SPOT.rosa[1], SPOT.rosa[2], 4.6);
          if (!A) { strikeAt = clock + 0.4; if (verse.big) { burstAt = clock + 1.0; burstBig = 0; } punch = 0; }
        } else { stage = 3; showT = 3.4; if (Math.random() < 0.25) { stage = 4; say('ROSA', pick(ROSA_LAST), SPOT.rosa[0], SPOT.rosa[1], SPOT.rosa[2], 2.6); } }
      }
    }
    if (strikeAt && clock >= strikeAt) { strikeAt = 0; rosaHit = 1; }
    if (burstAt && clock >= burstAt) { burstAt = 0; burst(burstBig ? SPOT.ze[0] + 1.1 : SPOT.rosa[0], 3.6, 21.8, burstBig); fx.visible = true; }

    // bubble life
    if (bubT > 0) { bubT -= dt; if (bubT <= 0) bubble.visible = false; else bubMat.opacity = bubT < 0.3 ? bubT / 0.3 : 1; }

    // night: bulbs glow warm, a warm fill on the floor, wood and faces
    const breathe = RM ? 1 : 0.92 + 0.08 * Math.sin(clock * 1.3);
    bulbMat.emissiveIntensity = (0.15 + 3.2 * nk) * breathe;
    perfMat.emissiveIntensity = 0.26 * nk; woodMat.emissiveIntensity = 0.1 * nk; floorMat.emissiveIntensity = 0.07 * nk;

    // ---- motion ---------------------------------------------------------------------
    const T = TUNES[cur], amp = playing ? 1 : 0.25, beat = pos / 4, bp = beat * Math.PI;
    const sad = T.waltz ? 0.5 : 1;
    // Zé: bob, sway, nod; the bellows breathe over two bars
    let b = zA * 3;
    bones[zA].position.y = rest[b + 1] + 0.018 * amp * Math.abs(Math.sin(bp)) * sad;
    bones[zA].rotation.z = 0.05 * amp * Math.sin(bp * 0.5);
    bones[zH].rotation.x = (stage === 1 ? -0.12 : 0.05) * amp * (0.5 + 0.5 * Math.sin(bp)) + (T.waltz ? 0.18 : 0);
    bones[zH].rotation.z = 0.06 * amp * Math.sin(bp * 0.5 + 0.8);
    const sBell = 1 + (playing ? 0.32 : 0.04) * Math.sin(pos / (2 * T.bar) * Math.PI * 2);
    bones[zBell].scale.x = sBell;
    b = zBass * 3; bones[zBass].position.x = rest[b] + 0.22 * (sBell - 1);
    // Rosa: winds up through the bar, the mallet falls on the downbeat
    const barFrac = (pos % T.bar) / T.bar;
    rosaHit = Math.max(0, rosaHit - dt * 2.5);
    bones[rArm].rotation.z = playing ? -0.55 * barFrac * barFrac * (T.waltz ? 0.4 : 1) - 0.5 * rosaHit * (1 - rosaHit) * 4 : 0;
    b = rA * 3; bones[rA].position.y = rest[b + 1] + 0.02 * amp * Math.abs(Math.sin(bp + 0.4)) * sad;
    bones[rH].rotation.z = (stage === 2 ? 0.12 : 0.04 * Math.sin(bp * 0.5)) * amp;
    bones[rH].rotation.x = stage === 2 ? -0.08 : 0;
    // cabeçudos: clumsy bob and sway, heavy heads lag behind
    for (let k = 0; k < 3; k++) {
      const a = bones[cabA[k]], h = bones[cabH[k]], ph = k * 1.9, ia = cabA[k] * 3;
      cabSpin[k] = Math.max(0, cabSpin[k] - dt / 1.3);
      const spin = cabSpin[k] > 0 ? (1 - cabSpin[k]) * Math.PI * 2 : 0;
      const sway = (RM ? 0.05 : 0.15) * amp * Math.sin(bp * 0.5 * sad + ph);
      a.position.y = rest[ia + 1] + (RM ? 0.02 : 0.08) * amp * Math.abs(Math.sin(bp * sad + ph * 0.3));
      a.rotation.z = sway;
      a.rotation.y = (playing ? 0.45 : 0.1) * Math.sin(clock * 0.31 + ph) + spin;
      cabLag[k] += (-sway * 1.6 - cabLag[k]) * Math.min(1, dt * 4);
      h.rotation.z = cabLag[k] + 0.05 * amp * Math.sin(clock * 2.3 + ph);
      h.rotation.x = 0.07 * amp * Math.sin(bp * sad + ph);
    }

    // ---- FX: smoke always (within 40 m), sparks after a bomba -----------------------
    let alive = 0;
    for (let i = 0; i < NFX; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (i < NSM) {
        fxAge[i] += dt * (RM ? 0.6 : 1);
        if (fxAge[i] >= fxLife[i]) {
          fxAge[i] -= fxLife[i];
          fxPos[i3] = 75.7 + Math.random() * 0.6; fxPos[i3 + 1] = 0.95; fxPos[i3 + 2] = 20.9 + Math.random() * 0.2;
          fxVel[i3] = 0.12 + Math.random() * 0.08; fxVel[i3 + 1] = 0.32 + Math.random() * 0.15; fxVel[i3 + 2] = (Math.random() - 0.5) * 0.08;
        }
        const k = fxAge[i] / fxLife[i];
        fxPos[i3] += fxVel[i3] * dt + Math.sin(clock * 1.7 + i) * 0.002; fxPos[i3 + 1] += fxVel[i3 + 1] * dt; fxPos[i3 + 2] += fxVel[i3 + 2] * dt;
        const g = 0.78 - 0.45 * nk + (storm ? -0.1 : 0);
        fxCol[i4] = g; fxCol[i4 + 1] = g; fxCol[i4 + 2] = g + 0.03;
        fxCol[i4 + 3] = (storm ? 0.12 : 0.3) * (1 - k) * Math.min(1, fxAge[i] * 3);
        alive++;
      } else if (fxCol[i4 + 3] > 0) {
        fxAge[i] += dt;
        const k = fxAge[i] / fxLife[i];
        if (k >= 1) { fxCol[i4 + 3] = 0; continue; }
        const drag = RM ? 0.98 : 0.995;
        fxVel[i3] *= drag; fxVel[i3 + 2] *= drag; fxVel[i3 + 1] -= (RM ? 0.9 : 5.5) * dt;
        fxPos[i3] += fxVel[i3] * dt; fxPos[i3 + 1] += fxVel[i3 + 1] * dt; fxPos[i3 + 2] += fxVel[i3 + 2] * dt;
        fxCol[i4 + 3] = k > 0.6 ? (1 - k) / 0.4 : 1;
        alive++;
      }
    }
    fx.visible = alive > 0;
    fxPA.needsUpdate = true; fxCA.needsUpdate = true;
  }

  function onPick(target) {
    const id = target && target.userData && target.userData.action && target.userData.action.id;
    if (id === 'ze' || id === 'rosa') { bomba(id); return; }
    if (id && id.startsWith('cab')) {
      const k = +id.slice(3) || 0;
      if (cabSpin[k] > 0) return;
      cabSpin[k] = 1;
      const [x, z] = CABS[k];
      say('CABEÇUDO', pick(CAB_LINES), x, 2.55, z, 2.8);
    }
  }

  return { group, regions, colliders, pickables, update, onPick };
}
