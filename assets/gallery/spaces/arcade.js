// THE ARCADE — "Spark Tools Labs": a playable retropunk arcade on the entrance plaza.
// Footprint x 11..23, z 38..50, ground y 0, roof 5 m. Door on the west face (x = 11), z = 44.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const GAMES = [
  ['bad-evidence', 'BAD EVIDENCE'], ['badvice', 'BADVICE'], ['counterweight', 'COUNTERWEIGHT'],
  ['deadweight', 'DEADWEIGHT'], ['double-take', 'DOUBLE TAKE'], ['false-positive', 'FALSE POSITIVE'],
  ['granted', 'GRANTED'], ['idk-machine', 'IDK MACHINE'], ['the-minutes', 'THE MINUTES'],
  ['the-wrong-question', 'THE WRONG QUESTION'], ['tilt', 'TILT'], ['side-door', 'SIDE DOOR'],
];
const X0 = 11, X1 = 23, Z0 = 38, Z1 = 50, WT = 0.3, H = 4.7, ROOF = 5.0;
const DOOR_Z = 44, DOOR_W = 1.6, DOOR_H = 2.6;

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group(); group.name = 'arcade';
  const colliders = [], pickables = [];
  const seats = [];   // places to sit (sit contract): { x, y (seat top), z, facing: [fx, fz] }, world metres
  const tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // ---------- geometry bins (merged per material) ----------
  const bins = {};
  const add = (k, g) => { (bins[k] ||= []).push(g); return g; };
  const xf = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    tmpE.set(rx, ry, rz, 'YXZ'); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(x, y, z), tmpQ, one); g.applyMatrix4(tmpM); return g;
  };
  const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const cyl = (r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 16) => xf(new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz);
  const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const tex = (g) => { M.boxUV(g); return g; };
  const finish = (list, vc) => {
    const gs = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; if (vc && !q.attributes.color) paint(q, 0xffffff); if (!vc && q.attributes.color) q.deleteAttribute('color'); return q; });
    return mergeGeometries(gs, false);
  };
  const addMesh = (geo, mat, name, shadow = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadow; m.receiveShadow = recv; group.add(m); return m; };

  // ---------- materials ----------
  const wallMat = M.get('concreteWall', { color: 0x4a4c52, roughness: 0.92 });
  const wallIn = M.get('concreteWall', { color: 0x2a2b30, roughness: 0.9, envMapIntensity: 0.25 });
  const steelDark = M.get('steel', { color: 0x1d1e22, roughness: 0.45, metalness: 0.9 });
  const steelIn = M.get('steel', { color: 0x4a4d55, roughness: 0.4, metalness: 0.9, envMapIntensity: 0.5 });
  const floorMat = M.get('terrazzo', { color: 0x34323a, roughness: 0.3, envMapIntensity: 0.3 });
  const ceilMat = M.get('concreteWall', { color: 0x1c1d21, roughness: 0.95, envMapIntensity: 0.2 });
  const blackVinyl = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.5 });
  const plasticMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.0, envMapIntensity: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const leatherMat = M.get('leather', { color: 0x6a1d3a, envMapIntensity: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb6c4, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.4 });

  // ---------- canvas helpers ----------
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const canvasTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
  const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const fitText = (g, text, maxW, size, font) => { g.font = `${size}px ${font}`; const w = g.measureText(text).width; if (w > maxW) { size = Math.floor(size * maxW / w); g.font = `${size}px ${font}`; } return size; };
  const MONO = '"Courier New", ui-monospace, monospace';
  const HEAVY = 'Impact, "Arial Black", Haettenschweiler, sans-serif';

  // ---------- atlases ----------
  const N = GAMES.length;
  const SC = { cols: 4, rows: 3, w: 256, h: 192 };   // screens
  const MQ = { cols: 4, rows: 3, w: 384, h: 128 };   // marquees
  const SD = { cols: 4, rows: 3, w: 240, h: 512 };   // side art
  const screenBase = mkCanvas(SC.cols * SC.w, SC.rows * SC.h), screenLive = mkCanvas(screenBase.width, screenBase.height);
  const marqueeC = mkCanvas(MQ.cols * MQ.w, MQ.rows * MQ.h), sideC = mkCanvas(SD.cols * SD.w, SD.rows * SD.h);
  const hueOf = (i) => (i * 31 + 320) % 360;

  (function drawStatics() {
    const sg = screenBase.getContext('2d'), mg = marqueeC.getContext('2d'), dg = sideC.getContext('2d');
    for (let i = 0; i < N; i++) {
      const h = hueOf(i), title = GAMES[i][1], R = rnd(i * 977 + 13);
      const cx = i % 4, cy = Math.floor(i / 4);
      // --- screen ---
      sg.save(); sg.translate(cx * SC.w, cy * SC.h); sg.beginPath(); sg.rect(0, 0, SC.w, SC.h); sg.clip();
      let g = sg.createLinearGradient(0, 0, 0, SC.h); g.addColorStop(0, hsl(h + 200, 70, 6)); g.addColorStop(1, hsl(h, 70, 14)); sg.fillStyle = g; sg.fillRect(0, 0, SC.w, SC.h);
      const motif = i % 6;
      if (motif === 0) { // synthwave sun + grid
        g = sg.createLinearGradient(0, 40, 0, 120); g.addColorStop(0, hsl(h + 60, 100, 65)); g.addColorStop(1, hsl(h, 100, 50)); sg.fillStyle = g; sg.beginPath(); sg.arc(128, 104, 46, Math.PI, 0); sg.fill();
        sg.strokeStyle = hsl(h + 180, 100, 60); sg.lineWidth = 1; for (let k = 0; k < 8; k++) { const y = 106 + k * k * 1.4; sg.beginPath(); sg.moveTo(0, y); sg.lineTo(SC.w, y); sg.stroke(); }
        for (let k = -8; k <= 8; k++) { sg.beginPath(); sg.moveTo(128 + k * 6, 106); sg.lineTo(128 + k * 34, SC.h); sg.stroke(); }
      } else if (motif === 1) { // invaders
        for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) { sg.fillStyle = hsl(h + r * 40, 90, 60); const x = 30 + c * 22, y = 24 + r * 16; sg.fillRect(x, y + 2, 12, 7); sg.fillRect(x + 2, y, 8, 2); sg.fillRect(x - 2, y + 5, 2, 4); sg.fillRect(x + 12, y + 5, 2, 4); }
        sg.fillStyle = hsl(h + 120, 90, 60); sg.fillRect(118, 160, 20, 6); sg.fillRect(125, 154, 6, 6);
      } else if (motif === 2) { // bricks + ball
        for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) { sg.fillStyle = hsl(h + r * 28, 85, 52); sg.fillRect(8 + c * 24, 18 + r * 11, 22, 9); }
        sg.fillStyle = '#fff'; sg.fillRect(160, 118, 6, 6); sg.fillStyle = hsl(h + 180, 90, 60); sg.fillRect(96, 168, 56, 6);
      } else if (motif === 3) { // concentric
        for (let k = 8; k > 0; k--) { sg.strokeStyle = hsl(h + k * 18, 90, 40 + k * 3); sg.lineWidth = 3; sg.beginPath(); sg.arc(128, 100, k * 12, 0, 7); sg.stroke(); }
      } else if (motif === 4) { // skyline
        for (let c = 0; c < 16; c++) { const bh = 30 + R() * 70; sg.fillStyle = hsl(h + 200, 50, 16 + R() * 10); sg.fillRect(c * 16, SC.h - bh - 20, 14, bh + 20); sg.fillStyle = hsl(h + 60, 100, 70); for (let w = 0; w < 5; w++) if (R() > 0.5) sg.fillRect(c * 16 + 3 + (w % 2) * 6, SC.h - bh - 14 + Math.floor(w / 2) * 12, 3, 4); }
      } else { // stripes
        sg.fillStyle = hsl(h + 30, 90, 30, 0.8); for (let k = -4; k < 10; k++) { sg.beginPath(); sg.moveTo(k * 36, SC.h); sg.lineTo(k * 36 + 20, SC.h); sg.lineTo(k * 36 + 120, 0); sg.lineTo(k * 36 + 100, 0); sg.fill(); }
      }
      // title
      const words = title.split(' ');
      const lines = title.length > 11 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [title];
      sg.textAlign = 'center'; sg.textBaseline = 'middle';
      lines.forEach((ln, li) => {
        const y = 78 + (li - (lines.length - 1) / 2) * 34, sz = fitText(sg, ln, 224, 34, MONO.replace('"Courier New"', 'bold "Courier New"'));
        sg.lineWidth = 5; sg.strokeStyle = hsl(h + 200, 90, 15); sg.strokeText(ln, 128 + 2, y + 2); sg.strokeText(ln, 128, y);
        sg.fillStyle = hsl(h + 50, 100, 78); sg.fillText(ln, 128, y);
      });
      sg.font = `bold 11px ${MONO}`; sg.textAlign = 'left'; sg.fillStyle = '#fff'; sg.fillText('1UP  000000', 8, 10); sg.textAlign = 'right'; sg.fillText('HI 042690', SC.w - 8, 10);
      sg.textAlign = 'center'; sg.fillStyle = hsl(h, 80, 70); sg.fillText('SPARK TOOLS LABS (C) 1987', 128, SC.h - 8);
      // scanlines + vignette
      sg.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < SC.h; y += 3) sg.fillRect(0, y, SC.w, 1);
      g = sg.createRadialGradient(128, 96, 60, 128, 96, 160); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); sg.fillStyle = g; sg.fillRect(0, 0, SC.w, SC.h);
      sg.restore();
      // --- marquee ---
      mg.save(); mg.translate(cx * MQ.w, cy * MQ.h); mg.beginPath(); mg.rect(0, 0, MQ.w, MQ.h); mg.clip();
      g = mg.createLinearGradient(0, 0, 0, MQ.h); g.addColorStop(0, hsl(h, 90, 22)); g.addColorStop(0.5, hsl(h + 20, 95, 38)); g.addColorStop(1, hsl(h, 90, 18)); mg.fillStyle = g; mg.fillRect(0, 0, MQ.w, MQ.h);
      mg.fillStyle = hsl(h + 180, 100, 60, 0.35); for (let k = 0; k < 8; k++) mg.fillRect(k * 56 - 20, 0, 18, MQ.h);
      mg.textAlign = 'center'; mg.textBaseline = 'middle';
      const mlines = title.length > 12 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [title];
      mlines.forEach((ln, li) => {
        const sz0 = mlines.length > 1 ? 54 : 84; const y = MQ.h / 2 + (li - (mlines.length - 1) / 2) * 52 + 4;
        fitText(mg, ln, 350, sz0, HEAVY); mg.lineJoin = 'round';
        mg.lineWidth = 12; mg.strokeStyle = hsl(h + 200, 90, 10); mg.strokeText(ln, MQ.w / 2, y);
        mg.lineWidth = 5; mg.strokeStyle = hsl(h + 180, 100, 70); mg.strokeText(ln, MQ.w / 2, y);
        mg.fillStyle = '#fff6d8'; mg.fillText(ln, MQ.w / 2, y);
      });
      mg.fillStyle = 'rgba(0,0,0,0.35)'; mg.fillRect(0, 0, MQ.w, 5); mg.fillRect(0, MQ.h - 5, MQ.w, 5);
      mg.restore();
      // --- side art ---
      dg.save(); dg.translate(cx * SD.w, cy * SD.h); dg.beginPath(); dg.rect(0, 0, SD.w, SD.h); dg.clip();
      dg.fillStyle = hsl(h + 220, 60, 7); dg.fillRect(0, 0, SD.w, SD.h);
      const cols = [hsl(h, 95, 52), hsl(h + 45, 95, 58), hsl(h + 180, 95, 50)];
      for (let k = 0; k < 5; k++) { dg.fillStyle = cols[k % 3]; dg.globalAlpha = 0.9; dg.beginPath(); const o = k * 70 - 80; dg.moveTo(0, o + 300); dg.lineTo(SD.w, o + 120); dg.lineTo(SD.w, o + 150 - k * 6); dg.lineTo(0, o + 340); dg.fill(); }
      dg.globalAlpha = 1;
      for (let k = 0; k < 28; k++) { dg.fillStyle = '#fff'; const s = 1 + R() * 3; dg.fillRect(R() * SD.w, R() * SD.h * 0.5, s, s); }
      dg.fillStyle = hsl(h + 60, 100, 70); dg.beginPath(); dg.arc(SD.w * (0.3 + R() * 0.4), 90, 38, 0, 7); dg.fill();
      dg.strokeStyle = hsl(h + 180, 100, 65); dg.lineWidth = 3; dg.beginPath(); dg.arc(SD.w * 0.5, 90, 54, 0, 7); dg.stroke();
      dg.save(); dg.translate(SD.w / 2, SD.h - 150); dg.rotate(-Math.PI / 2); dg.textAlign = 'center'; fitText(dg, title, 230, 52, HEAVY); dg.lineWidth = 7; dg.strokeStyle = 'rgba(0,0,0,0.85)'; dg.strokeText(title, 0, 0); dg.fillStyle = '#fff'; dg.fillText(title, 0, 0); dg.restore();
      dg.strokeStyle = hsl(h + 180, 100, 60); dg.lineWidth = 6; dg.strokeRect(3, 3, SD.w - 6, SD.h - 6);
      dg.restore();
    }
  })();
  const screenTex = canvasTex(screenLive), marqueeTex = canvasTex(marqueeC), sideTex = canvasTex(sideC);
  screenLive.getContext('2d').drawImage(screenBase, 0, 0);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: 0xffffff, toneMapped: false });
  const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeTex, color: 0xdddddd, toneMapped: false });
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.5 });

  const cellUV = (g, A, i, mapFn) => {
    const uv = g.attributes.uv, pos = g.attributes.position, cx = i % A.cols, cy = Math.floor(i / A.cols);
    for (let k = 0; k < uv.count; k++) {
      let u = uv.getX(k), v = uv.getY(k); if (mapFn) [u, v] = mapFn(pos.getX(k), pos.getY(k), pos.getZ(k), u, v);
      uv.setXY(k, (cx + u) / A.cols, 1 - (cy + 1) / A.rows + v / A.rows);
    }
    return g;
  };

  // ---------- cabinet profile (local: front +z, x width, y up) ----------
  const prof = new THREE.Shape();
  [[-0.42, 0], [0.28, 0], [0.28, 0.78], [0.42, 0.93], [0.42, 0.94], [0.20, 1.0], [0.12, 1.58], [0.24, 1.58], [0.24, 1.85], [-0.30, 1.85], [-0.42, 1.6]]
    .forEach(([z, y], k) => (k ? prof.lineTo(z, y) : prof.moveTo(z, y)));
  const coreGeo0 = new THREE.ExtrudeGeometry(prof, { depth: 0.65, bevelEnabled: false });
  const sideGeo0 = new THREE.ExtrudeGeometry(prof, { depth: 0.022, bevelEnabled: false });
  const toCab = (g, xoff) => { g.rotateY(-Math.PI / 2); g.translate(xoff, 0, 0); return g; };
  const PANEL_T = 0.31, PANEL_Y = 0.985, PANEL_C = 0.31;
  const panelXf = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(PANEL_T, 0, 0)), one).premultiply(new THREE.Matrix4().makeTranslation(0, PANEL_Y, PANEL_C));
  const screenXf = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.30, 0.166), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0, 0)), one);

  function cabinetParts(i) {
    const out = { body: [], side: [], screen: [], marquee: [], plastic: [], glow: [], steel: [] };
    const h = hueOf(i);
    const core = coreGeo0.clone(); toCab(core, 0.325); out.body.push(core);
    for (const sx of [-1, 1]) {
      const s = sideGeo0.clone(); toCab(s, sx < 0 ? -0.325 : 0.347);
      s.translate(0, 0, 0);
      cellUV(s, SD, i, (x, y, z) => [sx > 0 ? 1 - (z + 0.45) / 0.9 : (z + 0.45) / 0.9, y / 1.9]); out.side.push(s);
    }
    // back panel is covered by the core; add kick-plate + control panel slab
    const slab = box(0.66, 0.04, 0.27, 0, -0.02, 0); slab.applyMatrix4(panelXf); out.body.push(slab);
    const slabArt = new THREE.PlaneGeometry(0.64, 0.25); slabArt.rotateX(-Math.PI / 2); slabArt.translate(0, 0.0005, 0); slabArt.applyMatrix4(panelXf);
    out.plastic.push(paint(slabArt.toNonIndexed(), new THREE.Color().setHSL(h / 360, 0.5, 0.10)));
    const P = (g, c) => { g.applyMatrix4(panelXf); out.plastic.push(paint(g, c)); };
    // joystick: plate, shaft, ball
    P(cyl(0.032, 0.006, -0.12, 0.003, 0.02, 0, 0, 0, 20), 0x050505);
    P(cyl(0.005, 0.085, -0.12, 0.045, 0.02, 0, 0, 0, 8), 0xb8bcc4);
    P(xf(new THREE.SphereGeometry(0.019, 14, 10), -0.12, 0.093, 0.02), new THREE.Color().setHSL(((h + 180) % 360) / 360, 0.9, 0.5));
    const cs = [0xff2255, 0xffd21f, 0x22ddff, 0x4dff6a, 0xff7a1a, 0xb04dff];
    for (let b = 0; b < 6; b++) {
      const bx = -0.02 + (b % 3) * 0.075 + (Math.floor(b / 3)) * 0.02, bz = 0.045 - Math.floor(b / 3) * 0.075;
      P(cyl(0.0125, 0.012, bx, 0.006, bz - 0.0, 0, 0, 0, 14), cs[(b + i) % 6]);
      P(cyl(0.017, 0.004, bx, 0.002, bz, 0, 0, 0, 14), 0x08080a);
    }
    P(cyl(0.008, 0.01, 0.24, 0.005, 0.1, 0, 0, 0, 10), 0xffffff);
    P(cyl(0.008, 0.01, 0.26, 0.005, 0.1, 0, 0, 0, 10), 0xff3030);
    // coin door
    const door = box(0.25, 0.34, 0.012, 0, 0.42, 0.286); out.steel.push(door);
    out.steel.push(box(0.2, 0.14, 0.014, 0, 0.30, 0.288));
    for (const sx of [-0.055, 0.055]) {
      out.glow.push(paint(box(0.034, 0.075, 0.006, sx, 0.52, 0.294), sx < 0 ? 0xff2020 : 0xffe9a0));
      out.steel.push(box(0.05, 0.1, 0.008, sx, 0.52, 0.292));
    }
    out.glow.push(paint(box(0.06, 0.012, 0.006, 0, 0.35, 0.296), 0x20ff70));
    // t-molding glow lines along the panel front edge
    const edge = box(0.64, 0.012, 0.012, 0, 0.01, 0.13); edge.applyMatrix4(panelXf); out.glow.push(paint(edge, new THREE.Color().setHSL(((h + 180) % 360) / 360, 1, 0.55)));
    // screen
    const sg = new THREE.PlaneGeometry(0.52, 0.40, 10, 8), p = sg.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) / 0.26, y = p.getY(k) / 0.2; p.setZ(k, 0.014 * (1 - x * x) * (1 - y * y * 0.6)); }
    sg.computeVertexNormals(); sg.applyMatrix4(screenXf); cellUV(sg, SC, i); out.screen.push(sg);
    for (const [w, hh, ox, oy] of [[0.58, 0.04, 0, 0.22], [0.58, 0.04, 0, -0.22], [0.04, 0.44, 0.28, 0], [0.04, 0.44, -0.28, 0]]) {
      const f = box(w, hh, 0.03, ox, oy, 0.004); f.applyMatrix4(screenXf); out.body.push(f);
    }
    // marquee
    const mq = new THREE.PlaneGeometry(0.60, 0.20); mq.translate(0, 1.715, 0.2415); cellUV(mq, MQ, i); out.marquee.push(mq);
    out.glow.push(paint(box(0.62, 0.012, 0.006, 0, 1.60, 0.243), new THREE.Color().setHSL(h / 360, 1, 0.55)));
    out.glow.push(paint(box(0.62, 0.012, 0.006, 0, 1.83, 0.243), new THREE.Color().setHSL(((h + 180) % 360) / 360, 1, 0.55)));
    return out;
  }

  const placeCab = (parts, x, z, yaw, i) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    for (const k in parts) for (const g of parts[k]) { g.applyMatrix4(m); add('cab_' + k, g); }
    // pick proxy + collider
    const pm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.85, 0.85), new THREE.MeshBasicMaterial({ visible: false }));
    pm.position.set(x, 0.925, z); pm.rotation.y = yaw; pm.name = 'cabinet-' + GAMES[i][0];
    pm.userData.action = { type: 'app', url: `assets/extracted/${GAMES[i][0]}.html`, title: GAMES[i][1] };
    group.add(pm); pickables.push(pm);
    const q = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = q ? 0.43 : 0.36, hz = q ? 0.36 : 0.43;
    colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: 0, maxY: 1.9 });
  };
  // layout: island (6) back to back, south wall (3), east wall (3)
  let ci = 0;
  for (let k = 0; k < 3; k++) { const x = 15.72 + k * 0.78; placeCab(cabinetParts(ci), x, 44.08, Math.PI, ci); ci++; placeCab(cabinetParts(ci), x, 44.92, 0, ci); ci++; }
  for (let k = 0; k < 3; k++) { placeCab(cabinetParts(ci), 15.72 + k * 0.78, 49.28, Math.PI, ci); ci++; }
  for (let k = 0; k < 3; k++) { placeCab(cabinetParts(ci), 22.28, 39.9 + k * 0.78, -Math.PI / 2, ci); ci++; }

  // ---------- shell ----------
  const wall = (x0, x1, z0, z1, y0, y1, mat = 'wall') => { const g = box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(mat, tex(g)); };
  const solid = (x0, x1, z0, z1, y1 = ROOF) => colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: y1 });
  const dz0 = DOOR_Z - DOOR_W / 2, dz1 = DOOR_Z + DOOR_W / 2;
  // west wall with door gap
  wall(X0, X0 + WT, Z0, dz0, 0, H); wall(X0, X0 + WT, dz1, Z1, 0, H); wall(X0, X0 + WT, dz0, dz1, DOOR_H, H);
  solid(X0, X0 + WT, Z0, dz0); solid(X0, X0 + WT, dz1, Z1);
  // east + south walls
  wall(X1 - WT, X1, Z0, Z1, 0, H); wall(X0 + WT, X1 - WT, Z1 - WT, Z1, 0, H);
  solid(X1 - WT, X1, Z0, Z1); solid(X0, X1, Z1 - WT, Z1);
  // north: plinth, glazed shopfront, header
  wall(X0, X1, Z0, Z0 + WT, 0, 0.55); wall(X0, X1, Z0, Z0 + WT, 3.5, H);
  solid(X0, X1, Z0, Z0 + WT);
  // roof slab + parapet
  wall(X0 - 0.12, X1 + 0.12, Z0 - 0.12, Z1 + 0.12, H, ROOF);
  wall(X0 - 0.12, X1 + 0.12, Z0 - 0.12, Z0 - 0.0, ROOF, ROOF + 0.35); wall(X0 - 0.12, X1 + 0.12, Z1, Z1 + 0.12, ROOF, ROOF + 0.35);
  wall(X0 - 0.12, X0, Z0, Z1, ROOF, ROOF + 0.35); wall(X1, X1 + 0.12, Z0, Z1, ROOF, ROOF + 0.35);
  add('steelDark', tex(box(X1 - X0 + 0.34, 0.05, 0.3, 17, ROOF + 0.375, Z0 - 0.06))); add('steelDark', tex(box(X1 - X0 + 0.34, 0.05, 0.3, 17, ROOF + 0.375, Z1 + 0.06)));
  // exterior steel ribs (south/east) and corner columns
  for (let k = 0; k < 19; k++) { add('steelDark', tex(box(0.05, 4.3, 0.07, X0 + 0.45 + k * 0.6, 2.4, Z1 + 0.035))); }
  for (let k = 0; k < 19; k++) { add('steelDark', tex(box(0.07, 4.3, 0.05, X1 + 0.035, 2.4, Z0 + 0.45 + k * 0.6))); }
  for (const [cx, cz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) add('steelDark', tex(box(0.4, H + 0.3, 0.4, cx, (H + 0.3) / 2, cz)));
  // shopfront mullions + transoms
  const mulls = 7; for (let k = 0; k <= mulls; k++) add('steelDark', tex(box(0.09, 2.95, 0.14, X0 + 0.3 + (X1 - X0 - 0.6) * k / mulls, 2.025, Z0 + 0.1)));
  add('steelDark', tex(box(X1 - X0 - 0.4, 0.09, 0.14, 17, 3.5, Z0 + 0.1))); add('steelDark', tex(box(X1 - X0 - 0.4, 0.09, 0.14, 17, 0.55, Z0 + 0.1)));
  const gl = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 - 0.6, 2.9, 0.02), glassMat); gl.position.set(17, 2.02, Z0 + 0.1); gl.name = 'shopfront-glass'; group.add(gl);
  solid(X0, X1, Z0, Z0 + WT);
  // west door frame, open leaf, canopy
  add('steelDark', tex(box(0.2, DOOR_H, 0.1, X0 - 0.02, DOOR_H / 2, dz0 - 0.05))); add('steelDark', tex(box(0.2, DOOR_H, 0.1, X0 - 0.02, DOOR_H / 2, dz1 + 0.05)));
  add('steelDark', tex(box(0.2, 0.1, DOOR_W + 0.2, X0 - 0.02, DOOR_H + 0.05, DOOR_Z)));
  add('steelDark', tex(box(1.1, 0.07, 3.0, X0 - 0.5, 3.0, DOOR_Z))); // canopy
  // leaf swung open 90 deg outward, hinged at dz0
  const leaf = new THREE.Group(); leaf.position.set(X0 - 0.05, 0, dz0 - 0.08);
  for (const [w, h, x, y] of [[DOOR_W - 0.05, 0.08, 0, 0.04], [DOOR_W - 0.05, 0.1, 0, DOOR_H - 0.2], [0.08, DOOR_H - 0.2, -(DOOR_W - 0.05) / 2, DOOR_H / 2 - 0.05], [0.08, DOOR_H - 0.2, (DOOR_W - 0.05) / 2, DOOR_H / 2 - 0.05]]) { const m = new THREE.Mesh(tex(box(w, h, 0.05, 0, 0, 0)), steelDark); m.position.set(x, y, 0); m.castShadow = true; leaf.add(m); }
  const lg = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.2, DOOR_H - 0.35, 0.012), glassMat); lg.position.set(0, DOOR_H / 2 - 0.05, 0); leaf.add(lg);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.7, 8), steelIn); handle.position.set(DOOR_W / 2 - 0.12, 1.05, 0.05); leaf.add(handle);
  const leafPivot = new THREE.Group(); leafPivot.position.set(X0 - 0.05, 0, dz0 - 0.08); leafPivot.rotation.y = Math.PI / 2; // leaf runs along -x
  leaf.position.set(DOOR_W / 2 - 0.0, 0, 0); leafPivot.add(leaf); group.add(leafPivot);

  // ---------- floor, ceiling, interior fit-out ----------
  add('floor', tex(box(X1 - X0 - 2 * WT + 0.6, 0.06, Z1 - Z0 - 2 * WT + 0.6, 17, -0.03 + 0.001, 44)));
  // ceiling: underside is the roof slab (ceilMat); beams, ducts, trays
  add('ceil', tex(box(X1 - X0 - 2 * WT, 0.04, Z1 - Z0 - 2 * WT, 17, H - 0.02, 44)));
  for (let k = 0; k < 4; k++) add('steelIn', tex(box(0.18, 0.4, Z1 - Z0 - 2 * WT, X0 + 2.2 + k * 2.7, H - 0.24, 44)));
  add('steelIn', tex(cyl(0.24, 10.8, 17, 3.95, 47.2, 0, 0, Math.PI / 2, 20))); add('steelIn', tex(box(10.8, 0.36, 0.55, 17, 3.85, 41.2)));
  add('steelIn', tex(cyl(0.07, 10.8, 17, 4.25, 43.6, 0, 0, Math.PI / 2, 10))); add('steelIn', tex(cyl(0.05, 10.8, 17, 4.25, 43.9, 0, 0, Math.PI / 2, 8)));
  add('steelIn', tex(box(10.8, 0.04, 0.3, 17, 4.18, 45.6))); // cable tray
  for (let k = 0; k < 9; k++) add('steelIn', tex(box(0.06, 0.5, 0.06, X0 + 1 + k * 1.2, H - 0.45, 47.2)));
  // wall ledges / skirting with glow
  const strip = (x, y, z, w, h, d, c) => add('glow', paint(box(w, h, d, x, y, z), c));
  strip(17, 0.08, Z1 - WT - 0.02, 11.2, 0.04, 0.02, 0xff2fa8); strip(X1 - WT - 0.02, 0.08, 44, 0.02, 0.04, 11.2, 0x20e0ff); strip(X0 + WT + 0.02, 0.08, 41, 0.02, 0.04, 5.2, 0xff2fa8);
  strip(17, 3.5, Z1 - WT - 0.02, 11.2, 0.05, 0.02, 0x20e0ff); strip(X1 - WT - 0.02, 3.5, 44, 0.02, 0.05, 11.2, 0xff2fa8); strip(X0 + WT + 0.02, 3.5, 44, 0.02, 0.05, 11.2, 0x20e0ff);
  strip(17, H - 0.45, 40.6, 10.4, 0.04, 0.04, 0xff2fa8); strip(17, H - 0.45, 46.0, 10.4, 0.04, 0.04, 0x20e0ff); strip(17, H - 0.45, 43.3, 10.4, 0.04, 0.04, 0xffb020);
  strip(17, H - 0.07, 41.6, 10, 0.03, 0.15, 0xfff0e0); strip(17, H - 0.07, 47.6, 10, 0.03, 0.15, 0xfff0e0);
  // floor guide inlay under the island
  strip(17, 0.003, 44.5, 3.6, 0.004, 0.03, 0xff2fa8); strip(17, 0.003, 43.55, 3.6, 0.004, 0.03, 0x20e0ff); strip(17, 0.003, 45.45, 3.6, 0.004, 0.03, 0x20e0ff);
  // slat acoustic panels on west interior wall + bench by the windows
  for (let k = 0; k < 14; k++) add('wood', tex(box(0.04, 2.0, 0.08, X0 + WT + 0.04, 1.4, 45.2 + k * 0.33 * 1.0 > 49.4 ? 49.4 : 45.2 + k * 0.33)));
  add('steelIn', tex(box(8.0, 0.06, 0.45, 17, 0.44, 39.1))); for (const x of [13.2, 17, 20.8]) add('steelIn', tex(box(0.05, 0.42, 0.4, x, 0.21, 39.1)));
  add('leather', tex(box(7.9, 0.1, 0.42, 17, 0.5, 39.1)));
  colliders.push({ minX: 13, maxX: 21, minZ: 38.8, maxZ: 39.4, minY: 0, maxY: 0.8 });
  // Sitting (sit contract): the backless bench seats 13 along its 7.9 m leather cushion (centres
  // 0.6 m apart, centred on x = 17; cushion top 0.5 + 0.1 / 2 at z = 39.1), every place facing
  // into the arcade (+z), toward the island's screens. One invisible pick proxy
  // (material.visible = false) a little larger than steel frame + cushion carries them all.
  {
    const BX = 17, BZ = 39.1, TOP = 0.5 + 0.1 / 2, LEN = 7.9, PLACE = 0.6;
    const n = Math.floor(LEN / PLACE + 1e-9);
    const benchSeats = [];
    for (let k = 0; k < n; k++) benchSeats.push({ x: BX + (k - (n - 1) / 2) * PLACE, y: TOP, z: BZ, facing: [0, 1] });
    const pm = new THREE.Mesh(new THREE.BoxGeometry(8.04, TOP + 0.03, 0.49), new THREE.MeshBasicMaterial({ visible: false }));
    pm.position.set(BX, (TOP + 0.03) / 2, BZ); pm.name = 'bench-sit-pick';
    pm.userData.action = { type: 'sit', seats: benchSeats };
    group.add(pm); pickables.push(pm);
    seats.push(...benchSeats);
  }
  // pinball table facing west: backbox against the east wall
  const PX = 21.9, PZ = 44.0, PY = 0.8;
  add('body', xf(new THREE.BoxGeometry(1.35, 0.22, 0.56), PX + 0.05, PY + 0.02, PZ)); add('body', xf(new THREE.BoxGeometry(0.5, 0.5, 0.52), PX + 0.52, PY + 0.6, PZ));
  for (const dx of [-0.55, 0.6]) for (const dz of [-0.22, 0.22]) add('steelDark', xf(new THREE.BoxGeometry(0.05, 0.72, 0.05), PX + dx, 0.36, PZ + dz));
  add('steelIn', xf(new THREE.BoxGeometry(1.37, 0.03, 0.04), PX + 0.05, PY + 0.14, PZ - 0.29)); add('steelIn', xf(new THREE.BoxGeometry(1.37, 0.03, 0.04), PX + 0.05, PY + 0.14, PZ + 0.29));
  add('steelIn', xf(new THREE.BoxGeometry(0.04, 0.03, 0.62), PX - 0.64, PY + 0.14, PZ));
  add('plastic', paint(xf(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), PX - 0.7, PY + 0.12, PZ - 0.2, 0, 0, Math.PI / 2), 0xffd21f)); add('plastic', paint(xf(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), PX - 0.7, PY + 0.12, PZ + 0.2, 0, 0, Math.PI / 2), 0xff2255));
  colliders.push({ minX: PX - 0.72, maxX: PX + 0.8, minZ: PZ - 0.32, maxZ: PZ + 0.32, minY: 0, maxY: 1.9 });
  // change machine
  const CX = 22.38, CZ = 47.6;
  add('steelIn', tex(new RoundedBoxGeometry(0.5, 1.7, 0.7, 2, 0.02).translate(CX, 0.85, CZ)));
  add('glow', paint(box(0.012, 0.28, 0.2, CX - 0.256, 1.1, CZ), 0x20ff90)); add('glow', paint(box(0.012, 0.03, 0.14, CX - 0.256, 0.95, CZ), 0xff2a2a)); add('glow', paint(box(0.012, 0.05, 0.12, CX - 0.256, 0.72, CZ - 0.1), 0x20e0ff));
  add('steelDark', box(0.012, 0.16, 0.24, CX - 0.256, 0.42, CZ + 0.1));
  colliders.push({ minX: CX - 0.3, maxX: CX + 0.26, minZ: CZ - 0.37, maxZ: CZ + 0.37, minY: 0, maxY: 1.7 });

  // ---------- neon signs ----------
  const neonText = (text, w, h, hue, font, sub) => {
    const c = mkCanvas(w, h), g = c.getContext('2d'); g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const sz = fitText(g, text, w * 0.88, h * 0.78, font); const y = h / 2 + (sub ? -h * 0.04 : 0);
    g.shadowColor = hsl(hue, 100, 55); g.shadowBlur = h * 0.14; g.lineWidth = h * 0.045; g.strokeStyle = hsl(hue, 100, 58); g.strokeText(text, w / 2, y); g.strokeText(text, w / 2, y);
    g.shadowBlur = h * 0.04; g.lineWidth = h * 0.02; g.strokeStyle = hsl(hue, 90, 92); g.strokeText(text, w / 2, y);
    g.shadowBlur = 0;
    if (sub) { g.font = `bold ${Math.floor(h * 0.1)}px ${MONO}`; g.shadowColor = hsl(hue + 160, 100, 55); g.shadowBlur = h * 0.06; g.fillStyle = hsl(hue + 160, 100, 80); g.fillText(sub, w / 2, h * 0.9); }
    const t = canvasTex(c); return t;
  };
  const neonMats = [];
  const signPlane = (tex_, w, h, x, y, z, ry, backing = true) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex_, transparent: true, toneMapped: false, depthWrite: false }); neonMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; group.add(m);
    if (backing) { const b = new THREE.Mesh(new THREE.BoxGeometry(ry === 0 || ry === Math.PI ? w + 0.3 : 0.05, h + 0.2, ry === 0 || ry === Math.PI ? 0.05 : w + 0.3), steelDark); b.position.set(x - Math.sin(ry) * 0.04, y, z - Math.cos(ry) * 0.04); b.castShadow = true; group.add(b); }
    return m;
  };
  signPlane(neonText('ARCADE', 2048, 384, 325, HEAVY, 'SPARK TOOLS LABS  -  INSERT COIN'), 8.4, 1.575, 17, 4.12, Z0 - 0.12, Math.PI);
  signPlane(neonText('ARCADE', 1024, 256, 190, HEAVY), 2.6, 0.65, X0 - 0.14, 3.55, DOOR_Z, -Math.PI / 2);
  signPlane(neonText('PLAYER ONE', 1536, 256, 190, HEAVY, 'PRESS START'), 4.4, 0.73, 17, 3.1, Z1 - WT - 0.03, Math.PI, false);
  signPlane(neonText('HIGH SCORE', 1536, 256, 325, HEAVY), 4.4, 0.73, X1 - WT - 0.03, 3.0, 43.0, -Math.PI / 2, false);
  // halos
  const hc = mkCanvas(256, 128), hg = hc.getContext('2d'); hg.scale(2, 1); const rg = hg.createRadialGradient(64, 64, 2, 64, 64, 62); rg.addColorStop(0, 'rgba(255,60,170,0.85)'); rg.addColorStop(0.45, 'rgba(255,40,150,0.28)'); rg.addColorStop(1, 'rgba(255,40,150,0)'); hg.fillStyle = rg; hg.fillRect(0, 0, 128, 128);
  const haloTex = canvasTex(hc); const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.8 });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4), haloMat); halo.position.set(17, 3.9, Z0 - 0.06); halo.rotation.y = Math.PI; halo.renderOrder = 1; group.add(halo);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), haloMat); spill.rotation.x = -Math.PI / 2; spill.position.set(17, 0.02, Z0 - 2.3); spill.renderOrder = 1; group.add(spill);

  // ---------- merge bins into meshes ----------
  const meshFor = (key, mat, vc, name, shadow = true) => { if (bins[key] && bins[key].length) addMesh(finish(bins[key], vc), mat, name, shadow, true); };
  meshFor('wall', wallMat, false, 'walls'); meshFor('steelDark', steelDark, false, 'steel-dark'); meshFor('steelIn', steelIn, false, 'steel');
  meshFor('floor', floorMat, false, 'floor'); meshFor('ceil', ceilMat, false, 'ceiling'); meshFor('leather', leatherMat, false, 'bench');
  meshFor('wood', M.get('oak', { color: 0x6b4a33, envMapIntensity: 0.3 }), false, 'slats');
  meshFor('glow', glowMat, true, 'led-strips', false); meshFor('plastic', plasticMat, true, 'plastics');
  meshFor('body', blackVinyl, false, 'pinball-body');
  meshFor('cab_body', blackVinyl, false, 'cab-bodies'); meshFor('cab_side', sideMat, false, 'cab-sides'); meshFor('cab_screen', screenMat, false, 'cab-screens', false);
  meshFor('cab_marquee', marqueeMat, false, 'cab-marquees', false); meshFor('cab_plastic', plasticMat, true, 'cab-controls'); meshFor('cab_glow', glowMat, true, 'cab-glow', false);
  meshFor('cab_steel', steelIn, false, 'cab-coindoors');

  // ---------- lights ----------
  const mkLight = (c, i, x, y, z, d = 14) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); group.add(l); return l; };
  mkLight(0xff2fa8, 22, 14.5, 3.4, 41, 12); mkLight(0x20c8ff, 22, 20, 3.4, 46.4, 12); mkLight(0xff9a3a, 12, 17, 3.0, 43.5, 8);
  mkLight(0xff2fa8, 40, 17, 4.0, Z0 - 2.4, 10);

  // ---------- regions ----------
  const regions = [
    { minX: X0 + WT, maxX: X1 - WT, minZ: Z0 + WT, maxZ: Z1 - WT, y: 0 },
    { minX: 10.2, maxX: 11.6, minZ: 43.4, maxZ: 44.6, y: 0 },
  ];

  // ---------- animation ----------
  const sctx = screenLive.getContext('2d');
  let acc = 0, flick = 1, t = 0;
  const cell = (i) => [(i % 4) * SC.w, Math.floor(i / 4) * SC.h];
  function drawScreens(time) {
    sctx.globalCompositeOperation = 'source-over'; sctx.drawImage(screenBase, 0, 0);
    sctx.textAlign = 'center'; sctx.font = `bold 15px ${MONO}`;
    for (let i = 0; i < N; i++) {
      const [x, y] = cell(i);
      if (Math.floor(time * 1.6 + i * 0.37) % 2 === 0) { sctx.fillStyle = '#fff'; sctx.fillText('INSERT COIN', x + 128, y + 134); sctx.fillStyle = 'rgba(0,0,0,0)'; }
      const by = y + ((time * 55 + i * 40) % (SC.h + 40)) - 20; // rolling refresh band
      sctx.fillStyle = 'rgba(255,255,255,0.07)'; sctx.fillRect(x, Math.max(y, by), SC.w, Math.min(18, y + SC.h - Math.max(y, by)));
      const f = 0.03 + Math.random() * 0.06; sctx.fillStyle = `rgba(0,0,0,${f})`; sctx.fillRect(x, y, SC.w, SC.h);
    }
    screenTex.needsUpdate = true;
  }
  drawScreens(0);
  const cx0 = 17, cz0 = 44;
  return {
    group, regions, colliders, pickables,
    seats,   // every place to sit in the arcade (sit contract), world metres
    update(dt, frame) {
      t += dt; const cam = frame && frame.camera;
      if (!ctx.reducedMotion) {
        const near = !cam || Math.hypot(cam.position.x - cx0, cam.position.z - cz0) < 24;
        if (near) { acc += dt; if (acc > 0.1) { acc = 0; drawScreens(t); } }
        flick = 0.92 + 0.08 * Math.sin(t * 7.3); if (Math.sin(t * 1.9) * Math.sin(t * 5.3 + 1) > 0.93) flick = 0.55;
        for (const m of neonMats) m.opacity = 1; for (const m of neonMats) m.color.setScalar(flick > 0.6 ? 1.15 * flick + 0.1 : 0.55);
        haloMat.opacity = 0.55 + 0.3 * flick;
      }
    },
    onPick() {},
  };
}
