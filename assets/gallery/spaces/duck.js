import { reserveModuleVoice, finishModuleVoice } from '../audio-lease.js';
// duck.js — "O Pato": a 3 m inflatable rubber duck afloat in the reflecting pool
// (pool.js: water x ±3.5, z 24–38, surface y 0.40). The attentive room's mascot: it
// bobs, turns slowly to face the visitor while its printed pupils follow them at once,
// gives a small bow if stared at, and squeaks, squashes, spins and wobbles when
// clicked. Storms make it bob harder; at night it glows faintly from inside.
//
// Cost: one merged mesh (body, head and bill; one MeshPhysicalMaterial with vertex
// colours, seams/eyes/glow in a few shader lines) + one ripple quad on layer 1 (main
// camera only, skipped by the pool's reflection) = 3 draws including the reflection
// pass. update(): a few µs, nothing but two smoothed weather values when the visitor
// is more than 60 m away, no per-frame allocation. No shadows cast (the shadow map is
// static and the duck moves); no textures, no lights.

const TAU = Math.PI * 2;
const X = -0.9, Z = 33.0, WATER = 0.40;   // where it floats (slightly off the axis, far half)
const FAR2 = 60 * 60;

// ---- the shape, in duck space: origin on the waterline, +z = bill, +y = up -------------
const BODY = { cy: 0.52, ax: 1.25, up: 1.18, lo: 0.80, front: 1.58, back: 1.70 };
const HEAD = { x: 0, y: 2.12, z: 0.72, ax: 0.80, ay: 0.78, az: 0.84 };
const O = { x: 0, y: 1.45, z: 0.62 };                       // radial centre, inside body and head
const WING = { y: 0.86, z: -0.32, a: 0.80, b: 0.40, c: 0.955, s: 0.296 }; // panel ellipse, tilted 0.30 rad
const TAIL = { y: 1.30, z: -1.25, dy: 0.55, dz: -0.45, r: 0.65 };         // sculpt "grab" T0 → T0 + d
const BILL_UP = { x: 0, y: 1.98, z: 1.60, ax: 0.42, ay: 0.15, az: 0.40, pitch: 0.10, upper: true };
const BILL_LO = { x: 0, y: 1.86, z: 1.55, ax: 0.36, ay: 0.11, az: 0.34, pitch: 0.04, upper: false };
const EYE_R = 0.185, PUPIL_R = 0.094, PUPIL_SHIFT = 0.068;
const LEAN = 0.03;                                            // the heavy head tips it forward

const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => a - TAU * Math.round(a / TAU);
const easeOutBack = (x) => { const c1 = 1.25, c3 = c1 + 1, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u; };

// Exit distance of the ray o + t·d from inside an axis-aligned ellipsoid (NaN if it misses).
function rayExit(ox, oy, oz, dx, dy, dz, cx, cy, cz, ax, ay, az) {
  const ux = (ox - cx) / ax, uy = (oy - cy) / ay, uz = (oz - cz) / az;
  const vx = dx / ax, vy = dy / ay, vz = dz / az;
  const A = vx * vx + vy * vy + vz * vz, B = ux * vx + uy * vy + uz * vz, C = ux * ux + uy * uy + uz * uz - 1;
  const disc = B * B - A * C;
  return disc < 0 ? NaN : (-B + Math.sqrt(disc)) / A;
}

// The body is four octant-ellipsoids (taller above the girth than below, longer behind
// than in front) meeting with matching tangents, so it stays convex and smooth.
function bodyExit(dx, dy, dz) {
  let best = 0;
  for (let i = 0; i < 4; i++) {
    const up = i < 2, fr = (i & 1) === 0;
    const t = rayExit(O.x, O.y, O.z, dx, dy, dz, 0, BODY.cy, 0, BODY.ax, up ? BODY.up : BODY.lo, fr ? BODY.front : BODY.back);
    if (!(t > 0)) continue;
    if (t > best) best = t;
    if ((O.y + t * dy >= BODY.cy) === up && (O.z + t * dz >= 0) === fr) return t;
  }
  return best;
}

