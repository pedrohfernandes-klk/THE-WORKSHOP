// sculptures.js — the two outdoor sculptures of the campus (BRIEF §6.1).
//   East garden, on the gravel pad at (55, 0, 40): a 4 m weathering-steel piece.
//     Two folded plates of 30 mm steel rolling over and leaning on each other,
//     rust-orange with darker streaks (vertex colours), on a low steel base plate.
//   Plaza axis, at (0, 0, 44.5): a polished bronze looping form, 2.6 m tall,
//     on a 0.5 m honed whiteSandstone plinth of 1.6 × 1.6 m.
// Both are original abstract forms, built in world coordinates.

const CORTEN_AT = [55, 0, 40];
const PLINTH_AT = [0, 0, 44.5];
const PLINTH = { w: 1.6, h: 0.5 };
const T_PLATE = 0.03;           // 30 mm plate
const RADIUS = T_PLATE / 2;     // fully rolled edges: the stadium section has radius = half thickness

export function build(ctx) {
  const { THREE, M } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'sculptures';
  const colliders = [];

  // ---- helpers ----------------------------------------------------------------
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mesh = (geo, material, cast = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // bounds of a set of world-space geometries, as a collider
  const boundsOf = (geos, pad = 0) => {
    const box = new THREE.Box3();
    for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox); }
    return { minX: box.min.x - pad, maxX: box.max.x + pad, minZ: box.min.z - pad, maxZ: box.max.z + pad, minY: 0, maxY: 4 };
  };

  // ---- east garden: weathering steel --------------------------------------------
  const rust = new THREE.Color(0xb8642f);

  // Vertex colour of the corten: rust base, dark vertical streaks that run
  // along each plate, a slow blotch pattern, and a darker band where the
  // plate meets the ground.
  function cortenColour(u, p) {
    const x = p[0], y = p[1], z = p[2];
    const streak = 0.5 + 0.5 * Math.sin(z * 37 + 2.5 * Math.sin(u * 11 + z * 3) + 1.7 * Math.sin(u * 27 - z * 9));
    const blotch = 0.5 + 0.5 * Math.sin(x * 5.1 + y * 3.7 + Math.sin(z * 6) * 2.0) * Math.cos(y * 2.3 - x * 1.9);
    const ground = 1 - 0.22 * (1 - smooth(0.0, 0.7, y));
    const k = (0.84 + 0.22 * blotch - 0.2 * Math.pow(streak, 5)) * ground;
    return [rust.r * k, rust.g * k, rust.b * k];
  }

  // Centre-line of a plate, in its own plane: the heading angle phi(u)
  // (0 = straight up the y axis, positive towards +x) integrated along the length L.
  function centreline(phi, L, S) {
    const pts = [];
    let x = 0, y = 0;
    const ds = L / S;
    for (let i = 0; i <= S; i++) {
      const u = i / S, a = phi(u);
      pts.push({ x, y, a, u });
      x += Math.sin(a) * ds;
      y += Math.cos(a) * ds;
    }
    return pts;
  }

  // Cross-section of the plate, in (n, z): a stadium, i.e. two flat faces at
  // n = ±r joined by semicircular rolled edges at z = ±W/2.
  function stadium(W, F, A) {
    const r = RADIUS, zc = Math.max(W / 2 - r, 0), out = [];
    const add = (n, z, nn, nz) => out.push({ n, z, nn, nz });
    for (let k = 0; k < F; k++) add(r, -zc + 2 * zc * k / F, 1, 0);                 // top face
    for (let k = 0; k <= A; k++) {                                                   // right rolled edge
      const t = Math.PI / 2 - Math.PI * k / A;
      add(r * Math.sin(t), zc + r * Math.cos(t), Math.sin(t), Math.cos(t));
    }
    for (let k = 0; k < F; k++) add(-r, zc - 2 * zc * k / F, -1, 0);                // bottom face
    for (let k = 0; k <= A; k++) {                                                   // left rolled edge
      const t = -Math.PI / 2 - Math.PI * k / A;
      add(r * Math.sin(t), -zc + r * Math.cos(t), Math.sin(t), Math.cos(t));
    }
    return out;
  }

  // Sweeps the stadium section along the centre-line into a closed, shelled plate
  // (non-indexed, smooth normals), with end caps. Built in plate-local space.
  function sheet(line, widthAt, colourAt) {
    const F = low ? 8 : 20, A = low ? 4 : 8;
    const pos = [], nor = [], col = [];
    const vert = (p, n, c) => ({ p, n, c });
    const tri = (a, b, c, want) => {
      // orient the triangle so its winding agrees with the wanted normal
      const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
      const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const flip = cx * want[0] + cy * want[1] + cz * want[2] < 0;
      for (const v of flip ? [a, c, b] : [a, b, c]) {
        pos.push(v.p[0], v.p[1], v.p[2]); nor.push(v.n[0], v.n[1], v.n[2]); col.push(v.c[0], v.c[1], v.c[2]);
      }
    };
    const rings = line.map((q) => {
      const W = widthAt(q.u), cs = Math.cos(q.a), sn = Math.sin(q.a);
      const Nx = cs, Ny = -sn;     // in-plane normal of the centre-line
      return stadium(W, F, A).map(({ n, z, nn, nz }) => {
        const p = [q.x + Nx * n, q.y + Ny * n, z];
        const nv = [Nx * nn, Ny * nn, nz];
        return vert(p, nv, colourAt(q.u, p));
      });
    });
    const L = rings[0].length;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < L; j++) {
        const a = rings[i][j], b = rings[i][(j + 1) % L], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % L];
        tri(a, c, b, [a.n[0] + c.n[0], a.n[1] + c.n[1], a.n[2] + c.n[2]]);
        tri(b, c, d, [b.n[0] + c.n[0] + d.n[0], b.n[1] + c.n[1] + d.n[1], b.n[2] + c.n[2] + d.n[2]]);
      }
    }
    // end caps: the foot (hidden in the base plate) and the free tip
    [[0, -1], [rings.length - 1, 1]].forEach(([i, s]) => {
      const q = line[i], T = [Math.sin(q.a) * s, Math.cos(q.a) * s, 0];
      const centre = vert([q.x, q.y, 0], T, colourAt(q.u, [q.x, q.y, 0]));
      const ring = rings[i];
      for (let j = 0; j < L; j++) tri(centre, ring[j], ring[(j + 1) % L], T);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  // corten plates, in local space with the foot at the origin, then placed
  const S = low ? 24 : 64;
  const plateA = sheet(centreline((u) => 0.08 + 0.85 * Math.pow(u, 1.5), 4.1, S),
    (u) => 1.25 - 0.3 * u, cortenColour);
  const plateB = sheet(centreline((u) => 0.2 + 0.6 * Math.pow(u, 1.2), 2.9, S),
    (u) => 1.3 - 0.35 * u, cortenColour);

  const place = (geo, [x, y, z], ry = 0) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    return geo;
  };
  const [cx, cy, cz] = CORTEN_AT;
  const cortenGeos = [
    place(plateA, [cx, cy + 0.02, cz]),
    place(plateB, [cx - 0.7, cy + 0.02, cz - 0.3], -0.45),
  ];
  const cortenMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.84, metalness: 0.1 });
  for (const g of cortenGeos) mesh(g, cortenMat);

  // low steel base plate under the folded plates
  const baseGeo = new THREE.BoxGeometry(2.8, 0.03, 1.9);
  baseGeo.translate(cx, 0.015, cz);
  mesh(M.boxUV(baseGeo), M.get('steel', { color: 0x3b3f44, roughness: 0.55 }));

  colliders.push(boundsOf([...cortenGeos, baseGeo], 0.05));

  // ---- plaza axis: polished bronze ----------------------------------------------
  const bronzeBase = new THREE.Color(0xc0844a);
  // patina: darker towards the plinth, in the lower hollows and in streaks
  function bronzeColour(p, n) {
    const x = p[0], y = p[1], z = p[2];
    const low_ = 0.55 + 0.45 * smooth(0.0, 0.9, y);
    const streak = 0.5 + 0.5 * Math.sin(x * 9 + z * 7) * Math.cos(y * 5);
    const hollow = n[1] < -0.2 ? 0.8 : 1.0;
    const k = low_ * (0.86 + 0.14 * streak) * hollow;
    return [bronzeBase.r * k, bronzeBase.g * k, bronzeBase.b * k];
  }
  const withColour = (geo, toCol) => {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = toCol([pos.getX(i), pos.getY(i), pos.getZ(i)], [nor.getX(i), nor.getY(i), nor.getZ(i)]);
      col.set(c, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };

  // a stacked bulb at the base: a lathe, smooth normals from the lathe itself
  const bulbPts = [[0, 0], [0.44, 0.02], [0.56, 0.1], [0.6, 0.26], [0.53, 0.5], [0.36, 0.72], [0.14, 0.86], [0.0, 0.9]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bulb = new THREE.LatheGeometry(bulbPts, low ? 24 : 56);

  // the looping form: a closed tube with a varying radius along a standing loop
  function loopTube(K, Mc) {
    const curve = (t) => [0.7 * Math.sin(t), 1.7 - 0.8 * Math.cos(2 * t), 0.45 * Math.cos(t)];
    const radius = (t) => 0.14 + 0.03 * Math.cos(t) * Math.cos(t);
    const C = [], R = [];
    for (let k = 0; k < K; k++) { const t = (k / K) * Math.PI * 2; C.push(curve(t)); R.push(radius(t)); }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const T = C.map((_, k) => norm(sub(C[(k + 1) % K], C[(k - 1 + K) % K])));
    // parallel-transported frames, with the closing twist shared out round the loop
    const transport = (n, t) => norm(sub(n, scale(t, dot(n, t))));
    let N0 = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const N = [N0];
    for (let k = 1; k < K; k++) N.push(transport(N[k - 1], T[k]));
    const endN = transport(N[K - 1], T[0]);
    const twist = Math.atan2(dot(cross(endN, N0), T[0]), dot(endN, N0));
    const frames = N.map((n, k) => {
      const a = -twist * k / K, t = T[k];
      const b = cross(t, n);
      const nn = add(scale(n, Math.cos(a)), scale(b, Math.sin(a)));
      return { n: nn, b: cross(t, nn) };
    });
    const pos = [], nor = [], idx = [];
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < Mc; j++) {
        const th = (j / Mc) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        const d = add(scale(frames[k].n, c), scale(frames[k].b, s));
        const p = add(C[k], scale(d, R[k]));
        pos.push(p[0], p[1], p[2]); nor.push(d[0], d[1], d[2]);
      }
    }
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      for (let j = 0; j < Mc; j++) {
        const j1 = (j + 1) % Mc;
        const a = k * Mc + j, b = k * Mc + j1, c = k1 * Mc + j, d = k1 * Mc + j1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  const loop = loopTube(low ? 60 : 180, low ? 12 : 28);
  // winding check: make the normals agree with the faces (flip all if not)
  {
    const p = loop.attributes.position, n = loop.attributes.normal, ix = loop.index.array;
    const a = ix[0], b = ix[1], c = ix[2];
    const ux = p.getX(b) - p.getX(a), uy = p.getY(b) - p.getY(a), uz = p.getZ(b) - p.getZ(a);
    const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
    const cr = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (cr[0] * n.getX(a) + cr[1] * n.getY(a) + cr[2] * n.getZ(a) < 0) {
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
  }

  const bronzeMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0xffffff, metalness: 1, roughness: 0.25, envMapIntensity: 1.0,
  });
  const bronzeLift = [PLINTH_AT[0], PLINTH.h, PLINTH_AT[2]];

  const bulbGeo = withColour(bulb.clone(), bronzeColour);
  bulbGeo.translate(...bronzeLift);
  const loopGeo = withColour(loop, bronzeColour);
  loopGeo.translate(...bronzeLift);
  mesh(bulbGeo, bronzeMat);
  mesh(loopGeo, bronzeMat);

  // honed whiteSandstone plinth
  const plinthGeo = new THREE.BoxGeometry(PLINTH.w, PLINTH.h, PLINTH.w);
  plinthGeo.translate(PLINTH_AT[0], PLINTH.h / 2, PLINTH_AT[2]);
  mesh(M.boxUV(plinthGeo), M.get('whiteSandstone', { roughness: 0.6 }));

  colliders.push(boundsOf([plinthGeo, loopGeo], 0));

  return {
    group,
    regions: [],
    colliders,
    pickables: [],
    update() {},
  };
}
