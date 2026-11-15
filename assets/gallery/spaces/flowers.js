// flowers.js — perennial flower borders in the east garden's raised beds
// (docs/gallery/BRIEF.md §6.1–6.2). Lavender, cosmos, ornamental grass and
// alliums, drift-planted in groups. One InstancedMesh per plant part type;
// wind sway is injected into MeshStandardMaterial with onBeforeCompile and
// driven by one shared time uniform.

// Raised beds (soil top y 0.08). `ax` is the bed's long axis; `a0..a1` is the
// extent along it, `c0` the low edge across it; every bed is 1.2 m wide.
const BEDS = [
  { ax: 'x', a0: 29.5, a1: 40.5, c0: 26.3 },
  { ax: 'x', a0: 29.5, a1: 40.5, c0: 30.5 },
  { ax: 'z', a0: 15, a1: 23.5, c0: 43.3 },
  { ax: 'z', a0: 15, a1: 23.5, c0: 47.5 },
  { ax: 'z', a0: 34.5, a1: 49, c0: 43.3 },
  { ax: 'z', a0: 34.5, a1: 49, c0: 47.5 },
];
const SOIL_Y = 0.08;
const BED_W = 1.2;

// Vertex stage: replaces project_vertex. Bends each vertex by its height above
// the plant's root (aRoot, world space) so whole plants sway from the base.
const SWAY_HEAD = `
uniform float uTime;
uniform float uAmp;
attribute vec3 aRoot;
`;
const SWAY_PROJECT = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 swW = modelMatrix * mvPosition;
float swH = max( swW.y - aRoot.y, 0.0 );
float swPh = uTime * 1.7 + aRoot.x * 0.9 + aRoot.z * 0.6;
float swGust = 0.6 + 0.4 * sin( uTime * 0.41 + aRoot.x * 0.23 - aRoot.z * 0.17 );
float swB = swH * swH * uAmp * swGust;
swW.x += ( sin( swPh ) + 0.35 * sin( swPh * 2.3 + 1.3 ) ) * swB;
swW.z += cos( swPh * 0.8 + aRoot.x ) * swB * 0.5;
mvPosition = viewMatrix * swW;
gl_Position = projectionMatrix * mvPosition;
`;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function build(ctx) {
  const { THREE, renderer, quality, reducedMotion } = ctx;
  const low = quality === 'low';
  const shadows = quality === 'high';
  const dens = low ? 0.5 : 1;
  const rnd = mulberry32(0x2026f10e);
  const rr = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group();
  group.name = 'flowers';

  const timeU = { value: 0 };
  const aniso = renderer.capabilities.getMaxAnisotropy();

  // ---- canvas textures -------------------------------------------------
  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  }

  // Lavender mound foliage: grey-green fine leaf strokes, alpha-cut.
  const moundTex = canvasTexture(256, 256, (g, W, H) => {
    g.lineCap = 'round';
    for (let i = 0; i < 3200; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI * 2, L = 10 + rnd() * 22;
      g.strokeStyle = `rgb(${(122 + rnd() * 40) | 0},${(140 + rnd() * 34) | 0},${(116 + rnd() * 30) | 0})`;
      g.lineWidth = 2.6 + rnd() * 2.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    }
  });

  // Cosmos / daisy head: eight white petals and a gold disc, alpha outside.
  const petalTex = canvasTexture(256, 256, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    for (let k = 0; k < 8; k++) {
      g.save();
      g.translate(cx, cy);
      g.rotate(k * Math.PI / 4 + (rnd() - 0.5) * 0.12);
      g.beginPath();
      g.ellipse(0, -H * 0.27, W * 0.095, H * 0.25, 0, 0, Math.PI * 2);
      g.fillStyle = '#fcfbf7';
      g.fill();
      g.strokeStyle = 'rgba(190,180,160,0.5)';
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }
    const grd = g.createRadialGradient(cx, cy, 2, cx, cy, W * 0.11);
    grd.addColorStop(0, '#ffe27a');
    grd.addColorStop(1, '#d69a1c');
    g.beginPath(); g.arc(cx, cy, W * 0.11, 0, Math.PI * 2);
    g.fillStyle = grd; g.fill();
  });

  // Cosmos basal leaf: pointed ellipse, base at the bottom edge.
  const leafTex = canvasTexture(128, 256, (g, W, H) => {
    const grd = g.createLinearGradient(0, H, 0, 0);
    grd.addColorStop(0, '#3f6a2e');
    grd.addColorStop(1, '#7fa14f');
    g.beginPath();
    g.moveTo(W / 2, H - 2);
    g.bezierCurveTo(W * 0.05, H * 0.7, W * 0.05, H * 0.25, W / 2, 2);
    g.bezierCurveTo(W * 0.95, H * 0.25, W * 0.95, H * 0.7, W / 2, H - 2);
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(200,220,150,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2, H - 4); g.lineTo(W / 2, 8); g.stroke();
  });

  // Grass blade: dark base, pale tip; colour comes from instance colour.
  const bladeTex = canvasTexture(32, 128, (g, W, H) => {
    const grd = g.createLinearGradient(0, H, 0, 0);
    grd.addColorStop(0, '#34501f');
    grd.addColorStop(0.6, '#8c9a4e');
    grd.addColorStop(1, '#d2c98a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });

  // ---- materials (sway injected per material) ---------------------------
  function swayMaterial(name, params, amp) {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, ...params });
    const uAmp = { value: reducedMotion ? 0 : amp };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.uniforms.uAmp = uAmp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + SWAY_HEAD)
        .replace('#include <project_vertex>', SWAY_PROJECT);
    };
    mat.customProgramCacheKey = () => 'flowers-' + name;
    mat.name = name;
    return mat;
  }
  const foliageMat = swayMaterial('flowerFoliage', { map: moundTex, alphaTest: 0.5, roughness: 0.8 }, 0.03);
  const stemMat = swayMaterial('flowerStem', { roughness: 0.6 }, 0.05);
  const headMat = swayMaterial('flowerHead', { roughness: 0.5 }, 0.05);
  const petalMat = swayMaterial('flowerPetal', { map: petalTex, alphaTest: 0.5, roughness: 0.55 }, 0.06);
  const leafMat = swayMaterial('flowerLeaf', { map: leafTex, alphaTest: 0.5, roughness: 0.7 }, 0.05);
  const bladeMat = swayMaterial('flowerBlade', { map: bladeTex, roughness: 0.7 }, 0.07);

  // ---- geometry ---------------------------------------------------------
  // Unit geometries, shaped so the instance scale maps to real metres.
  const foliageGeo = new THREE.SphereGeometry(1, low ? 8 : 12, low ? 5 : 8).translate(0, 1, 0); // base y 0, top y 2
  const stemGeo = new THREE.CylinderGeometry(0.0045, 0.0055, 1, 5, 1).translate(0, 0.5, 0);      // base 0, top 1
  const headGeo = new THREE.SphereGeometry(1, low ? 6 : 10, low ? 4 : 7);                         // unit ball
  const petalGeo = new THREE.PlaneGeometry(1, 1);
  const leafGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);                            // base 0, tip 1
  const bladeGeo = (() => {
    const seg = 4, pos = [], uv = [], nrm = [], idx = [];
    const W = 0.024, bend = 0.12;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = W * 0.5 * Math.pow(1 - t, 0.8) + 0.0003;
      const x = bend * t * t;
      pos.push(-w + x, t, 0, w + x, t, 0);
      uv.push(0, t, 1, t);
      nrm.push(0, 0, 1, 0, 0, 1);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  })();

  // ---- instance buckets ---------------------------------------------------
  const buckets = { foliage: [], stems: [], heads: [], petals: [], leaves: [], blades: [] };
  // root: plant base (world), p: position, q: euler XYZ(YXZ order), s: scale, c: THREE.Color
  const put = (list, root, p, q, s, c) => list.push({ root, p, q, s, c });

  function instanced(list, geometry, material) {
    const n = list.length;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    const root = new Float32Array(n * 3);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3();
    const s = new THREE.Vector3(), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const it = list[i];
      p.set(it.p[0], it.p[1], it.p[2]);
      e.set(it.q[0], it.q[1], it.q[2], 'YXZ');
      q.setFromEuler(e);
      s.set(it.s[0], it.s[1], it.s[2]);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.c);
      root[i * 3] = it.root[0]; root[i * 3 + 1] = it.root[1]; root[i * 3 + 2] = it.root[2];
    }
    geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 3));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // ---- palettes -------------------------------------------------------------
  const col = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const STEM = ['#56703f', '#7b8e5c'];
  const LAV_HEAD = ['#7a58b0', '#9e7ed6'];
  const ALLIUM = ['#5e2f9a', '#a262d2'];
  const COS_WHITE = ['#ffffff', '#f2efe6'];
  const COS_PINK = ['#f6a4c6', '#e2679b'];
  const GRASS = ['#8e9e5e', '#c9b872', '#5f7d40'];
  const GREY_GREEN = ['#f2f4ee', '#c9d2c0'];
  const LEAF = ['#ffffff', '#c9d6b8'];

  // ---- planting ---------------------------------------------------------
  // Position along a bed (u along its length, v across it, 0..BED_W).
  const xzOf = (bed, u, v) => (bed.ax === 'x' ? [u, bed.c0 + v] : [bed.c0 + v, u]);
  const clampUV = (bed, u, v) => [
    Math.min(bed.a1 - 0.08, Math.max(bed.a0 + 0.08, u)),
    Math.min(BED_W - 0.12, Math.max(0.12, v)),
  ];

  function lavGroup(bed, u, v) {
    const n = Math.max(1, Math.round(rr(2, 4) * dens));
    const tone = rnd();
    for (let i = 0; i < n; i++) {
      const [uu, vv] = clampUV(bed, u + rr(-0.28, 0.28), v + rr(-0.22, 0.22));
      const [x, z] = xzOf(bed, uu, vv);
      const r = rr(0.2, 0.28), hf = rr(0.2, 0.3);
      put(buckets.foliage, [x, SOIL_Y, z], [x, SOIL_Y, z], [0, rnd() * Math.PI * 2, 0],
        [r, hf / 2, r], col(GREY_GREEN[0], GREY_GREEN[1], rnd()));
      const ns = Math.round(rr(2, 3.4));
      for (let k = 0; k < ns; k++) {
        const a = rnd() * Math.PI * 2, d = r * rr(0.1, 0.55);
        const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
        const top = rr(0.5, 0.85);
        const stemC = col(STEM[0], STEM[1], rnd());
        put(buckets.stems, [sx, SOIL_Y, sz], [sx, SOIL_Y, sz], [0, 0, 0], [1, top, 1], stemC);
        put(buckets.heads, [sx, SOIL_Y, sz], [sx, SOIL_Y + top - 0.005, sz], [0, 0, 0],
          [0.011, 0.035, 0.011], col(LAV_HEAD[0], LAV_HEAD[1], tone * 0.6 + rnd() * 0.4));
      }
    }
  }

  function cosGroup(bed, u, v) {
    const n = Math.max(1, Math.round(rr(6, 9) * dens));
    const pink = rnd() < 0.45;
    const pal = pink ? COS_PINK : COS_WHITE;
    for (let i = 0; i < n; i++) {
      const [uu, vv] = clampUV(bed, u + rr(-0.26, 0.26), v + rr(-0.2, 0.2));
      const [x, z] = xzOf(bed, uu, vv);
      const top = rr(0.45, 0.78), yaw = rnd() * Math.PI * 2, d = rr(0.075, 0.1);
      put(buckets.stems, [x, SOIL_Y, z], [x, SOIL_Y, z], [0, 0, 0], [1, top, 1], col(STEM[0], STEM[1], rnd()));
      put(buckets.petals, [x, SOIL_Y, z], [x, SOIL_Y + top + d * 0.4, z],
        [-rr(0.4, 0.9), yaw, 0], [d, d, d], col(pal[0], pal[1], rnd()));
      const nl = low ? 1 : 2;
      for (let j = 0; j < nl; j++) {
        put(buckets.leaves, [x, SOIL_Y, z], [x, SOIL_Y, z],
          [rr(0.6, 1.1), rnd() * Math.PI * 2, 0],
          [rr(0.035, 0.055), rr(0.12, 0.2), 1], col(LEAF[0], LEAF[1], rnd()));
      }
    }
  }

  function alliumGroup(bed, u, v) {
    const n = Math.max(1, Math.round(rr(2, 3) * dens));
    for (let i = 0; i < n; i++) {
      const [uu, vv] = clampUV(bed, u + rr(-0.15, 0.15), v + rr(-0.15, 0.15));
      const [x, z] = xzOf(bed, uu, vv);
      const top = rr(0.62, 0.8), r = rr(0.04, 0.055);
      put(buckets.stems, [x, SOIL_Y, z], [x, SOIL_Y, z], [0, 0, 0], [1, top, 1], col(STEM[0], STEM[1], rnd()));
      put(buckets.heads, [x, SOIL_Y, z], [x, SOIL_Y + top + r * 0.6, z], [0, 0, 0],
        [r, r, r], col(ALLIUM[0], ALLIUM[1], rnd()));
    }
  }

  function grassGroup(bed, u, v) {
    const tufts = Math.max(1, Math.round(rr(5, 8) * dens));
    const tall = rr(0.85, 1.0);
    for (let t = 0; t < tufts; t++) {
      const [uu, vv] = clampUV(bed, u + rr(-0.3, 0.3), v + rr(-0.25, 0.25));
      const [cx, cz] = xzOf(bed, uu, vv);
      const blades = Math.max(6, Math.round(rr(18, 26) * dens));
      const tint = rnd();
      for (let b = 0; b < blades; b++) {
        const bx = cx + rr(-0.06, 0.06), bz = cz + rr(-0.06, 0.06);
        const h = Math.min(0.9, rr(0.3, 0.85) * tall);
        const dir = rnd() * Math.PI * 2, lean = rr(0.02, 0.22);
        const c = col(GRASS[0], GRASS[1], tint).lerp(new THREE.Color(GRASS[2]), rnd() * 0.35);
        put(buckets.blades, [bx, SOIL_Y, bz], [bx, SOIL_Y, bz],
          [lean * Math.cos(dir), rnd() * Math.PI * 2, lean * Math.sin(dir)],
          [rr(0.8, 1.25), h, rr(0.8, 1.25)], c);
      }
    }
  }

  // Walk each bed, dropping drift groups every ~0.3–0.6 m. Groups overlap, so
  // the border reads as dense, continuous planting rather than a dot grid.
  let groupIndex = 0;
  for (const bed of BEDS) {
    let u = bed.a0 + rr(0.05, 0.3);
    let i = 0;
    while (u < bed.a1 - 0.1) {
      const v = rr(0.2, BED_W - 0.2);
      const skip = low && rnd() < 0.4;
      const roll = rnd();
      if (!skip) {
        if (i % 9 === 4) alliumGroup(bed, u, v);
        else if (roll < 0.28) lavGroup(bed, u, v);
        else if (roll < 0.56) cosGroup(bed, u, v);
        else grassGroup(bed, u, v);
      }
      u += rr(0.3, 0.6);
      i++; groupIndex++;
    }
  }

  // ---- meshes (one InstancedMesh per part) ----------------------------------
  instanced(buckets.foliage, foliageGeo, foliageMat);
  instanced(buckets.stems, stemGeo, stemMat);
  // Lavender spike heads and allium balls share one mesh; scale distinguishes them.
  instanced(buckets.heads, headGeo, headMat);
  instanced(buckets.petals, petalGeo, petalMat);
  instanced(buckets.leaves, leafGeo, leafMat);
  instanced(buckets.blades, bladeGeo, bladeMat);

  // ---- module contract ------------------------------------------------------
  return {
    group,
    regions: [],
    colliders: [],
    pickables: [],
    update(dt) {
      if (!reducedMotion) timeU.value += dt;
    },
  };
}
