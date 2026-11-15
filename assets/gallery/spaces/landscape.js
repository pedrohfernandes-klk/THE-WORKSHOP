// THE WORKSHOP campus — landscape: rolling countryside out to the horizon.
// Flat y=-0.03 inside the campus rectangle (hole r=17 at (-50,30) discarded in-shader for the amphitheatre),
// soft hills 15-40 m at 300-800 m, patchwork fields, hedgerow tree lines, custom aerial perspective.
const X0 = -66, X1 = 68, Z0 = -48, Z1 = 84, FLAT_Y = -0.03;
const HOLE = { x: -50, z: 30, r: 17 };
const HAZE = [0.37, 0.39, 0.46]; // horizon haze, linear (mixed before the colour-space conversion)

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); a *= 0.5; f *= 2.03; }
  return s; // ~0..1 (mean 0.5)
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// distance outside the campus rectangle (0 inside)
function rectDist(x, z) {
  const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1);
  return Math.hypot(dx, dz);
}
export function heightAt(x, z) {
  const d = rectDist(x, z);
  if (d <= 0) return FLAT_Y;
  const cx = 1, cz = 11, r = Math.hypot(x - cx, z - cz);
  // gentle meadow undulation, growing away from the campus
  const roll = (fbm(x * 0.011, z * 0.011, 3) - 0.5) * 7 * sstep(12, 140, d);
  const micro = (fbm(x * 0.07, z * 0.07, 2) - 0.5) * 0.7 * sstep(6, 60, d);
  // big soft hills out at 300-800 m, wrapping the horizon
  const hn = fbm(x * 0.0032 + 3.1, z * 0.0032 - 1.7, 4);
  const hills = Math.max(0, hn - 0.36) * 120 * sstep(160, 450, r) * (0.7 + 0.5 * sstep(500, 1100, r));
  const ridge = sstep(700, 1500, r) * 14 * (0.5 + fbm(x * 0.002, z * 0.002, 2));
  return FLAT_Y + (roll + micro + hills + ridge) * sstep(0, 45, d) + Math.min(d, 6) * 0.0; 
}