// One continuous inflated skin: body and head joined by a smooth radial union (a fat
// neck), then sculpted: soft waviness, a lower back, an upturned tail, puffed wing
// panels, and a slight sag of the crown.
function skin(dx, dy, dz, out) {
  const rA = bodyExit(dx, dy, dz);
  const rB = rayExit(O.x, O.y, O.z, dx, dy, dz, HEAD.x, HEAD.y, HEAD.z, HEAD.ax, HEAD.ay, HEAD.az) || 0;
  const K = 0.45, h = Math.max(K - Math.abs(rA - rB), 0) / K;
  let r = Math.max(rA, rB) + h * h * K * 0.25;
  r += 0.006 * Math.exp(-(((rA - rB) / 0.10) ** 2)) * Math.sin(9 * Math.atan2(dx, dz)); // neck folds
  let x = O.x + dx * r, y = O.y + dy * r, z = O.z + dz * r;
  const wav = 0.005 * Math.sin(2.3 * x + 1.1) * Math.sin(1.9 * y + 0.3) * Math.sin(2.1 * z + 2.2)
    + 0.0025 * Math.sin(4.7 * x - 0.8) * Math.sin(5.1 * z + 1.4);
  x += dx * wav; y += dy * wav; z += dz * wav;
  if (y > BODY.cy) y = BODY.cy + (y - BODY.cy) * (1 - 0.15 * sstep(0.2, -1.0, z) * (1 - sstep(1.75, 2.0, y)));
  // tail: a sculptor's grab of the rear of the back, up and out into a narrowing point
  const gx = x, gy = y - TAIL.y, gz0 = z - TAIL.z, gz = gz0 > 0 ? gz0 * 1.8 : gz0; // tight toward the neck: keeps the dip in the back
  const g = Math.exp(-(gx * gx + gy * gy + gz * gz) / (TAIL.r * TAIL.r));
  y += TAIL.dy * g; z += TAIL.dz * g; x *= 1 - 0.45 * g;
  // wings: welded panels, puffed out on both flanks (the seam is drawn in the shader)
  const ax = Math.abs(x);
  if (ax > 0.3) {
    const qz = z - WING.z, qy = y - WING.y;
    const u = (-qz * WING.c + qy * WING.s) / WING.a, v = (qz * WING.s + qy * WING.c) / WING.b;
    x += Math.sign(x) * 0.065 * sstep(1.0, 0.62, Math.sqrt(u * u + v * v)) * sstep(0.45, 0.85, ax / BODY.ax);
  }
  y -= 0.045 * sstep(2.45, 2.95, y);
  z += 0.035 * sstep(1.9, 2.9, y);
  out.x = x; out.y = y; out.z = z; out.head = rB > rA;
  return out;
}

function bill(B, dx, dy, dz, out) {
  let lx = dx * B.ax, ly = dy * B.ay, lz = dz * B.az;
  const s = lz / B.az;
  lx *= 1 + 0.2 * sstep(-0.4, 0.9, s);                        // spoon: wider at the front
  if (B.upper && ly > 0) ly *= 0.8;                           // flatter on top
  ly += (B.upper ? 0.05 : 0.04) * (lx / B.ax) ** 2 * sstep(0.1, 0.9, s) + 0.03 * sstep(0.5, 1.0, s); // smile
  const c = Math.cos(B.pitch), sn = Math.sin(B.pitch);
  out.x = B.x + lx; out.y = B.y + ly * c - lz * sn; out.z = B.z + ly * sn + lz * c;
  return out;
}

// Unit directions of a subdivided cube, spherified (no poles, even spacing), welded.
function sphereDirs(THREE, n) {
  const box = new THREE.BoxGeometry(2, 2, 2, n, n, n);
  const p = box.attributes.position, src = box.index;
  const seen = new Map(), dirs = [], remap = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let j = seen.get(key);
    if (j === undefined) {
      j = dirs.length / 3; seen.set(key, j);
      const x2 = x * x, y2 = y * y, z2 = z * z;
      dirs.push(x * Math.sqrt(1 - y2 / 2 - z2 / 2 + y2 * z2 / 3), y * Math.sqrt(1 - z2 / 2 - x2 / 2 + z2 * x2 / 3), z * Math.sqrt(1 - x2 / 2 - y2 / 2 + x2 * y2 / 3));
    }
    remap[i] = j;
  }
  const index = new Uint32Array(src.count);
  for (let i = 0; i < src.count; i++) index[i] = remap[src.getX(i)];
  box.dispose();
  return { dirs, index };
}

