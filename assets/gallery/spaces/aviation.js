// Aviation: airliner + contrails, light prop aircraft circuit, helicopter. World coords, procedural.
// Aircraft models face +z (nose), +y up. Aerial-perspective tint toward the sky colour by distance.
export function build(ctx) {
  const THREE = ctx.THREE;
  const low = ctx.quality === 'low';
  const calm = !!ctx.reducedMotion;
  const group = new THREE.Group();
  group.name = 'aviation';
  const SKY = new THREE.Color('#c9d2dd');
  const CX = 0, CZ = 20;
  const PI = Math.PI;

  // ---------- tint registry ----------
  const tints = { jet: [], plane: [], heli: [] };
  function mat(kind, color, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.4, metalness: 0.2 }, o));
    tints[kind].push({ m, base: new THREE.Color(color) });
    return m;
  }
  function physical(kind, color, o) {
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.08, metalness: 0.1, clearcoat: 1 }, o));
    tints[kind].push({ m, base: new THREE.Color(color) });
    return m;
  }
  function applyTint(list, k) {
    for (let i = 0; i < list.length; i++) list[i].m.color.copy(list[i].base).lerp(SKY, k);
  }
  function mesh(g, m) { const x = new THREE.Mesh(g, m); x.castShadow = false; x.receiveShadow = false; return x; }
  function mirror(obj) { const g = new THREE.Group(); g.scale.x = -1; g.add(obj); return g; }
  function planform(pts, thick) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
    g.rotateX(-PI / 2); // shape y -> -z (aft), thickness -> +y
    g.translate(0, -thick / 2, 0);
    return g;
  }
  const radial = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function light(parent, color, x, y, z, size) {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2 });
    const s = mesh(new THREE.SphereGeometry(0.22, 8, 6), m); s.position.set(x, y, z); parent.add(s);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.setScalar(size); s.add(sp);
    return { m, sp };
  }

  // =================== JET ===================
  const jet = new THREE.Group(); jet.name = 'jet'; group.add(jet);
  const jetModel = new THREE.Group(); jet.add(jetModel);
  const white = mat('jet', '#f2f4f6', { roughness: 0.32, metalness: 0.25 });
  const blue = mat('jet', '#1f4f8f', { roughness: 0.35, metalness: 0.2 });
  const grey = mat('jet', '#9aa1a8', { roughness: 0.3, metalness: 0.7 });
  const dark = mat('jet', '#15181c', { roughness: 0.6, metalness: 0.3 });
  const seg = low ? 14 : 28;
  const fusePts = [[0, 19], [0.7, 18.5], [1.4, 17.2], [1.85, 15], [2, 12], [2, -8], [1.7, -13], [1.0, -17], [0.4, -19], [0, -19.2]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const fuse = mesh(new THREE.LatheGeometry(fusePts, seg), white); fuse.rotation.x = PI / 2; jetModel.add(fuse);
  const cockpit = mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), dark); cockpit.position.set(0, 0.85, 17.1); cockpit.rotation.x = -0.5; jetModel.add(cockpit);
  for (const sgn of [1, -1]) { // cheatline arcs
    const band = mesh(new THREE.CylinderGeometry(2.012, 2.012, 26, 12, 1, true, sgn > 0 ? PI / 2 - 0.12 : 3 * PI / 2 - 0.12, 0.24), blue);
    band.material.side = THREE.DoubleSide; band.rotation.x = PI / 2; band.position.z = 1; jetModel.add(band);
  }
  const wingG = planform([[0.8, 0], [16, 10.5], [16, 12.5], [0.8, 6.5]], 0.4);
  const wing = mesh(wingG, white); wing.material.side = THREE.DoubleSide; wing.rotation.z = 0.05;
  const wingGrp = new THREE.Group(); wingGrp.position.set(0, -0.9, 3); wingGrp.add(wing);
  jetModel.add(wingGrp); const wingL = mirror(wing.clone()); wingL.position.copy(wingGrp.position); jetModel.add(wingL);
  const stG = planform([[0.5, 0], [6.5, 4.2], [6.5, 5.4], [0.5, 3.6]], 0.2);
  const st = mesh(stG, white); st.rotation.z = 0.06;
  const stGrp = new THREE.Group(); stGrp.position.set(0, 0.6, -14.2); stGrp.add(st);
  jetModel.add(stGrp); const stL = mirror(st.clone()); stL.position.copy(stGrp.position); jetModel.add(stL);
  const finS = new THREE.Shape(); finS.moveTo(0, 0); finS.lineTo(5.5, 7.2); finS.lineTo(8.2, 7.2); finS.lineTo(8.2, 0);
  const finG = new THREE.ExtrudeGeometry(finS, { depth: 0.3, bevelEnabled: false }); finG.translate(0, 0, -0.15); finG.rotateY(PI / 2);
  const fin = mesh(finG, blue); fin.position.set(0, 1.5, -10.5); jetModel.add(fin);
  const engG = new THREE.CylinderGeometry(1.05, 0.9, 4.6, low ? 12 : 20, 1, true);
  const lipG = new THREE.TorusGeometry(1.05, 0.12, 6, low ? 12 : 20);
  const coreG = new THREE.CircleGeometry(0.95, low ? 12 : 20);
  const engM = grey.clone(); engM.side = THREE.DoubleSide; tints.jet.push({ m: engM, base: grey.color.clone() });
  for (const sgn of [1, -1]) {
    const e = new THREE.Group(); e.position.set(sgn * 6.3, -2.4, 3.2);
    const body = mesh(engG, engM); body.rotation.x = PI / 2; e.add(body);
    const lip = mesh(lipG, white); lip.position.z = 2.3; e.add(lip);
    const core = mesh(coreG, dark); core.position.z = 2.2; e.add(core);
    const pyl = mesh(new THREE.BoxGeometry(0.35, 1.2, 3), white); pyl.position.set(0, 1.1, -0.3); e.add(pyl);
    jetModel.add(e);
  }
  const lRed = light(jetModel, 0xff1a1a, 15.8, 0.1, -9.2, 22);   // left (+x) wingtip
  const lGrn = light(jetModel, 0x22ff55, -15.8, 0.1, -9.2, 22);  // right wingtip
  const sTail = light(jetModel, 0xffffff, 0, 0.6, -19.4, 40);
  const sWing = light(jetModel, 0xffffff, 0, 8.9, -18.5, 36);
  sWing.m.emissiveIntensity = 0;
  // contrails (jet-local, behind the engines)
  const N = low ? 14 : 26, LEN = 1600;
  function ribbon(vertical) {
    const pos = new Float32Array((N + 1) * 2 * 3), col = new Float32Array((N + 1) * 2 * 4), idx = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, z = -3 - LEN * Math.pow(s, 1.6), w = 0.8 + 26 * Math.pow(s, 0.8) * (vertical ? 0.8 : 1);
      const fade = Math.min(1, s / 0.03), a = Math.pow(1 - s, 1.6) * 0.5 * fade;
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k);
        const sg = k ? 1 : -1;
        pos[o * 3] = vertical ? 0 : sg * w; pos[o * 3 + 1] = vertical ? sg * w : 0; pos[o * 3 + 2] = z;
        col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = 1; col[o * 4 + 3] = a;
      }
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -LEN / 2), LEN);
    return g;
  }
  const cmat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cFlat = ribbon(false), cVert = ribbon(true);
  for (const sgn of [1, -1]) for (const g of [cFlat, cVert]) {
    const c = mesh(g, cmat); c.position.set(sgn * 6.3, -2.4, 0); c.frustumCulled = false; c.renderOrder = 2; jet.add(c);
  }

  // =================== PROP PLANE ===================
  const plane = new THREE.Group(); plane.name = 'plane'; group.add(plane);
  const pm = new THREE.Group(); plane.add(pm);
  const pWhite = mat('plane', '#f4f1ea', { roughness: 0.4 });
  const pRed = mat('plane', '#b3201c', { roughness: 0.4 });
  const pDark = mat('plane', '#1a1c20', { roughness: 0.7 });
  const pGlass = physical('plane', '#243040', { transparent: true, opacity: 0.85 });
  const pPts = [[0, 4.0], [0.4, 3.85], [0.62, 3.2], [0.66, 1.8], [0.58, 0], [0.42, -2], [0.24, -3.5], [0.08, -4.0], [0, -4.1]].map(p => new THREE.Vector2(p[0], p[1]));
  const pf = mesh(new THREE.LatheGeometry(pPts, low ? 10 : 16), pWhite); pf.rotation.x = PI / 2; pm.add(pf);
  const cano = mesh(new THREE.SphereGeometry(0.55, 10, 8), pGlass); cano.scale.set(0.95, 0.8, 1.6); cano.position.set(0, 0.45, 1.0); pm.add(cano);
  const pw = mesh(new THREE.BoxGeometry(10.6, 0.12, 1.5), pWhite); pw.position.set(0, 0.8, 0.9); pm.add(pw);
  const tipR = mesh(new THREE.BoxGeometry(0.9, 0.13, 1.5), pRed); tipR.position.set(4.85, 0.8, 0.9); pm.add(tipR);
  const tipL = tipR.clone(); tipL.position.x = -4.85; pm.add(tipL);
  for (const sgn of [1, -1]) {
    const strut = mesh(new THREE.BoxGeometry(0.06, 1.9, 0.1), pWhite); strut.position.set(sgn * 1.4, 0.0, 0.9); strut.rotation.z = -sgn * 0.62; pm.add(strut);
    const lg = mesh(new THREE.BoxGeometry(0.06, 0.8, 0.08), pDark); lg.position.set(sgn * 0.5, -0.8, 1.4); lg.rotation.z = sgn * 0.25; pm.add(lg);
    const wh = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), pDark); wh.rotation.z = PI / 2; wh.position.set(sgn * 0.62, -1.15, 1.4); pm.add(wh);
  }
  const nw = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), pDark); nw.rotation.z = PI / 2; nw.position.set(0, -1.0, 3.1); pm.add(nw);
  const pfin = mesh(new THREE.BoxGeometry(0.1, 1.3, 1.3), pRed); pfin.position.set(0, 0.95, -3.3); pfin.rotation.x = -0.25; pm.add(pfin);
  const pst = mesh(new THREE.BoxGeometry(3.3, 0.08, 0.85), pWhite); pst.position.set(0, 0.25, -3.5); pm.add(pst);
  const spin = mesh(new THREE.ConeGeometry(0.17, 0.4, 10), pRed); spin.rotation.x = PI / 2; spin.position.z = 4.2; pm.add(spin);
  const prop = new THREE.Group(); prop.position.z = 4.1; pm.add(prop);
  const pbl = mesh(new THREE.BoxGeometry(0.14, 2.0, 0.03), pDark); prop.add(pbl);
  const pdMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, fog: false });
  tints.plane.push({ m: pdMat, base: new THREE.Color(0xffffff) });
  prop.add(mesh(new THREE.CircleGeometry(1.0, 20), pdMat));

  // =================== HELICOPTER ===================
  const heli = new THREE.Group(); heli.name = 'heli'; group.add(heli);
  const hm = new THREE.Group(); heli.add(hm);
  const hBody = mat('heli', '#1f3b57', { roughness: 0.28, metalness: 0.4 });
  const hWhite = mat('heli', '#e8ebee', { roughness: 0.35 });
  const hDark = mat('heli', '#16181b', { roughness: 0.6, metalness: 0.4 });
  const hGlass = physical('heli', '#1a2735', { transparent: true, opacity: 0.8 });
  const hull = mesh(new THREE.SphereGeometry(1, low ? 12 : 20, low ? 8 : 14), hBody); hull.scale.set(1.15, 1.25, 2.6); hull.position.set(0, 0, 0.6); hm.add(hull);
  const glass = mesh(new THREE.SphereGeometry(1, 14, 10), hGlass); glass.scale.set(1.0, 0.85, 1.4); glass.position.set(0, 0.25, 1.7); hm.add(glass);
  const boom = mesh(new THREE.CylinderGeometry(0.16, 0.42, 6.2, 10), hBody); boom.rotation.x = PI / 2; boom.position.set(0, 0.35, -4.3); hm.add(boom);
  const hfin = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.9), hWhite); hfin.position.set(0, 1.0, -7.2); hfin.rotation.x = 0.3; hm.add(hfin);
  const hst = mesh(new THREE.BoxGeometry(1.8, 0.07, 0.5), hWhite); hst.position.set(0, 0.45, -6.5); hm.add(hst);
  const mast = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), hDark); mast.position.set(0, 1.55, 0.3); hm.add(mast);
  for (const sgn of [1, -1]) {
    const sk = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), hDark); sk.rotation.x = PI / 2; sk.position.set(sgn * 1.05, -1.5, 0.5); hm.add(sk);
    for (const zz of [-0.6, 1.5]) { const lg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), hDark); lg.position.set(sgn * 0.98, -1.1, zz); lg.rotation.z = -sgn * 0.3; hm.add(lg); }
  }
  const rotor = new THREE.Group(); rotor.position.set(0, 1.95, 0.3); hm.add(rotor);
  const bl1 = mesh(new THREE.BoxGeometry(10.8, 0.04, 0.32), hDark), bl2 = mesh(new THREE.BoxGeometry(10.8, 0.04, 0.32), hDark); bl2.rotation.y = PI / 2;
  rotor.add(bl1, bl2);
  const rdMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false });
  tints.heli.push({ m: rdMat, base: new THREE.Color(0xffffff) });
  const rd = mesh(new THREE.CircleGeometry(5.4, 28), rdMat); rd.rotation.x = -PI / 2; rotor.add(rd);
  const trot = new THREE.Group(); trot.position.set(0.25, 1.05, -7.2); hm.add(trot);
  trot.add(mesh(new THREE.BoxGeometry(0.03, 1.9, 0.12), hDark));
  const tdMat = rdMat.clone(); tints.heli.push({ m: tdMat, base: new THREE.Color(0xffffff) });
  const td = mesh(new THREE.CircleGeometry(0.95, 14), tdMat); td.rotation.y = PI / 2; trot.add(td);
  const hBeacon = light(hm, 0xff2020, 0, 2.2, -2.2, 10);

  // ---------- state ----------
  const positions = { jet: jet.position, plane: plane.position, heli: heli.position };
  let t = 0;
  const JET_Y = 1000, JET_Z = -250, JET_X0 = -9000, JET_SPAN = 18000, JET_PERIOD = 90, JET_PHASE = 0.36;
  const P0 = new THREE.Vector3(-1400, 120, 300), P1 = new THREE.Vector3(700, 120, -150),
    P2 = new THREE.Vector3(1100, 140, -700), P3 = new THREE.Vector3(-1600, 170, -1500);
  const HP = 120, HOFF = 20;
  const hPrev = new THREE.Vector3(), tmp = new THREE.Vector3();
  let hYaw = 0, hPitch = 0, hBank = 0, hInit = false;
  jet.rotation.y = PI / 2;
  const sub = (v, a, b, e) => v.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e);
  const angLerp = (a, b, k) => { let d = ((b - a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return a + d * k; };
  const kOf = (d, cap) => Math.min(cap, 1 - Math.exp(-d / 2200));

  function update(dt, frame) {
    if (dt > 0.25) dt = 0.25;
    t += dt;
    // jet
    const u = ((t / JET_PERIOD + JET_PHASE) % 1);
    jet.position.set(JET_X0 + JET_SPAN * u, JET_Y + 40 * Math.sin(t * 0.05), JET_Z);
    jet.rotation.z = 0;
    const tt = t;
    if (calm) {
      const nv = 1.6;
      lRed.m.emissiveIntensity = nv; lGrn.m.emissiveIntensity = nv; lRed.sp.material.opacity = lGrn.sp.material.opacity = 0.9;
      sTail.m.emissiveIntensity = 0; sTail.sp.material.opacity = 0;
    } else {
      const nv = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tt * 3.1));
      lRed.m.emissiveIntensity = 2 * nv; lGrn.m.emissiveIntensity = 2 * nv;
      lRed.sp.material.opacity = lGrn.sp.material.opacity = nv;
      const ph = tt % 1.3, f = (ph < 0.07 || (ph > 0.17 && ph < 0.24)) ? 1 : 0;
      sTail.m.emissiveIntensity = 6 * f; sTail.sp.material.opacity = f;
      sWing.m.emissiveIntensity = 6 * f; sWing.sp.material.opacity = f;
    }
    // prop plane: lazy elliptical circuit, banking
    const a = 0.075 * t, R = 600;
    plane.position.set(CX + R * Math.cos(a), 200 + 40 * Math.sin(a * 2.3), CZ + R * 0.85 * Math.sin(a));
    const vx = -R * Math.sin(a), vz = R * 0.85 * Math.cos(a);
    plane.rotation.order = 'YXZ';
    plane.rotation.y = Math.atan2(vx, vz);
    plane.rotation.z = 0.32 + 0.1 * Math.sin(a * 2.3);
    plane.rotation.x = -0.03 * Math.cos(a * 2.3);
    prop.rotation.z += dt * 60;

    // helicopter
    const c = (t + HOFF) % HP;
    if (c < 40) { sub(heli.position, P0, P1, c / 40); }
    else if (c < 62) { const s = (c - 40) / 22; sub(heli.position, P1, P2, 1 - (1 - s) * (1 - s)); }
    else if (c < 80) { heli.position.copy(P2); heli.position.y += 1.2 * Math.sin(t * 1.3); heli.position.x += 3 * Math.sin(t * 0.4); }
    else { const s = (c - 80) / 40; sub(heli.position, P2, P3, s * s); }
    if (!hInit) { hPrev.copy(heli.position); hInit = true; }
    const hdt = dt > 0 ? dt : 1 / 60;
    tmp.copy(heli.position).sub(hPrev).divideScalar(hdt);
    hPrev.copy(heli.position);
    const sp = Math.hypot(tmp.x, tmp.z);
    if (sp > 400) { hInit = false; } // cycle wrap
    else if (sp > 3) { hYaw = angLerp(hYaw, Math.atan2(tmp.x, tmp.z), Math.min(1, dt * 1.5)); }
    else { hYaw += dt * 0.15; }
    hPitch += (Math.min(0.2, sp * 0.004) - hPitch) * Math.min(1, dt * 2);
    heli.rotation.order = 'YXZ';
    heli.rotation.y = hYaw; heli.rotation.x = hPitch; heli.rotation.z = 0.02 * Math.sin(t * 0.9);
    rotor.rotation.y += dt * 38; trot.rotation.x += dt * 55;
    hBeacon.m.emissiveIntensity = hBeacon.sp.material.opacity = calm ? 0.8 : ((t % 1.1) < 0.12 ? 3 : 0);
    hBeacon.sp.material.opacity = hBeacon.m.emissiveIntensity > 0 ? 1 : 0;

    // aerial perspective
    const cam = frame && frame.camera;
    if (cam) {
      const cp = cam.position;
      applyTint(tints.jet, kOf(cp.distanceTo(jet.position), 0.55));
      applyTint(tints.plane, kOf(cp.distanceTo(plane.position), 0.85));
      applyTint(tints.heli, kOf(cp.distanceTo(heli.position), 0.85));
    }
  }
  update(0.016, null);

  return { group, regions: [], colliders: [], pickables: [], update, positions, onPick() {} };
}