function patchMaterial(mat, THREE, kind) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = mat.userData.uHaze || (mat.userData.uHaze = { value: new THREE.Vector3(...HAZE) });
    sh.uniforms.uHole = { value: new THREE.Vector3(HOLE.x, HOLE.z, HOLE.r) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const noiseFns = /* glsl */`
      varying vec3 vWP; uniform vec3 uHaze; uniform vec3 uHole;
      float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(lh(i),lh(i+vec2(1,0)),f.x), mix(lh(i+vec2(0,1)),lh(i+vec2(1,1)),f.x), f.y); }
      float lfbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*lvn(p); p=p*2.03+vec2(7.1,3.7); a*=.5; } return s; }`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + noiseFns)
      .replace('#include <map_fragment>', kind === 'terrain' ? /* glsl */`
        #include <map_fragment>
        {
          if (distance(vWP.xz, uHole.xy) < uHole.z) discard;
          float dist = length(vWP - cameraPosition);
          vec2 w = vWP.xz;
          // second, rotated, differently scaled sample to break tiling
          vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * w * 0.0613 + 0.37;
          vec3 c2 = texture2D(map, uv2).rgb;
          float m1 = lfbm(w * 0.0071);
          vec3 base = mix(diffuseColor.rgb, c2, 0.35 + 0.4 * m1);
          // meadow palette: lush green / dry gold / brownish, large scale
          float m2 = lfbm(w * 0.0023 + 11.0), m3 = lfbm(w * 0.019 + 5.0);
          vec3 lush = vec3(0.40, 0.78, 0.26), dry = vec3(0.85, 0.80, 0.45), loam = vec3(0.74, 0.62, 0.46);
          vec3 tint = mix(lush, dry, smoothstep(0.55, 0.8, m2) * 0.7);
          tint = mix(tint, loam, 0.45 * smoothstep(0.62, 0.8, m3));
          base *= tint * (0.78 + 0.5 * m3);
          // patchwork fields from far-ish onward: rotated rectangles, crops of varying colour
          vec2 fp = mat2(0.94, -0.34, 0.34, 0.94) * w / vec2(95.0, 140.0);
          vec2 cell = floor(fp); float fh = lh(cell), fh2 = lh(cell + 9.3);
          vec3 crop = fh < 0.3 ? vec3(0.78, 0.7, 0.30) : fh < 0.55 ? vec3(0.34, 0.5, 0.2) : fh < 0.8 ? vec3(0.45, 0.62, 0.26) : vec3(0.52, 0.4, 0.26);
          crop *= 0.85 + 0.3 * fh2;
          vec2 fe = abs(fract(fp) - 0.5);
          float edge = smoothstep(0.5, 0.485, max(fe.x, fe.y));
          float fieldAmt = smoothstep(90.0, 260.0, dist) * (0.35 + 0.5 * smoothstep(0.3, 0.6, lh(cell + 3.0)));
          crop *= mix(0.6, 1.0, edge); // darker hedge/headland line along field edges
          // far away the photographed detail averages out
          vec3 avg = vec3(0.30, 0.36, 0.18) * tint * 1.4;
          base = mix(base, crop * 0.36 + avg * 0.4, fieldAmt);
          base = mix(base, avg, smoothstep(120.0, 700.0, dist) * 0.8);
          diffuseColor.rgb = base;
        }` : '#include <map_fragment>')
      .replace('#include <color_fragment>', kind === 'tree' ? `
        #include <color_fragment>
        { float lf = lvn(vWP.xz * 1.7 + vWP.y * 2.3) * 0.6 + lvn(vWP.xz * 5.1 - vWP.y * 3.7) * 0.4;
          diffuseColor.rgb *= 0.3 + 0.85 * lf; diffuseColor.rgb *= vec3(1.0, 1.08, 0.8); }` : '#include <color_fragment>')
      .replace('#include <fog_fragment>', /* glsl */`
        {
          float hd = length(vWP - cameraPosition);
          float hz = 1.0 - exp(-pow(hd * 0.0009, 1.5));
          hz = mix(hz, hz * 0.55 + 0.45 * smoothstep(900.0, 1500.0, hd), 0.0);
          hz = min(1.0, hz * (1.12 - 0.5 * clamp(vWP.y / 70.0, 0.0, 1.0)) + smoothstep(1100.0, 1650.0, hd));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(hz, 0.0, 1.0));
        }
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'landscape-' + kind;
}

export function build(ctx) {
  const { THREE, M, quality } = ctx;
  const group = new THREE.Group();
  group.name = 'landscape';
  const low = quality === 'low';

  // ---- terrain: polar mesh, dense near, sparse far -------------------------------------------
  const cx = 1, cz = 11, R = 1700;
  const radii = [0];
  for (let r = 12; r <= 140; r += low ? 16 : 8) radii.push(r);
  for (let r = radii[radii.length - 1]; r < R;) { r *= low ? 1.14 : 1.075; radii.push(Math.min(r, R)); }
  const SEC = low ? 160 : 288;
  const nv = (radii.length - 1) * SEC + 1;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  let vi = 0;
  const put = (x, z) => {
    const y = heightAt(x, z), e = 3;
    const hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
    const il = 1 / Math.hypot(hx, 2 * e, hz);
    pos.set([x, y, z], vi * 3); nor.set([-hx * il, 2 * e * il, -hz * il], vi * 3); uv.set([x, z], vi * 2); vi++;
  };
  put(cx, cz);
  for (let i = 1; i < radii.length; i++) for (let s = 0; s < SEC; s++) {
    const a = (s / SEC) * Math.PI * 2;
    put(cx + Math.cos(a) * radii[i], cz + Math.sin(a) * radii[i]);
  }
  const idx = [];
  const at = (i, s) => 1 + (i - 1) * SEC + (s % SEC);
  for (let s = 0; s < SEC; s++) idx.push(0, at(1, s + 1), at(1, s));
  for (let i = 1; i < radii.length - 1; i++) for (let s = 0; s < SEC; s++) {
    const a = at(i, s), b = at(i, s + 1), c = at(i + 1, s), d = at(i + 1, s + 1);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const tmat = M.get('terrain', { tile: 9, roughness: 1 }).clone();
  tmat.polygonOffset = true; tmat.polygonOffsetFactor = 2; tmat.polygonOffsetUnits = 2;
  patchMaterial(tmat, THREE, 'terrain');
  const terrain = new THREE.Mesh(geo, tmat);
  terrain.receiveShadow = true;
  terrain.frustumCulled = false;
  terrain.name = 'terrain';
  group.add(terrain);

  // ---- hedgerow / tree lines: instanced low-poly clumps ---------------------------------------
  const clumps = [];
  const rnd = (() => { let s = 20240611; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; })();
  const nLines = low ? 22 : 46;
  for (let l = 0; l < nLines; l++) {
    const ang = rnd() * Math.PI * 2, dist = 150 + Math.pow(rnd(), 0.8) * 1100;
    let x = cx + Math.cos(ang) * dist, z = cz + Math.sin(ang) * dist;
    const dir = rnd() * Math.PI * 2, len = 6 + Math.floor(rnd() * 26), big = rnd() < 0.3;
    let da = dir;
    for (let k = 0; k < len; k++) {
      if (rectDist(x, z) > 170) {
        const sz = (big ? 8 : 4.2) * (0.7 + rnd() * 0.7) * (1 + dist / 1800);
        clumps.push([x + (rnd() - 0.5) * 4, z + (rnd() - 0.5) * 4, sz, rnd()]);
      }
      da += (rnd() - 0.5) * 0.25;
      const step = (big ? 11 : 7) * (0.8 + rnd() * 0.5);
      x += Math.cos(da) * step; z += Math.sin(da) * step;
    }
  }
  // scattered lone trees / copses on the nearer meadows
  for (let i = 0; i < (low ? 40 : 110); i++) {
    const ang = rnd() * Math.PI * 2, dist = 110 + rnd() * 500;
    const x = cx + Math.cos(ang) * dist, z = cz + Math.sin(ang) * dist;
    if (rectDist(x, z) > 150) clumps.push([x, z, 5 + rnd() * 5, rnd()]);
  }
  const cg = new THREE.IcosahedronGeometry(1, 3);
  // squash into a rounder crown with a lumpy silhouette
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const k = 0.82 + 0.3 * hash2(Math.round(cp.getX(i) * 50), Math.round(cp.getZ(i) * 50 + cp.getY(i) * 31));
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i) * k * 0.95, cp.getZ(i) * k);
  }
  for (let i = 0; i < cp.count; i++) { // smooth crown normals, leafy lumps come from the shader
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), l = Math.hypot(x, y, z) || 1;
    cg.attributes.normal.setXYZ(i, x / l, y / l, z / l);
  }
  const tm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  patchMaterial(tm, THREE, 'tree');
  const trees = new THREE.InstancedMesh(cg, tm, clumps.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  clumps.forEach(([x, z, s, r], i) => {
    p.set(x, heightAt(x, z) + s * 0.75, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
    sc.set(s * (1.3 + r * 0.3), s * (0.85 + r * 0.3), s * (1.3 + (1 - r) * 0.3));
    trees.setMatrixAt(i, m4.compose(p, q, sc));
    col.setRGB(0.07 + r * 0.05, 0.15 + r * 0.08, 0.05 + r * 0.03);
    trees.setColorAt(i, col);
  });
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  trees.frustumCulled = false;
  trees.name = 'treelines';
  group.add(trees);

  // Every hover / centre-prompt / tap raycast walked all ~30k terrain triangles
  // (~9k on low): its bounding sphere always contains the camera, so neither the
  // sphere test nor raycaster.far prunes it. Inside the campus rectangle the
  // terrain is exactly the plane y = FLAT_Y (outside it nothing is walkable or
  // pickable within the 60 m pick range), so intersect that plane analytically,
  // honouring the amphitheatre hole the shader discards. The triangle test
  // ignored that hole, so an invisible plane blocked picks into the bowl from the rim.
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLAT_Y);
  const pickHit = new THREE.Vector3();
  terrain.raycast = (raycaster, intersects) => {
    if (!raycaster.ray.intersectPlane(pickPlane, pickHit)) return;
    if (pickHit.x < X0 || pickHit.x > X1 || pickHit.z < Z0 || pickHit.z > Z1) return;
    if (Math.hypot(pickHit.x - HOLE.x, pickHit.z - HOLE.z) < HOLE.r) return;
    const distance = raycaster.ray.origin.distanceTo(pickHit);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: pickHit.clone(), object: terrain, face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(0, 1, 0), materialIndex: 0 } });
  };
  // Tree lines stand 150 m+ out, always beyond the 60 m pick range: skip the
  // per-instance matrix work (~900 instances) on every pick.
  trees.raycast = () => {};
  return { group, regions: [], colliders: [], pickables: [], update() {}, onPick() {} };
}
