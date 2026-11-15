// Roof terrace over the hall (level 1, y = 7.2). BRIEF §5.4 / §6.
// Hardwood deck, sandstone coping, frameless glass balustrade with steel rail,
// the skylight lantern, corten planters with swaying grasses, a multi-stem tree,
// two benches and low step-lights. World coordinates, metres.

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'terrace';
  const Y = 7.2;
  const X0 = -6.9, X1 = 6.9, Z0 = 5.4, Z1 = 17.4;

  // ---- deterministic random ----------------------------------------------------
  let seed = 1337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + (b - a) * rnd();

  // ---- helpers -----------------------------------------------------------------
  const tmp = new THREE.Object3D();
  function box(w, h, d, x, y, z, mat, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (opts.rotX) g.rotateX(opts.rotX);
    g.translate(x, y, z);                 // bake so boxUV sees world-scale metres
    if (!opts.noUV) M.boxUV(g, opts.uv);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    (opts.parent || group).add(m);
    return m;
  }
  function tube(r, len, mat, x, y, z, axis, parent) {
    const g = new THREE.CylinderGeometry(r, r, len, 12);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || group).add(m);
    return m;
  }

  // ---- materials ---------------------------------------------------------------
  const matDeck = M.get('deck', { color: 0xc9bfae, roughness: 0.85 });
  const matStone = M.get('whiteSandstone');
  const matSteel = M.get('steel', { roughness: 0.28, color: 0xdfe3e6 });
  const matDarkSteel = M.get('steel', { roughness: 0.5, color: 0x3a3e42 });
  const matCorten = new THREE.MeshStandardMaterial({ color: 0xa4562c, roughness: 0.82, metalness: 0.2, envMapIntensity: 0.8 });
  const matSoil = M.get('gravel', { color: 0x4a3f36, tile: 0.8 });
  const matBark = M.get('bark', { color: 0xb8a690 });
  const matOakSeat = M.get('oakPlanks', { color: 0xd9c4a6 });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4efe6, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2,
    envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5,
    specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  const glassEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x6fae95, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.75,
  });
  const frostedMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f6f0, emissive: 0xb9d4c2, emissiveIntensity: 0.38, roughness: 0.55,
    metalness: 0, transparent: true, opacity: 0.82, envMapIntensity: 1.2,
    clearcoat: 0.6, clearcoatRoughness: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b, emissive: 0xffd49a, emissiveIntensity: 4, roughness: 0.4,
  });

  // ---- deck + coping -------------------------------------------------------------
  const deckW = X1 - X0, deckD = Z1 - Z0;
  // deck in four pieces, leaving the lift opening x 3.2..5.4, z 14.9..16.95 clear
  {
    const pieces = [[X0, 3.2, Z0, Z1], [5.4, X1, Z0, Z1], [3.2, 5.4, Z0, 14.9], [3.2, 5.4, 16.95, Z1]];
    for (const [xa, xb, za, zb] of pieces) {
      const g = new THREE.BoxGeometry(xb - xa, 0.09, zb - za);
      g.translate((xa + xb) / 2, Y - 0.045 + 0.004, (za + zb) / 2);
      M.boxUV(g);
      const m = new THREE.Mesh(g, matDeck);
      m.receiveShadow = true; m.castShadow = false;
      group.add(m);
    }
  }
  // slim sandstone coping around the three open edges (inside x ±6.9, z 17.4)
  const cw = 0.22, ch = 0.07;
  box(cw, ch, deckD, X0 + cw / 2, Y + ch / 2, (Z0 + Z1) / 2, matStone, { uv: { scale: 1 } });
  box(cw, ch, deckD, X1 - cw / 2, Y + ch / 2, (Z0 + Z1) / 2, matStone);
  box(deckW - 2 * cw, ch, cw, 0, Y + ch / 2, Z1 - cw / 2, matStone);
  // dark shadow gap line where deck meets the facade
  box(deckW, 0.02, 0.05, 0, Y + 0.01, Z0 + 0.025, matDarkSteel);

  // ---- glass balustrade (set back 0.15 from the edge, h 1.1) -------------------
  {
    const bx = X1 - 0.15, bz = Z1 - 0.15;
    const baseY = Y + ch;                  // glass starts on the coping
    const gh = 1.1 - ch - 0.04;
    const railY = Y + 1.1;
    const panelGeo = new THREE.BoxGeometry(1, gh, 0.014);
    const edgeGeo = new THREE.BoxGeometry(1, gh, 0.016);
    // panels along x = ±bx (z from 5.55 to 17.25) and along z = bz (x from -bx to bx)
    const runs = [
      { axis: 'z', fixed: -bx, a: Z0 + 0.1, b: bz },
      { axis: 'z', fixed: bx, a: Z0 + 0.1, b: bz },
      { axis: 'x', fixed: bz, a: -bx, b: bx },
    ];
    let count = 0;
    const plan = runs.map((r) => { const len = r.b - r.a; const n = Math.ceil(len / 1.6); count += n; return { ...r, n, len }; });
    const panels = new THREE.InstancedMesh(panelGeo, glassMat, count);
    const edges = new THREE.InstancedMesh(edgeGeo, glassEdgeMat, count * 2);
    panels.renderOrder = 2;
    let pi = 0, ei = 0;
    const spigotGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12);
    const spigots = new THREE.InstancedMesh(spigotGeo, matSteel, count * 4);
    let si = 0;
    for (const r of plan) {
      const w = r.len / r.n;
      for (let i = 0; i < r.n; i++) {
        const c = r.a + w * (i + 0.5);
        const pw = w - 0.03;
        tmp.rotation.set(0, r.axis === 'z' ? Math.PI / 2 : 0, 0);
        tmp.scale.set(pw, 1, 1);
        tmp.position.set(r.axis === 'z' ? r.fixed : c, baseY + 0.045 + gh / 2, r.axis === 'z' ? c : r.fixed);
        tmp.updateMatrix(); panels.setMatrixAt(pi++, tmp.matrix);
        // green polished edge strips (top and bottom of each pane, slightly proud)
        for (const dy of [-gh / 2 + 0.006, gh / 2 - 0.006]) {
          tmp.scale.set(pw, 0.012 / gh, 1);
          tmp.position.y = baseY + 0.045 + gh / 2 + dy;
          tmp.updateMatrix(); edges.setMatrixAt(ei++, tmp.matrix);
        }
        // two spigot clamps per pane
        tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
        for (const o of [-pw * 0.3, pw * 0.3]) {
          for (const side of [-0.0]) {
            tmp.position.set(r.axis === 'z' ? r.fixed : c + o, baseY + 0.045, r.axis === 'z' ? c + o : r.fixed);
            tmp.updateMatrix(); spigots.setMatrixAt(si++, tmp.matrix);
          }
        }
      }
    }
    panels.count = pi; edges.count = ei; spigots.count = si;
    panels.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = spigots.instanceMatrix.needsUpdate = true;
    spigots.castShadow = true;
    group.add(panels, edges, spigots);
    // continuous stainless top rail + corner spheres
    const r = 0.026;
    tube(r, bz - (Z0 + 0.1), matSteel, -bx, railY, (Z0 + 0.1 + bz) / 2, 'z');
    tube(r, bz - (Z0 + 0.1), matSteel, bx, railY, (Z0 + 0.1 + bz) / 2, 'z');
    tube(r, 2 * bx, matSteel, 0, railY, bz, 'x');
    for (const sx of [-bx, bx]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 12, 8), matSteel);
      s.position.set(sx, railY, bz); group.add(s);
      // end post against the façade
      tube(0.03, 1.1, matSteel, sx, Y + 0.55, Z0 + 0.08, 'y');
    }
    // end caps of rails near façade
    for (const sx of [-bx, bx]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 12, 8), matSteel);
      s.position.set(sx, railY, Z0 + 0.1); group.add(s);
    }
  }

  // ---- skylight lantern -----------------------------------------------------------
  {
    const lx = 1.8, z0 = 7.0, z1 = 15.0, uh = 0.9, t = 0.24;
    const zc = (z0 + z1) / 2;
    const lenZ = z1 - z0;
    // stone upstand (4 walls)
    box(t, uh, lenZ, -lx + t / 2, Y + uh / 2, zc, matStone);
    box(t, uh, lenZ, lx - t / 2, Y + uh / 2, zc, matStone);
    box(2 * lx - 2 * t, uh, t, 0, Y + uh / 2, z0 + t / 2, matStone);
    box(2 * lx - 2 * t, uh, t, 0, Y + uh / 2, z1 - t / 2, matStone);
    // brushed steel cap flashing
    const capT = 0.03;
    box(0.3, capT, lenZ + 0.06, -lx + t / 2, Y + uh + capT / 2, zc, matSteel, { noUV: true });
    box(0.3, capT, lenZ + 0.06, lx - t / 2, Y + uh + capT / 2, zc, matSteel, { noUV: true });
    box(2 * lx - 0.6, capT, 0.3, 0, Y + uh + capT / 2, z0 + t / 2, matSteel, { noUV: true });
    box(2 * lx - 0.6, capT, 0.3, 0, Y + uh + capT / 2, z1 - t / 2, matSteel, { noUV: true });
    // dark reveal at foot
    box(2 * lx + 0.04, 0.03, lenZ + 0.04, 0, Y + 0.015, zc, matDarkSteel, { noUV: true, cast: false });

    // sloped frosted glass: two slopes rising to a ridge along z, glazed gable ends
    const iw = lx - t + 0.03;            // inner half width at the eave
    const eaveY = Y + uh + capT;
    const rise = 0.62;
    const ridgeY = eaveY + rise;
    const rz0 = z0 + t - 0.02, rz1 = z1 - t + 0.02;
    const slopeLen = Math.hypot(iw, rise);
    const ang = Math.atan2(rise, iw);
    const nPane = 5;                     // glazing bars along z
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(slopeLen, 0.018, rz1 - rz0);
      const m = new THREE.Mesh(g, frostedMat);
      m.position.set(s * iw / 2, eaveY + rise / 2 + 0.01, (rz0 + rz1) / 2);
      m.rotation.z = -s * ang;
      m.renderOrder = 1;
      group.add(m);
      // rafters along the slope
      const bars = nPane + 1;
      for (let i = 0; i <= bars; i++) {
        const z = rz0 + ((rz1 - rz0) * i) / bars;
        const b = new THREE.Mesh(new THREE.BoxGeometry(slopeLen + 0.04, 0.045, 0.04), matSteel);
        b.position.set(s * iw / 2, eaveY + rise / 2 + 0.035, z);
        b.rotation.z = -s * ang;
        b.castShadow = true;
        group.add(b);
      }
      // cross muntins
      for (let k = 1; k < 3; k++) {
        const f = k / 3;
        const px = s * (iw * (1 - f)), py = eaveY + rise * f + 0.035;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, rz1 - rz0), matSteel);
        b.position.set(px, py, (rz0 + rz1) / 2);
        b.rotation.z = -s * ang;
        group.add(b);
      }
    }
    // ridge beam
    box(0.07, 0.07, rz1 - rz0 + 0.06, 0, ridgeY + 0.03, zc, matSteel, { noUV: true });
    // gable triangles (frosted)
    const tri = new THREE.Shape();
    tri.moveTo(-iw, 0); tri.lineTo(iw, 0); tri.lineTo(0, rise); tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri);
    for (const z of [rz0, rz1]) {
      const m = new THREE.Mesh(triGeo, frostedMat);
      m.position.set(0, eaveY, z);
      m.renderOrder = 1;
      group.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2 * iw + 0.02, 0.04, 0.05), matSteel);
      edge.position.set(0, eaveY + 0.02, z);
      group.add(edge);
    }
    // emissive diffuser underlay so the lantern reads as lit from the hall below
    const under = new THREE.Mesh(new THREE.PlaneGeometry(2 * iw, rz1 - rz0), new THREE.MeshBasicMaterial({ color: 0xc9dccd, transparent: true, opacity: 0.55, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, eaveY - 0.04, zc);
    under.renderOrder = 0;
    group.add(under);
    // step-lights recessed in the upstand foot
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      box(0.04, 0.03, 0.18, s * (lx + 0.005), Y + 0.14, z0 + 0.8 + i * 1.6, lightMat, { noUV: true, cast: false, receive: false });
    }
  }

  // ---- planters with ornamental grasses -----------------------------------------
  const colliders = [];
  const grassSpots = [];                  // {x0,x1,z0,z1,top,n}
  function planter(x0, x1, z0, z1, h = 0.62) {
    const t = 0.05, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(w, h, t, cx, Y + h / 2, z0 + t / 2, matCorten);
    box(w, h, t, cx, Y + h / 2, z1 - t / 2, matCorten);
    box(t, h, d - 2 * t, x0 + t / 2, Y + h / 2, cz, matCorten);
    box(t, h, d - 2 * t, x1 - t / 2, Y + h / 2, cz, matCorten);
    box(w, 0.06, d, cx, Y + 0.03, cz, matCorten, { cast: false });
    // soil
    const soilTop = Y + h - 0.07;
    box(w - 2 * t, soilTop - Y - 0.06, d - 2 * t, cx, (soilTop + Y + 0.06) / 2, cz, matSoil, { cast: false });
    // folded lip
    box(w + 0.02, 0.025, 0.07, cx, Y + h + 0.0125, z0 + 0.035, matCorten, { noUV: true });
    box(w + 0.02, 0.025, 0.07, cx, Y + h + 0.0125, z1 - 0.035, matCorten, { noUV: true });
    box(0.07, 0.025, d, x0 + 0.035, Y + h + 0.0125, cz, matCorten, { noUV: true });
    box(0.07, 0.025, d, x1 - 0.035, Y + h + 0.0125, cz, matCorten, { noUV: true });
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: Y, maxY: Y + h + 0.1 });
    return { cx, cz, w, d, soilTop };
  }
  const PL = [
    planter(-6.65, -6.05, 6.6, 13.6),
    planter(6.05, 6.65, 6.6, 13.6),
    planter(-6.65, -5.3, 15.75, 17.1, 0.5),   // tree planter
    planter(0.9, 2.2, 16.45, 17.1, 0.5),      // short front planter near the lift
  ];
  // step-lights along planter foot
  for (const x of [-6.03, 6.03]) for (let i = 0; i < 4; i++) {
    box(0.04, 0.03, 0.2, x, Y + 0.12, 7.4 + i * 1.8, lightMat, { noUV: true, cast: false, receive: false });
  }

  // grass blades: tapered curved ribbons, instanced
  {
    const segs = 4;
    const pos = [], idx = [], gcol = [];
    for (let i = 0; i <= segs; i++) {
      const f = i / segs, w = 0.014 * (1 - f * 0.92);
      const bend = f * f * 0.35;
      pos.push(-w, f, bend, w, f, bend);
      const c = 0.35 + f * 0.65;
      gcol.push(c, c, c, c, c, c);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    bg.setIndex(idx);
    bg.computeVertexNormals();
    const uniforms = { uTime: { value: 0 } };
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    gm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float wph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
        float sway = sin(uTime * 1.4 + wph) * 0.5 + sin(uTime * 2.3 + wph * 1.9) * 0.25;
        transformed.x += sway * position.y * position.y * 0.12;
        transformed.z += cos(uTime * 1.1 + wph) * position.y * position.y * 0.07;
      `);
    };
    const total = PL.slice(0, 2).reduce((s, p) => s + p.w * p.d, 0) + PL[3].w * PL[3].d;
    const perM2 = low ? 350 : 1100;
    const nBlades = Math.floor(total * perM2);
    const blades = new THREE.InstancedMesh(bg, gm, nBlades);
    blades.castShadow = false; blades.receiveShadow = true; blades.frustumCulled = false;
    const col = new THREE.Color();
    const tones = [0x6f8a3c, 0x8da04a, 0xa9a85a, 0xc4b36a, 0x5b7a38];
    let k = 0;
    for (const p of [PL[0], PL[1], PL[3]]) {
      const n = Math.floor(p.w * p.d * perM2);
      // clumps give the natural mounded look
      const clumps = Math.max(4, Math.floor(p.w * p.d * 5));
      const cl = [];
      for (let c = 0; c < clumps; c++) cl.push([rr(-p.w / 2 + 0.08, p.w / 2 - 0.08), rr(-p.d / 2 + 0.08, p.d / 2 - 0.08), rr(0.45, 1.1), tones[(rnd() * tones.length) | 0]]);
      for (let i = 0; i < n && k < nBlades; i++) {
        const c = cl[(rnd() * cl.length) | 0];
        const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * 0.26;
        tmp.position.set(p.cx + THREE.MathUtils.clamp(c[0] + Math.cos(a) * rad, -p.w / 2 + 0.04, p.w / 2 - 0.04), p.soilTop - 0.01,
          p.cz + THREE.MathUtils.clamp(c[1] + Math.sin(a) * rad, -p.d / 2 + 0.04, p.d / 2 - 0.04));
        tmp.rotation.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.35);
        const hgt = c[2] * (0.75 + rnd() * 0.5);
        tmp.scale.set(1, hgt, 1);
        tmp.updateMatrix();
        blades.setMatrixAt(k, tmp.matrix);
        col.setHex(c[3]).offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
        blades.setColorAt(k, col);
        k++;
      }
    }
    blades.count = k;
    blades.instanceMatrix.needsUpdate = true;
    if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
    group.add(blades);
    group._grass = uniforms;
  }

  // ---- multi-stem tree in the SW corner planter -----------------------------------
  {
    const p = PL[2];
    const tree = new THREE.Group();
    tree.position.set(p.cx, p.soilTop, p.cz);
    group.add(tree);
    const leafMat = M.get('leaves', { color: 0xb4d072, tile: 0.7, roughness: 0.85 });
    const stems = 4;
    const blobGeo = new THREE.IcosahedronGeometry(1, low ? 1 : 2);
    const nBlobs = low ? 26 : 60;
    const blobs = new THREE.InstancedMesh(blobGeo, leafMat, nBlobs);
    blobs.castShadow = true; blobs.receiveShadow = true;
    let b = 0;
    for (let s = 0; s < stems; s++) {
      const a = (s / stems) * Math.PI * 2 + rr(-0.3, 0.3);
      const lean = 0.18 + rnd() * 0.12;
      const hgt = rr(2.0, 2.7);
      const steps = 6;
      let px = 0, pz = 0, py = 0;
      for (let i = 0; i < steps; i++) {
        const f0 = i / steps, f1 = (i + 1) / steps;
        const x1 = Math.cos(a) * lean * hgt * f1 * f1 * 1.3, z1 = Math.sin(a) * lean * hgt * f1 * f1 * 1.3, y1 = hgt * f1;
        const dx = x1 - px, dy = y1 - py, dz = z1 - pz, len = Math.hypot(dx, dy, dz);
        const r0 = 0.055 * (1 - f0 * 0.7), r1 = 0.055 * (1 - f1 * 0.7);
        const cg = new THREE.CylinderGeometry(r1, r0, len, 8);
        const cm = new THREE.Mesh(cg, matBark);
        cm.position.set((px + x1) / 2, (py + y1) / 2, (pz + z1) / 2);
        cm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
        cm.castShadow = true;
        tree.add(cm);
        px = x1; py = y1; pz = z1;
      }
      const per = Math.floor(nBlobs / stems);
      for (let i = 0; i < per && b < nBlobs; i++) {
        const rad = rr(0.22, 0.45);
        tmp.position.set(px + rr(-0.75, 0.75), py + rr(-0.45, 0.65), pz + rr(-0.75, 0.75));
        tmp.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
        tmp.scale.set(rad, rad * 0.8, rad);
        tmp.updateMatrix();
        blobs.setMatrixAt(b++, tmp.matrix);
      }
    }
    blobs.count = b;
    tree.add(blobs);
    // underplanting of low grasses already handled by blades; add a gravel mulch skin
  }

  // ---- benches facing the plaza (+z) ------------------------------------------------
  function bench(cx, cz, w = 1.9) {
    const d = 0.55, seatY = Y + 0.44, x0 = cx - w / 2;
    // seat slats
    for (let i = 0; i < 5; i++) {
      box(w, 0.04, 0.095, cx, seatY, cz - d / 2 + 0.05 + i * 0.11, matOakSeat);
    }
    // back slats, reclined
    for (let i = 0; i < 3; i++) {
      box(w, 0.085, 0.03, cx, seatY + 0.2 + i * 0.12, cz - d / 2 - 0.04 - i * 0.015, matOakSeat, { rotX: -0.18 });
    }
    // powder-black steel side frames
    for (const sx of [x0 + 0.12, x0 + w - 0.12]) {
      box(0.05, 0.42, 0.05, sx, Y + 0.21, cz + d / 2 - 0.08, matDarkSteel, { noUV: true });
      box(0.05, 0.42, 0.05, sx, Y + 0.21, cz - d / 2 + 0.06, matDarkSteel, { noUV: true });
      box(0.05, 0.04, d, sx, seatY - 0.04, cz, matDarkSteel, { noUV: true });
      box(0.04, 0.46, 0.04, sx, seatY + 0.25, cz - d / 2 - 0.05, matDarkSteel, { noUV: true, rotX: -0.18 });
    }
    // under-bench light strip
    box(w - 0.4, 0.015, 0.03, cx, Y + 0.09, cz + d / 2 - 0.05, lightMat, { noUV: true, cast: false, receive: false });
    colliders.push({ minX: x0, maxX: x0 + w, minZ: cz - d / 2 - 0.1, maxZ: cz + d / 2, minY: Y, maxY: Y + 0.9 });
  }
  bench(-3.6, 16.35);
  bench(-1.3, 16.35);

  // ---- a couple of lanterns-for-the-eye: soft step-lights flanking the lift side ------
  for (let i = 0; i < 3; i++) {
    box(0.06, 0.03, 0.06, -4.8 + i * 1.6, Y + 0.02, 5.7, lightMat, { noUV: true, cast: false, receive: false });
  }

  // ---- contract -----------------------------------------------------------------------
  colliders.push({ minX: -2.15, maxX: 2.15, minZ: 6.65, maxZ: 15.35, minY: Y, maxY: 9 });
  const regions = [
    { minX: -6.2, maxX: 6.2, minZ: 5.9, maxZ: 14.1, y: Y },
    { minX: -6.2, maxX: 2.4, minZ: 14.0, maxZ: 16.8, y: Y },
    { minX: -0.85, maxX: 0.85, minZ: 4.4, maxZ: 6.2, y: Y },
  ];
  let t = 0;
  return {
    group, regions, colliders, pickables: [],
    update(dt) { t += dt; if (group._grass) group._grass.uTime.value = t; },
    onPick() {},
  };
}