// Approximate signed distance to an ellipsoid (for baking contact occlusion).
function sdEll(x, y, z, cx, cy, cz, ax, ay, az) {
  const qx = (x - cx) / ax, qy = (y - cy) / ay, qz = (z - cz) / az;
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt((qx / ax) ** 2 + (qy / ay) ** 2 + (qz / az) ** 2);
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(ax, ay, az);
}
const sdBody = (x, y, z) => sdEll(x, y, z, 0, BODY.cy, 0, BODY.ax, y >= BODY.cy ? BODY.up : BODY.lo, z >= 0 ? BODY.front : BODY.back);
const sdHead = (x, y, z) => sdEll(x, y, z, HEAD.x, HEAD.y, HEAD.z, HEAD.ax, HEAD.ay, HEAD.az);
const sdBill = (x, y, z) => Math.min(
  sdEll(x, y, z, BILL_UP.x, BILL_UP.y, BILL_UP.z, BILL_UP.ax * 1.1, BILL_UP.ay, BILL_UP.az),
  sdEll(x, y, z, BILL_LO.x, BILL_LO.y, BILL_LO.z, BILL_LO.ax * 1.1, BILL_LO.ay, BILL_LO.az));

function buildGeometry(THREE, low) {
  const parts = [];
  const tmp = { x: 0, y: 0, z: 0, head: false };
  const yellow = new THREE.Color(0xffcc1c), orange = new THREE.Color(0xff8a14);
  const addPart = (n, place, color, kind) => {
    const { dirs, index } = sphereDirs(THREE, n);
    const count = dirs.length / 3, pos = new Float32Array(count * 3), owner = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      place(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], tmp);
      pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z;
      owner[i] = kind === 'bill' ? 2 : tmp.head ? 1 : 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    parts.push({ geo, owner, color });
  };
  addPart(low ? 22 : 40, skin, yellow, 'skin');
  addPart(low ? 8 : 16, (x, y, z, o) => bill(BILL_UP, x, y, z, o), orange, 'bill');
  addPart(low ? 6 : 12, (x, y, z, o) => bill(BILL_LO, x, y, z, o), orange, 'bill');

  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let vo = 0, io = 0;
  const DEL = [0.10, 0.22, 0.40], W = [0.5, 0.3, 0.2];
  for (const part of parts) {
    const pa = part.geo.attributes.position.array, na = part.geo.attributes.normal.array, ia = part.geo.index.array;
    const count = pa.length / 3;
    for (let i = 0; i < count; i++) {
      const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2], nx = na[i * 3], ny = na[i * 3 + 1], nz = na[i * 3 + 2];
      // baked contact occlusion: how far the other inflated parts crowd this point
      let occ = 0;
      const own = part.owner[i];
      for (let k = 0; k < 3; k++) {
        const sx = x + nx * DEL[k], sy = y + ny * DEL[k], sz = z + nz * DEL[k];
        let d = Infinity;
        if (own !== 0) d = Math.min(d, sdBody(sx, sy, sz));
        if (own !== 1) d = Math.min(d, sdHead(sx, sy, sz));
        if (own !== 2) d = Math.min(d, sdBill(sx, sy, sz));
        occ += W[k] * clamp((DEL[k] - d) / DEL[k], 0, 1);
      }
      const ao = 1 - 0.5 * clamp(occ, 0, 1);
      const j = (vo + i) * 3;
      P[j] = x; P[j + 1] = y; P[j + 2] = z; N[j] = nx; N[j + 1] = ny; N[j + 2] = nz;
      C[j] = part.color.r * ao; C[j + 1] = part.color.g * ao; C[j + 2] = part.color.b * ao;
    }
    for (let i = 0; i < ia.length; i++) I[io + i] = ia[i] + vo;
    vo += count; io += ia.length;
    part.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  return geo;
}

