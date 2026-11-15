// The Ruins: abandoned half-collapsed brutalist pavilion NW of the campus (x -64..-34, z -47..-18).
export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group(); group.name = 'ruins';
  const colliders = [];
  const regions = [
    { minX: -34.5, maxX: -31, minZ: -20, maxZ: 17, y: 0 },
    { minX: -62, maxX: -30.5, minZ: -27, maxZ: -17.9, y: 0 },
    { minX: -58, maxX: -40, minZ: -42, maxZ: -25.9, y: 0 },
    { minX: -40.5, maxX: -33.5, minZ: -46, maxZ: -25.9, y: 0 },
  ];
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const col = (a, b, c, d, y0, y1) => colliders.push({ minX: a, maxX: b, minZ: c, maxZ: d, minY: y0, maxY: y1 });
  const mesh = (g, m, sh = true) => { const o = new THREE.Mesh(g, m); o.castShadow = sh; o.receiveShadow = true; return o; };

  const tint = (name, c, rough) => { const m = M.get(name).clone(); m.color.set(c); if (rough != null) m.roughness = rough; return m; };
  const concrete = tint('concreteWall', 0x8d8e8c);
  const floorM = tint('concreteFloor', 0x7a7b79);
  const gravelM = tint('gravel', 0x777770);
  const rust = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.95, metalness: 0.2 });
  const rebarM = new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.95, metalness: 0.4 });
  const woodM = tint('darkWood', 0x4a4038);
  const darkM = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.6 });

  function canvasTex(w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  // ---------- jagged walls ----------
  function wall(x0, z0, len, alongZ, hBase, hVar, windows, th = 0.3) {
    const n = Math.ceil(len), h = [];
    for (let i = 0; i <= n; i++) { let v = hBase + rr(-hVar, hVar); if (rnd() < 0.2) v = rr(0.7, 1.5); h.push(Math.max(0.5, v)); }
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, 0);
    for (let i = n; i >= 0; i--) {
      const x = Math.min(i * len / n, len);
      s.lineTo(x, h[i]);
      if (i > 0 && rnd() < 0.5) s.lineTo(x - 0.5 * len / n, h[i] + rr(-0.5, 0.4));
    }
    if (windows) for (let a = 1.2; a < len - 2; a += rr(2.6, 3.6)) {
      let ok = true; for (let i = Math.floor(a); i <= Math.ceil(a + 1.3); i++) if (h[Math.min(i, n)] < 2.8) ok = false;
      if (!ok) continue;
      const p = new THREE.Path(); p.moveTo(a, 0.9); p.lineTo(a, 2.3); p.lineTo(a + 1.3, 2.3); p.lineTo(a + 1.3, 0.9); p.closePath(); s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false });
    g.translate(0, 0, -th / 2);
    const m = mesh(g, concrete);
    if (alongZ) { m.rotation.y = -Math.PI / 2; m.position.set(x0, 0, z0); col(x0 - th / 2, x0 + th / 2, z0, z0 + len, 0, 5); }
    else { m.position.set(x0, 0, z0); col(x0, x0 + len, z0 - th / 2, z0 + th / 2, 0, 5); }
    group.add(m);
    return { h, n, len, x0, z0, alongZ };
  }
  const wN = wall(-58, -42, 18, false, 3.5, 0.7, true);
  const wW = wall(-58, -42, 16, true, 4.0, 0.8, true);
  wall(-58, -26, 8, false, 2.0, 0.9, false);
  wall(-47.5, -26, 7.5, false, 2.2, 1.0, false);
  wall(-40, -42, 6, true, 3.0, 0.9, true);
  wall(-40, -33, 7, true, 2.4, 1.0, false);
  const hAt = (w, i) => w.h[Math.min(i, w.n)];

  // inner partition, short broken
  wall(-52, -42, 7, true, 1.8, 0.8, false, 0.25);

  // ---------- floors / path ----------
  function slab(x0, x1, z0, z1, mat, y) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
    const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (x1 - x0), u.getY(i) * (z1 - z0));
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; group.add(m); return m;
  }
  const pathM = tint('concreteFloor', 0x6c6d6a);
  slab(-34.5, -31, -20, 17, pathM, 0.02);
  slab(-52, -31, -23, -20, pathM, 0.02);
  slab(-50.5, -47, -27, -23, pathM, 0.02);
  slab(-58, -40, -42, -26, floorM, 0.015);
  // cracks
  const crackTex = canvasTex(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(8,8,8,0.8)'; c.lineWidth = 2;
    for (let k = 0; k < 7; k++) { let x = rnd() * w, y = rnd() * h; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 12; j++) { x += (rnd() - 0.4) * 50; y += (rnd() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
  });
  const crackM = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.7 });
  for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), crackM); c.rotation.x = -Math.PI / 2; c.rotation.z = rnd() * 6; c.position.set(-33 + rr(-1, 1), 0.03, -18 + i * 3 - 3); group.add(c); }
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), crackM); c.rotation.x = -Math.PI / 2; c.rotation.z = rnd() * 6; c.position.set(rr(-57, -41), 0.025, rr(-41, -27)); group.add(c); }

  // ---------- roof slab tilted into interior ----------
  const ang = Math.atan2(2.7, 11);
  const roof = mesh(new THREE.BoxGeometry(12, 0.3, 11.2), concrete); M.boxUV(roof.geometry);
  roof.position.set(-50, 2.3, -36); roof.rotation.x = ang; roof.rotation.z = 0.04; group.add(roof);
  col(-56, -44, -33.2, -30.4, 0, 2.3);
  // rebar from slab edge and wall tops
  const rebarCount = low ? 40 : 90;
  const rebarG = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  const rebar = new THREE.InstancedMesh(rebarG, rebarM, rebarCount);
  const o = new THREE.Object3D();
  for (let i = 0; i < rebarCount; i++) {
    const L = rr(0.4, 1.2);
    if (i < 30) { o.position.set(-56 + rnd() * 12, 2.3 - 1.35 + rr(-0.1, 0.1), -30.5 + 0.1); o.rotation.set(Math.PI / 2 + rr(-0.5, 0.5), 0, rr(-0.4, 0.4)); }
    else {
      const w = i % 2 ? wN : wW; const k = Math.floor(rnd() * w.n); const t = hAt(w, k);
      if (w.alongZ) o.position.set(w.x0 + rr(-0.1, 0.1), t + L * 0.4, w.z0 + k * w.len / w.n);
      else o.position.set(w.x0 + k * w.len / w.n, t + L * 0.4, w.z0 + rr(-0.1, 0.1));
      o.rotation.set(rr(-0.4, 0.4), 0, rr(-0.4, 0.4));
    }
    o.scale.set(1, L, 1); o.updateMatrix(); rebar.setMatrixAt(i, o.matrix);
  }
  rebar.castShadow = true; group.add(rebar);

  // ---------- rubble ----------
  const piles = [[-45, -30, 1.6], [-56, -28, 1.2], [-41.5, -39, 1.4], [-37, -30, 1.0], [-54, -24, 1.0]];
  const rubN = low ? 90 : 220;
  const rub = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 0), concrete, rubN);
  for (let i = 0; i < rubN; i++) {
    const p = piles[i % piles.length], a = rnd() * 6.28, d = Math.sqrt(rnd()) * p[2], s = rr(0.3, 1.1) * (1.1 - d / p[2] * 0.5);
    o.position.set(p[0] + Math.cos(a) * d, 0.1 + s * 0.12 + (1 - d / p[2]) * 0.4, p[1] + Math.sin(a) * d);
    o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.scale.set(s, s * rr(0.5, 1), s * rr(0.7, 1.2)); o.updateMatrix(); rub.setMatrixAt(i, o.matrix);
  }
  rub.castShadow = rub.receiveShadow = true; group.add(rub);
  for (const p of piles) col(p[0] - p[2] * 0.7, p[0] + p[2] * 0.7, p[1] - p[2] * 0.7, p[1] + p[2] * 0.7, 0, 0.9);

  // ---------- plants ----------
  const leafTex = canvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = 20 + rnd() * 216, y = 20 + rnd() * 216, r = 14 + rnd() * 16;
      c.fillStyle = `hsl(${85 + rnd() * 30},${22 + rnd() * 12}%,${20 + rnd() * 14}%)`;
      c.save(); c.translate(x, y); c.rotate(rnd() * 6.28); c.beginPath(); c.ellipse(0, 0, r, r * 0.5, 0, 0, 6.28); c.fill(); c.restore();
    }
  });
  const leafM = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const weedN = low ? 60 : 160, weeds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7), leafM, weedN);
  for (let i = 0; i < weedN; i++) {
    const p = piles[i % 5];
    const nearWall = i % 3 === 0;
    const x = nearWall ? rr(-58, -40) : p[0] + rr(-2, 2), z = nearWall ? (rnd() < 0.5 ? -41.6 : -26.4) : p[1] + rr(-2, 2);
    o.position.set(x, 0.3, z); o.rotation.set(0, rnd() * 3.14, rr(-0.2, 0.2)); const s = rr(0.7, 1.6); o.scale.set(s, s, s); o.updateMatrix(); weeds.setMatrixAt(i, o.matrix);
  }
  group.add(weeds);
  const ivyN = low ? 14 : 36, ivy = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1), leafM, ivyN);
  for (let i = 0; i < ivyN; i++) {
    if (i % 2) o.position.set(rr(-57, -50), rr(0.6, 2.6), -41.82); else o.position.set(-57.82, rr(0.6, 2.6), rr(-41, -30));
    o.rotation.set(0, i % 2 ? 0 : Math.PI / 2, rr(-0.3, 0.3)); o.scale.setScalar(rr(0.8, 1.5)); o.updateMatrix(); ivy.setMatrixAt(i, o.matrix);
  }
  group.add(ivy);

  // ---------- puddles ----------
  const puddleM = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -3 });
  [[-48, -30, 1.1], [-53, -38, 0.8], [-43, -35, 0.6], [-49, -22, 1.2], [-40, -21.5, 0.7], [-33, -5, 0.8]].forEach(([x, z, r]) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 18), puddleM); p.rotation.x = -Math.PI / 2; p.scale.y = rr(0.6, 1); p.position.set(x, 0.035, z); p.receiveShadow = true; group.add(p);
  });

  // ---------- graffiti ----------
  const gTex = canvasTex(512, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.lineCap = 'round'; c.globalAlpha = 0.55;
    const cols = ['#9a3a2e', '#3a6a7a', '#b0a050', '#ccc'];
    for (let k = 0; k < 6; k++) {
      c.strokeStyle = cols[k % 4]; c.lineWidth = 6 + rnd() * 10; c.beginPath(); c.moveTo(rnd() * w, rnd() * h);
      c.bezierCurveTo(rnd() * w, rnd() * h, rnd() * w, rnd() * h, rnd() * w, rnd() * h); c.stroke();
    }
    c.lineWidth = 5; c.beginPath(); c.arc(380, 120, 50, 0, 6.28); c.stroke(); c.moveTo(340, 80); c.lineTo(420, 160); c.moveTo(420, 80); c.lineTo(340, 160); c.stroke();
  });
  const gM = new THREE.MeshBasicMaterial({ map: gTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.6, color: 0x999999 });
  [[-53, 1.3, -41.83, 0, 3, 1.5], [-46, 1.2, -41.83, 0, 2.4, 1.2], [-57.83, 1.4, -37, Math.PI / 2, 3, 1.5], [-47, 1, -25.83, Math.PI, 2.2, 1.1]].forEach(([x, y, z, ry, w, h]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gM); p.position.set(x, y, z); p.rotation.y = ry; group.add(p);
  });

  // ---------- car wreck ----------
  const car = new THREE.Group(); car.position.set(-44, 0, -22.8 - 0.0); car.rotation.y = 0.35;
  const part = (w, h, d, x, y, z, m = rust) => { const b = mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); car.add(b); return b; };
  part(4.3, 0.55, 1.75, 0, 0.45, 0); part(2.0, 0.5, 1.6, -0.2, 0.98, 0); part(2.1, 0.08, 1.6, -0.2, 1.26, 0);
  part(1.2, 0.08, 1.7, 1.45, 0.78, 0).rotation.z = -0.06; part(0.9, 0.08, 1.7, -1.75, 0.76, 0);
  [[0.9, -0.2], [-1.1, -0.2]].forEach(() => {});
  part(0.05, 0.4, 1.5, 0.82, 0.98, 0, darkM); part(0.05, 0.4, 1.5, -1.22, 0.98, 0, darkM);
  part(1.9, 0.4, 0.05, -0.2, 0.98, 0.8, darkM); part(1.9, 0.4, 0.05, -0.2, 0.98, -0.8, darkM);
  for (const [x, z] of [[1.4, 0.85], [1.4, -0.85], [-1.4, 0.85], [-1.4, -0.85]]) {
    const r = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 12), darkM); r.rotation.x = Math.PI / 2; r.position.set(x, 0.26, z * 1.02); car.add(r);
  }
  group.add(car);
  col(-46.4, -41.6, -24.6, -21, 0, 1.3);

  // ---------- chairs ----------
  const chairG = [new THREE.BoxGeometry(0.4, 0.04, 0.4), new THREE.BoxGeometry(0.4, 0.45, 0.04), new THREE.BoxGeometry(0.03, 0.45, 0.03)];
  const chairM = new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.7, metalness: 0.5 });
  [[-54, -32, 1.4, true], [-53.2, -33.5, 0.3, false], [-47, -38, 2, true], [-42.5, -33, 4, true], [-55, -39, 0.8, true], [-50, -29, 5, false]].forEach(([x, z, ry, tip]) => {
    const c = new THREE.Group();
    const s = mesh(chairG[0], chairM); s.position.y = 0.45; c.add(s);
    const b = mesh(chairG[1], chairM); b.position.set(0, 0.7, -0.18); c.add(b);
    for (const [lx, lz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) { const l = mesh(chairG[2], chairM); l.position.set(lx, 0.22, lz); c.add(l); }
    c.position.set(x, 0, z); c.rotation.y = ry;
    if (tip) { c.rotation.z = Math.PI / 2; c.position.y = 0.22; }
    group.add(c);
  });

  // ---------- trolley (on its side) ----------
  const tr = new THREE.Group(); tr.position.set(-36, 0.4, -27); tr.rotation.set(0, 0.6, Math.PI / 2 + 0.1);
  const bar = (w, h, d, x, y, z) => { const b = mesh(new THREE.BoxGeometry(w, h, d), rebarM); b.position.set(x, y, z); tr.add(b); };
  bar(0.9, 0.02, 0.55, 0, 0, 0); bar(0.9, 0.02, 0.02, 0, 0.5, 0.27); bar(0.9, 0.02, 0.02, 0, 0.5, -0.27);
  for (let i = -4; i <= 4; i++) { bar(0.015, 0.5, 0.015, i * 0.1, 0.25, 0.27); bar(0.015, 0.5, 0.015, i * 0.1, 0.25, -0.27); }
  bar(0.02, 0.5, 0.55, -0.45, 0.25, 0); bar(0.02, 0.02, 0.6, -0.5, 0.9, 0);
  group.add(tr);

  // ---------- dead tree ----------
  const tree = new THREE.Group(); tree.position.set(-61, 0, -23);
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, 4.2, 7), woodM); trunk.position.y = 2.1; tree.add(trunk);
  for (let i = 0; i < 9; i++) {
    const L = rr(1, 2.2), b = mesh(new THREE.CylinderGeometry(0.015, 0.07, L, 5), woodM), a = i * 2.4, ph = 0.8 + rnd() * 0.5;
    b.position.set(Math.cos(a) * L * 0.35, 2.4 + i * 0.25, Math.sin(a) * L * 0.35); b.rotation.set(Math.sin(a) * ph, 0, -Math.cos(a) * ph); tree.add(b);
  }
  group.add(tree); col(-61.4, -60.6, -23.4, -22.6, 0, 4);

  // ---------- fence + sign ----------
  for (let x = -62; x <= -52; x += 1.6) {
    const p = mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), woodM); p.position.set(x, 0.65, -21); p.rotation.z = rr(-0.12, 0.12); group.add(p);
    if (x < -52) { const r = mesh(new THREE.BoxGeometry(1.6, 0.1, 0.04), woodM); r.position.set(x + 0.8, 0.5 + rr(-0.1, 0.4), -21); r.rotation.z = rr(-0.2, 0.2); group.add(r); }
  }
  col(-62.1, -51.9, -21.15, -20.85, 0, 1.3);
  for (let x = -46; x <= -44; x += 1.6) { const p = mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), woodM); p.position.set(x, 0.65, -21); p.rotation.z = 0.2; group.add(p); }
  const signTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#7a2a22'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ddd'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#ddd'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText('KEEP', w / 2, 55); c.fillText('OUT', w / 2, 105);
    c.fillStyle = 'rgba(40,30,20,0.45)'; for (let i = 0; i < 80; i++) c.fillRect(rnd() * w, rnd() * h, 6, 6);
  });
  const pivot = new THREE.Group(); pivot.position.set(-56.5, 1.15, -21.1);
  const sign = mesh(new THREE.BoxGeometry(0.7, 0.35, 0.02), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8, metalness: 0.3 })); sign.position.set(-0.3, -0.18, 0); pivot.add(sign);
  pivot.rotation.z = -0.9; group.add(pivot);

  // ---------- lights: fluorescent + hanging lamp ----------
  const tubeM = new THREE.MeshStandardMaterial({ color: 0x223028, emissive: 0xbfe8ff, emissiveIntensity: 1.5, roughness: 0.4 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), tubeM); tube.rotation.z = Math.PI / 2; tube.position.set(-55, 3.0, -40.8); group.add(tube);
  const housing = mesh(new THREE.BoxGeometry(1.3, 0.05, 0.12), rust); housing.position.set(-55, 3.06, -40.8); group.add(housing);
  const tubeLight = new THREE.PointLight(0xaee0ff, 6, 9, 1.6); tubeLight.position.set(-55, 2.7, -40.2); group.add(tubeLight);
  const lamp = new THREE.Group(); lamp.position.set(-47, 3.3, -39);
  const cord = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), darkM, false); cord.position.y = -0.6; lamp.add(cord);
  const shade = mesh(new THREE.ConeGeometry(0.22, 0.2, 12, 1, true), rust); shade.material = rust.clone(); shade.material.side = THREE.DoubleSide; shade.position.y = -1.25; lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x887755, emissiveIntensity: 0.6 })); bulb.position.y = -1.3; lamp.add(bulb);
  group.add(lamp);
  // roof-support dark stand-in so the interior reads cold: nothing else added

  // ---------- mist ----------
  const mistTex = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(150,158,165,0.9)'); g.addColorStop(1, 'rgba(150,158,165,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const mists = [];
  const mistN = low ? 3 : 6;
  for (let i = 0; i < mistN; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rr(5, 8), rr(5, 8)), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.16, depthWrite: false, color: 0x8a949a }));
    m.rotation.x = -Math.PI / 2; m.position.set(rr(-56, -42), 0.25 + i * 0.12, rr(-40, -27)); m.userData.bx = m.position.x; m.userData.ph = rnd() * 6; group.add(m); mists.push(m);
  }

  // ---------- crows ----------
  const crowM = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6 });
  const crows = [], crowBody = new THREE.SphereGeometry(0.11, 8, 6), crowHead = new THREE.SphereGeometry(0.06, 6, 5), beakG = new THREE.ConeGeometry(0.02, 0.09, 4);
  for (let i = 0; i < 5; i++) {
    const k = 3 + i * 3, c = new THREE.Group();
    const b = mesh(crowBody, crowM); b.scale.set(1, 0.8, 1.6); c.add(b);
    const hd = mesh(crowHead, crowM); hd.position.set(0, 0.08, 0.16); c.add(hd);
    const bk = mesh(beakG, crowM); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.07, 0.24); c.add(bk);
    const w = i < 3 ? wN : wW;
    const y = hAt(w, k) + 0.1;
    if (w.alongZ) c.position.set(w.x0, y, w.z0 + k), c.rotation.y = rnd() * 6; else c.position.set(w.x0 + k, y, w.z0), c.rotation.y = rnd() * 6;
    c.userData = { y, t: rr(1, 6), hop: 0 }; group.add(c); crows.push(c);
  }

  // ---------- update ----------
  let fl = 0, flOn = 1, tt = 0;
  const still = !!ctx.reducedMotion;
  function update(dt, frame) {
    const t = (frame && frame.time != null) ? frame.time : (tt += dt);
    if (!still) {
      fl -= dt;
      if (fl <= 0) {
        if (rnd() < 0.55) { flOn = 1; fl = rr(0.4, 3); } else { flOn = rnd() < 0.5 ? 0.05 : 0.5; fl = rr(0.03, 0.14); }
      }
      tubeM.emissiveIntensity = 1.5 * flOn; tubeLight.intensity = 6 * flOn;
    }
    lamp.rotation.z = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 0.37) * 0.03; lamp.rotation.x = Math.sin(t * 0.63) * 0.03;
    pivot.rotation.z = -0.9 + Math.sin(t * 0.7) * 0.03;
    for (let i = 0; i < mists.length; i++) {
      const m = mists[i], u = m.userData;
      m.position.x = u.bx + Math.sin(t * 0.06 + u.ph) * 1.8; m.rotation.z = t * 0.01 + u.ph; m.material.opacity = 0.14 + 0.05 * Math.sin(t * 0.2 + u.ph);
    }
    if (!still) for (let i = 0; i < crows.length; i++) {
      const c = crows[i], u = c.userData; u.t -= dt;
      if (u.t <= 0) { u.hop = 1; u.t = rr(3, 10); c.rotation.y += rr(-1, 1); }
      if (u.hop > 0) { u.hop = Math.max(0, u.hop - dt * 3); c.position.y = u.y + Math.sin((1 - u.hop) * Math.PI) * 0.15; }
    }
  }
  return { group, regions, colliders, pickables: [], update };
}
