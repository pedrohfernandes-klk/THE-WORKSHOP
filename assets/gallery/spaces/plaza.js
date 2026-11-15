// plaza.js — the entrance plaza (x ±24, z 17.4–52, y 0): large-format stone paving with a finer
// central axis and façade apron, gravel allée beds with steel edging, drainage slots, and the
// boundary of dressed white-sandstone low walls, clipped hedges and gate piers.
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'plaza';
  const colliders = [];

  // ---------- helpers ----------
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hash3 = (x, y, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    let r = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
      r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    }
    return r;
  };
  const shadowOn = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
  const box = (mat, x0, x1, y0, y1, z0, z1, tileUV = {}) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    M.boxUV(g, tileUV);
    return g;
  };

  // ---------- paving ----------
  // The rectangular_paving photo is a 10 x 5 grid of cells over its tile: every slab maps onto one
  // whole cell (random cell per slab) so joints in the photo and real joints coincide and nothing tiles.
  const PTILE = 9.6;                 // cell = 0.96 m x 1.92 m
  const CU = 0.1, CV = 0.2;          // cell size in texture space
  const GAP = 0.010;
  const slabPos = [], slabNor = [], slabUv = [], slabCol = [], slabIdx = [];
  let vcount = 0;
  const pushQuad = (p, n, uvs, c) => {
    for (let i = 0; i < 4; i++) {
      slabPos.push(p[i][0], p[i][1], p[i][2]); slabNor.push(n[0], n[1], n[2]);
      slabUv.push(uvs[i][0], uvs[i][1]); slabCol.push(c[0], c[1], c[2]);
    }
    slabIdx.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
    vcount += 4;
  };
  const rand = rng(1717);
  // base colour multipliers pull the brown photo toward a pale warm grey (vertex colours may exceed 1)
  const TONE = [1.45, 1.75, 2.45];
  function slab(x0, x1, z0, z1, o) {
    const xa = x0 + GAP / 2, xb = x1 - GAP / 2, za = z0 + GAP / 2, zb = z1 - GAP / 2;
    const y = -rand() * 0.003 - (o.sink || 0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const low1 = 0.93 + 0.1 * noise3(cx * 0.09, 0.3, cz * 0.09) + 0.05 * noise3(cx * 0.4, 1.7, cz * 0.4);
    const t = (o.bright || 1) * low1 * (0.86 + rand() * 0.22);
    const warm = (rand() - 0.5) * 0.08;
    const c = [TONE[0] * t * (1 + warm), TONE[1] * t, TONE[2] * t * (1 - warm)];
    const cu = Math.floor(rand() * 10) * CU, cv = Math.floor(rand() * 5) * CV;
    const w = x1 - x0, d = z1 - z0;
    // map: texture u along x (cell width 0.96 m), v along z (cell height 1.92 m); rotate for the apron
    const su = o.rot ? 1 / (PTILE * CV / 1) * 0 + 1 / PTILE : 1 / PTILE;
    let uvf;
    if (o.rot) uvf = (x, z) => [cu + (z - z0) / PTILE, cv + (x - x0) / PTILE];
    else uvf = (x, z) => [cu + (x - x0) / PTILE * (o.sub ? 1 : 1), cv + (z - z0) / PTILE];
    const top = [[xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za]];
    pushQuad(top, [0, 1, 0], top.map(p => uvf(p[0], p[2])), c);
    const dark = [0.25, 0.25, 0.25], z0uv = [0, 0];
    const yb = y - 0.05;
    pushQuad([[xa, y, za], [xb, y, za], [xb, yb, za], [xa, yb, za]], [0, 0, -1], [z0uv, z0uv, z0uv, z0uv], dark);
    pushQuad([[xb, y, zb], [xa, y, zb], [xa, yb, zb], [xb, yb, zb]], [0, 0, 1], [z0uv, z0uv, z0uv, z0uv], dark);
    pushQuad([[xa, y, zb], [xa, y, za], [xa, yb, za], [xa, yb, zb]], [-1, 0, 0], [z0uv, z0uv, z0uv, z0uv], dark);
    pushQuad([[xb, y, za], [xb, y, zb], [xb, yb, zb], [xb, yb, za]], [1, 0, 0], [z0uv, z0uv, z0uv, z0uv], dark);
    void w; void d; void su;
  }
  // Tile a rectangle with running-bond slabs of w x d, skipping `holes`, merging slivers.
  function tileRegion(X0, X1, Z0, Z1, w, d, holes, o) {
    const zc = [Z0];
    for (let z = Z0 + d; z < Z1 - 0.3; z += d) zc.push(z);
    // snap grid lines onto hole edges that fall inside the region
    const edges = [];
    for (const h of holes) for (const e of [h[2], h[3]]) if (e > Z0 + 0.5 && e < Z1 - 0.5) edges.push(e);
    let rows = zc.slice();
    for (const e of edges) {
      // replace the nearest grid line if close, otherwise insert
      let bi = -1, bd = 0.5;
      rows.forEach((z, i) => { if (i > 0 && Math.abs(z - e) < bd) { bd = Math.abs(z - e); bi = i; } });
      if (bi >= 0) rows[bi] = e; else rows.push(e);
    }
    rows = [...new Set(rows.map(v => +v.toFixed(4)))].sort((a, b) => a - b);
    rows.push(Z1);
    for (let i = 0; i + 1 < rows.length; ) {          // merge slivers
      if (rows[i + 1] - rows[i] < 0.5 && rows.length > 2) { rows.splice(i + 1 < rows.length - 1 ? i + 1 : i, 1); } else i++;
    }
    for (let r = 0; r + 1 < rows.length; r++) {
      const z0 = rows[r], z1 = rows[r + 1];
      let free = [[X0, X1]];
      for (const h of holes) {
        if (h[3] <= z0 + 1e-4 || h[2] >= z1 - 1e-4) continue;
        const nf = [];
        for (const [a, b] of free) {
          if (h[1] <= a || h[0] >= b) { nf.push([a, b]); continue; }
          if (h[0] > a) nf.push([a, h[0]]);
          if (h[1] < b) nf.push([h[1], b]);
        }
        free = nf;
      }
      for (const [a, b] of free) {
        const off = ((r & 1) ? 0.5 : 0) + (rand() * 0.15);
        const cuts = [a];
        for (let x = a - off * w + w; x < b - 1e-3; x += w) if (x > a + 1e-3) cuts.push(x);
        cuts.push(b);
        for (let i = 0; i + 1 < cuts.length; ) {
          if (cuts[i + 1] - cuts[i] < 0.3 && cuts.length > 2) cuts.splice(i + 1 < cuts.length - 1 ? i + 1 : i, 1); else i++;
        }
        for (let i = 0; i + 1 < cuts.length; i++) slab(cuts[i], cuts[i + 1], z0, z1, o);
      }
    }
  }
  const POOL = [-3.9, 3.9, 23.6, 38.4];
  const BEDL = [-10, -5.5, 21, 35], BEDR = [5.5, 10, 21, 35];
  const GRL = [-20.5, -15.5, 19, 37], GRR = [15.5, 20.5, 19, 37];
  const BAND = [-2.5, 2.5, 18.4, 52];
  const holesMain = [POOL, BEDL, BEDR, GRL, GRR, BAND];
  // apron along the façade: long slabs, slightly cooler
  tileRegion(-24, 24, 17.4, 18.34, 1.92, 0.94, [], { rot: true, bright: 1.04 });
  tileRegion(-24, 24, 18.46, 52, 0.96, 1.92, holesMain, {});
  // finer, lighter axis band
  tileRegion(-2.5, 2.5, 18.46, 52, 0.48, 0.96, [POOL], { bright: 1.1 });
  // thresholds through the openings
  tileRegion(23.6, 24.8, 27, 31, 0.6, 0.6, [], { bright: 1.0 });
  tileRegion(-24.8, -23.6, 27, 31, 0.6, 0.6, [], { bright: 1.0 });
  tileRegion(-2, 2, 51.6, 52.8, 0.48, 0.6, [], { bright: 1.05 });

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(slabPos, 3));
  pg.setAttribute('normal', new THREE.Float32BufferAttribute(slabNor, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(slabUv, 2));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(slabCol, 3));
  pg.setIndex(slabIdx);
  const pavMat = M.get('paving', { tile: 1, roughness: 0.82 }).clone();   // tile 1 -> uv already in texture space
  pavMat.vertexColors = true;
  pavMat.needsUpdate = true;
  group.add(shadowOn(new THREE.Mesh(pg, pavMat), false));

  // base / bedding layer (shows in the joints): a plane with the pool cut out
  {
    const s = new THREE.Shape();
    s.moveTo(-24.8, -17.4); s.lineTo(24.8, -17.4); s.lineTo(24.8, -52.8); s.lineTo(-24.8, -52.8); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(POOL[0], -POOL[2]); hole.lineTo(POOL[0], -POOL[3]); hole.lineTo(POOL[1], -POOL[3]); hole.lineTo(POOL[1], -POOL[2]); hole.closePath();
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.05, 0);
    M.boxUV(g);
    const m = new THREE.Mesh(g, M.get('concreteFloor', { color: 0x4d4943 }));
    m.receiveShadow = true;
    group.add(m);
  }

  // axis inlay strips (steel flush joints) either side of the finer band
  {
    const steel = M.get('steel', { roughness: 0.5 });
    const gs = [];
    for (const sx of [-2.5, 2.5]) for (const [a, b] of [[18.46, 23.6], [38.4, 52]]) gs.push(box(steel, sx - 0.012, sx + 0.012, -0.004, 0.0008, a, b));
    group.add(shadowOn(new THREE.Mesh(mergeGeometries(gs), steel), false));
  }

  // ---------- drainage slot ----------
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
    const c = cv.getContext('2d');
    c.fillStyle = '#0d0d0e'; c.fillRect(0, 0, 256, 32);
    c.fillStyle = '#6b6d70';
    for (let i = 0; i < 16; i++) c.fillRect(i * 16 + 6, 0, 4, 32);
    c.fillStyle = '#85888c'; c.fillRect(0, 0, 256, 3); c.fillRect(0, 29, 256, 3);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const steel = M.get('steel', { roughness: 0.45 });
    for (const [a, b] of [[-23.6, -2.6], [2.6, 23.6]]) {
      const L = b - a;
      const pl = new THREE.PlaneGeometry(L, 0.12);
      pl.rotateX(-Math.PI / 2); pl.translate((a + b) / 2, -0.004, 18.4);
      const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(L / 1.0, 1);
      const m = new THREE.Mesh(pl, new THREE.MeshStandardMaterial({ map: t2, roughness: 0.55, metalness: 0.6 }));
      m.receiveShadow = true; group.add(m);
      group.add(shadowOn(new THREE.Mesh(mergeGeometries([
        box(steel, a, b, -0.004, 0.0015, 18.4 - 0.065, 18.4 - 0.055), box(steel, a, b, -0.004, 0.0015, 18.4 + 0.055, 18.4 + 0.065)]), steel), false));
    }
  }

  // ---------- gravel beds under the allées ----------
  {
    const gravel = M.get('gravel', { tile: 1.3, color: 0x8e98a3 });
    const steel = M.get('steel', { roughness: 0.4 });
    const gg = [], eg = [];
    for (const r of [GRL, GRR]) {
      gg.push(box(gravel, r[0], r[1], -0.12, 0.022, r[2], r[3]));
      const t = 0.012, h0 = -0.06, h1 = 0.055;
      eg.push(box(steel, r[0] - t, r[1] + t, h0, h1, r[2] - t, r[2]), box(steel, r[0] - t, r[1] + t, h0, h1, r[3], r[3] + t),
        box(steel, r[0] - t, r[0], h0, h1, r[2], r[3]), box(steel, r[1], r[1] + t, h0, h1, r[2], r[3]));
    }
    group.add(shadowOn(new THREE.Mesh(mergeGeometries(gg), gravel), false));
    group.add(shadowOn(new THREE.Mesh(mergeGeometries(eg), steel), true));
  }

  // ---------- boundary: wall + hedge + piers ----------
  const stone = M.get('whiteSandstone', { tile: 2.0, color: 0xeeeae2 });
  const WT = 0.45, HT = 0.8, WH = 0.6, HH = 1.4;
  // runs: axis 'x' means the run extends along z at fixed x (the side boundaries)
  const runs = [
    { side: -1, a: 17.4, b: 26.3, ax: 'z' }, { side: -1, a: 31.7, b: 52.8, ax: 'z' },
    { side: 1, a: 17.4, b: 26.3, ax: 'z' }, { side: 1, a: 31.7, b: 52.8, ax: 'z' },
    { side: 1, a: -24.8, b: -2.7, ax: 'x' }, { side: 1, a: 2.7, b: 24.8, ax: 'x' },
  ];
  // rect of a run for a given band [d0, d1] measured outward from the plaza edge (24 / 52)
  const rectOf = (run, d0, d1) => {
    if (run.ax === 'z') {
      const x0 = run.side * (24 + d0), x1 = run.side * (24 + d1) ;
      return [Math.min(x0, x1), Math.max(x0, x1), run.a, run.b];
    }
    return [run.a, run.b, 52 + d0, 52 + d1];
  };
  const wallGeos = [], capGeos = [], hedgeGeos = [];
  for (const run of runs) {
    // wall: inside the plaza edge, d from -WT to 0 ; hedge behind it: 0 to HT
    const [wx0, wx1, wz0, wz1] = rectOf(run, -WT, 0);
    wallGeos.push(box(stone, wx0, wx1, -0.1, WH - 0.07, wz0, wz1));
    // cap: dressed slabs 1.8 m long with 4 mm joints, small overhang
    const along = run.ax === 'z' ? [wz0, wz1] : [wx0, wx1];
    const n = Math.max(1, Math.round((along[1] - along[0]) / 1.8));
    const step = (along[1] - along[0]) / n;
    for (let i = 0; i < n; i++) {
      const a0 = along[0] + i * step + 0.002, a1 = along[0] + (i + 1) * step - 0.002;
      if (run.ax === 'z') capGeos.push(box(stone, wx0 - 0.03, wx1 + 0.03, WH - 0.07, WH, a0, a1));
      else capGeos.push(box(stone, a0, a1, WH - 0.07, WH, wz0 - 0.03, wz1 + 0.03));
    }
    hedgeGeos.push(hedgeGeometry(rectOf(run, 0, HT)));
    const hr = rectOf(run, -WT, HT);
    colliders.push({ minX: hr[0], maxX: hr[1], minZ: hr[2], maxZ: hr[3], minY: 0, maxY: HH });
  }
  const wallGeo = mergeGeometries(wallGeos), capGeo = mergeGeometries(capGeos);
  group.add(shadowOn(new THREE.Mesh(wallGeo, stone)));
  group.add(shadowOn(new THREE.Mesh(capGeo, stone)));

  function hedgeGeometry([x0, x1, z0, z1]) {
    const r = 0.22, y0 = -0.25, y1 = HH;
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const seg = (L, k) => Math.max(2, Math.round(L / k));
    const step = low ? 0.7 : 0.3;
    let g = new THREE.BoxGeometry(sx, sy, sz, seg(sx, step), seg(sy, step), seg(sz, step));
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, cnt = p.count;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const ix = hx - r, iy = hy - r, iz = hz - r;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const qx = Math.max(-ix, Math.min(ix, x)), qy = Math.max(-iy, Math.min(iy, y)), qz = Math.max(-iz, Math.min(iz, z));
      let dx = x - qx, dy = y - qy, dz = z - qz;
      const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L; dy /= L; dz /= L;
      x = qx + dx * r; y = qy + dy * r; z = qz + dz * r;
      const wx = x + cx, wy = y + cy, wz = z + cz;
      // soft irregular clipped surface: low-frequency lumps plus leaf-scale roughness
      const bump = (noise3(wx * 0.9, wy * 0.9, wz * 0.9) - 0.5) * 0.14 + (noise3(wx * 4.1, wy * 4.1, wz * 4.1) - 0.5) * 0.05;
      x += dx * bump; y += dy * bump; z += dz * bump;
      p.setXYZ(i, x + cx, y + cy, z + cz);
      const clump = 0.78 + 0.5 * noise3(wx * 2.3, wy * 2.3, wz * 2.3) + 0.2 * noise3(wx * 9, wy * 9, wz * 9);
      const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, wy / 0.6));
      const k = clump * ao;
      col[i * 3] = 0.55 * k; col[i * 3 + 1] = 0.95 * k; col[i * 3 + 2] = 0.5 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    M.boxUV(g);
    return g;
  }
  const hedgeMat = M.get('leaves', { tile: 0.9, roughness: 0.92 }).clone();
  hedgeMat.vertexColors = true; hedgeMat.needsUpdate = true;
  group.add(shadowOn(new THREE.Mesh(mergeGeometries(hedgeGeos), hedgeMat)));

  // piers at the openings: plinth, shaft, cap slab, small cap block
  {
    const pg2 = [];
    const pier = (x0, x1, z0, z1) => {
      pg2.push(box(stone, x0 - 0.05, x1 + 0.05, -0.1, 0.25, z0 - 0.05, z1 + 0.05),
        box(stone, x0, x1, 0.25, 1.65, z0, z1),
        box(stone, x0 - 0.06, x1 + 0.06, 1.65, 1.73, z0 - 0.06, z1 + 0.06),
        box(stone, x0 + 0.1, x1 - 0.1, 1.73, 1.83, z0 + 0.1, z1 - 0.1));
      colliders.push({ minX: x0 - 0.05, maxX: x1 + 0.05, minZ: z0 - 0.05, maxZ: z1 + 0.05, minY: 0, maxY: 1.83 });
    };
    for (const s of [-1, 1]) {
      const xa = s > 0 ? 23.52 : -24.82, xb = s > 0 ? 24.82 : -23.52;
      pier(xa, xb, 26.3, 27); pier(xa, xb, 31, 31.7);
    }
    pier(-2.7, -2, 51.52, 52.82); pier(2, 2.7, 51.52, 52.82);
    group.add(shadowOn(new THREE.Mesh(mergeGeometries(pg2), stone)));
  }

  // ---------- regions ----------
  const regions = [
    { minX: -23, maxX: 23, minZ: 18.2, maxZ: 51, y: 0 },
    { minX: -25, maxX: -23, minZ: 27.6, maxZ: 30.4, y: 0 },
    { minX: 23, maxX: 25, minZ: 27.6, maxZ: 30.4, y: 0 },
    { minX: -1.4, maxX: 1.4, minZ: 51, maxZ: 53, y: 0 },
  ];

  return { group, regions, colliders, pickables: [], update() {}, onPick() {} };
}