// ---- shader additions: printed eyes, welded seams, wet waterline, inner glow ----------
const VERT_PARS = /* glsl */`
varying vec3 vDuckObj;
varying float vDuckWY;
varying vec3 vDuckAX;
varying vec3 vDuckAY;
varying vec3 vDuckAZ;`;
const VERT_MAIN = /* glsl */`
vDuckObj = transformed;
vDuckAX = normalMatrix * vec3(1.0, 0.0, 0.0);
vDuckAY = normalMatrix * vec3(0.0, 1.0, 0.0);
vDuckAZ = normalMatrix * vec3(0.0, 0.0, 1.0);
vDuckWY = (modelMatrix * vec4(transformed, 1.0)).y;`;
const FRAG_PARS = /* glsl */`
uniform vec3 uDuckE0;
uniform vec3 uDuckE1;
uniform vec3 uDuckP0;
uniform vec3 uDuckP1;
uniform float uDuckGlow;
uniform float uDuckWater;
varying vec3 vDuckObj;
varying float vDuckWY;
varying vec3 vDuckAX;
varying vec3 vDuckAY;
varying vec3 vDuckAZ;
// slope of a welded seam across signed distance d (m): a soft groove with a fine bead,
// faded out once it is thinner than a pixel
float duckSeam(float d) {
  float fw = fwidth(d) + 1e-5;
  const float w = 0.024, wb = 0.0065;
  float groove = 0.0065 * 2.0 * d / (w * w) * exp(-d * d / (w * w));
  float bead = -0.0016 * 2.0 * d / (wb * wb) * exp(-d * d / (wb * wb));
  return groove * (1.0 - smoothstep(w * 0.6, w * 2.5, fw)) + bead * (1.0 - smoothstep(wb * 0.6, wb * 2.5, fw));
}`;
const FRAG_COLOR = /* glsl */`
{
  float d0 = length(vDuckObj - uDuckE0), d1 = length(vDuckObj - uDuckE1);
  float de = min(d0, d1);
  float dp = d0 < d1 ? length(vDuckObj - uDuckP0) : length(vDuckObj - uDuckP1);
  float ae = fwidth(de) * 0.8 + 1e-4, ap = fwidth(dp) * 0.8 + 1e-4;
  float disc = 1.0 - smoothstep(${EYE_R.toFixed(3)} - ae, ${EYE_R.toFixed(3)} + ae, de);
  float rim = smoothstep(${(EYE_R - 0.017).toFixed(3)} - ae, ${(EYE_R - 0.017).toFixed(3)} + ae, de);
  float pupil = 1.0 - smoothstep(${PUPIL_R.toFixed(3)} - ap, ${PUPIL_R.toFixed(3)} + ap, dp);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.80, 0.81, 0.78), vec3(0.012), max(rim, pupil)), disc);
  float wet = 1.0 - smoothstep(uDuckWater, uDuckWater + 0.09, vDuckWY);
  diffuseColor.rgb *= 1.0 - 0.25 * wet;
}`;
const FRAG_NORMAL = /* glsl */`
vec3 duckTilt;
{
  vec3 o = vDuckObj;
  // centre seam: chest, crown, back, tail (the face is one panel)
  float s1 = duckSeam(o.x) * smoothstep(0.04, 0.3, o.y) * (1.0 - smoothstep(0.95, 1.15, o.z) * smoothstep(1.6, 1.8, o.y));
  float s2 = duckSeam(o.y - 0.55);                                   // girdle round the body
  float s3 = duckSeam(o.z - 0.62) * smoothstep(1.72, 1.95, o.y);     // head: ear to ear over the crown
  vec2 q = vec2(o.z - (${WING.z.toFixed(3)}), o.y - ${WING.y.toFixed(3)});
  vec2 uv = vec2((-q.x * ${WING.c} + q.y * ${WING.s}) / ${WING.a.toFixed(3)}, (q.x * ${WING.s} + q.y * ${WING.c}) / ${WING.b.toFixed(3)});
  float f = length(uv);
  vec2 gf = (uv.x / ${WING.a.toFixed(3)} * vec2(-${WING.c}, ${WING.s}) + uv.y / ${WING.b.toFixed(3)} * vec2(${WING.s}, ${WING.c})) / max(f, 1e-3);
  float gl = max(length(gf), 1e-3);
  float s4 = duckSeam((f - 0.95) / gl) * smoothstep(0.55, 0.75, abs(o.x));   // wing panels
  vec3 gW = (vDuckAZ * gf.x + vDuckAY * gf.y) / gl;
  duckTilt = -(s1 * (vDuckAX - normal * dot(normal, vDuckAX)) + s2 * (vDuckAY - normal * dot(normal, vDuckAY))
             + s3 * (vDuckAZ - normal * dot(normal, vDuckAZ)) + s4 * (gW - normal * dot(normal, gW)));
  normal = normalize(normal + duckTilt);
}`;
const FRAG_CLEARCOAT = /* glsl */`
#ifdef USE_CLEARCOAT
clearcoatNormal = normalize(clearcoatNormal + duckTilt);
#endif`;
const FRAG_EMISSIVE = /* glsl */`
{
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.58) * uDuckGlow * (0.35 + 0.65 * facing);
}`;

const RIPPLE_VERT = /* glsl */`
varying vec2 vP;
varying vec2 vW;
void main() {
  vP = position.xz;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RIPPLE_FRAG = /* glsl */`
