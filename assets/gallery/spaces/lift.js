// The glass lift (BRIEF §5.2 / §6.2). World coordinates. The state machine lives in lift-logic.js.
import { LiftLogic } from './lift-logic.js';

const SX0 = 3.2, SX1 = 5.4, SZ0 = 14.9, SZ1 = 16.95, H = 10.6, LV = [0, 7.2];
const CX0 = 3.35, CX1 = 5.25, CZ0 = 15.05, CZ1 = 16.8;

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group(); group.name = 'lift';
  const car = new THREE.Group(); car.name = 'lift-car'; group.add(car);

  // ---------- materials ----------
  const bronze = new THREE.MeshStandardMaterial({ color: 0x86603a, metalness: 0.75, roughness: 0.38, envMapIntensity: 1.3 });
  const bronzeDk = new THREE.MeshStandardMaterial({ color: 0x3d2c1e, metalness: 0.75, roughness: 0.45, envMapIntensity: 1.0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8cbcf, metalness: 1, roughness: 0.26, envMapIntensity: 1.4 });
  const steelBrushed = new THREE.MeshStandardMaterial({ color: 0xb4b7bb, metalness: 1, roughness: 0.42, envMapIntensity: 1.2 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.7, roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdcefee, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.13,
    envMapIntensity: 3.2, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  });
  const terrazzo = M.get('terrazzo', { tile: 1.2 });
  const concrete = M.get('concreteFloor');
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4e2, emissive: 0xffe6c2, emissiveIntensity: 3.2, roughness: 0.6 });

  // ---------- helpers ----------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  const unitCylHi = new THREE.CylinderGeometry(1, 1, 1, 28);
  function box(parent, mat, w, h, d, x, y, z, shadow = true) {
    const m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d); m.position.set(x, y, z);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; } parent.add(m); return m;
  }
  function cyl(parent, mat, r, len, axis, x, y, z, hi = false) {
    const m = new THREE.Mesh(hi ? unitCylHi : unitCyl, mat);
    if (axis === 'x') { m.rotation.z = Math.PI / 2; m.scale.set(r, len, r); }
    else if (axis === 'z') { m.rotation.x = Math.PI / 2; m.scale.set(r, len, r); }
    else m.scale.set(r, len, r);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  // glass pane in a plane perpendicular to z (face 'z') or x (face 'x')
  function pane(parent, face, a0, a1, y0, y1, c) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, y1 - y0), glass);
    if (face === 'z') m.position.set((a0 + a1) / 2, (y0 + y1) / 2, c);
    else { m.rotation.y = Math.PI / 2; m.position.set(c, (y0 + y1) / 2, (a0 + a1) / 2); }
    m.renderOrder = 2; parent.add(m); return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { c, g, t };
  }

  // ---------- shaft frame ----------
  const shaft = new THREE.Group(); group.add(shaft);
  const P = 0.07;
  for (const [x, z] of [[SX0, SZ0], [SX1, SZ0], [SX0, SZ1], [SX1, SZ1]]) box(shaft, bronze, P, H, P, x, H / 2, z);
  // front jambs beside the doors (full height)
  for (const x of [3.7, 4.9]) box(shaft, bronze, 0.05, H, 0.07, x, H / 2, SZ0);
  const trY = [0.14, 2.45, 4.8, 6.4, 7.2, 9.65, 10.5];
  for (const y of trY) {
    box(shaft, bronze, SX1 - SX0, 0.05, 0.07, 4.3, y, SZ0, y > 0.2);       // front
    box(shaft, bronze, SX1 - SX0, 0.05, 0.07, 4.3, y, SZ1);                 // back
    box(shaft, bronze, 0.07, 0.05, SZ1 - SZ0, SX0, y, 15.925);              // -x
    box(shaft, bronze, 0.07, 0.05, SZ1 - SZ0, SX1, y, 15.925);              // +x
  }
  box(shaft, bronze, 0.04, H, 0.06, 4.3, H / 2, SZ1);                       // back mullion
  box(shaft, bronze, 0.06, H, 0.04, SX0, H / 2, 15.925); box(shaft, bronze, 0.06, H, 0.04, SX1, H / 2, 15.925);
  // plinth (solid steel kick plate)
  box(shaft, steelBrushed, SX1 - SX0, 0.14, 0.03, 4.3, 0.07, SZ1 - 0.02);
  box(shaft, steelBrushed, 0.03, 0.14, SZ1 - SZ0, SX0 + 0.02, 0.07, 15.925); box(shaft, steelBrushed, 0.03, 0.14, SZ1 - SZ0, SX1 - 0.02, 0.07, 15.925);
  box(shaft, steelBrushed, 0.6, 0.14, 0.03, 3.45, 0.07, SZ0 + 0.02); box(shaft, steelBrushed, 0.5, 0.14, 0.03, 5.15, 0.07, SZ0 + 0.02);
  // glass: front (not the two door openings), back, sides — whole height
  const doorH = 2.3;
  const frontGlass = [[SX0, 3.7], [4.9, SX1]];
  for (const [a, b] of frontGlass) pane(shaft, 'z', a, b, 0.14, H - 0.1, SZ0);
  pane(shaft, 'z', 3.7, 4.9, 2.5, 7.2 - 0.05, SZ0);     // between the two doors
  pane(shaft, 'z', 3.7, 4.9, LV[1] + doorH + 0.2, H - 0.1, SZ0);
  pane(shaft, 'z', SX0, 4.3, 0.14, H - 0.1, SZ1); pane(shaft, 'z', 4.3, SX1, 0.14, H - 0.1, SZ1);
  pane(shaft, 'x', SZ0, 15.925, 0.14, H - 0.1, SX0); pane(shaft, 'x', 15.925, SZ1, 0.14, H - 0.1, SX0);
  pane(shaft, 'x', SZ0, 15.925, 0.14, H - 0.1, SX1); pane(shaft, 'x', 15.925, SZ1, 0.14, H - 0.1, SX1);
  // door headers and sills
  for (const L of LV) {
    box(shaft, bronze, 1.22, 0.14, 0.08, 4.3, L + doorH + 0.07, SZ0);
    box(shaft, steel, 1.2, 0.02, 0.16, 4.3, L + 0.012, SZ0 - 0.02, false);
    box(shaft, bronzeDk, 1.2, 0.012, 0.03, 4.3, L + 0.022, SZ0 - 0.06, false); // door track
  }
  // head-house roof
  box(shaft, bronze, 2.5, 0.12, 2.3, 4.3, H + 0.06, 15.925);
  box(shaft, bronzeDk, 2.34, 0.04, 2.14, 4.3, H - 0.02, 15.925, false);
  // pit
  const pitG = new THREE.BoxGeometry(SX1 - SX0 - 0.1, 0.03, SZ1 - SZ0 - 0.1); M.boxUV(pitG);
  const pit = new THREE.Mesh(pitG, iron); pit.position.set(4.3, 0.015, 15.925); pit.receiveShadow = true; shaft.add(pit);

  // ---------- rails, sheave, cables, counterweight ----------
  const railH = 10.45;
  for (const x of [3.245, 5.355]) { box(shaft, steel, 0.045, railH, 0.09, x, railH / 2 + 0.03, 16.0, false); }
  for (const x of [4.0, 4.6]) box(shaft, steel, 0.05, railH - 0.4, 0.05, x, (railH - 0.4) / 2 + 0.03, 16.905, false);
  // machine beam + sheave
  const SHY = 10.08, SHR = 0.445, SHZ = 16.44;
  box(shaft, iron, 2.0, 0.14, 0.12, 4.3, 10.31, SHZ - 0.1); box(shaft, iron, 0.08, 0.24, 0.5, 3.55, 10.18, SHZ - 0.0); box(shaft, iron, 0.08, 0.24, 0.5, 5.05, 10.18, SHZ - 0.0);
  const sheave = cyl(shaft, steelBrushed, SHR, 0.3, 'x', 4.3, SHY, SHZ, true); sheave.castShadow = true;
  cyl(shaft, bronzeDk, 0.1, 0.5, 'x', 4.3, SHY, SHZ);
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.6, roughness: 0.5 });
  const carCables = [4.22, 4.38].map((x) => cyl(shaft, cableMat, 0.007, 1, 'y', x, 5, SHZ - SHR));
  const cwCable = cyl(shaft, cableMat, 0.007, 1, 'y', 4.3, 5, SHZ + SHR);
  const cw = new THREE.Group(); shaft.add(cw);
  box(cw, iron, 0.62, 1.4, 0.07, 0, 0, 0);
  for (let i = 0; i < 7; i++) box(cw, bronzeDk, 0.58, 0.16, 0.085, 0, -0.6 + i * 0.2, 0, false);
  box(cw, bronze, 0.62, 0.05, 0.1, 0, 0.72, 0, false); box(cw, bronze, 0.62, 0.05, 0.1, 0, -0.72, 0, false);
  cw.position.set(4.3, 8.6, 16.895);

  // ---------- car ----------
  const CW = CX1 - CX0, CD = CZ1 - CZ0, CH = 2.4;
  const cxm = (CX0 + CX1) / 2, czm = (CZ0 + CZ1) / 2;
  // platform + floor
  box(car, bronze, 2.02, 0.14, 1.82, cxm, -0.1, 15.91);
  const floorG = new THREE.BoxGeometry(CW, 0.04, CD); M.boxUV(floorG);
  const floor = new THREE.Mesh(floorG, terrazzo); floor.position.set(cxm, -0.008, czm); floor.receiveShadow = true; floor.castShadow = true; car.add(floor);
  box(car, steel, 1.2, 0.018, 0.14, 4.3, 0.004, 15.0 + 0.04, false);
  // roof + light panel
  box(car, bronze, 2.02, 0.1, 1.82, cxm, CH + 0.05, 15.91);
  const lp = box(car, lightMat, 1.5, 0.012, 1.2, cxm, CH - 0.004, 16.0 - 0.0, false);
  box(car, bronzeDk, 1.58, 0.02, 1.28, cxm, CH + 0.002, 16.0, false);
  // corner posts + transoms
  for (const [x, z] of [[CX0, CZ0], [CX1, CZ0], [CX0, CZ1], [CX1, CZ1]]) box(car, bronze, 0.05, CH, 0.05, x, CH / 2, z);
  for (const y of [0.1, 1.2, CH - 0.03]) {
    box(car, bronze, CW, 0.035, 0.04, cxm, y, CZ1, false); box(car, bronze, 0.04, 0.035, CD, CX0, y, czm, false); box(car, bronze, 0.04, 0.035, CD, CX1, y, czm, false);
  }
  box(car, steelBrushed, CW, 0.1, 0.02, cxm, 0.06, CZ1 - 0.012, false);
  // glass walls (-x, +x, back) and front side-lights
  pane(car, 'x', CZ0, CZ1, 0.12, CH - 0.03, CX0); pane(car, 'x', CZ0, CZ1, 0.12, CH - 0.03, CX1);
  pane(car, 'z', CX0, CX1, 0.12, CH - 0.03, CZ1);
  pane(car, 'z', CX0, 3.7, 0.12, CH - 0.03, CZ0); pane(car, 'z', 4.9, CX1, 0.12, CH - 0.03, CZ0);
  pane(car, 'z', 3.7, 4.9, doorH + 0.05, CH - 0.03, CZ0);
  box(car, bronze, 1.22, 0.07, 0.05, 4.3, doorH + 0.03, CZ0, false);
  box(car, bronze, 0.04, CH, 0.05, 3.7, CH / 2, CZ0, false); box(car, bronze, 0.04, CH, 0.05, 4.9, CH / 2, CZ0, false);
  // guide shoes
  for (const x of [3.285, 5.315]) for (const y of [0.1, CH - 0.1]) box(car, iron, 0.04, 0.16, 0.12, x, y, 16.0, false);
  // car frame uprights (outside rails)
  for (const x of [3.29, 5.31]) box(car, bronzeDk, 0.02, CH + 0.2, 0.06, x, CH / 2, 16.0, false);
  // handrail
  const HR = 0.018, HY = 0.92;
  cyl(car, steel, HR, CD - 0.12, 'z', CX0 + 0.075, HY, czm);
  cyl(car, steel, HR, CW - 0.12, 'x', cxm, HY, CZ1 - 0.075);
  cyl(car, steel, HR, 0.8, 'z', CX1 - 0.075, HY, 16.33);
  for (const [x, z] of [[CX0 + 0.075, 15.25], [CX0 + 0.075, 16.0], [CX0 + 0.075, 16.65], [4.3, CZ1 - 0.075], [4.9, CZ1 - 0.075], [3.7, CZ1 - 0.075], [CX1 - 0.075, 16.05], [CX1 - 0.075, 16.6]]) {
    const onSide = Math.abs(x - (CX0 + 0.075)) < 0.01 || Math.abs(x - (CX1 - 0.075)) < 0.01;
    if (onSide) cyl(car, steel, 0.008, 0.075, 'x', x + (x < 4.3 ? -0.0375 : 0.0375), HY, z); else cyl(car, steel, 0.008, 0.075, 'z', x, HY, z + 0.0375);
  }
  for (const [x, z] of [[CX0 + 0.075, 15.15], [CX0 + 0.075, 16.7], [CX1 - 0.075, 15.97], [CX1 - 0.075, 16.7]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), steel); s.position.set(x, HY, z); car.add(s); }
  // car light
  const carLight = new THREE.PointLight(0xffe6c8, 1.1, 7, 2); carLight.position.set(cxm, CH - 0.2, 16.0); car.add(carLight);

  // ---------- indicator display (shared canvas) ----------
  const disp = canvasTex(160, 80, () => {});
  let dispKey = '';
  function drawDisplay(digit, dir) {
    const g = disp.g; g.fillStyle = '#0b0605'; g.fillRect(0, 0, 160, 80);
    g.fillStyle = '#ffb347'; g.shadowColor = '#ff9a1f'; g.shadowBlur = 10;
    g.font = 'bold 62px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(digit), 58, 44);
    g.beginPath();
    if (dir > 0) { g.moveTo(118, 18); g.lineTo(140, 46); g.lineTo(96, 46); } else if (dir < 0) { g.moveTo(118, 62); g.lineTo(140, 34); g.lineTo(96, 34); }
    else { g.arc(118, 40, 6, 0, 7); }
    g.closePath(); g.fill(); g.shadowBlur = 0; disp.t.needsUpdate = true;
  }
  drawDisplay(0, 0);
  const dispMat = new THREE.MeshStandardMaterial({ color: 0x111111, map: disp.t, emissive: 0xffffff, emissiveMap: disp.t, emissiveIntensity: 1.4, roughness: 0.4 });

  // ---------- buttons ----------
  const pickables = [];
  const glowBtns = []; // { mat, getter }
  function digitTex(d) {
    return canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e4dc'; g.font = 'bold 38px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d, 32, 35); }).t;
  }
  function makeButton(parent, id, x, y, z, normalSign, label, r) {
    // normalSign: facing direction along z (-1 faces -z) or along x ('x-')
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const face = new THREE.Group(); g.add(face);
    if (normalSign === 'x-') face.rotation.y = -Math.PI / 2; else if (normalSign < 0) face.rotation.y = Math.PI;
    // local +z points out of the wall toward the viewer
    const bezel = new THREE.Mesh(unitCylHi, steel); bezel.rotation.x = Math.PI / 2; bezel.scale.set(r, 0.012, r); bezel.position.z = 0.006; face.add(bezel);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: label ? digitTex(label) : null, roughness: 0.35, metalness: 0.2, emissive: 0xffa640, emissiveIntensity: 0 });
    if (label) { capMat.emissiveMap = capMat.map; }
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 28), label ? capMat : steel); cap.position.z = 0.0125; face.add(cap);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffa233, emissiveIntensity: 0, roughness: 0.5 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r * 0.94, 32), ringMat); ring.position.z = 0.0128; face.add(ring);
    const pick = new THREE.Mesh(new THREE.CircleGeometry(r * 1.7, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.position.z = 0.015; face.add(pick);
    pick.userData.action = { type: 'custom', id }; g.userData.action = pick.userData.action;
    pickables.push(pick);
    return { ringMat, capMat: label ? capMat : null };
  }
  // car operating panel on the +x wall
  const opX = CX1 - 0.012;
  box(car, steelBrushed, 0.014, 0.56, 0.17, opX, 1.2, 15.55);
  box(car, bronzeDk, 0.004, 0.52, 0.13, opX - 0.008, 1.2, 15.55, false);
  const dispMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.065), dispMat); dispMesh.rotation.y = -Math.PI / 2; dispMesh.position.set(opX - 0.0125, 1.37, 15.55); car.add(dispMesh);
  const carBtn1 = makeButton(car, 'lift-go-1', opX - 0.007, 1.23, 15.55, 'x-', '1', 0.027);
  const carBtn0 = makeButton(car, 'lift-go-0', opX - 0.007, 1.13, 15.55, 'x-', '0', 0.027);
  // call panels (on the shaft front, hall side) at x 3.45
  const callBtns = [], callArrows = [];
  const arrowShape = (up) => { const s = new THREE.Shape(); const k = up ? 1 : -1; s.moveTo(0, 0.016 * k); s.lineTo(-0.014, -0.01 * k); s.lineTo(0.014, -0.01 * k); s.closePath(); return new THREE.ShapeGeometry(s); };
  const arrowGeoUp = arrowShape(true), arrowGeoDn = arrowShape(false);
  const landingDisp = [];
  LV.forEach((L, i) => {
    const cy = L + (i === 0 ? 1.1 : 1.1), by = i === 0 ? 1.1 : 8.3;
    const py = by;
    box(group, steelBrushed, 0.115, 0.31, 0.016, 3.45, py + 0.015, SZ0 - 0.055);
    for (const [dx, dy] of [[-0.045, 0.14], [0.045, 0.14], [-0.045, -0.11], [0.045, -0.11]]) cyl(group, steel, 0.006, 0.05, 'z', 3.45 + dx, py + dy, SZ0 - 0.03);
    const b = makeButton(group, 'lift-call-' + i, 3.45, py - 0.035, SZ0 - 0.0465, -1, null, 0.03);
    callBtns.push(b);
    const am = new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffa233, emissiveIntensity: 0, roughness: 0.5 });
    const a = new THREE.Mesh(i === 0 ? arrowGeoUp : arrowGeoDn, am); a.rotation.y = Math.PI; a.position.set(3.45, py + 0.075, SZ0 - 0.0465); group.add(a);
    callArrows.push(am);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), dispMat); d.rotation.y = Math.PI; d.position.set(4.3, L + 2.62, SZ0 - 0.03); group.add(d); landingDisp.push(d);
    box(group, bronzeDk, 0.22, 0.12, 0.012, 4.3, L + 2.62, SZ0 - 0.018, false);
  });

  // ---------- doors ----------
  const PW = 0.58;
  function makePanel(parent, z, glassMat) {
    const p = new THREE.Group(); p.position.z = z; parent.add(p);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.04, doorH - 0.12), glassMat); gl.position.y = doorH / 2 + 0.01; gl.renderOrder = 3; p.add(gl);
    box(p, bronze, 0.035, doorH, 0.03, -PW / 2 + 0.0175, doorH / 2, 0, false); box(p, bronze, 0.035, doorH, 0.03, PW / 2 - 0.0175, doorH / 2, 0, false);
    box(p, bronze, PW, 0.06, 0.03, 0, doorH - 0.03, 0, false); box(p, steelBrushed, PW, 0.1, 0.03, 0, 0.05, 0, false);
    box(p, steel, 0.018, 0.5, 0.012, 0, 1.0, 0.026 * 0, false);
    return p;
  }
  const land = LV.map((L) => {
    const g = new THREE.Group(); g.position.y = L; group.add(g);
    return { g, a: makePanel(g, SZ0 - 0.035, glass), b: makePanel(g, SZ0 - 0.035, glass) };
  });
  const carDoor = { a: makePanel(car, CZ0 + 0.05, glass), b: makePanel(car, CZ0 + 0.05, glass) };
  const SH_LAND = 0.51, SH_CAR = 0.5, CLOSED_A = 4.0, CLOSED_B = 4.6;
  const ease = (f) => f * f * (3 - 2 * f);
  function poseDoors(parts, f, shift) { const e = ease(f); parts.a.position.x = CLOSED_A - shift * e; parts.b.position.x = CLOSED_B + shift * e; }
  land.forEach((l) => poseDoors(l, 0, SH_LAND)); poseDoors(carDoor, 0, SH_CAR);

  // ---------- logic, colliders, regions ----------
  const events = (n) => { if (api.lift.onEvent) api.lift.onEvent(n); };
  const logic = new LiftLogic({ emit: events });
  const regions = [];
  const thrRegion = { minX: 3.75, maxX: 4.85, minZ: 13.8, maxZ: 15.6, y: 0 };
  const carRegion = { minX: 3.75, maxX: 4.85, minZ: 15.45, maxZ: 16.4, y: 0 };
  const colliders = [
    { minX: SX0 - 0.06, maxX: SX0 + 0.04, minZ: SZ0 - 0.06, maxZ: SZ1 + 0.06, minY: 0, maxY: H }, // -x
    { minX: SX1 - 0.04, maxX: SX1 + 0.06, minZ: SZ0 - 0.06, maxZ: SZ1 + 0.06, minY: 0, maxY: H }, // +x
    { minX: SX0 - 0.06, maxX: SX1 + 0.06, minZ: SZ1 - 0.04, maxZ: SZ1 + 0.06, minY: 0, maxY: H }, // back
    { minX: SX0 - 0.06, maxX: 3.72, minZ: SZ0 - 0.06, maxZ: SZ0 + 0.04, minY: 0, maxY: H },       // front jamb L
    { minX: 4.88, maxX: SX1 + 0.06, minZ: SZ0 - 0.06, maxZ: SZ0 + 0.04, minY: 0, maxY: H },       // front jamb R
    { minX: 3.7, maxX: 4.9, minZ: SZ0 - 0.06, maxZ: SZ0 + 0.04, minY: LV[0] + doorH, maxY: LV[1] }, // between doors
  ];
  const doorCol = LV.map((L) => ({ minX: 3.7, maxX: 4.9, minZ: SZ0 - 0.06, maxZ: SZ0 + 0.04, minY: L, maxY: L + doorH + 0.1 }));
  doorCol.forEach((c) => colliders.push(c));
  const doorColHome = doorCol.map((c) => ({ minY: c.minY, maxY: c.maxY }));

  let vx = 0, vy = 0, vz = 0, vSet = false;
  let insideCar = false;
  const inFootprint = (x, z) => x >= CX0 && x <= CX1 && z >= CZ0 && z <= CZ1;

  const api = {
    group, regions, colliders, pickables,
    lift: {
      get carY() { return logic.carY; },
      get state() { return logic.publicState; },
      get doorLevel() { return logic.doorLevel; },
      isInside: (x, z) => inFootprint(x, z),
      call: (l) => logic.call(l),
      go: (l) => logic.go(l),
      setVisitor(x, y, z) { vx = x; vy = y; vz = z; vSet = true; },
      regions,
      onEvent: null,
    },
    update(dt) {
      if (dt > 0.1) dt = 0.1;
      // occupancy
      const moving = logic.state === 'moving' || logic.state === 'arrived';
      const cy = logic.carY;
      insideCar = vSet && inFootprint(vx, vz) && vy >= cy - 0.1 && vy <= cy + 3.2;
      const lvY = LV[logic.level];
      const inDoorway = vSet && !moving && vx >= 3.55 && vx <= 5.05 && vz >= 14.3 && vz <= 15.45 && vy >= lvY - 0.3 && vy <= lvY + 3.2;
      logic.setOccupancy(inDoorway, insideCar);
      logic.update(dt);

      // car + machinery
      const y = logic.carY;
      car.position.y = y;
      const top = y + CH + 0.1;
      for (const c of carCables) { c.scale.y = Math.max(0.01, SHY - top); c.position.y = (SHY + top) / 2; }
      const cwTop = 9.3 - y; cw.position.y = 8.6 - y;
      cwCable.scale.y = Math.max(0.01, SHY - cwTop); cwCable.position.y = (SHY + cwTop) / 2;
      sheave.rotation.x = -y / SHR;

      // doors
      const f = logic.door;
      poseDoors(carDoor, f, SH_CAR);
      for (let i = 0; i < 2; i++) poseDoors(land[i], logic.level === i ? f : 0, SH_LAND);

      // indicator + button glow
      const lvl = Math.round(y / LV[1]);
      const dir = moving ? logic.dir : 0;
      const key = lvl * 3 + dir + 1;
      if (key + '' !== dispKey) { dispKey = key + ''; drawDisplay(lvl, dir); }
      const set = (m, on) => { m.emissiveIntensity = on ? 2.6 : 0; if (on) m.color.setHex(0xffd9a0); else m.color.setHex(0x3a2a14); };
      const p = logic.pending;
      for (let i = 0; i < 2; i++) { set(callBtns[i].ringMat, p[i].call); set(callArrows[i], p[i].call); }
      carBtn0.ringMat.emissiveIntensity = p[0].go ? 2.6 : 0; carBtn1.ringMat.emissiveIntensity = p[1].go ? 2.6 : 0;
      carBtn0.capMat.emissiveIntensity = p[0].go ? 0.9 : 0.0; carBtn1.capMat.emissiveIntensity = p[1].go ? 0.9 : 0.0;
      lightMat.emissiveIntensity = 3.0 + (moving ? -0.2 : 0);

      // colliders: door openings are free while the doors are open at that level
      const st = logic.state;
      const stationary = st === 'opening' || st === 'open' || st === 'closing';
      for (let i = 0; i < 2; i++) {
        const free = stationary && logic.level === i && f > 0.3;
        doorCol[i].minY = free ? -1000 : doorColHome[i].minY; doorCol[i].maxY = free ? -999 : doorColHome[i].maxY;
      }
      // regions (same array, mutated in place)
      regions.length = 0;
      const doorsWalk = stationary && f > 0.5;
      if (doorsWalk) { thrRegion.y = lvY; regions.push(thrRegion); }
      if (doorsWalk || insideCar) { carRegion.y = y; regions.push(carRegion); }
    },
    onPick(object) {
      const a = object && object.userData && object.userData.action;
      if (!a || a.type !== 'custom') return;
      if (a.id === 'lift-call-0') logic.call(0); else if (a.id === 'lift-call-1') logic.call(1);
      else if (a.id === 'lift-go-0') logic.go(0); else if (a.id === 'lift-go-1') logic.go(1);
    },
  };
  if (typeof window !== "undefined") { window.__lift = api.lift; window.__liftUpdate = api.update; }
  return api;
}
