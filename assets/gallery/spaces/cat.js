import { reserveModuleVoice, finishModuleVoice } from '../audio-lease.js';
// cat.js — "O Gato Crítico": a chunky ginger tabby on the cap of the south pier of the east
// (garden) gate of the plaza (plaza.js: cap block x 23.62…24.72, z 26.40…26.90, top y 1.83),
// looking west over the plaza and its two east litter bins. It judges the visitor in small
// pixel speech bubbles — jumps, sprints, loitering, staring, paper balls in (or near, or on) it —
// follows you with its head, blinks, flicks its tail and twitches its ears, and ignores you
// when you are far. Click: it purrs (synthesised), or turns its back and licks a paw.
//
// Cost: one SkinnedMesh (12 rigid bones, one draw) + eyes (one draw) + the bubble sprite
// (one draw, only while speaking). Cat, eyes and bubble live on layer 1 (main camera only:
// no reflections, no raycasts); an invisible box on layer 0 takes the clicks.
// update() returns at once beyond 35 m and allocates nothing.
// group.userData.say(text) lets the host make it speak (e.g. from another module's event).
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PX = 23.86, PY = 1.83, PZ = 26.65, YAW = -Math.PI / 2;   // facing -x, into the plaza
const SC = 1.2;                                                  // a chunky tom: modelled at life size, shown 1.2x
const CY = Math.cos(YAW), SY = Math.sin(YAW);
const HX = PX + 0.09 * SC * SY, HY = PY + 0.36 * SC, HZ = PZ + 0.09 * SC * CY; // eye line, world
const BCX = PX, BCY = PY + 0.2 * SC, BCZ = PZ, HIT2 = (0.24 * SC) ** 2;        // body centre, world (ball hits)
const BINS = [[13, 26.6], [13, 36.6], [-13, 26.6], [-13, 36.6]]; // furniture.js
const FAR = 35;
const SIT = 0, PURR = 1, AWAY = 2, LICK = 3, BACK = 4;
const BALL_FLY = 2, BALL_REST = 3, BALL_SINK = 4;                // paperball.js states

const LINES = {
  greet: ['Ah. Tu outra vez.', 'Chegou o artista.', 'Hm. Um visitante.', 'Vamos lá ver isso.', 'Mostra o que vales.', 'Olha quem chegou.'],
  jump: ['Já vi melhor.', 'O anterior saltava mais.', 'Isso foi um salto?', 'A gravidade ganhou.', 'Eu salto isso a dormir.',
    'Salto com alma. Sem altura.', 'Pfff.', 'Bravo... acho eu.', 'Os pombos riem-se.', 'Mais alto. Ou não.', 'Aterragem: 3/10.', 'Técnica duvidosa.'],
  jumps: ['Pronto, já percebi.', 'Outra vez?', 'Estás a assustar o pilar.', 'Já chega de ginástica.', 'Isto não é um trampolim.'],
  sprint: ['Calma, atleta.', 'Onde é o fogo?', 'Ninguém te persegue.', 'Correr? Que esforço.', 'Eu também fujo assim do banho.',
    'Velocidade 8. Estilo 3.', 'Vais chegar cansado.', 'Isto é uma praça, não uma pista.'],
  loiter: ['Hmm.', 'Já vi melhor.', '4/10', 'Bravo... acho eu.', 'O anterior saltava mais.', 'Estás à espera de quê?',
    'Postura: 5/10.', 'Muito parado. Suspeito.', 'Isso é arte moderna?', 'Pagas em festinhas?', 'Vai ver os quadros.', 'Ainda aqui?'],
  stare: ['Que foi?', 'Nunca viste um gato?', 'Tira a fotografia e segue.', 'Sim, sou eu. O crítico.', 'Fixa-me menos.', 'Pisca primeiro. Eu ganho.'],
  leave: ['Vai, vai.', 'Volta quando saltares melhor.', 'Até nunca. Ou amanhã.', 'Não fiques triste.'],
  basket: ['Sorte.', 'Até eu.', 'Cesto! Sem estilo.', 'Hmm. Aceitável.', 'Sorte de principiante.', 'Bravo... acho eu.', 'O cesto também se assustou.'],
  three: ['3 pontos? Eu dava 2.', 'De longe. Sorte de longe.'],
  miss: ['Falhaste. Eu vi.', 'Quase não conta.', 'O cesto tem medo de ti.', 'Mira: 3/10.', 'Era para ali? Ah.'],
  hit: ['Ai! Falta!', 'Isso foi pessoal.', 'Vou fingir que não vi.', '0/10. Péssima mira.', 'Cartão vermelho.'],
  purr: ['Rrrrrr...', 'Prrr... Não contes a ninguém.', 'Hmpf. Continua.', 'Isto não muda a nota.', 'Prrr. Talvez 6/10.'],
  snub: ['Não.', 'Agora não.', 'Marca na agenda.', 'Sem autógrafos.', 'Estou ocupado.', 'Fala com a minha pata.'],
  busy: ['Já disse que não.', 'Ocupadíssimo.', 'Shh.'],
};

