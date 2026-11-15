// Paper-ball basketball mini-game. See createPaperGame().
export function createPaperGame({ THREE, scene, camera, bins = [], spawns = [], groundAt, onScore, reducedMotion }) {
  const R = 0.06, G = 9.81, DRAG = 0.12, COUNT = 16, PREVIEW_N = 20;
  const IDLE = 0, HELD = 1, FLY = 2, REST = 3, SINK = 4, GONE = 5;
  const pickables = [];
  let holding = null, power = 0.6;
  const balls = [];

  // ---- texture + geometry
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#f1ede2'; cx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { const v = 200 + Math.random() * 45 | 0; cx.fillStyle = `rgba(${v},${v - 4},${v - 14},0.35)`; cx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  cx.strokeStyle = 'rgba(110,140,190,0.28)'; cx.lineWidth = 1;
  for (let y = 10; y < 128; y += 12) { cx.beginPath(); cx.moveTo(0, y + 0.5); cx.lineTo(128, y + 0.5); cx.stroke(); }
  cx.strokeStyle = 'rgba(190,90,90,0.25)'; cx.beginPath(); cx.moveTo(18.5, 0); cx.lineTo(18.5, 128); cx.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });

  const geos = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(R, 1), p = g.attributes.position, map = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4);
      let j = map.get(key);
      if (!j) { const s = 0.75 + Math.random() * 0.4; j = [s, (Math.random() - .5) * 0.012, (Math.random() - .5) * 0.012, (Math.random() - .5) * 0.012]; map.set(key, j); }
      p.setXYZ(i, p.getX(i) * j[0] + j[1], p.getY(i) * j[0] + j[2], p.getZ(i) * j[0] + j[3]);
    }
    g.computeVertexNormals(); geos.push(g);
  }

  const ground = (x, z) => { const h = groundAt ? groundAt(x, z) : 0; return (h === null || h === undefined || h !== h) ? 0 : h; };

  function place(b) {
    const s = spawns.length ? spawns[(Math.random() * spawns.length) | 0] : { x: 0, y: 0, z: 0 };
    b.pos.set(s.x + (Math.random() - .5) * 0.6, 0, s.z + (Math.random() - .5) * 0.6);
    b.pos.y = (s.y !== undefined ? s.y : ground(b.pos.x, b.pos.z)) + R;
    b.vel.set(0, 0, 0); b.spin.set(0, 0, 0);
    b.mesh.position.copy(b.pos); b.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.mesh.visible = true; b.state = IDLE; b.timer = 0; b.touched = false;
    if (b.mesh.parent !== scene) scene.add(b.mesh);
    if (!pickables.includes(b.mesh)) pickables.push(b.mesh);
  }
  function unpick(b) { const i = pickables.indexOf(b.mesh); if (i >= 0) pickables.splice(i, 1); }

  for (let i = 0; i < COUNT; i++) {
    const mesh = new THREE.Mesh(geos[i % 4], mat);
    mesh.userData.action = { type: 'custom', id: 'paperball' };
    mesh.castShadow = true;
    const b = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), state: IDLE, timer: 0, touched: false, origin: new THREE.Vector3() };
    mesh.userData.ball = b; balls.push(b); place(b);
  }

  // ---- preview dots
  const dc = document.createElement('canvas'); dc.width = dc.height = 32;
  const dx = dc.getContext('2d'); dx.fillStyle = '#fff'; dx.beginPath(); dx.arc(16, 16, 12, 0, 7); dx.fill();
  const dotTex = new THREE.CanvasTexture(dc);
  const dots = [];
  for (let i = 0; i < PREVIEW_N; i++) {
    const m = new THREE.SpriteMaterial({ map: dotTex, color: 0xfff6d8, transparent: true, opacity: 0.5, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.setScalar(0.035 * (1 - i / PREVIEW_N * 0.4)); s.visible = false; s.renderOrder = 5;
    scene.add(s); dots.push(s);
  }

  // ---- temps
  const dir = new THREE.Vector3(), cp = new THREE.Vector3(), tv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pp = new THREE.Vector3(), pv = new THREE.Vector3();
  const ANG = 25 * Math.PI / 180, CA = Math.cos(ANG), SA = Math.sin(ANG);

  function launchVel(out, pw) {
    camera.getWorldDirection(dir);
    out.copy(dir).multiplyScalar(CA).addScaledVector(up, SA).normalize().multiplyScalar(5 + 7 * pw);
  }

  function tryPickUp(object) {
    if (holding) return false;
    let o = object; while (o && !(o.userData && o.userData.ball)) o = o.parent;
    if (!o) return false;
    const b = o.userData.ball;
    if (b.state !== IDLE && b.state !== REST) return false;
    unpick(b); b.state = HELD; b.timer = 0; holding = b;
    scene.remove(b.mesh); camera.add(b.mesh);
    b.mesh.position.set(0.22, -0.2, -0.55); b.mesh.rotation.set(0.3, 0.5, 0);
    return true;
  }

  function throwBall(pw) {
    if (!holding) return;
    pw = Math.max(0, Math.min(1, pw === undefined ? power : pw));
    const b = holding; holding = null;
    camera.remove(b.mesh); scene.add(b.mesh);
    camera.getWorldPosition(cp); camera.getWorldDirection(dir);
    b.pos.copy(cp).addScaledVector(dir, 0.35); b.pos.y -= 0.05;
    b.origin.copy(cp);
    launchVel(b.vel, pw);
    b.spin.set((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14);
    b.mesh.position.copy(b.pos); b.state = FLY; b.touched = false; b.timer = 0;
    for (let i = 0; i < PREVIEW_N; i++) dots[i].visible = false;
  }

  function step(b, h) {
    const p = b.pos, v = b.vel;
    if (b.state === SINK) {
      v.y -= G * h; v.x *= 0.9; v.z *= 0.9; p.addScaledVector(v, h);
      b.timer += h;
      if (b.timer > 0.45) { b.state = GONE; b.mesh.visible = false; b.timer = 0; }
      return;
    }
    const prevY = p.y;
    v.y -= G * h;
    const k = Math.max(0, 1 - DRAG * h); v.multiplyScalar(k);
    p.addScaledVector(v, h);

    for (let i = 0; i < bins.length; i++) {
      const bn = bins[i], rimY = bn.y + bn.h;
      const ddx = p.x - bn.x, ddz = p.z - bn.z, d = Math.sqrt(ddx * ddx + ddz * ddz);
      // score: crossing rim disc downward
      if (prevY > rimY && p.y <= rimY && d < bn.r && v.y < 0) {
        b.state = SINK; b.timer = 0;
        const m = Math.max(0, bn.r - R - 0.01); if (d > m && d > 1e-4) { p.x = bn.x + ddx / d * m; p.z = bn.z + ddz / d * m; }
        v.set(0, v.y * 0.3, 0);
        if (onScore) onScore({ points: (Math.hypot(bn.x - b.origin.x, bn.z - b.origin.z) > 6 ? 3 : 2), swish: !b.touched });
        return;
      }
      // rim torus: nearest point on circle
      if (Math.abs(p.y - rimY) < R + 0.02 && d < bn.r + R + 0.02) {
        const inv = d > 1e-4 ? 1 / d : 0;
        const rx = bn.x + (d > 1e-4 ? ddx * inv : 1) * bn.r, rz = bn.z + (d > 1e-4 ? ddz * inv : 0) * bn.r;
        tv.set(p.x - rx, p.y - rimY, p.z - rz);
        const L = tv.length();
        if (L < R && L > 1e-5) {
          tv.multiplyScalar(1 / L); p.addScaledVector(tv, R - L);
          const vn = v.dot(tv);
          if (vn < 0) { v.addScaledVector(tv, -(1 + 0.55) * vn); v.multiplyScalar(0.92); b.touched = true; }
        }
      } else if (p.y < rimY - R * 0.5 && p.y > bn.y && d < bn.r + R && d > 1e-4) {
        // bin outer wall
        const nx = ddx / d, nz = ddz / d;
        p.x = bn.x + nx * (bn.r + R); p.z = bn.z + nz * (bn.r + R);
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) { v.x -= 1.5 * vn * nx; v.z -= 1.5 * vn * nz; b.touched = true; }
      }
    }

    const g = ground(p.x, p.z) + R;
    if (p.y < g) {
      p.y = g;
      if (v.y < -0.6) { v.y = -v.y * 0.45; v.x *= 0.8; v.z *= 0.8; b.touched = true; }
      else {
        v.y = 0; const f = Math.max(0, 1 - 3.0 * h); v.x *= f; v.z *= f;
        b.spin.set(v.z / R * 0.5, b.spin.y * f, -v.x / R * 0.5);
        if (v.x * v.x + v.z * v.z < 0.02) { v.set(0, 0, 0); b.spin.set(0, 0, 0); b.state = REST; b.timer = 0; return; }
      }
    }
  }

  function update(dt) {
    if (dt > 0.1) dt = 0.1;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i], s = b.state;
      if (s === FLY || s === SINK) {
        const sp = b.vel.length();
        let n = Math.ceil(sp * dt / 0.03); n = n < 1 ? 1 : n > 10 ? 10 : n;
        const h = dt / n;
        for (let j = 0; j < n && (b.state === FLY || b.state === SINK); j++) step(b, h);
        b.mesh.position.copy(b.pos);
        b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
        if (b.state === REST) {
          if (!pickables.includes(b.mesh)) pickables.push(b.mesh);
          let near = false;
          for (let k = 0; k < bins.length; k++) if (Math.hypot(b.pos.x - bins[k].x, b.pos.z - bins[k].z) < 0.8) near = true;
          b.timer = near ? -1 : 0;
        }
      } else if (s === REST) {
        if (b.timer >= 0) { b.timer += dt; if (b.timer > 4) place(b); }
      } else if (s === GONE) {
        b.timer += dt; if (b.timer > 4) place(b);
      }
    }

    // held ball bob + preview
    if (holding) {
      const t = performance.now() * 0.002;
      if (!reducedMotion) holding.mesh.position.y = -0.2 + Math.sin(t) * 0.006;
      camera.getWorldPosition(cp); camera.getWorldDirection(dir);
      pp.copy(cp).addScaledVector(dir, 0.35); pp.y -= 0.05;
      launchVel(pv, power);
      let hit = false;
      const h = 0.06;
      for (let i = 0; i < PREVIEW_N; i++) {
        if (!hit) {
          pv.y -= G * h; pv.multiplyScalar(1 - DRAG * h); pp.addScaledVector(pv, h);
          if (pp.y < ground(pp.x, pp.z) + R) hit = true;
        }
        dots[i].visible = !hit;
        if (!hit) dots[i].position.copy(pp);
      }
    }
  }

  function dispose() {
    for (const b of balls) { if (b.mesh.parent) b.mesh.parent.remove(b.mesh); }
    for (const d of dots) { scene.remove(d); d.material.dispose(); }
    geos.forEach(g => g.dispose()); mat.dispose(); tex.dispose(); dotTex.dispose();
    pickables.length = 0; holding = null;
  }

  return {
    pickables, tryPickUp, throw: throwBall, update, dispose,
    get holding() { return !!holding; },
    setPower(p) { power = Math.max(0, Math.min(1, p)); },
  };
}
