// Wayfinding: the plaza totem, the two gate signs, the amphitheatre rim sign,
// the lift plaque inside the hall and the pavilion door plates.
// Dark blackened-steel totems with canvas-drawn off-white lettering; stone
// plinths carry inset bronze plates. Every text face is a CanvasTexture that is
// redrawn once the house fonts (Instrument Sans / Serif) have loaded.

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'signage';

  const INK = '#ece6d8';
  const SANS = "'Instrument Sans', system-ui, sans-serif";
  const SERIF = "'Instrument Serif', Georgia, serif";
  const maxAniso = ctx.renderer ? ctx.renderer.capabilities.getMaxAnisotropy() : 8;

  // ---- fonts: draw now with fallbacks, redraw when the real faces arrive ----
  const faces = []; // { c, tex, canvas, draw }
  function redrawAll() { for (const f of faces) f.draw(); }
  if (typeof FontFace === 'function' && typeof document !== 'undefined' && document.fonts) {
    const sans = new FontFace('Instrument Sans', `url(${new URL('../../fonts/instrument-sans-variable.woff2', import.meta.url)})`, { weight: '400 700' });
    const serif = new FontFace('Instrument Serif', `url(${new URL('../../fonts/instrument-serif-400.woff2', import.meta.url)})`, { weight: '400', style: 'normal' });
    const serifI = new FontFace('Instrument Serif', `url(${new URL('../../fonts/instrument-serif-400-italic.woff2', import.meta.url)})`, { weight: '400', style: 'italic' });
    Promise.all([sans.load(), serif.load(), serifI.load()]).then((loaded) => {
      for (const f of loaded) document.fonts.add(f);
      redrawAll();
    }).catch(() => {});
  }

  // ---- canvas helpers ----
  function setFont(c, family, px, o = {}) {
    c.font = `${o.style || 'normal'} ${o.weight || 400} ${px.toFixed(2)}px ${family}`;
    c.letterSpacing = `${((o.ls || 0) * px).toFixed(2)}px`;
  }
  // Largest size (<= maxPx) at which text fits maxW. Leaves the font set.
  function fitFont(c, text, family, maxW, maxPx, o) {
    let px = maxPx;
    for (; px > 8; px -= 1) {
      setFont(c, family, px, o);
      if (c.measureText(text).width <= maxW) break;
    }
    setFont(c, family, px, o);
    return px;
  }
  function drawArrow(c, x, y, ang, len) {
    const hl = len * 0.36, hw = len * 0.2;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = Math.max(2, len * 0.07);
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(-len / 2, 0);
    c.lineTo(len / 2 - hl * 0.6, 0);
    c.stroke();
    c.beginPath();
    c.moveTo(len / 2, 0);
    c.lineTo(len / 2 - hl, -hw);
    c.lineTo(len / 2 - hl, hw);
    c.closePath();
    c.fill();
    c.restore();
  }
  function bronzeGround(c, W, H) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4a3a27');
    g.addColorStop(1, '#2a2119');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  function makeFace(w, h, ppm, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(w * ppm));
    canvas.height = Math.max(64, Math.round(h * ppm));
    const c = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const face = {
      c, tex, canvas,
      draw() { draw(c, canvas.width, canvas.height); tex.needsUpdate = true; },
    };
    face.draw();
    faces.push(face);
    return tex;
  }

  // ---- materials ----
  const steelDark = M.get('steel', { color: 0x26221e, roughness: 0.48, metalness: 1 });   // blackened totem
  const bronze = M.get('steel', { color: 0x5a4630, roughness: 0.4, metalness: 1 });       // plate body / pins
  const stone = M.get('whiteSandstone');

  // ---- sign drawings ----
  function drawTotem(c, W, H) {
    const s = W / 512;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a2520');
    g.addColorStop(1, '#1c1915');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(236,230,216,0.22)';
    c.lineWidth = 2 * s;
    c.strokeRect(24 * s, 24 * s, W - 48 * s, H - 48 * s);

    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    fitFont(c, 'THE', SERIF, 360 * s, 64 * s, { ls: 0.3 });
    c.fillText('THE', W / 2, 230 * s);
    fitFont(c, 'WORKSHOP', SERIF, 380 * s, 124 * s, { ls: 0.06 });
    c.fillText('WORKSHOP', W / 2, 360 * s);

    c.strokeStyle = 'rgba(236,230,216,0.4)';
    c.lineWidth = 1.5 * s;
    c.beginPath();
    c.moveTo(80 * s, 430 * s);
    c.lineTo(W - 80 * s, 430 * s);
    c.stroke();

    const rows = [
      ['Hall', -Math.PI / 2],
      ['Studio', -3 * Math.PI / 4],
      ['Arcade', -Math.PI / 4],
      ['Garden', 0],
      ['Amphitheatre', Math.PI],
    ];
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let i = 0; i < rows.length; i++) {
      const yc = (600 + 200 * i) * s;
      fitFont(c, rows[i][0], SANS, 300 * s, 60 * s, { weight: 500 });
      c.fillStyle = INK;
      c.fillText(rows[i][0], 80 * s, yc);
      drawArrow(c, W - 96 * s, yc, rows[i][1], 64 * s);
      c.strokeStyle = 'rgba(236,230,216,0.14)';
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.moveTo(80 * s, yc + 100 * s);
      c.lineTo(W - 80 * s, yc + 100 * s);
      c.stroke();
    }

    // Cinema & Terrace: no arrow, the way is given in words.
    const yc = 1600 * s;
    fitFont(c, 'Cinema & Terrace', SANS, 380 * s, 60 * s, { weight: 500 });
    c.fillStyle = INK;
    c.fillText('Cinema & Terrace', 80 * s, yc);
    fitFont(c, 'by the glass lift in the Hall', SERIF, 380 * s, 42 * s, { style: 'italic' });
    c.fillStyle = 'rgba(236,230,216,0.8)';
    c.fillText('by the glass lift in the Hall', 80 * s, yc + 72 * s);
  }

  function drawPlate(c, W, H, text, family, o) {
    bronzeGround(c, W, H);
    c.strokeStyle = 'rgba(236,230,216,0.3)';
    c.lineWidth = Math.max(2, H * 0.02);
    c.strokeRect(H * 0.09, H * 0.09, W - H * 0.18, H - H * 0.18);

    const arrow = o.arrow;
    const pad = W * 0.06;
    const arrowLen = arrow !== undefined ? H * 0.34 : 0;
    const gap = arrow !== undefined ? H * 0.22 : 0;
    fitFont(c, text, family, W - 2 * pad - arrowLen - gap, H * (o.maxPx || 0.42), o);
    const tw = c.measureText(text).width;
    const x0 = (W - (tw + gap + arrowLen)) / 2;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(text, x0, H / 2 + H * 0.02);
    if (arrow !== undefined) drawArrow(c, x0 + tw + gap + arrowLen / 2, H / 2, arrow, arrowLen);
  }

  // ---- builders ----
  const colliders = [];

  // Standing totem: stone foot, blackened steel panel 1.8 x 0.5 x 0.12, text face on +z.
  function totem(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const footGeo = M.boxUV(new THREE.BoxGeometry(0.6, 0.14, 0.32));
    const foot = new THREE.Mesh(footGeo, stone);
    foot.position.set(0, 0.07, 0);
    foot.castShadow = foot.receiveShadow = true;
    g.add(foot);

    const panelGeo = M.boxUV(new THREE.BoxGeometry(0.5, 1.8, 0.12));
    const panel = new THREE.Mesh(panelGeo, steelDark);
    panel.position.set(0, 0.14 + 0.9, 0);
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);

    const faceMat = new THREE.MeshStandardMaterial({
      map: makeFace(0.5, 1.8, low ? 512 : 1024, drawTotem),
      roughness: 0.5, metalness: 0.2,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.8), faceMat);
    face.position.set(0, 0.14 + 0.9, 0.06 + 0.0008);
    face.receiveShadow = true;
    g.add(face);

    group.add(g);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.16, maxZ: z + 0.16, minY: 0, maxY: 2 });
  }

  // A plate (bronze body + text face) whose centre is (cx, cy, cz) in its parent's frame.
  // The text face sits on the +z side of the parent frame.
  function plate(parent, cx, cy, cz, w, h, t, ppm, draw) {
    const body = new THREE.Mesh(M.boxUV(new THREE.BoxGeometry(w, h, t)), bronze);
    body.position.set(cx, cy, cz);
    body.castShadow = body.receiveShadow = true;
    parent.add(body);
    const faceMat = new THREE.MeshStandardMaterial({
      map: makeFace(w, h, ppm, draw), roughness: 0.5, metalness: 0.25,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
    face.position.set(cx, cy, cz + t / 2 + 0.0008);
    face.receiveShadow = true;
    parent.add(face);
  }

  // Low directional sign on a stone plinth (plinth front faces +z in its frame).
  function lowSign(x, z, rotY, text, arrow) {
    const w = 0.5, h = 0.7, d = 0.18, pw = 0.42, ph = 0.15, t = 0.025;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const plinth = new THREE.Mesh(M.boxUV(new THREE.BoxGeometry(w, h, d)), stone);
    plinth.position.set(0, h / 2, 0);
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    plate(g, 0, 0.45, d / 2 + t / 2, pw, ph, t, low ? 420 : 900,
      (c, W, H) => drawPlate(c, W, H, text, SANS, { arrow, weight: 500 }));
    group.add(g);
    const sx = rotY === 0 || Math.abs(rotY) === Math.PI ? w / 2 : d / 2;
    const sz = rotY === 0 || Math.abs(rotY) === Math.PI ? d / 2 : w / 2;
    colliders.push({ minX: x - sx, maxX: x + sx, minZ: z - sz, maxZ: z + sz, minY: 0, maxY: h });
  }

  // Wall-mounted plate, standing off the wall on two pins. `wallGap` is the
  // distance from the plate back to the wall (0 = no standoff drawn).
  function doorPlate(x, y, z, rotY, text, wallGap) {
    const w = 0.4, h = 0.13, t = 0.02;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    plate(g, 0, 0, 0, w, h, t, low ? 400 : 900,
      (c, W, H) => drawPlate(c, W, H, text, SERIF, { maxPx: 0.5, ls: 0.04 }));
    if (wallGap > 0) {
      const pinLen = wallGap - t / 2;
      const pinGeo = new THREE.CylinderGeometry(0.008, 0.008, pinLen, 8);
      pinGeo.rotateX(Math.PI / 2);
      for (const px of [-0.13, 0.13]) {
        const pin = new THREE.Mesh(pinGeo, bronze);
        pin.position.set(px, 0, -(wallGap + t / 2) / 2);
        pin.castShadow = true;
        g.add(pin);
      }
    }
    group.add(g);
  }

  // ---- 1. plaza totem ----
  totem(-4.2, 20.2);

  // ---- 2. gate signs at the plaza openings ----
  // West opening (x -24): sign inside the plaza, face toward +x.
  lowSign(-23.0, 26.4, Math.PI / 2, 'Amphitheatre', -Math.PI);
  // East opening (x +24): sign inside the plaza, face toward -x.
  lowSign(23.0, 26.4, -Math.PI / 2, 'Garden', 0);

  // ---- 3. lift plaque inside the hall, face -z ----
  {
    const g = new THREE.Group();
    g.position.set(2.9, 1.5, 14.92);
    g.rotation.y = Math.PI;
    plate(g, 0, 0, 0, 0.6, 0.14, 0.02, low ? 600 : 1000,
      (c, W, H) => drawPlate(c, W, H, 'Lift · Cinema · Roof terrace', SANS, { weight: 500, maxPx: 0.4, ls: 0.02 }));
    group.add(g);
  }

  // ---- 4. pavilion door plates ----
  doorPlate(-10.95, 1.5, 45.2, Math.PI / 2, 'Studio', 0.05);   // west pavilion, east face, faces +x
  doorPlate(10.95, 1.5, 45.2, -Math.PI / 2, 'Arcade', 0.05);   // east pavilion, west face, faces -x

  // ---- 5. amphitheatre rim sign, face +x ----
  {
    const w = 0.6, h = 1.0, d = 0.22, t = 0.025;
    const g = new THREE.Group();
    g.position.set(-32, 0, 26);
    g.rotation.y = Math.PI / 2;
    const plinth = new THREE.Mesh(M.boxUV(new THREE.BoxGeometry(w, h, d)), stone);
    plinth.position.set(0, h / 2, 0);
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    plate(g, 0, 0.68, d / 2 + t / 2, 0.46, 0.2, t, low ? 420 : 900,
      (c, W, H) => drawPlate(c, W, H, 'Amphitheatre', SERIF, { maxPx: 0.46, ls: 0.03 }));
    group.add(g);
    colliders.push({ minX: -32 - d / 2, maxX: -32 + d / 2, minZ: 26 - w / 2, maxZ: 26 + w / 2, minY: 0, maxY: h });
  }

  return {
    group,
    regions: [],
    colliders,
    pickables: [],
    update() {},
  };
}