uniform float uTime, uAct;
uniform vec3 uSky, uWarm;
uniform vec2 uAxes;
varying vec2 vP;
varying vec2 vW;
void main() {
  vec2 q = (vP - vec2(0.0, -0.04)) / uAxes;
  float rho = length(q);
  float d = (rho - 1.0) * rho / max(length(q / uAxes), 1e-4);    // ≈ metres from the hull
  if (d < -0.04) discard;
  float keep = smoothstep(-0.04, 0.01, d)
    * smoothstep(3.5, 3.36, abs(vW.x)) * smoothstep(24.0, 24.14, vW.y) * smoothstep(38.0, 37.86, vW.y);
  float s = 0.0;
  for (int k = 0; k < 3; k++) {
    float ph = fract(uTime * 0.21 + float(k) * 0.3333);
    float x = (d - 0.05 - ph * 1.3) / (0.10 + 0.14 * ph);
    s += sin(x * 2.2) * exp(-x * x) * (1.0 - ph) * (1.0 - ph);
  }
  s *= uAct;
  float dd = max(d, 0.0);
  float a = (0.24 * exp(-dd / 0.09) + 0.14 * max(-s, 0.0)) * keep;
  vec3 c = (uSky * 0.05 * max(s, 0.0) + uWarm * exp(-dd / 0.5)) * keep;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function build(ctx) {
  const { THREE } = ctx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'duck';

  // ---- the duck ------------------------------------------------------------------------
  const geo = buildGeometry(THREE, low);
  const U = {
    uDuckE0: { value: new THREE.Vector3() }, uDuckE1: { value: new THREE.Vector3() },
    uDuckP0: { value: new THREE.Vector3() }, uDuckP1: { value: new THREE.Vector3() },
    uDuckGlow: { value: 0 }, uDuckWater: { value: WATER },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    name: 'duck-vinyl', vertexColors: true, color: 0xffffff,
    roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, specularIntensity: 0.8,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n' + FRAG_CLEARCOAT)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'o-pato-1';
  const duck = new THREE.Mesh(geo, mat);
  duck.name = 'o-pato';
  duck.castShadow = false;       // static shadow map: a moving caster would leave a frozen shadow
  duck.receiveShadow = true;
  duck.rotation.order = 'YXZ';
  duck.userData.action = { type: 'custom', id: 'duck' };
  duck.userData.label = 'Squeeze O Pato';
  group.add(duck);

  // Printed eyes: anchored on the real skin; pupils are moved toward the visitor each frame.
  const eyeAnchor = (side, E, Nrm) => {
    const az = 0.54 * side, el = 0.28;
    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
    const t = 1 / Math.sqrt((dx / HEAD.ax) ** 2 + (dy / HEAD.ay) ** 2 + (dz / HEAD.az) ** 2);
    const qx = HEAD.x + dx * t, qy = HEAD.y + dy * t, qz = HEAD.z + dz * t;
    const ux = qx - O.x, uy = qy - O.y, uz = qz - O.z, ul = Math.hypot(ux, uy, uz);
    const s = skin(ux / ul, uy / ul, uz / ul, { x: 0, y: 0, z: 0, head: true });
    E.set(s.x, s.y, s.z);
    Nrm.set((qx - HEAD.x) / HEAD.ax ** 2, (qy - HEAD.y) / HEAD.ay ** 2, (qz - HEAD.z) / HEAD.az ** 2).normalize();
  };
  const N0 = new THREE.Vector3(), N1 = new THREE.Vector3();
  eyeAnchor(1, U.uDuckE0.value, N0);
  eyeAnchor(-1, U.uDuckE1.value, N1);
  U.uDuckP0.value.copy(U.uDuckE0.value); U.uDuckP1.value.copy(U.uDuckE1.value);

  // Cheap, exact-enough picking: body and head ellipsoids instead of 25k triangles.
  const PICK = [
    [0, BODY.cy + 0.1, -0.05, BODY.ax, BODY.up * 0.9, (BODY.front + BODY.back) / 2],
    [HEAD.x, HEAD.y, HEAD.z + 0.08, HEAD.ax, HEAD.ay, HEAD.az + 0.1],
    [BILL_UP.x, 1.95, BILL_UP.z + 0.05, 0.5, 0.2, 0.42],
  ];
  const inv = new THREE.Matrix4(), ray = new THREE.Ray(), hitP = new THREE.Vector3(), hitN = new THREE.Vector3();
  duck.raycast = function (raycaster, intersects) {
    inv.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inv);
    let best = Infinity, bi = -1;
    for (let i = 0; i < PICK.length; i++) {
      const [cx, cy, cz, ax, ay, az] = PICK[i];
      const ux = (ray.origin.x - cx) / ax, uy = (ray.origin.y - cy) / ay, uz = (ray.origin.z - cz) / az;
      const vx = ray.direction.x / ax, vy = ray.direction.y / ay, vz = ray.direction.z / az;
      const A = vx * vx + vy * vy + vz * vz, B = ux * vx + uy * vy + uz * vz, C = ux * ux + uy * uy + uz * uz - 1;
      const disc = B * B - A * C;
      if (disc < 0) continue;
      let t = (-B - Math.sqrt(disc)) / A;
      if (t < 0) t = (-B + Math.sqrt(disc)) / A;
      if (t >= 0 && t < best) { best = t; bi = i; }
    }
    if (bi < 0) return;
    hitP.copy(ray.direction).multiplyScalar(best).add(ray.origin);
    const [cx, cy, cz, ax, ay, az] = PICK[bi];
    hitN.set((hitP.x - cx) / (ax * ax), (hitP.y - cy) / (ay * ay), (hitP.z - cz) / (az * az)).normalize();
    hitP.applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(hitP);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: hitP.clone(), object: this, face: { a: 0, b: 0, c: 0, normal: hitN.clone(), materialIndex: 0 } });
  };

  // ---- ripples and contact darkening on the water (layer 1: not in the reflection) ------
  const rippleU = {
    uTime: { value: 0 }, uAct: { value: 0.4 },
    uSky: { value: new THREE.Color(1.1, 1.2, 1.35) }, uWarm: { value: new THREE.Color(0, 0, 0) },
    uAxes: { value: new THREE.Vector2(0.97, 1.26) },
  };
  const rippleGeo = new THREE.PlaneGeometry(5.6, 5.6);
  rippleGeo.rotateX(-Math.PI / 2);
  const ripple = new THREE.Mesh(rippleGeo, new THREE.ShaderMaterial({
    name: 'duck-ripples', uniforms: rippleU, vertexShader: RIPPLE_VERT, fragmentShader: RIPPLE_FRAG,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  ripple.name = 'o-pato-ripples';
  ripple.layers.set(1);
  ripple.renderOrder = 2;
  group.add(ripple);

  // ---- state ---------------------------------------------------------------------------------
  const rm = !!ctx.reducedMotion;
  let t = 0, ph = 0, ripT = 0;
  let yaw = Math.atan2(0 - X, 17.4 - Z), yawV = 0;   // starts facing the hall door
  let spinT = 1, kickT = -1, nodT = -1, gaze = 0, nodded = false;
  let night = 0, storm = 0, glow = 0, lastSqueak = -9, toasted = false, lastCam = null;
  const P0 = U.uDuckP0.value, P1 = U.uDuckP1.value, E0 = U.uDuckE0.value, E1 = U.uDuckE1.value;
  const sky = rippleU.uSky.value, warm = rippleU.uWarm.value;

  const level = (v, flag) => (typeof v === 'number' ? clamp(v, 0, 1) : v === true || (v == null && flag) ? 1 : 0);

  function aim(E, Nn, P, lx, ly, lz, k) {
    let vx = lx - E.x, vy = ly - E.y, vz = lz - E.z;
    const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    const dn = vx * Nn.x + vy * Nn.y + vz * Nn.z;
    let tx = vx - Nn.x * dn, ty = vy - Nn.y * dn, tz = vz - Nn.z * dn;
    let tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (dn < 0 && tl > 1e-4) { tx /= tl; ty /= tl; tz /= tl; tl = 1; }
    const sink = (tl * PUPIL_SHIFT) ** 2 / 1.6;
    P.x += (E.x + tx * PUPIL_SHIFT - Nn.x * sink - P.x) * k;
    P.y += (E.y + ty * PUPIL_SHIFT - Nn.y * sink - P.y) * k;
    P.z += (E.z + tz * PUPIL_SHIFT - Nn.z * sink - P.z) * k;
  }

  function update(dt, frame) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    t += dt;
    // weather, published by the lead as scene.userData.weather = { mode, night, storm }
    const w = ctx.scene && ctx.scene.userData && ctx.scene.userData.weather;
    const kw = Math.min(1, dt * 0.7);
    night += ((w ? level(w.night, w.mode === 'night') : 0) - night) * kw;
    storm += ((w ? level(w.storm, w.mode === 'storm') : 0) - storm) * kw;
    glow += (0.32 * night - glow) * kw;
    U.uDuckGlow.value = glow;

    const cam = frame && frame.camera;
    if (!cam) return;
    lastCam = cam;
    const e = cam.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
    const fx = cx - X, fz = cz - Z, fy = cy - WATER - 1.6;
    if (fx * fx + fz * fz + fy * fy > FAR2) return;          // too far to matter: hold still

    // bobbing, rocking and a slow drift; storms are bigger and choppier
    const m = rm ? 0.35 : 1, amp = (1 + 2.2 * storm) * m;
    ph += dt * (1 + 0.35 * storm);
    let bob = (0.028 * Math.sin(1.13 * ph) + 0.016 * Math.sin(1.97 * ph + 1.1) + 0.009 * Math.sin(3.3 * ph + 0.4)) * amp;
    let pitch = LEAN + (0.018 * Math.sin(0.91 * ph + 0.6) + 0.009 * Math.sin(1.71 * ph + 2.0)) * amp;
    let roll = (0.022 * Math.sin(0.77 * ph + 1.9) + 0.010 * Math.sin(1.53 * ph + 0.2)) * amp + 0.05 * storm * Math.sin(0.23 * t) * m;
    const px = X + (0.10 * Math.sin(0.071 * t) + 0.04 * (1 + storm) * Math.sin(0.19 * t + 1)) * m;
    const pz = Z + (0.14 * Math.sin(0.053 * t + 2) + 0.05 * (1 + storm) * Math.sin(0.17 * t)) * m;

    // it turns, unhurried, to face you (a soft dead zone lets you wander a little)
    let err = wrap(Math.atan2(cx - px, cz - pz) - yaw);
    const ae = Math.abs(err);
    if (ae < 0.09) err *= ae / 0.09;
    yawV += (0.9 * err - 1.5 * yawV + storm * 0.25 * Math.sin(0.43 * t)) * dt;
    const vmax = rm ? 0.3 : 0.55;
    yawV = clamp(yawV, -vmax, vmax);
    yaw = wrap(yaw + yawV * dt);

    // stared at for a few seconds: a small, polite bow
    const tx = px - cx, ty = WATER + 1.6 - cy, tz = pz - cz, tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    if ((-e[8] * tx - e[9] * ty - e[10] * tz) / tl > 0.985 && tl < 40) {
      gaze += dt;
      if (gaze > 2.6 && !nodded && nodT < 0 && kickT < 0) { nodT = 0; nodded = true; }
    } else { gaze = 0; nodded = false; }
    if (nodT >= 0) { nodT += dt; if (nodT < 1.1) pitch += 0.075 * Math.sin(Math.PI * nodT / 1.1) * (rm ? 0.4 : 1); else nodT = -1; }

    // squeezed: squash, dip, wobble, and (motion allowing) one full spin
    let spin = 0, sq = 0;
    if (spinT < 1) { spinT = Math.min(1, spinT + dt / 1.3); spin = spinT < 1 ? TAU * easeOutBack(spinT) : 0; }
    if (kickT >= 0) {
      kickT += dt;
      const dec = Math.exp(-2.6 * kickT), km = rm ? 0.35 : 1;
      roll += 0.10 * dec * Math.sin(9.5 * kickT) * km;
      pitch += 0.06 * dec * Math.sin(8.1 * kickT + 0.9) * km;
      bob -= 0.13 * dec * Math.sin(6.0 * kickT) * km;
      const r = Math.min(1, kickT / 0.06);
      sq = 0.09 * r * r * (3 - 2 * r) * Math.exp(-4.2 * kickT) * Math.cos(11 * Math.max(kickT - 0.06, 0)) * (rm ? 0.5 : 1);
      if (kickT > 3) kickT = -1;
    }

    const heading = yaw + spin;
    duck.position.set(px, WATER + bob, pz);
    duck.rotation.set(pitch, heading, roll);
    duck.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    ripple.position.set(px, WATER + 0.004, pz);
    ripple.rotation.y = heading;
    ripT += dt * (1 + 0.6 * storm);
    rippleU.uTime.value = ripT;
    rippleU.uAct.value = 0.35 + 0.65 * storm + (kickT >= 0 ? 1.2 * Math.exp(-1.2 * kickT) : 0);
    const day = (1 - 0.65 * storm) * (1 - 0.96 * night);
    sky.setRGB(1.1 * day, 1.2 * day, 1.35 * day);
    warm.setRGB(0.25 * glow, 0.15 * glow, 0.06 * glow);

    // the printed pupils find you immediately, whatever the body is doing
    const c = Math.cos(heading), s = Math.sin(heading);
    const wx = cx - px, wy = cy - WATER - bob, wz = cz - pz;
    const lx = wx * c - wz * s, lz = wx * s + wz * c;
    const k = Math.min(1, dt * 10);
    aim(E0, N0, P0, lx, wy, lz, k);
    aim(E1, N1, P1, lx, wy, lz, k);
  }

  // ---- the squeak: a big rubber reed, pitch bending down, then the 'eek' of air back in --
  let noise = null, noiseCtx = null;
  function voice(ac, out, t0, dur, f0, fPeak, fEnd, amp) {
    const lease = reserveModuleVoice(ctx, 1, false, dur + .06, out, t0); if (!lease) return; t0 = Math.max(t0, lease.startAt);
    const o = ac.createOscillator(), am = ac.createGain(), lfo = ac.createOscillator(), lfoG = ac.createGain();
    const vib = ac.createOscillator(), vibG = ac.createGain(), env = ac.createGain();
    const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g2 = ac.createGain(), body = ac.createBiquadFilter(), gb = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(fPeak, t0 + dur * 0.12);
    o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    am.gain.value = 0.72; lfo.frequency.value = 36; lfoG.gain.value = 0.28;   // reed flutter: the rubbery buzz
    lfo.connect(lfoG); lfoG.connect(am.gain);
    vib.frequency.value = 7.5; vibG.gain.value = f0 * 0.012; vib.connect(vibG); vibG.connect(o.frequency);
    f1.type = 'bandpass'; f1.Q.value = 4.5;                                    // formants of the rubber cavity
    f1.frequency.setValueAtTime(1450, t0); f1.frequency.exponentialRampToValueAtTime(980, t0 + dur);
    f2.type = 'bandpass'; f2.Q.value = 6;
    f2.frequency.setValueAtTime(2900, t0); f2.frequency.exponentialRampToValueAtTime(2300, t0 + dur);
    g2.gain.value = 0.45;
    body.type = 'lowpass'; body.frequency.value = 1600; body.Q.value = 0.7; gb.gain.value = 0.3;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(amp, t0 + 0.03);
    env.gain.setValueAtTime(amp, t0 + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(am);
    am.connect(f1); f1.connect(env);
    am.connect(f2); f2.connect(g2); g2.connect(env);
    am.connect(body); body.connect(gb); gb.connect(env);
    env.connect(lease.gain);
    const end = t0 + dur + 0.05;
    lease.track(o); lease.track(lfo); lease.track(vib); finishModuleVoice(lease, vib);
    o.start(t0); lfo.start(t0); vib.start(t0);
    o.stop(end); lfo.stop(end); vib.stop(end);
  }
  function hiss(ac, out, t0, dur, amp) {
    const lease = reserveModuleVoice(ctx, 1, false, dur + .04, out, t0); if (!lease) return; t0 = Math.max(t0, lease.startAt);
    if (!noise || noiseCtx !== ac) {
      const n = Math.floor(ac.sampleRate * 0.5);
      noise = ac.createBuffer(1, n, ac.sampleRate); noiseCtx = ac;
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(lease.gain);
    lease.track(src); finishModuleVoice(lease, src); src.start(t0); src.stop(t0 + dur + 0.02);
  }
  function squeak(gain, pan) {
    const A = ctx.audio;
    if (!A) return;
    let ac = null, bus = null;
    try { if (A.muted) return; ac = A.context; bus = A.bus; } catch (err) { return; }
    if (!ac || !bus || ac.state === 'closed') return;
    try {
      if (ac.state === 'suspended' && ac.resume) ac.resume();
      const t0 = ac.currentTime + 0.015;
      const out = ac.createGain();
      out.gain.value = gain;
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(bus); } else out.connect(bus);
      voice(ac, out, t0, 0.58, 760, 900, 420, 1.0);
      voice(ac, out, t0 + 0.66, 0.26, 640, 1050, 820, 0.5);
      hiss(ac, out, t0, 0.08, 0.22);
      hiss(ac, out, t0 + 0.5, 0.16, 0.12);
    } catch (err) { /* audio unavailable */ }
  }

  function onPick() {
    if (t - lastSqueak < 0.22) return;
    lastSqueak = t;
    kickT = 0;
    if (!rm && spinT >= 1) spinT = 0;
    let gain = 0.3, pan = 0;
    if (lastCam) {
      const e = lastCam.matrixWorld.elements;
      const dx = duck.position.x - e[12], dy = duck.position.y + 1.5 - e[13], dz = duck.position.z - e[14];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      gain *= clamp(8 / d, 0.25, 1);
      pan = clamp((e[0] * dx + e[1] * dy + e[2] * dz) / d, -1, 1) * 0.7;
    }
    squeak(gain, pan);
    if (!toasted) {
      toasted = true;
      try { ctx.ui && ctx.ui.toast && ctx.ui.toast('O Pato · it was watching you first'); } catch (err) { /* no toast */ }
    }
  }

  update(0, null);
  duck.position.set(X, WATER, Z);
  duck.rotation.set(LEAN, yaw, 0);
  ripple.position.set(X, WATER + 0.004, Z);
  ripple.rotation.y = yaw;

  return { group, regions: [], colliders: [], pickables: [duck], update, onPick };
}