export function build(ctx) {
  const { THREE } = ctx;
  const low = ctx.quality === 'low';
  const RM = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'cat';
  group.position.set(PX, PY, PZ);
  group.rotation.y = YAW;
  group.scale.setScalar(SC);

  // ---------- skeleton: rest pose has identity rotations; cat-local metres, +z forward ----------
  const bones = [];
  const bone = (parent, x, y, z) => {
    const b = new THREE.Bone();
    b.userData.at = [x, y, z];
    if (parent) { const a = parent.userData.at; b.position.set(x - a[0], y - a[1], z - a[2]); parent.add(b); }
    else b.position.set(x, y, z);
    b.rotation.order = 'YXZ';
    bones.push(b);
    return b;
  };
  const bRoot = bone(null, 0, 0, 0);
  const bBody = bone(bRoot, 0, 0.1, -0.03);
  const bNeck = bone(bRoot, 0, 0.27, 0.045);
  const bHead = bone(bNeck, 0, 0.31, 0.06);
  const bEarL = bone(bHead, 0.047, 0.402, 0.07);
  const bEarR = bone(bHead, -0.047, 0.402, 0.07);
  const bLegR = bone(bRoot, -0.046, 0.168, 0.072);
  const TP = [[0, 0.055, -0.15], [0.08, 0.034, -0.16], [0.138, 0.028, -0.09], [0.15, 0.027, 0.0], [0.124, 0.03, 0.082], [0.075, 0.043, 0.132]];
  const TR = [0.03, 0.028, 0.026, 0.024, 0.021, 0.015];
  const bTail = [];
  for (let i = 0; i < 5; i++) bTail.push(bone(i ? bTail[i - 1] : bRoot, TP[i][0], TP[i][1], TP[i][2]));

  // ---------- geometry: rigid parts, each bound to one bone ----------
  const parts = [];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), D3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const SW = low ? 10 : 18, SH = low ? 7 : 12;
  function ell(kind, b, cx, cy, cz, rx, ry, rz, ax = 0, ay = 0, az = 0, extra = null, ws = SW, hs = SH) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    E.set(ax, ay, az); Q.setFromEuler(E);
    g.applyMatrix4(M4.compose(P3.set(cx, cy, cz), Q, S3.set(rx, ry, rz)));
    parts.push({ g, b, kind, ...extra });
  }
  function rod(kind, b, a, c, r0, r1, radial, extra = null) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.CylinderGeometry(r1, r0, L, radial, 1, true);
    Q.setFromUnitVectors(UP, D3.set(dx / L, dy / L, dz / L));
    g.applyMatrix4(M4.compose(P3.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), Q, ONE));
    parts.push({ g, b, kind, a, c, L, ...extra });
  }
  function ear(side, b) {
    const [px, py, pz] = b.userData.at;
    for (let k = 0; k < 2; k++) {
      const inner = k === 1, r = inner ? 0.025 : 0.039, h = inner ? 0.052 : 0.074;
      const g = new THREE.ConeGeometry(r, h, 3, 1);
      g.rotateY(Math.PI);                      // flat face forward, ridge behind
      g.scale(1, 1, 0.55);
      g.translate(0, h / 2 + (inner ? 0.007 : 0), inner ? 0.006 : 0);
      g.rotateX(0.12);                         // tip a touch forward
      g.rotateZ(-side * 0.3);                  // and out
      g.translate(px, py, pz);
      parts.push({ g, b, kind: inner ? 'earIn' : 'earOut' });
    }
  }

  // body: haunches, thighs, upright chest, ruff
  ell('body', bBody, 0, 0.105, -0.035, 0.125, 0.108, 0.135);
  for (const s of [1, -1]) ell('body', bBody, s * 0.072, 0.085, -0.012, 0.062, 0.076, 0.096);
  ell('body', bBody, 0, 0.19, 0.03, 0.092, 0.125, 0.088, 0.3);
  ell('neck', bNeck, 0, 0.29, 0.058, 0.074, 0.06, 0.066);
  // legs and paws (the right front leg has its own bone: it is the one that gets licked)
  for (const s of [1, -1]) {
    const b = s > 0 ? bBody : bLegR, x = s * 0.046;
    rod('leg', b, [x, 0.014, 0.096], [x, 0.17, 0.07], 0.025, 0.028, low ? 7 : 12);
    ell('paw', b, x, 0.016, 0.106, 0.03, 0.018, 0.038);
    ell('paw', bBody, s * 0.088, 0.017, 0.036, 0.034, 0.02, 0.062);
  }
  // head: skull, tomcat jowls, whisker pads, chin, nose, ears, whiskers
  ell('skull', bHead, 0, 0.36, 0.085, 0.084, 0.071, 0.074);
  for (const s of [1, -1]) {
    ell('cheek', bHead, s * 0.04, 0.337, 0.112, 0.047, 0.04, 0.042);
    ell('muzzle', bHead, s * 0.017, 0.333, 0.15, 0.021, 0.018, 0.019);
  }
  ell('chin', bHead, 0, 0.317, 0.138, 0.022, 0.013, 0.019);
  ell('nose', bHead, 0, 0.348, 0.168, 0.012, 0.0085, 0.008, 0.2, 0, 0, null, 8, 6);
  ear(1, bEarL); ear(-1, bEarR);
  if (!low) {
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
      rod('whisker', bHead, [s * 0.03, 0.337 - k * 0.006, 0.158], [s * 0.128, 0.352 - k * 0.021, 0.15 - k * 0.012], 0.0012, 0.0005, 3);
    }
  }
  // tail: tapered segments with joint spheres, lying round the paws, one bone per segment
  let s0 = 0;
  for (let i = 0; i < 5; i++) {
    const a = TP[i], c = TP[i + 1];
    ell('tail', bTail[i], a[0], a[1], a[2], TR[i], TR[i], TR[i], 0, 0, 0, { s0 }, low ? 8 : 10, low ? 6 : 8);
    rod('tail', bTail[i], a, c, TR[i], TR[i + 1], low ? 7 : 10, { s0 });
    s0 += Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  }
  ell('tail', bTail[4], TP[5][0], TP[5][1], TP[5][2], TR[5], TR[5], TR[5], 0, 0, 0, { s0 }, 8, 6);
  const TAIL_LEN = s0;

  // ---------- fur colour: ginger tabby, cream bib, white socks, baked contact shade ----------
  const C = (hex) => new THREE.Color(hex);
  const GINGER = C(0xe08a3a), DARK = C(0xb0602a), DEEP = C(0x8a4317), CREAM = C(0xf3dcb8), WHITE = C(0xf6f0e6);
  const NOSE = C(0xc56d68), EARIN = C(0xc4877c), WHISK = C(0xf7f3ec);
  const col = new THREE.Color();
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  function shade(p, x, y, z, nx, ny, nz) {
    const k = p.kind;
    if (k === 'whisker') { col.copy(WHISK); return; }
    if (k === 'earIn') { col.copy(EARIN).multiplyScalar(0.7 + 0.3 * sst(0.405, 0.45, y)); return; }
    if (k === 'nose') { col.copy(NOSE); return; }
    if (k === 'paw' || k === 'chin') col.copy(WHITE);
    else if (k === 'muzzle') col.copy(WHITE).lerp(CREAM, 0.3);
    else if (k === 'earOut') col.copy(GINGER).lerp(DEEP, 0.85 * sst(0.44, 0.47, y));
    else if (k === 'tail') {
      let s = p.s0;
      if (p.c) {
        const ax = p.c[0] - p.a[0], ay = p.c[1] - p.a[1], az = p.c[2] - p.a[2];
        const t = Math.min(1, Math.max(0, ((x - p.a[0]) * ax + (y - p.a[1]) * ay + (z - p.a[2]) * az) / (p.L * p.L)));
        s += t * p.L;
      }
      col.copy(GINGER).lerp(DEEP, 0.62 * sst(0.45, 0.8, 0.5 + 0.5 * Math.sin(s * TAU / 0.056)));
      if (s > TAIL_LEN - 0.035) col.copy(DEEP);
      if (ny < -0.3) col.lerp(CREAM, 0.3);
    } else if (k === 'skull' || k === 'cheek') {
      col.copy(GINGER).lerp(DARK, 0.55 * sst(0.45, 0.95, ny));
      if (k === 'skull' && nz > 0.15) col.lerp(DEEP, 0.6 * Math.max(0, 1 - Math.abs(x) / 0.022) * sst(0.15, 0.55, ny));
      col.lerp(CREAM, (k === 'cheek' ? 0.8 : 0.65) * sst(-0.05, -0.65, ny));
    } else { // body, neck, leg
      col.copy(GINGER);
      const dorsal = Math.max(0, ny * 0.45 - nz * 0.89);
      col.lerp(DARK, 0.42 * Math.min(1, dorsal * 1.4));
      const u = (y - 0.1) * 0.677 + (z + 0.14) * 0.736;
      const band = k === 'leg' ? sst(0.55, 0.85, 0.5 + 0.5 * Math.sin(y * TAU / 0.04)) : sst(0.5, 0.85, 0.5 + 0.5 * Math.sin(u * TAU / 0.052 + x * 6));
      col.lerp(DEEP, 0.5 * band * Math.min(1, Math.abs(nx) * 0.9 + dorsal) * (k === 'leg' ? 0.7 : 1));
      if (k === 'leg') { col.lerp(CREAM, 0.45 * sst(0.3, 0.9, nz)); if (y < 0.04) col.copy(WHITE); }
      else col.lerp(CREAM, 0.85 * sst(0.35, 0.8, nz) * (1 - sst(0.04, 0.1, Math.abs(x))));
    }
    col.multiplyScalar(0.62 + 0.38 * sst(0, 0.075, y));
  }
  for (const p of parts) {
    const g = p.g;
    g.deleteAttribute('uv');
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
    const cols = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const bi = bones.indexOf(p.b);
    for (let i = 0; i < n; i++) {
      shade(p, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
      cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
      si[i * 4] = bi; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  const geo = mergeGeometries(parts.map((p) => p.g));
  for (const p of parts) p.g.dispose();

  const furMat = low
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, sheen: 1, sheenRoughness: 0.42, sheenColor: C(0xffd9ad) });
  const cat = new THREE.SkinnedMesh(geo, furMat);
  cat.name = 'cat-body';
  cat.add(bRoot);
  cat.updateMatrixWorld(true);
  cat.bind(new THREE.Skeleton(bones));
  cat.castShadow = true; cat.receiveShadow = true;
  cat.computeBoundingSphere();
  cat.boundingSphere.radius *= 1.5;      // head turns and tail flicks stay inside
  cat.raycast = () => {};                // clicks go to the proxy below
  group.add(cat);

  // ---------- eyes: glossy, slit pupils, dark rims; a child of the head bone, squashed to blink ----------
  const EYE_O = [0, 0.364, 0.149];
  const eyeGeos = [];
  const IRIS = C(0xcdbf3c), PUPIL = C(0x080605), RIM = C(0x1c140e);
  const eyePart = (s, color, rx, ry, rz, push) => {
    const g = new THREE.SphereGeometry(1, low ? 10 : 14, low ? 7 : 10);
    const ay = s * 0.42;
    E.set(0, ay, s * 0.18); Q.setFromEuler(E);
    const cx = s * 0.034 + Math.sin(ay) * push - EYE_O[0], cz = EYE_O[2] + Math.cos(ay) * push - EYE_O[2];
    g.applyMatrix4(M4.compose(P3.set(cx, 0, cz), Q, S3.set(rx, ry, rz)));
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    eyeGeos.push(g);
  };
  for (const s of [1, -1]) {
    eyePart(s, RIM, 0.0196, 0.0152, 0.006, -0.002);
    eyePart(s, IRIS, 0.0168, 0.0128, 0.0072, 0);
    eyePart(s, PUPIL, 0.0042, 0.0108, 0.003, 0.0058);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0, emissive: 0x141004 });
  const eyes = new THREE.Mesh(mergeGeometries(eyeGeos), eyeMat);
  for (const g of eyeGeos) g.dispose();
  const hp = bHead.userData.at;
  eyes.position.set(EYE_O[0] - hp[0], EYE_O[1] - hp[1], EYE_O[2] - hp[2]);
  eyes.name = 'cat-eyes';
  eyes.receiveShadow = true;
  eyes.raycast = () => {};
  bHead.add(eyes);

  // ---------- click proxy (layer 0, never drawn) ----------
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.52), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(0, 0.3, -0.01);
  proxy.name = 'cat-pick';
  proxy.userData.action = { type: 'custom', id: 'cat' };
  group.add(proxy);

  // ---------- pixel speech bubble: 160 x 64 canvas, 1-bit text, constant integer pixel scale ----------
  const BW = 160, BH = 64, LH = 11, MAXW = BW - 16;
  const INK = '#15120e', PAPER = '#f4efe6';
  const FONT = 'bold 10px "DejaVu Sans Mono", Menlo, Consolas, ui-monospace, monospace';
  const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const bubMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false });
  bubMat.color.setScalar(1.1);
  const bubble = new THREE.Sprite(bubMat);
  bubble.center.set(0.5, 0);
  bubble.position.set(0, 0.62, 0.05);
  bubble.renderOrder = 6;
  bubble.visible = false;
  bubble.name = 'cat-bubble';
  bubble.raycast = () => {};
  group.add(bubble);
  const lines = ['', '', '', ''];
  function drawBubble(text) {
    g2.clearRect(0, 0, BW, BH);
    g2.font = FONT; g2.textBaseline = 'top';
    let n = 0, cur = '';
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const tryS = cur ? cur + ' ' + words[i] : words[i];
      if (cur && g2.measureText(tryS).width > MAXW) { if (n < 4) lines[n++] = cur; cur = words[i]; } else cur = tryS;
    }
    if (cur && n < 4) lines[n++] = cur;
    let tw = 0;
    for (let i = 0; i < n; i++) tw = Math.max(tw, Math.ceil(g2.measureText(lines[i]).width));
    const w = Math.min(BW - 2, tw + 12), h = n * LH + 6;
    const x0 = (BW - w) >> 1, y0 = BH - 7 - h, cx = BW >> 1, by = y0 + h - 1;
    g2.fillStyle = INK; g2.fillRect(x0 + 1, y0, w - 2, h); g2.fillRect(x0, y0 + 1, w, h - 2);
    g2.fillStyle = PAPER; g2.fillRect(x0 + 2, y0 + 1, w - 4, h - 2); g2.fillRect(x0 + 1, y0 + 2, w - 2, h - 4);
    for (let r = 0; r <= 5; r++) {          // stepped tail pointing down at the cat
      const hw = 5 - r;
      g2.fillStyle = INK; g2.fillRect(cx - hw - 1, by + r, 2 * hw + 2, 1);
      if (hw > 0) { g2.fillStyle = PAPER; g2.fillRect(cx - hw, by + r, 2 * hw, 1); }
    }
    g2.fillStyle = INK;
    for (let i = 0; i < n; i++) g2.fillText(lines[i], Math.round(cx - g2.measureText(lines[i]).width / 2), y0 + 3 + i * LH);
    // 1-bit: snap the anti-aliased glyphs to ink or paper, so the pixels stay pixels
    const img = g2.getImageData(x0 + 2, y0 + 2, w - 4, h - 4), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 150) { d[i] = 21; d[i + 1] = 18; d[i + 2] = 14; } else { d[i] = 244; d[i + 1] = 239; d[i + 2] = 230; }
      d[i + 3] = 255;
    }
    g2.putImageData(img, x0 + 2, y0 + 2);
    tex.needsUpdate = true;
  }

  // ---------- lines: shuffle bags, so nothing repeats until the pool is spent ----------
  const bags = {};
  for (const key of Object.keys(LINES)) {
    const order = new Uint8Array(LINES[key].length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    bags[key] = { lines: LINES[key], order, i: order.length };
  }
  function next(key) {
    const b = bags[key], o = b.order;
    if (b.i >= o.length) {
      for (let i = o.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0, t = o[i]; o[i] = o[j]; o[j] = t; }
      b.i = 0;
    }
    return b.lines[o[b.i++]];
  }

  // ---------- state ----------
  let awake = false, seen = false, layerChecked = false, lastCam = null;
  let t = 0, lastX = 0, lastY = 0, lastZ = 0, hs = 0, dist = 99;
  let air = false, airT = 0, airY0 = 0, takeHs = 0, jumpCount = 0, jumpWin = 0;
  let sprintT = 0, sprintLock = false, sprintCalm = 0;
  let stillT = 0, loiterCd = 3, stareT = 0, stareCd = 0, awayT = 999, wasNear = false;
  let alert = 0, glance = 0, glanceT = 5, annoy = 0, canComment = false;
  let mode = SIT, modeT = 0, rootYaw = 0, rootTarget = 0, legLift = 0, lastPurr = false;
  let cy = 0, cp = 0, holdY = 0, holdP = 0, idleYaw = 0, idlePitch = 0, idleT = 1;
  let roll = 0, rollT = 0, rollDir = 1, blinkT = 2, blink = 0, squint = 0;
  let earTw = 0, earSide = 1, earT = 3, flat = 0, flick = 0, tailPh = 0, breathPh = 0;
  let bubT = 0, bubAge = 0, bubPri = 0, quiet = 0;
  const BALLS = new Array(16).fill(null), ballSt = new Int8Array(16);
  let nBalls = 0, scanT = 0, hitCd = 0;
  const drawn = [cat, eyes, bubble];
  for (let i = 0; i < drawn.length; i++) drawn[i].layers.set(1);

  function say(text, pri = 1) {
    if (!text) return false;
    if (bubT > 0 && (pri < bubPri || (pri === bubPri && pri < 4 && bubAge < 1.3))) return false;
    if (bubT <= 0 && pri < 2 && quiet > 0) return false;
    drawBubble(text);
    bubT = Math.min(4.6, 1.9 + text.length * 0.065); bubAge = 0; bubPri = pri;
    bubble.visible = true; bubMat.opacity = 1;
    return true;
  }
  group.userData.say = (text) => say(String(text), 5);

  function curious() { rollT = 1.4; rollDir = Math.random() < 0.5 ? -1 : 1; }
  function onJump(h) {
    alert = 3.5; flick = 1; curious();
    annoy = Math.min(1, annoy + 0.12);
    jumpCount = jumpWin > 0 ? jumpCount + 1 : 1; jumpWin = 8;
    if (!canComment) return;
    if (jumpCount >= 3) { annoy = Math.min(1, annoy + 0.15); say(next('jumps'), 2); return; }
    let text;
    if (Math.random() < 0.55) {
      const n = Math.min(9, Math.max(1, Math.round(2 + h * 1.05 + Math.random() * 2.4 - (jumpCount - 1) * 1.3)));
      text = n >= 8 ? n + '/10. Não te habitues.' : n <= 2 ? n + '/10. Doeu ver.' : Math.random() < 0.5 ? n + '/10.' : n + '/10. Pelo esforço.';
    } else text = next('jump');
    if (say(text, 2)) squint = 1.2;
  }
  function onSprint() { alert = 3; flick = 1; annoy = Math.min(1, annoy + 0.15); say(next('sprint'), 2); }
  function nearBin(x, z) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < 4; i++) { const dx = x - BINS[i][0], dz = z - BINS[i][1], q = dx * dx + dz * dz; if (q < bd) { bd = q; best = i; } }
    const bx = BINS[best][0] - PX, bz = BINS[best][1] - PZ;
    return bx * bx + bz * bz < 22 * 22 ? Math.sqrt(bd) : 1e9;   // only the bins this cat can see well
  }
  function onBasket(b) {
    if (nearBin(b.pos.x, b.pos.z) > 1.2 || dist > 30) return;
    alert = 3; flick = 0.6; curious();
    let three = false;
    if (b.origin && typeof b.origin.x === 'number') {
      for (let i = 0; i < 4; i++) if (Math.hypot(BINS[i][0] - b.pos.x, BINS[i][1] - b.pos.z) < 1 && Math.hypot(BINS[i][0] - b.origin.x, BINS[i][1] - b.origin.z) > 6) three = true;
    }
    say(next(three && Math.random() < 0.6 ? 'three' : 'basket'), 3);
  }
  function onMiss(b) {
    if (nearBin(b.pos.x, b.pos.z) > 1.8 || dist > 30 || Math.random() > 0.7) return;
    alert = 2.5; say(next('miss'), 3);
  }
  function onHit() { alert = 4; flick = 1; annoy = Math.min(1, annoy + 0.5); squint = 1.5; say(next('hit'), 3); }

  // ---------- sound (lazy; nothing until the visitor has entered, nothing when muted) ----------
  let brown = null, white = null;
  function audioNodes(seconds) {
    const A = ctx.audio;
    if (!A || A.muted) return null;
    const ac = A.context, bus = A.bus;
    if (!ac || !bus || ac.state === 'closed') return null;
    if (!brown) {
      const n = Math.floor(ac.sampleRate * 2);
      brown = ac.createBuffer(1, n, ac.sampleRate);
      const d = brown.getChannelData(0); let v = 0;
      for (let i = 0; i < n; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.15; d[i] = v; }
      white = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
      const w = white.getChannelData(0);
      for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    }
    let pan = 0;
    if (lastCam) {
      const e = lastCam.matrixWorld.elements, dx = HX - e[12], dy = HY - e[13], dz = HZ - e[14], L = Math.hypot(dx, dy, dz) || 1;
      pan = Math.max(-0.8, Math.min(0.8, (e[0] * dx + e[1] * dy + e[2] * dz) / L));
    }
    const lease = reserveModuleVoice(ctx, 1, false, seconds + .06, bus); if (!lease) return null;
    const out = ac.createGain();
    out.gain.value = Math.max(0.08, Math.min(1, 1 - dist / 30));
    let tail = out;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p; }
    tail.connect(lease.gain);
    return { ac, out, tail, lease };
  }
  function purrSound() {
    try {
      const N = audioNodes(3.1); if (!N) return;
      const { ac, out, tail, lease } = N, t0 = Math.max(ac.currentTime + 0.02, lease.startAt), T = 3.0, g = 0.42;
      const src = ac.createBufferSource(); src.buffer = brown; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.9;
      const tone = ac.createOscillator(); tone.type = 'triangle';
      tone.frequency.setValueAtTime(52, t0); tone.frequency.setValueAtTime(46, t0 + 1.32);
      const toneG = ac.createGain(); toneG.gain.value = 0.3;
      const am = ac.createGain(); am.gain.value = 0.5;               // 25 Hz pulse of the purr
      const lfo = ac.createOscillator(); lfo.type = 'sine';
      lfo.frequency.setValueAtTime(26, t0); lfo.frequency.setValueAtTime(23, t0 + 1.32);
      const depth = ac.createGain(); depth.gain.value = 0.5;
      const env = ac.createGain(), eg = env.gain;                     // out-breath, gap, in-breath
      eg.setValueAtTime(0, t0); eg.linearRampToValueAtTime(g, t0 + 0.18); eg.setValueAtTime(g, t0 + 1.2);
      eg.linearRampToValueAtTime(g * 0.15, t0 + 1.32); eg.linearRampToValueAtTime(g * 0.7, t0 + 1.48);
      eg.setValueAtTime(g * 0.7, t0 + 2.5); eg.linearRampToValueAtTime(0, t0 + 2.95);
      src.connect(lp); tone.connect(toneG); toneG.connect(lp); lp.connect(am); am.connect(env); env.connect(out);
      lfo.connect(depth); depth.connect(am.gain);
      lease.track(src); lease.track(tone); lease.track(lfo); finishModuleVoice(lease, lfo);
      src.start(t0, Math.random()); tone.start(t0); lfo.start(t0);
      src.stop(t0 + T); tone.stop(t0 + T); lfo.stop(t0 + T);
      src.onended = () => { try { out.disconnect(); if (tail !== out) tail.disconnect(); } catch (e) { /* gone */ } };
    } catch (e) { /* sound is optional */ }
  }
  function sniffSound() {
    try {
      const N = audioNodes(.4); if (!N) return;
      const { ac, out, tail, lease } = N, t0 = Math.max(ac.currentTime + 0.02, lease.startAt);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 0.8;
      bp.connect(out);
      for (let k = 0; k < 2; k++) {
        const s = ac.createBufferSource(); s.buffer = white;
        const gg = ac.createGain(), ts = t0 + k * 0.17;
        gg.gain.setValueAtTime(0.0001, ts); gg.gain.exponentialRampToValueAtTime(0.09, ts + 0.02); gg.gain.exponentialRampToValueAtTime(0.0001, ts + 0.12);
        s.connect(gg); gg.connect(bp); lease.track(s); if (k === 1) finishModuleVoice(lease, s); s.start(ts, Math.random() * 0.2); s.stop(ts + 0.14);
        if (k === 1) s.onended = () => { try { out.disconnect(); if (tail !== out) tail.disconnect(); } catch (e) { /* gone */ } };
      }
    } catch (e) { /* sound is optional */ }
  }

  function onPick() {
    alert = 4;
    if (mode === AWAY || mode === LICK || mode === BACK) { flick = 1; say(next('busy'), 4); return; }
    // fickle, but fair: gentle visitors get purrs, jumpy ones get the back
    const pPurr = Math.min(0.85, Math.max(0.15, 0.62 - 0.55 * annoy - (lastPurr ? 0.12 : 0)));
    if (Math.random() < pPurr) {
      mode = PURR; modeT = 3.3; lastPurr = true; annoy = Math.max(0, annoy - 0.3);
      say(next('purr'), 4); purrSound();
    } else {
      mode = AWAY; rootTarget = Math.PI; lastPurr = false; flick = 1; annoy = Math.min(1, annoy + 0.1);
      if (RM) rootYaw = Math.PI;
      say(next('snub'), 4); sniffSound();
    }
  }

  function scanBalls() {
    const ch = ctx.scene ? ctx.scene.children : null;
    if (!ch) return;
    for (let i = 0; i < ch.length && nBalls < 16; i++) {
      const u = ch[i].userData, b = u && u.ball;
      if (!b || typeof b.state !== 'number' || !b.pos) continue;
      let k = 0;
      while (k < nBalls && BALLS[k] !== b) k++;
      if (k === nBalls) { BALLS[nBalls] = b; ballSt[nBalls] = b.state; nBalls++; }
    }
  }

  function doze() {
    awake = false; seen = false; air = false; hs = 0; awayT = 999; wasNear = false;
    bubT = 0; bubble.visible = false;
    mode = SIT; rootYaw = rootTarget = 0; legLift = 0;
    bRoot.rotation.y = 0; bLegR.rotation.set(0, 0, 0);
  }

  const easeBack = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

  function update(dt, frame) {
    const cam = frame && frame.camera;
    if (!cam) return;
    if (!layerChecked) {     // a camera that does not draw layer 1 (dev harness): draw on layer 0
      layerChecked = true;
      if (!cam.layers.isEnabled(1)) for (let i = 0; i < drawn.length; i++) drawn[i].layers.set(0);
    }
    lastCam = cam;
    const e = cam.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
    const dx = x - HX, dy = y - HY, dz = z - HZ;
    dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > FAR) { if (awake) doze(); return; }
    awake = true;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    t += dt;

    // ---- the visitor: speed, jumps, where they are
    if (!seen) { seen = true; lastX = x; lastY = y; lastZ = z; }
    const mx = x - lastX, my = y - lastY, mz = z - lastZ;
    lastX = x; lastY = y; lastZ = z;
    const step = Math.sqrt(mx * mx + mz * mz), tele = step > 1.5 || my > 0.8 || my < -0.8;
    if (!tele) hs += (Math.min(12, step / dt) - hs) * Math.min(1, dt * 6);
    const vy = tele ? 0 : my / dt;
    const lxv = (x - PX) * CY - (z - PZ) * SY, lzv = (x - PX) * SY + (z - PZ) * CY;   // visitor in cat space
    const indoors = (y < 7 && x > -6.9 && x < 6.9 && z > -17.4 && z < 17.4) || (y >= 7 && x > -6.9 && x < 6.9 && z < 5.4) ||
      (y < 6 && ((x > 11 && x < 23) || (x < -11 && x > -23)) && z > 38 && z < 50) || (z > 56.3 && x > -22 && x < 22);
    let vYaw = Math.atan2(lxv, lzv);
    const behind = vYaw > 1.95 || vYaw < -1.95;
    const sees = !indoors && !behind && dist < 26;
    canComment = sees && (mode === SIT || mode === PURR);

    if (!air && vy > 2.6) { air = true; airT = 0; airY0 = y; takeHs = hs; }
    if (air) { airT += dt; if ((airT > 0.18 && y <= airY0 + 0.02) || airT > 1.6 || tele) { air = false; if (!tele) onJump(takeHs); } }
    if (jumpWin > 0) jumpWin -= dt;

    if (hs > 3.7) { sprintT += dt; sprintCalm = 0; if (sprintT > 0.7 && !sprintLock) { sprintLock = true; if (canComment && dist < 24) onSprint(); } }
    else { sprintT = 0; if (hs < 2.4 && sprintLock) { sprintCalm += dt; if (sprintCalm > 2) sprintLock = false; } }

    if (canComment && dist < 10 && hs < 0.3 && !air) stillT += dt; else stillT = 0;
    loiterCd -= dt;
    if (stillT > 6.5 && loiterCd <= 0) { stillT = 0; loiterCd = 12; if (say(next('loiter'), 1) && Math.random() < 0.5) curious(); }

    stareCd -= dt;
    if (canComment && dist < 9) {
      const dot = (e[8] * dx + e[9] * dy + e[10] * dz) / dist;         // camera forward . direction to the cat
      if (dot > 0.985) stareT += dt; else if (stareT > 0) stareT -= dt;
      if (stareT > 2.2 && stareCd <= 0) { stareT = 0; stareCd = 16; say(next('stare'), 1); }
    }

    if (sees && dist < 12) {
      if (awayT > 25 && say(next('greet'), 1)) curious();
      awayT = 0; wasNear = true;
    } else {
      awayT += dt;
      if (wasNear && dist > 16) { wasNear = false; if (sees && Math.random() < 0.4) say(next('leave'), 1); }
    }

    // ---- paper balls (found among the scene's children; their state says in, out, or on the cat)
    scanT -= dt;
    if (scanT <= 0 && nBalls < 16) { scanT = 3; scanBalls(); }
    if (hitCd > 0) hitCd -= dt;
    for (let i = 0; i < nBalls; i++) {
      const b = BALLS[i], s = b.state, p = b.pos;
      if (s === BALL_FLY && hitCd <= 0) {
        const bx = p.x - BCX, by = p.y - BCY, bz = p.z - BCZ, q = bx * bx + by * by + bz * bz;
        if (q < HIT2) {
          hitCd = 1.2;
          const v = b.vel;
          if (v && typeof v.x === 'number') {
            const L = Math.sqrt(q) || 1, nx = bx / L, ny = by / L, nz = bz / L, vn = v.x * nx + v.y * ny + v.z * nz;
            if (vn < 0) { v.x -= 1.5 * vn * nx; v.y -= 1.5 * vn * ny; v.z -= 1.5 * vn * nz; }
            v.x *= 0.5; v.y *= 0.5; v.z *= 0.5; b.touched = true;
          }
          onHit();
        }
      }
      if (s !== ballSt[i]) {
        if (s === BALL_SINK) onBasket(b);
        else if (s === BALL_REST && ballSt[i] === BALL_FLY) onMiss(b);
        ballSt[i] = s;
      }
    }

    // ---- mood
    if (alert > 0) alert -= dt;
    annoy = Math.max(0, annoy - dt * 0.04);
    if (squint > 0) squint -= dt;
    if (mode === PURR) { modeT -= dt; if (modeT <= 0) mode = SIT; }
    else if (mode === AWAY) { if (Math.abs(rootYaw - Math.PI) < 0.02) { mode = LICK; modeT = 3.4; } }
    else if (mode === LICK) { modeT -= dt; if (modeT <= 0) mode = BACK; }
    else if (mode === BACK) { if (legLift < 0.2) rootTarget = 0; if (Math.abs(rootYaw) < 0.02 && legLift < 0.05) mode = SIT; }

    // ---- body: turn on the spot, breathe, lift the paw to lick it
    if (rootYaw !== rootTarget) {
      const dr = rootTarget - rootYaw, st = RM ? 99 : 4.5 * dt;
      rootYaw = Math.abs(dr) <= st ? rootTarget : rootYaw + Math.sign(dr) * st;
      bRoot.rotation.y = rootYaw;
    }
    legLift += ((mode === LICK ? 1 : 0) - legLift) * Math.min(1, dt * 7);
    bLegR.rotation.x = -1.25 * legLift; bLegR.rotation.z = 0.3 * legLift;
    breathPh += dt * (mode === PURR ? 3.0 : 1.8);
    const br = 0.011 * Math.sin(breathPh);
    bBody.scale.set(1 + br * 0.5, 1 + br * 0.6, 1 + br * 0.8);

    // ---- gaze: cats hold still, then snap to a new target
    idleT -= dt;
    if (idleT <= 0) { idleT = 2.5 + Math.random() * 4; idleYaw = (Math.random() - 0.5) * 1.6; idlePitch = -0.12 + Math.random() * 0.4; }
    glanceT -= dt;
    if (glanceT <= 0) { glanceT = 6 + Math.random() * 6; glance = 1.4; }
    if (glance > 0) glance -= dt;
    let wy = idleYaw, wp = idlePitch;
    if (mode === LICK) { wy = -0.5; wp = -0.55 + (RM ? 0 : 0.1 * Math.sin(t * 9)); }
    else if (sees && (dist < 14 || alert > 0 || glance > 0)) {
      vYaw -= rootYaw;
      if (vYaw > Math.PI) vYaw -= 2 * Math.PI; else if (vYaw < -Math.PI) vYaw += 2 * Math.PI;
      wy = Math.max(-1.9, Math.min(1.9, vYaw));
      wp = Math.max(-0.6, Math.min(0.7, Math.atan2(y - HY, Math.sqrt(lxv * lxv + lzv * lzv))));
    }
    if (RM || mode === LICK || Math.abs(wy - holdY) > 0.13 || Math.abs(wp - holdP) > 0.1) { holdY = wy; holdP = wp; }
    const k = 1 - Math.exp(-dt * (RM ? 3 : 11));
    cy += (holdY - cy) * k; cp += (holdP - cp) * k;
    if (rollT > 0) rollT -= dt;
    roll += ((rollT > 0 ? rollDir * 0.26 : mode === PURR ? 0.14 : 0) - roll) * Math.min(1, dt * (RM ? 2 : 6));
    bNeck.rotation.y = cy * 0.35; bNeck.rotation.x = -cp * 0.3;
    bHead.rotation.y = cy * 0.65; bHead.rotation.x = -cp * 0.7; bHead.rotation.z = roll;

    // ---- eyes: blink, squint when unimpressed, half-shut when purring
    blinkT -= dt;
    if (blinkT <= 0) { blink = 0.14; blinkT = Math.random() < 0.2 ? 0.3 : 2 + Math.random() * 4.5; }
    let lid = 1;
    if (blink > 0) { blink -= dt; const u = Math.max(0, blink) / 0.14; lid = 1 - 0.93 * (1 - Math.abs(u * 2 - 1)); }
    eyes.scale.y = Math.max(0.06, lid * (mode === PURR ? 0.32 : squint > 0 ? 0.6 : 1));

    // ---- ears: listen toward you, twitch now and then, flatten when annoyed or busy
    earT -= dt;
    if (earT <= 0) { earT = 3 + Math.random() * 6; if (!RM) { earTw = 1; earSide = Math.random() < 0.5 ? 1 : -1; } }
    if (earTw > 0) earTw = Math.max(0, earTw - dt * 7);
    flat += (((annoy > 0.55 || mode === AWAY || mode === LICK) ? 1 : 0) - flat) * Math.min(1, dt * 5);
    const sw = (sees && mode !== LICK ? Math.max(-0.5, Math.min(0.5, (vYaw - cy) * 0.4)) : 0);
    const twL = earSide > 0 ? earTw : 0, twR = earSide < 0 ? earTw : 0;
    bEarL.rotation.set(-0.45 * flat - 0.25 * twL, sw + 0.6 * twL + 0.3 * flat, -(0.7 * flat + 0.4 * twL));
    bEarR.rotation.set(-0.45 * flat - 0.25 * twR, sw - 0.6 * twR - 0.3 * flat, 0.7 * flat + 0.4 * twR);

    // ---- tail: lazy sweep along the stone, quicker when annoyed, sharp flicks on events
    if (flick > 0) flick = Math.max(0, flick - dt * (RM ? 3 : 1.4));
    const calm = mode === PURR ? 0.5 : mode === LICK ? 0.35 : 1;
    tailPh += dt * (1.1 + 2.4 * annoy);
    const A = (RM ? 0.5 : 1) * (0.7 + 0.9 * annoy) * calm;
    const fl = RM ? 0 : flick;
    for (let i = 1; i < 5; i++) {
      bTail[i].rotation.y = A * (0.03 + 0.035 * i) * Math.sin(tailPh - i * 0.75) + fl * 0.14 * i * Math.sin(t * 15 - i * 0.9);
    }
    const lift = 0.1 + 0.08 * Math.max(0, Math.sin(tailPh * 0.5)) + 0.35 * (RM ? flick * 0.5 : flick);
    bTail[3].rotation.x = -lift * 0.5;
    bTail[4].rotation.x = -lift; bTail[4].rotation.z = -lift * 0.8;

    // ---- bubble: pop in, hold, fade; a whole number of screen pixels per canvas pixel
    if (bubT > 0) {
      bubT -= dt; bubAge += dt;
      bubMat.opacity = Math.max(0, Math.min(1, bubT / 0.25));
      const el = ctx.renderer && ctx.renderer.domElement, H = (el && el.height) || 1080, W = (el && el.width) || 1920;
      const m = Math.max(1, Math.min(Math.round(H / 480), Math.floor(W / 380)));
      const pop = RM || bubAge >= 0.18 ? 1 : 0.6 + 0.4 * easeBack(bubAge / 0.18);
      const unit = 2 * Math.tan((cam.fov || 52) * Math.PI / 360) / ((cam.zoom || 1) * H) * m * pop / SC;
      bubble.scale.set(BW * unit, BH * unit, 1);
      if (bubT <= 0) { bubble.visible = false; quiet = 1.2; }
    } else if (quiet > 0) quiet -= dt;
  }

  return { group, regions: [], colliders: [], pickables: [proxy], update, onPick };
}
