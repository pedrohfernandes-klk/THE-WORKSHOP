// THE WORKSHOP — the room. A tall, daylit museum hall rendered as architecture:
// plaster with analytic baked light, a polished-concrete reflector floor, a
// skylight light-well, track spots with real scallop pools, framed works.
//
// Units are metres, y up. See docs/gallery/BRIEF.md section 3 and 4.3.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
export const EYE_HEIGHT = 1.62;
export const START = {
  position: new THREE.Vector3(0, 1.62, 13.5),
  target: new THREE.Vector3(0, 1.62, 0),
};

const HX = 6.5; // hall half width
const HZ = 17; // hall half length
const HY = 6.4; // hall height
const DOOR_W = 2.6;
const DOOR_H = 3.6;
const SKY_X = 1.8;
const SKY_Z = 15;
const WELL = 0.8;
const TRACK_X = 4.4;
const TRACK_Y = 6.36;

export const SLOTS = (() => {
  const out = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  out.push({ index: 0, id: 'hero', kind: 'hero', position: v(0, 2.8, -16.98), normal: v(0, 0, 1), box: { w: 8.0, h: 4.6 } });
  const zs = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
  zs.forEach((z, i) => out.push({ index: 1 + i, id: `left-${i + 1}`, kind: 'side', position: v(-HX, 2.0, z), normal: v(1, 0, 0), box: { w: 3.6, h: 3.6 } }));
  zs.forEach((z, i) => out.push({ index: 7 + i, id: `right-${i + 1}`, kind: 'side', position: v(HX, 2.0, z), normal: v(-1, 0, 0), box: { w: 3.6, h: 3.6 } }));
  out.push({ index: 13, id: 'door-left', kind: 'door', position: v(-3.9, 2.0, HZ), normal: v(0, 0, -1), box: { w: 2.6, h: 3.2 } });
  return out;
})();

const FAMILY_AREA = { matter: 5.0, signal: 4.2, archive: 1.3 };

function displaySize(work, slot) {
  const a = work.aspect || (work.w && work.h ? work.w / work.h : 1);
  const area = slot.kind === 'hero' ? 26 : FAMILY_AREA[work.family] ?? 4.2;
  let h = Math.sqrt(area / a);
  let w = h * a;
  const k = Math.min(1, slot.box.w / w, slot.box.h / h);
  w *= k;
  h *= k;
  if (h < 0.55) {
    h = 0.55;
    w = h * a;
  }
  return { w, h };
}
function hangCenterY(slot, h) {
  return slot.kind === 'hero' ? Math.max(2.4, 0.8 + h / 2) : Math.max(1.6, 0.6 + h / 2);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function mergeGeometries(list) {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += c;
    io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const g of list) g.dispose();
  return out;
}

// box centred at (cx,cy,cz); `alongY` swaps UVs so wood grain runs along y
function boxPart(cx, cy, cz, sx, sy, sz, alongY = false) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (alongY) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setXY(i, uv.getY(i), u);
    }
  }
  g.translate(cx, cy, cz);
  return g;
}

function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ---------------------------------------------------------------------------
// Generated textures
// ---------------------------------------------------------------------------
function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// soft elliptical "scallop" of a track spot washing a wall
function makePoolTexture() {
  const S = 256;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = (i + 0.5) / S * 2 - 1;
      const y = 1 - (j + 0.5) / S * 2; // +1 = top
      // light arrives from above: the pool is a rounded arch, brightest in the upper-middle
      const ex = x / 0.98;
      const ey = (y - 0.10) / (y > 0.10 ? 0.92 : 0.98);
      const r = Math.hypot(ex, ey);
      let I = smooth(1.0, 0.0, r);
      I = Math.pow(I, 1.7);
      I *= 0.38 + 0.62 * smooth(-1.0, 0.75, y);
      const v = Math.max(0, Math.min(255, Math.round(I * 255)));
      const o = (j * S + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function makeOakTexture() {
  const S = 512;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      // grain runs along u (canvas x)
      const warp = vnoise(i * 0.004, j * 0.03) * 5.0;
      const ring = 0.5 + 0.5 * Math.sin(j * 0.16 + warp * 3.0 + vnoise(i * 0.01, j * 0.2) * 2.0);
      const pores = hash2(Math.floor(i / 5), j) > 0.93 ? -0.07 : 0;
      const b = 0.80 + 0.17 * ring + pores + (vnoise(i * 0.02, j * 0.5) - 0.5) * 0.08;
      const o = (j * S + i) * 4;
      img.data[o] = Math.min(255, 205 * b);
      img.data[o + 1] = Math.min(255, 164 * b);
      img.data[o + 2] = Math.min(255, 112 * b);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function makeWeaveTexture() {
  const S = 128;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const cell = 8;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const cx = Math.floor(i / cell);
      const cy = Math.floor(j / cell);
      const fx = (i % cell) / cell;
      const fy = (j % cell) / cell;
      const over = (cx + cy) & 1;
      let h = over ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      h = 0.5 + 0.35 * h + (hash2(i, j) - 0.5) * 0.12;
      const v = Math.round(255 * h);
      const o = (j * S + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeDaylightTexture() {
  const c = canvasOf(32, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#fffdf8');
  g.addColorStop(0.45, '#ffffff');
  g.addColorStop(0.7, '#f6f1e6');
  g.addColorStop(0.86, '#e4dccb');
  g.addColorStop(1, '#f1ead9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeDiffuserTexture() {
  // very soft luminance variation of a stretched-membrane skylight diffuser
  const w = 64;
  const h = 512;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = i / (w - 1) * 2 - 1;
      const z = j / (h - 1) * 2 - 1;
      const cx = Math.pow(Math.max(0, 1 - x * x), 1.4);
      let b = 0.52 + 0.48 * cx - 0.18 * Math.pow(Math.abs(z), 5);
      b += (vnoise(i * 0.15, j * 0.05) - 0.5) * 0.06 + Math.sin(z * 31.4) * 0.012;
      const v = Math.round(255 * Math.min(1, b));
      const o = (j * w + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let fontPromise = null;
function ensureFonts() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
    const defs = [
      ['Instrument Serif', 'instrument-serif-400.woff2', { weight: '400' }],
      ['Instrument Sans', 'instrument-sans-variable.woff2', { weight: '400 700' }],
    ];
    await Promise.all(
      defs.map(async ([fam, file, desc]) => {
        const face = new FontFace(fam, `url(${new URL(`../fonts/${file}`, import.meta.url).href})`, desc);
        await face.load();
        document.fonts.add(face);
      }),
    );
  })().catch(() => {});
  return fontPromise;
}

const PLAQUE_PX = { w: 880, h: 560 };
function drawPlaque(canvas, work) {
  const ctx = canvas.getContext('2d');
  const { w, h } = PLAQUE_PX;
  ctx.fillStyle = '#f8f7f3';
  ctx.fillRect(0, 0, w, h);
  const pad = 58;
  ctx.fillStyle = '#15120e';
  ctx.textBaseline = 'alphabetic';
  // title, Instrument Serif, shrinking to fit two lines
  let size = 74;
  const maxW = w - pad * 2;
  let lines = [work.title || ''];
  for (; size >= 46; size -= 4) {
    ctx.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
    lines = wrap(ctx, work.title || '', maxW);
    if (lines.length <= 2) break;
  }
  let y = pad + size * 0.82;
  for (const ln of lines.slice(0, 2)) {
    ctx.fillText(ln, pad, y);
    y += size * 1.02;
  }
  // hairline
  ctx.fillStyle = 'rgba(21,18,14,0.22)';
  ctx.fillRect(pad, h - 196, 64, 3);
  ctx.fillStyle = 'rgba(21,18,14,0.74)';
  ctx.font = '400 33px "Instrument Sans", system-ui, sans-serif';
  const med = (work.medium || '').toString();
  const medLines = wrap(ctx, med, maxW).slice(0, 2);
  let my = h - 138;
  for (const ln of medLines) {
    ctx.fillText(ln, pad, my);
    my += 41;
  }
  ctx.fillStyle = 'rgba(21,18,14,0.52)';
  ctx.font = '500 25px "Instrument Sans", system-ui, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3.5px';
  ctx.fillText((work.no || '').toString().toUpperCase(), pad, h - 48);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ---------------------------------------------------------------------------
// GLSL shared by the plaster, the floor and the artworks
// ---------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */ `
float gh21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gvn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh21(i), gh21(i + vec2(1.0, 0.0)), f.x), mix(gh21(i + vec2(0.0, 1.0)), gh21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float gfbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gvn(p); p = p * 2.03 + vec2(11.7, 3.1); a *= 0.5; }
  return s;
}
`;

const GLSL_FLOOR_BASE = /* glsl */ `
uniform float uSky;
uniform float uDay;
uniform vec3 uTint;
// polished warm-grey concrete: albedo with analytic lighting (skylight strip,
// daylight from the door, contact darkening at the walls, saw-cut joints)
vec3 floorBase(vec3 W, out float joint) {
  vec2 p = W.xz;
  float cloud = gfbm(p * 0.22);                 // large tonal clouds
  float blot = gfbm(p * 1.3 + 7.0);              // mid mottling
  float m = gvn(p * 7.0);
  float mm = gvn(p * 41.0);
  float agg = gh21(floor(p * 260.0));            // aggregate speckle
  vec3 col = vec3(0.205, 0.192, 0.176);
  col *= 0.74 + 0.62 * cloud + (blot - 0.5) * 0.22 + (m - 0.5) * 0.05 + (mm - 0.5) * 0.04;
  col *= 1.0 + (agg - 0.5) * 0.07 + step(0.985, agg) * 0.10;
  col.b *= 0.96 + 0.07 * gvn(p * 0.6);
  col.r *= 1.0 + 0.04 * (blot - 0.5);
  // hairline saw cuts on a 4 m grid
  vec2 g = abs(fract((p + vec2(2.0, 0.0)) / 4.0 + 0.5) - 0.5) * 4.0;
  float jd = min(g.x, g.y);
  float fw = fwidth(jd) + 1e-5;
  joint = 1.0 - smoothstep(0.0009, 0.0009 + fw * 1.1 + 0.0006, jd);
  col *= 1.0 - 0.09 * joint;
  float sk = exp(-pow(abs(p.x - 0.6) / 3.4, 2.0)) * (1.0 - smoothstep(12.0, 18.0, abs(p.y)));
  float dp = exp(-pow(p.x / 3.0, 2.0)) * smoothstep(5.0, 17.4, p.y);
  float light = (0.30 + 0.70 * uSky) * (0.78 + 0.85 * sk * uSky) + 1.0 * dp * uDay;
  float dx = ${HX.toFixed(1)} - abs(p.x);
  float dzE = p.y + ${HZ.toFixed(1)};
  float dzD = ${HZ.toFixed(1)} - p.y;
  float doorOpen = (1.0 - smoothstep(1.2, 1.6, abs(p.x))) * step(0.0, p.y);
  dzD = mix(dzD, 9.0, doorOpen);
  float d = min(dx, min(dzE, dzD));
  float ao = 0.70 + 0.30 * smoothstep(0.0, 1.3, d);
  ao *= mix(0.04, 1.0, smoothstep(0.012, 0.026, d));
  return col * light * ao * uTint;
}
`;


const GLSL_SHAFT = /* glsl */ `
const vec3 SUNDIR = normalize(vec3(0.16, -1.0, 0.22));
float shaftDensity(vec3 p, float T) {
  float h = ${HY.toFixed(1)} - p.y;
  if (h < 0.0 || p.y < 0.0) return 0.0;
  vec3 q = p - SUNDIR * (h / -SUNDIR.y);
  float soft = 0.05 + 0.12 * h;
  float m = smoothstep(0.0, soft, ${SKY_X.toFixed(1)} - abs(q.x)) * smoothstep(0.0, soft * 1.5, ${SKY_Z.toFixed(1)} - abs(q.z));
  float dz = abs(fract((q.z + ${SKY_Z.toFixed(1)}) / 1.5 + 0.5) - 0.5) * 1.5;
  float bw = 0.036;
  float blur = 0.04 + 0.22 * h;
  float k = 0.62 * exp(-h / 2.6);
  m *= (1.0 - (1.0 - smoothstep(bw, bw + blur, dz)) * k) * (1.0 - (1.0 - smoothstep(bw, bw + blur, abs(q.x))) * k);
  float nf = gfbm(vec2(p.x * 0.4 + p.y * 0.12 + T * 0.012, p.z * 0.22 - p.y * 0.08 - T * 0.009));
  float n = 0.25 + 3.0 * nf * nf;
  return m * n * (1.0 - 0.45 * smoothstep(0.0, ${HY.toFixed(1)}, h));
}
`;

// ---------------------------------------------------------------------------
// The floor shader (Reflector)
// ---------------------------------------------------------------------------
const FloorShader = {
  name: 'GalleryFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uSky: { value: 1 },
    uDay: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uBlur: { value: 3.4 },
    uRefl: { value: 1 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vW;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 color;
    uniform vec2 uTexel;
    uniform float uBlur;
    uniform float uRefl;
    varying vec4 vUv;
    varying vec3 vW;
    ${GLSL_NOISE}
    ${GLSL_FLOOR_BASE}
    const vec2 PD[12] = vec2[12](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
      vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
      vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      float joint;
      vec3 base = floorBase(vW, joint);
      vec3 V = cameraPosition - vW;
      float dist = length(V);
      V /= dist;
      float c = clamp(V.y, 0.0, 1.0);
      float graze = 1.0 - c;
      float F = 0.04 + 0.46 * pow(graze, 2.8);
      vec2 p = vW.xz;
      float cl = gfbm(p * 0.32);
      // micro-variation of the polish: wobbles the reflection a little
      vec2 wob = (vec2(gvn(p * 3.0), gvn(p * 3.0 + 31.7)) - 0.5) * 0.0026
               + (vec2(gvn(p * 23.0), gvn(p * 19.0 + 5.0)) - 0.5) * 0.0016;
      vec2 uv = vUv.xy / vUv.w + wob * (0.35 + 0.65 * graze);
      float rad = uBlur * (0.45 + 1.15 * graze) * (0.85 + 0.3 * cl);
      float lod = clamp(log2(max(rad * 1.5, 1.0)), 0.0, 4.0);
      float ang = ign(gl_FragCoord.xy) * 6.2831853;
      float cs = cos(ang), sn = sin(ang);
      mat2 R = mat2(cs, -sn, sn, cs);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        vec2 o = R * PD[i] * rad * uTexel;
        vec3 sv = textureLod(tDiffuse, clamp(uv + o, vec2(0.001), vec2(0.999)), lod).rgb;
        if (!(sv.r >= 0.0 && sv.g >= 0.0 && sv.b >= 0.0 && sv.r < 1e4 && sv.g < 1e4 && sv.b < 1e4)) sv = vec3(0.3);
        acc += min(sv, vec3(0.85));
      }
      vec3 refl = acc / 12.0;
      refl *= vec3(0.965, 0.945, 0.915) * (0.82 + 0.36 * cl) * uTint;
      
      // fade the reflection very slightly with distance (haze of satin polish)
      refl *= mix(1.0, 0.82, smoothstep(8.0, 34.0, dist));
      vec3 outc = base * (1.0 - F) + refl * F * uRefl;
      gl_FragColor = vec4(outc, 1.0);
    }`,
};

// ---------------------------------------------------------------------------
// Plaster (walls, ceiling, well, reveals): MeshStandardMaterial + analytic bake
// ---------------------------------------------------------------------------
function makePlaster(U) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSky = U.uSky;
    shader.uniforms.uDay = U.uDay;
    shader.uniforms.uTint = U.uTint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBW;
uniform float uSky; uniform float uDay; uniform vec3 uTint;
${GLSL_NOISE}
float plasterBake(vec3 p) {
  float h = clamp(p.y / ${HY.toFixed(1)}, 0.0, 1.2);
  float v = mix(0.80, 1.02, smoothstep(0.0, 0.5, h));
  v *= 1.0 - 0.26 * smoothstep(0.78, 1.0, h);
  v *= 1.0 - 0.26 * exp(-p.y / 0.5);
  float dxw = ${HX.toFixed(1)} - abs(p.x);
  float dzw = ${HZ.toFixed(1)} - abs(p.z);
  float cd = (dxw < 0.05) ? dzw : ((dzw < 0.05) ? dxw : min(dxw, dzw));
  v *= 1.0 - 0.30 * exp(-max(cd, 0.0) / 0.9);
  float ceilP = step(abs(p.y - ${HY.toFixed(1)}), 0.02);
  v *= 1.0 - 0.18 * ceilP * (1.0 - smoothstep(0.0, 2.5, cd) ) * 0.0;
  vec2 q = ceilP > 0.5 ? p.xz : (dxw < 0.05 ? p.zy : p.xy);
  v *= 0.93 + 0.15 * gfbm(q * 0.55);
  v *= 1.0 + (gvn(q * 15.0) - 0.5) * 0.045;
  // daylight spilling in from the door
  v *= 1.0 + 0.20 * exp(-(${HZ.toFixed(1)} - p.z) / 6.5) * smoothstep(-0.2, 2.5, p.y);
  // reveals of the door opening are bright with outside light
  if (p.z > ${(HZ + 0.005).toFixed(3)} && abs(p.x) < 1.4) v *= 1.0 + 1.1 * (p.z - ${HZ.toFixed(1)}) / 0.4;
  // 2 cm shadow gap above the floor
  if (p.y < 6.0) v *= mix(0.03, 1.0, smoothstep(0.016, 0.026, p.y));
  return v;
}
vec3 plasterGlow(vec3 p) {
  float g = 0.0;
  float dx = max(abs(p.x) - ${SKY_X.toFixed(1)}, 0.0);
  float dz = max(abs(p.z) - ${SKY_Z.toFixed(1)}, 0.0);
  float d = length(vec2(dx, dz));
  float ceilP = step(abs(p.y - ${HY.toFixed(1)}), 0.02);
  g += ceilP * 1.15 * exp(-d / 1.25);
  g += ceilP * 0.22 * exp(-d / 4.0);
  g += (1.0 - ceilP) * 0.10 * smoothstep(3.5, ${HY.toFixed(1)}, p.y) * (1.0 - smoothstep(0.0, 7.0, d));
  if (p.y > ${(HY + 0.01).toFixed(2)}) g += 1.5 + (p.y - ${HY.toFixed(1)}) * 2.0;
  return g * uSky * vec3(1.0, 0.965, 0.90);
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= plasterBake(vBW) * uTint;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += plasterGlow(vBW) * diffuseColor.rgb;');
  };
  mat.customProgramCacheKey = () => 'gallery-plaster';
  return mat;
}

// ---------------------------------------------------------------------------
// Artwork material (lit by its own pool: emissive from its texture; developing)
// ---------------------------------------------------------------------------
const ART_EMISSIVE = 0.80;

function makeArtMaterial(texture, weave) {
  const u = {
    uDev: { value: 1 },
    uSize: { value: new THREE.Vector2(1, 1) },
    uInset: { value: 0 },
    uWeave: { value: weave ? 1 : 0 },
  };
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: ART_EMISSIVE,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.4,
  });
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDev = u.uDev;
    shader.uniforms.uSize = u.uSize;
    shader.uniforms.uInset = u.uInset;
    shader.uniforms.uWeave = u.uWeave;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDev; uniform vec2 uSize; uniform float uInset; uniform float uWeave;
${GLSL_NOISE}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // recess shadow where a mat / frame lip overhangs the image
  float dm = min(min(vMapUv.x, 1.0 - vMapUv.x) * uSize.x, min(vMapUv.y, 1.0 - vMapUv.y) * uSize.y);
  diffuseColor.rgb *= 1.0 - uInset * (0.62 * exp(-dm / 0.0065) + 0.16 * exp(-dm / 0.035));
  if (uWeave > 0.0) {
    // canvas weave: analytic, fades out as the threads become sub-pixel (no moire)
    vec2 wc = vMapUv * uSize / 0.0032;
    float wf = max(fwidth(wc.x), fwidth(wc.y));
    float amp = uWeave * (1.0 - smoothstep(0.12, 0.5, wf));
    vec2 wfr = fract(wc);
    float over = mod(floor(wc.x) + floor(wc.y), 2.0);
    float wh = over > 0.5 ? sin(3.14159 * wfr.x) : sin(3.14159 * wfr.y);
    diffuseColor.rgb *= 1.0 + amp * 0.11 * (wh - 0.65);
  }
  if (uDev < 0.999) {
    // photograph in the tray: the image surfaces through a noise threshold
    float n = gfbm(vMapUv * vec2(uSize.x, uSize.y) * 3.2) * 1.02 + gvn(vMapUv * 90.0) * 0.06;
    float t = uDev * 1.55 - 0.30;
    float mask = smoothstep(n - 0.16, n + 0.03, t);
    float early = smoothstep(0.0, 0.9, uDev);
    vec3 lit = diffuseColor.rgb;
    float l = dot(lit, vec3(0.2126, 0.7152, 0.0722));
    vec3 stage = mix(vec3(l), lit, 0.35 + 0.65 * early) * (0.55 + 0.45 * early);
    vec3 prime = vec3(0.86, 0.83, 0.77);
    diffuseColor.rgb = mix(prime, stage, mask);
  }
}`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = emissive * diffuseColor.rgb;');
  };
  mat.customProgramCacheKey = () => 'gallery-art';
  return mat;
}

// ---------------------------------------------------------------------------
// createRoom
// ---------------------------------------------------------------------------
export function createRoom(renderer, { quality = 'high', reducedMotion = false } = {}) {
  const high = quality !== 'low';
  const scene = new THREE.Scene();

  // Interior-only environment: every hall material carries this PMREM as its own
  // envMap, so the campus sky (scene.environment) never lights the interior.
  const envTex = (() => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    const tex = pmrem.fromScene(env, 0.04).texture;
    env.traverse?.((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    pmrem.dispose();
    return tex;
  })();

  const U = {
    uSky: { value: 1 },
    uDay: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uAmbSky: { value: new THREE.Vector3(1, 1, 1) },
    uAmbGround: { value: new THREE.Vector3(1, 1, 1) },
  };
  const tintColor = new THREE.Color(1, 1, 1);

  // No scene lights: the hall's ambient (what a hemisphere light used to give) is
  // added inside the hall materials, so nothing here lights the campus outside.
  const AMB_SKY = new THREE.Color(0xfff2e0);
  const AMB_GROUND = new THREE.Color(0xb8ad9d);
  const AMB_K = 3.3 / Math.PI;
  let ambTint = 0;
  const envMats = [];
  function prep(m) {
    m.envMap = envTex;
    m.userData.envBase = m.envMapIntensity ?? 1;
    envMats.push(m);
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    m.onBeforeCompile = (shader, r) => {
      if (prev) prev.call(m, shader, r);
      shader.uniforms.uAmbSky = U.uAmbSky;
      shader.uniforms.uAmbGround = U.uAmbGround;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uAmbSky; uniform vec3 uAmbGround;')
        .replace(
          '#include <aomap_fragment>',
          '#include <aomap_fragment>\n{ vec3 nW_ = inverseTransformDirection(normal, viewMatrix); reflectedLight.indirectDiffuse += material.diffuseColor * mix(uAmbGround, uAmbSky, nW_.y * 0.5 + 0.5); }',
        );
    };
    m.customProgramCacheKey = () => `${prevKey}|amb`;
    return m;
  }
  function unprep(m) {
    const i = envMats.indexOf(m);
    if (i >= 0) envMats.splice(i, 1);
  }

  const plaster = prep(makePlaster(U));

  // ---- architecture --------------------------------------------------------
  const hall = new THREE.Group();
  hall.name = 'hall';
  scene.add(hall);
  const arch = hall;

  function addMesh(geo, mat, parent = arch, cast = false) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    parent.add(m);
    return m;
  }

  // end wall (hero)
  {
    const g = new THREE.PlaneGeometry(HX * 2, HY);
    const m = addMesh(g, plaster, arch, true);
    m.position.set(0, HY / 2, -HZ);
  }
  // side walls
  {
    const gl = new THREE.PlaneGeometry(HZ * 2, HY);
    const l = addMesh(gl, plaster, arch, true);
    l.rotation.y = Math.PI / 2;
    l.position.set(-HX, HY / 2, 0);
    const r = addMesh(gl, plaster, arch, true);
    r.rotation.y = -Math.PI / 2;
    r.position.set(HX, HY / 2, 0);
  }
  // entrance wall with door opening
  {
    const s = new THREE.Shape();
    const hw = DOOR_W / 2;
    s.moveTo(-HX, 0);
    s.lineTo(-hw, 0);
    s.lineTo(-hw, DOOR_H);
    s.lineTo(hw, DOOR_H);
    s.lineTo(hw, 0);
    s.lineTo(HX, 0);
    s.lineTo(HX, HY);
    s.lineTo(-HX, HY);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    const m = addMesh(g, plaster, arch, true);
    m.rotation.y = Math.PI;
    m.position.set(0, 0, HZ);

  }
  // ceiling with skylight opening
  {
    const s = new THREE.Shape();
    s.moveTo(-HX, -HZ);
    s.lineTo(HX, -HZ);
    s.lineTo(HX, HZ);
    s.lineTo(-HX, HZ);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-SKY_X, -SKY_Z);
    hole.lineTo(-SKY_X, SKY_Z);
    hole.lineTo(SKY_X, SKY_Z);
    hole.lineTo(SKY_X, -SKY_Z);
    hole.closePath();
    s.holes.push(hole);
    // opening for the glass lift car and shaft (x 3.2..5.4, z 14.9..16.95)
    const lift = new THREE.Path();
    lift.moveTo(3.2, 14.9);
    lift.lineTo(3.2, 16.95);
    lift.lineTo(5.4, 16.95);
    lift.lineTo(5.4, 14.9);
    lift.closePath();
    s.holes.push(lift);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(Math.PI / 2);
    const m = addMesh(g, plaster, arch, true);
    m.position.y = HY;
  }
  // light well
  {
    const top = HY + WELL;
    const parts = [];
    const a = new THREE.PlaneGeometry(SKY_Z * 2, WELL);
    a.rotateY(Math.PI / 2);
    a.translate(-SKY_X, HY + WELL / 2, 0);
    const b = new THREE.PlaneGeometry(SKY_Z * 2, WELL);
    b.rotateY(-Math.PI / 2);
    b.translate(SKY_X, HY + WELL / 2, 0);
    const c = new THREE.PlaneGeometry(SKY_X * 2, WELL);
    c.translate(0, HY + WELL / 2, -SKY_Z);
    const d = new THREE.PlaneGeometry(SKY_X * 2, WELL);
    d.rotateY(Math.PI);
    d.translate(0, HY + WELL / 2, SKY_Z);
    parts.push(a, b, c, d);
    addMesh(mergeGeometries(parts), plaster, arch, true);

    // glowing diffuser
    const dg = new THREE.PlaneGeometry(SKY_X * 2, SKY_Z * 2);
    dg.rotateX(Math.PI / 2);
    const dm = new THREE.MeshBasicMaterial({ color: 0xffffff, map: makeDiffuserTexture(), fog: false });
    const diffuser = addMesh(dg, dm);
    diffuser.position.y = top;
    scene.userData.diffuser = diffuser;
  }
  // mullions: steel T-bars across the skylight
  {
    const mullMat = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.55, metalness: 0.15, emissive: 0xcfc9bb, emissiveIntensity: 0.5 });
    prep(mullMat);
    scene.userData.mullMat = mullMat;
    const count = 21;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(geo, mullMat, count + 1);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m4.compose(
        new THREE.Vector3(0, HY + 0.055, -SKY_Z + i * 1.5),
        new THREE.Quaternion(),
        new THREE.Vector3(SKY_X * 2 + 0.06, 0.11, 0.07),
      );
      inst.setMatrixAt(i, m4);
    }
    m4.compose(new THREE.Vector3(0, HY + 0.055, 0), new THREE.Quaternion(), new THREE.Vector3(0.07, 0.11, SKY_Z * 2));
    inst.setMatrixAt(count, m4);
    inst.instanceMatrix.needsUpdate = true;
    arch.add(inst);
  }

  // ---- tracks + spot fixtures ---------------------------------------------
  const trackMat = prep(new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.55, metalness: 0.5 }));
  {
    const parts = [
      boxPart(-TRACK_X, TRACK_Y + 0.02, 0, 0.035, 0.04, 32),
      boxPart(TRACK_X, TRACK_Y + 0.02, -0.65, 0.035, 0.04, 30.7),
      boxPart(-0.95, TRACK_Y + 0.02, 15.4, 7.9, 0.04, 0.035),
    ];
    addMesh(mergeGeometries(parts), trackMat);
  }

  // fixtures: one per side/door slot, two for the hero
  const HEAD_Y = TRACK_Y - 0.17;
  const fixtures = []; // { slot, pos, target }
  for (const s of SLOTS) {
    if (s.kind === 'side') {
      const x = s.position.x < 0 ? -TRACK_X : TRACK_X;
      fixtures.push({ slot: s.index, pos: new THREE.Vector3(x, HEAD_Y, s.position.z), target: new THREE.Vector3(s.position.x, 2.0, s.position.z) });
    } else if (s.kind === 'door') {
      fixtures.push({ slot: s.index, pos: new THREE.Vector3(s.position.x, HEAD_Y, 15.4), target: new THREE.Vector3(s.position.x, 2.0, HZ) });
    } else {
      fixtures.push({ slot: 0, pos: new THREE.Vector3(-TRACK_X, HEAD_Y, -15.6), target: new THREE.Vector3(-1.2, 2.8, -HZ) });
      fixtures.push({ slot: 0, pos: new THREE.Vector3(TRACK_X, HEAD_Y, -15.6), target: new THREE.Vector3(1.2, 2.8, -HZ) });
    }
  }
  // spot head, +z = beam direction: cylinder, cooling fins, black bezel, hinge arms
  const barrelGeo = (() => {
    const cylZ = (r0, r1, len, z) => {
      const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, z);
      return g;
    };
    const parts = [cylZ(0.040, 0.043, 0.15, 0.0), cylZ(0.047, 0.047, 0.026, 0.066), cylZ(0.044, 0.044, 0.018, -0.083)];
    for (let i = 0; i < 3; i++) parts.push(cylZ(0.0465, 0.0465, 0.005, -0.02 - i * 0.017));
    parts.push(boxPart(-0.056, 0.03, 0.0, 0.007, 0.07, 0.03), boxPart(0.056, 0.03, 0.0, 0.007, 0.07, 0.03), boxPart(0, 0.066, 0.0, 0.119, 0.008, 0.03));
    return mergeGeometries(parts);
  })();
  const fixtureMat = prep(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.38, metalness: 0.75, envMapIntensity: 1.1 }));
  const barrels = new THREE.InstancedMesh(barrelGeo, fixtureMat, fixtures.length);
  const stemGeo = mergeGeometries([
    boxPart(0, TRACK_Y - 0.002 - HEAD_Y, 0, 0.05, 0.03, 0.075),
    (() => {
      const g = new THREE.CylinderGeometry(0.009, 0.009, 0.095, 12, 1);
      g.translate(0, TRACK_Y - 0.05 - HEAD_Y, 0);
      return g;
    })(),
  ]);
  const stems = new THREE.InstancedMesh(stemGeo, fixtureMat, fixtures.length);
  const lensGeo = new THREE.CircleGeometry(0.0335, 24);
  lensGeo.translate(0, 0, 0.0795);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lenses = new THREE.InstancedMesh(lensGeo, lensMat, fixtures.length);
  lenses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(fixtures.length * 3), 3);
  {
    const dummy = new THREE.Object3D();
    fixtures.forEach((f, i) => {
      dummy.position.copy(f.pos);
      dummy.lookAt(f.target);
      dummy.updateMatrix();
      barrels.setMatrixAt(i, dummy.matrix);
      lenses.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(f.pos);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
    });
    barrels.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    stems.instanceMatrix.needsUpdate = true;
  }
  lenses.layers.set(1); // glints stay out of the floor reflection
  arch.add(barrels, lenses, stems);

  // ---- benches ------------------------------------------------------------
  // oiled-oak slab (2.4 x 0.6 x 0.06, rounded plan corners, eased edges) on two
  // slim blackened-steel U-frames (40 x 10 mm flat bar), 0.25 m in from the ends.
  const oakTex = makeOakTexture();
  const oakBenchTex = oakTex.clone();
  oakBenchTex.center.set(0.5, 0.5);
  oakBenchTex.rotation = Math.PI / 2;
  oakBenchTex.needsUpdate = true;
  const benchOak = new THREE.MeshStandardMaterial({ map: oakBenchTex, color: 0xf2e6d6, roughness: 0.42, metalness: 0, envMapIntensity: 1.0 });
  prep(benchOak);
  const benchSteel = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.36, metalness: 0.9, envMapIntensity: 1.2 });
  prep(benchSteel);
  const colliders = [];
  const seatGeo = (() => {
    const w = 0.6 - 0.014;
    const l = 2.4 - 0.014;
    const r = 0.03;
    const x = -w / 2;
    const y = -l / 2;
    const sh = new THREE.Shape();
    sh.moveTo(x + r, y);
    sh.lineTo(x + w - r, y);
    sh.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    sh.lineTo(x + w, y + l - r);
    sh.absarc(x + w - r, y + l - r, r, 0, Math.PI / 2, false);
    sh.lineTo(x + r, y + l);
    sh.absarc(x + r, y + l - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(x, y + r);
    sh.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: 0.046,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.007,
      bevelOffset: 0,
      bevelSegments: 3,
      curveSegments: 8,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.397, 0);
    return g;
  })();
  const frameSteelGeo = (() => {
    const parts = [];
    for (const zz of [-0.95, 0.95]) {
      parts.push(boxPart(0, 0.385, zz, 0.5, 0.01, 0.04));
      for (const xx of [-0.245, 0.245]) {
        parts.push(boxPart(xx, 0.19, zz, 0.01, 0.38, 0.04));
        parts.push(boxPart(xx, 0.003, zz, 0.03, 0.006, 0.07));
      }
    }
    return mergeGeometries(parts);
  })();
  const blobTex = (() => {
    const c = canvasOf(128, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 128);
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = '#fff';
    ctx.fillRect(30, 18, 68, 92);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  })();
  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: blobTex,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const blobGeo = new THREE.PlaneGeometry(1.15, 3.0);
  blobGeo.rotateX(-Math.PI / 2);
  for (const bz of [-5, 5]) {
    const seat = addMesh(seatGeo, benchOak);
    seat.position.z = bz;
    const steel = addMesh(frameSteelGeo, benchSteel);
    steel.position.z = bz;
    const blob = addMesh(blobGeo, blobMat);
    blob.position.set(0, 0.004, bz);
    blob.renderOrder = 1;
    colliders.push({ minX: -0.3 - 0.3, maxX: 0.3 + 0.3, minZ: bz - 1.2 - 0.3, maxZ: bz + 1.2 + 0.3 });
  }

  // ---- floor ---------------------------------------------------------------
  const FLOOR_Z0 = -HZ;
  const FLOOR_Z1 = HZ;
  const floorGeo = new THREE.PlaneGeometry(HX * 2, FLOOR_Z1 - FLOOR_Z0);
  let floor;
  const tmpV2 = new THREE.Vector2();
  const dbSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const REFL_SCALE = 0.5;
  if (high) {
    const w = Math.max(256, Math.round(dbSize.x * REFL_SCALE));
    const h = Math.max(256, Math.round(dbSize.y * REFL_SCALE));
    floor = new Reflector(floorGeo, {
      textureWidth: w,
      textureHeight: h,
      clipBias: 0.002,
      multisample: 2,
      shader: FloorShader,
    });
    const rtex = floor.getRenderTarget().texture;
    rtex.generateMipmaps = true;
    rtex.minFilter = THREE.LinearMipmapLinearFilter;
    const un = floor.material.uniforms;
    un.uSky = U.uSky;
    un.uDay = U.uDay;
    un.uTint = U.uTint;
    un.uTexel.value.set(1 / w, 1 / h);
    floor.userData.reflW = w;
    floor.userData.reflH = h;
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.3, metalness: 0, envMapIntensity: 0.9 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSky = U.uSky;
      shader.uniforms.uDay = U.uDay;
      shader.uniforms.uTint = U.uTint;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vBW;\n${GLSL_NOISE}\n${GLSL_FLOOR_BASE}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float j; totalEmissiveRadiance += floorBase(vBW, j); }');
    };
    mat.customProgramCacheKey = () => 'gallery-floor-low';
    prep(mat);
    floor = new THREE.Mesh(floorGeo, mat);
  }
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (FLOOR_Z0 + FLOOR_Z1) / 2);
  floor.name = 'floor';
  floor.camera?.layers.set(0); // reflection renders layer 0 only
  hall.add(floor);

  // ---- artwork machinery ---------------------------------------------------
  const poolTex = makePoolTexture();
  const POOL_COUNT = SLOTS.length;
  const poolGeo = new THREE.BufferGeometry();
  const poolPos = new Float32Array(POOL_COUNT * 4 * 3);
  const poolUv = new Float32Array(POOL_COUNT * 4 * 2);
  const poolCol = new Float32Array(POOL_COUNT * 4 * 3);
  const poolIdx = new Uint16Array(POOL_COUNT * 6);
  for (let i = 0; i < POOL_COUNT; i++) {
    const v = i * 4;
    poolIdx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  }
  poolGeo.setAttribute('position', new THREE.BufferAttribute(poolPos, 3));
  const poolNor = new Float32Array(POOL_COUNT * 4 * 3);
  poolGeo.setAttribute('normal', new THREE.BufferAttribute(poolNor, 3));
  poolGeo.setAttribute('uv', new THREE.BufferAttribute(poolUv, 2));
  poolGeo.setAttribute('color', new THREE.BufferAttribute(poolCol, 3));
  poolGeo.setIndex(new THREE.BufferAttribute(poolIdx, 1));
  poolGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 40);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: true,
  });
  const poolMesh = new THREE.Mesh(poolGeo, poolMat);
  poolMesh.frustumCulled = false;
  poolMesh.renderOrder = 2;
  hall.add(poolMesh);

  // soft contact shadow of each work on the wall (ring of vertex-alpha bands)
  const SH_RINGS = [-0.012, 0.008, 0.028, 0.062];
  const SH_ALPHA = [0.55, 0.40, 0.15, 0.0];
  const shPos = new Float32Array(POOL_COUNT * 16 * 3);
  const shCol = new Float32Array(POOL_COUNT * 16 * 4);
  const shIdx = new Uint16Array(POOL_COUNT * 72);
  for (let i = 0; i < POOL_COUNT; i++) {
    let o = i * 72;
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 4; j++) {
        const a = i * 16 + k * 4 + j;
        const b = i * 16 + k * 4 + ((j + 1) % 4);
        const c = i * 16 + (k + 1) * 4 + ((j + 1) % 4);
        const d = i * 16 + (k + 1) * 4 + j;
        shIdx.set([a, b, c, a, c, d], o);
        o += 6;
      }
    }
  }
  const shGeo = new THREE.BufferGeometry();
  shGeo.setAttribute('position', new THREE.BufferAttribute(shPos, 3));
  const shNor = new Float32Array(POOL_COUNT * 16 * 3);
  shGeo.setAttribute('normal', new THREE.BufferAttribute(shNor, 3));
  shGeo.setAttribute('color', new THREE.BufferAttribute(shCol, 4));
  shGeo.setIndex(new THREE.BufferAttribute(shIdx, 1));
  shGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 40);
  const shMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shMesh = new THREE.Mesh(shGeo, shMat);
  shMesh.frustumCulled = false;
  shMesh.renderOrder = 1;
  hall.add(shMesh);

  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const plaquePlane = new THREE.PlaneGeometry(0.22, 0.14);
  const blankTex = (() => {
    const t = new THREE.DataTexture(new Uint8Array([219, 211, 196, 255]), 1, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  })();
  const linenMat = prep(new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 0.96, metalness: 0 }));
  const blackFrameMat = prep(new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.38, metalness: 0.25, envMapIntensity: 0.9 }));

  const pickables = [];
  const slotState = SLOTS.map((s) => {
    const zRef = s.position.z;
    const order = clamp01((HZ - zRef) / (HZ * 2));
    return {
      slot: s,
      hung: false,
      group: null,
      art: null,
      artMat: null,
      mats: [], // per-slot materials receiving emissive "spot" light
      oakMat: null,
      paperMat: null,
      plaqueMat: null,
      disposables: [],
      work: null,
      size: { w: 1, h: 1 },
      cy: 2,
      developing: false,
      devT: 1,
      devPlaying: false,
      gaze: 0,
      gazeT: 0,
      tOn: 0.08 + 0.72 * order + (s.position.x > 0 ? 0.012 : 0),
      ramp: 0,
      poolAmp: 0.0,
      box: new THREE.Box3(),
      center: new THREE.Vector3(),
    };
  });

  const plaqueQueue = [];
  ensureFonts().then(() => {
    for (const st of plaqueQueue) {
      if (st.plaqueTex && st.work) {
        drawPlaque(st.plaqueTex.image, st.work);
        st.plaqueTex.needsUpdate = true;
      }
    }
  });

  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _c = new THREE.Vector3();

  function writePool(st) {
    const s = st.slot;
    const n = s.normal;
    _right.copy(n).negate().cross(_up).normalize(); // viewer's right
    const wallC = _c.set(s.position.x, st.cy + 0.3, s.position.z);
    // snap to the wall plane
    if (Math.abs(n.x) > 0.5) wallC.x = Math.sign(n.x) > 0 ? -HX : HX;
    else wallC.z = n.z > 0 ? -HZ : HZ;
    wallC.addScaledVector(n, 0.006);
    const { w, h } = st.size;
    let pw, ph;
    if (s.kind === 'hero') {
      pw = Math.min(w + 3.6, HX * 2 - 0.1);
      ph = h + 3.0;
    } else if (s.kind === 'door') {
      pw = Math.max(w + 1.8, 3.0);
      ph = h + 2.6;
    } else {
      pw = Math.max(w + 2.4, 3.6);
      ph = h + 3.4;
    }
    // clamp to wall extents; remap uvs so the gradient is cropped, not squashed
    const axis = Math.abs(_right.x) > 0.5 ? 'x' : 'z';
    const lim = (axis === 'x' ? HX : HZ) - 0.01;
    let sLo = -pw / 2;
    let sHi = pw / 2;
    const c0 = wallC[axis];
    const r0 = _right[axis];
    const e1 = (-lim - c0) / r0;
    const e2 = (lim - c0) / r0;
    sLo = Math.max(sLo, Math.min(e1, e2));
    sHi = Math.min(sHi, Math.max(e1, e2));
    const yLo = Math.max(0.02 - wallC.y, -ph / 2);
    const yHi = Math.min(HY - 0.02 - wallC.y, ph / 2);
    const u0 = (sLo + pw / 2) / pw;
    const u1 = (sHi + pw / 2) / pw;
    const v0 = (yLo + ph / 2) / ph;
    const v1 = (yHi + ph / 2) / ph;
    const corners = [
      [sLo, yLo, u0, v0],
      [sHi, yLo, u1, v0],
      [sHi, yHi, u1, v1],
      [sLo, yHi, u0, v1],
    ];
    for (let k = 0; k < 4; k++) {
      const [sx, sy, uu, vv] = corners[k];
      const vi = s.index * 4 + k;
      poolPos[vi * 3] = wallC.x + _right.x * sx;
      poolPos[vi * 3 + 1] = wallC.y + sy;
      poolPos[vi * 3 + 2] = wallC.z + _right.z * sx;
      poolNor.set([n.x, n.y, n.z], vi * 3);
      poolUv[vi * 2] = uu;
      poolUv[vi * 2 + 1] = vv;
    }
    poolGeo.attributes.position.needsUpdate = true;
    poolGeo.attributes.uv.needsUpdate = true;
    poolGeo.attributes.normal.needsUpdate = true;
  }

  function writeShadow(st) {
    const s = st.slot;
    const n = s.normal;
    _right.copy(n).negate().cross(_up).normalize();
    const c = _c.set(s.position.x, st.cy - 0.03, s.position.z);
    if (Math.abs(n.x) > 0.5) c.x = n.x > 0 ? -HX : HX;
    else c.z = n.z > 0 ? -HZ : HZ;
    c.addScaledVector(n, 0.003);
    const hw = st.size.w / 2 + st.extra;
    const hh = st.size.h / 2 + st.extra;
    for (let k = 0; k < 4; k++) {
      const o = SH_RINGS[k];
      const xs = [-hw - o, hw + o, hw + o, -hw - o];
      const ys = [-hh - o, -hh - o, hh + o, hh + o];
      for (let j = 0; j < 4; j++) {
        const vi = st.slot.index * 16 + k * 4 + j;
        shPos[vi * 3] = c.x + _right.x * xs[j];
        shPos[vi * 3 + 1] = c.y + ys[j];
        shPos[vi * 3 + 2] = c.z + _right.z * xs[j];
        shNor.set([n.x, n.y, n.z], vi * 3);
      }
    }
    shGeo.attributes.position.needsUpdate = true;
    shGeo.attributes.normal.needsUpdate = true;
  }

  function setShadowAlpha(i, f) {
    for (let k = 0; k < 4; k++)
      for (let j = 0; j < 4; j++) {
        const vi = i * 16 + k * 4 + j;
        shCol[vi * 4] = shCol[vi * 4 + 1] = shCol[vi * 4 + 2] = 0.02;
        shCol[vi * 4 + 3] = SH_ALPHA[k] * f;
      }
    shGeo.attributes.color.needsUpdate = true;
  }

  function clearPool(i) {
    for (let k = 0; k < 4; k++) {
      const vi = i * 4 + k;
      poolPos[vi * 3] = poolPos[vi * 3 + 1] = poolPos[vi * 3 + 2] = 0;
      poolCol[vi * 3] = poolCol[vi * 3 + 1] = poolCol[vi * 3 + 2] = 0;
    }
    poolGeo.attributes.position.needsUpdate = true;
    poolGeo.attributes.color.needsUpdate = true;
  }

  function release(st) {
    if (st.group) {
      arch.remove(st.group);
      st.group.removeFromParent();
    }
    const pi = pickables.indexOf(st.art);
    if (pi >= 0) pickables.splice(pi, 1);
    for (const d of st.disposables) {
      unprep(d);
      d.dispose?.();
    }
    st.disposables.length = 0;
    const qi = plaqueQueue.indexOf(st);
    if (qi >= 0) plaqueQueue.splice(qi, 1);
    setShadowAlpha(st.slot.index, 0);
    clearPool(st.slot.index);
    st.group = st.art = st.artMat = st.oakMat = st.paperMat = st.plaqueMat = st.plaqueTex = null;
    st.hung = false;
  }

  function hang(slotIndex, work, texture, { develop = false } = {}) {
    const st = slotState[slotIndex];
    if (!st) return;
    release(st);
    const s = st.slot;
    const size = displaySize(work, s);
    const { w, h } = size;
    const cy = hangCenterY(s, h);
    st.size = size;
    st.cy = cy;
    st.work = work;

    const group = new THREE.Group();
    group.position.set(s.position.x, cy, s.position.z);
    group.rotation.y = Math.atan2(s.normal.x, s.normal.z);
    arch.add(group);
    group.userData.__newGroup = true;
    st.group = group;

    const frameKind = work.frame || 'canvas';
    const weave = frameKind === 'canvas' && work.family !== 'signal';
    const artMat = prep(makeArtMaterial(texture || blankTex, weave));
    artMat.userData.u.uSize.value.set(w, h);
    if (frameKind === 'frame') {
      artMat.roughness = 0.42;
      artMat.envMapIntensity = 0.7;
      artMat.userData.envBase = 0.7;
    }
    st.disposables.push(artMat);
    st.artMat = artMat;

    let extra = 0; // frame thickness beyond the image, for the plaque
    let artZ;
    if (frameKind === 'canvas') {
      const body = new THREE.Mesh(unitBox, linenMat);
      body.scale.set(w, h, 0.04);
      body.position.z = 0.02;
      group.add(body);
      artZ = 0.0402;
      artMat.userData.u.uInset.value = 0;
    } else if (frameKind === 'frame') {
      const fw = 0.03;
      const fd = 0.025;
      const geo = mergeGeometries([
        boxPart(0, h / 2 + fw / 2, fd / 2, w + fw * 2, fw, fd),
        boxPart(0, -h / 2 - fw / 2, fd / 2, w + fw * 2, fw, fd),
        boxPart(-w / 2 - fw / 2, 0, fd / 2, fw, h, fd),
        boxPart(w / 2 + fw / 2, 0, fd / 2, fw, h, fd),
        boxPart(0, 0, 0.002, w, h, 0.004), // backing
      ]);
      st.disposables.push(geo);
      group.add(new THREE.Mesh(geo, blackFrameMat));
      artZ = 0.0155;
      extra = fw;
      artMat.userData.u.uInset.value = 0.55;
    } else {
      const b = 0.18 * Math.min(w, h);
      const fw = 0.04;
      const fd = 0.035;
      const W = w + 2 * b;
      const H = h + 2 * b;
      const frameGeo = mergeGeometries([
        boxPart(0, H / 2 + fw / 2, fd / 2, W + fw * 2, fw, fd),
        boxPart(0, -H / 2 - fw / 2, fd / 2, W + fw * 2, fw, fd),
        boxPart(-W / 2 - fw / 2, 0, fd / 2, fw, H, fd, true),
        boxPart(W / 2 + fw / 2, 0, fd / 2, fw, H, fd, true),
      ]);
      const mt = 0.005;
      const mz = 0.027;
      const matGeo = mergeGeometries([
        boxPart(0, h / 2 + b / 2, mz, W, b, mt),
        boxPart(0, -h / 2 - b / 2, mz, W, b, mt),
        boxPart(-w / 2 - b / 2, 0, mz, b, h, mt),
        boxPart(w / 2 + b / 2, 0, mz, b, h, mt),
        boxPart(0, 0, 0.002, W, H, 0.004), // backing board
      ]);
      st.disposables.push(frameGeo, matGeo);
      const oakMat = new THREE.MeshStandardMaterial({
        map: oakTex,
        emissiveMap: oakTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.0,
        roughness: 0.52,
        envMapIntensity: 0.8,
      });
      const paperMat = new THREE.MeshStandardMaterial({
        color: 0xf1ede2,
        emissive: 0xf1ede2,
        emissiveIntensity: 0.0,
        roughness: 0.95,
      });
      prep(oakMat);
      prep(paperMat);
      st.oakMat = oakMat;
      st.paperMat = paperMat;
      st.disposables.push(oakMat, paperMat);
      group.add(new THREE.Mesh(frameGeo, oakMat));
      group.add(new THREE.Mesh(matGeo, paperMat));
      artZ = 0.0215;
      extra = b + fw;
      artMat.userData.u.uInset.value = 1;
    }

    const art = new THREE.Mesh(unitPlane, artMat);
    art.scale.set(w, h, 1);
    art.position.z = artZ;
    art.userData.slot = slotIndex;
    group.add(art);
    st.art = art;
    pickables.push(art);
    group.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });

    // plaque
    if (s.kind !== 'hero') {
      const cv = canvasOf(PLAQUE_PX.w, PLAQUE_PX.h);
      drawPlaque(cv, work);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      const pm = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
      const plaque = new THREE.Mesh(plaquePlane, pm);
      plaque.position.set(w / 2 + extra + 0.25 + 0.11, 1.35 - cy, 0.009);
      plaque.layers.set(1); // not worth drawing in the floor reflection
      group.add(plaque);
      st.plaqueTex = tex;
      st.plaqueMat = pm;
      st.disposables.push(tex, pm);
      plaqueQueue.push(st);
    }

    // develop state
    st.developing = !!develop;
    st.devPlaying = false;
    st.devT = develop ? 0 : 1;
    artMat.userData.u.uDev.value = st.devT;

    st.box.setFromCenterAndSize(
      st.center.set(s.position.x, cy, s.position.z).addScaledVector(s.normal, 0.03),
      new THREE.Vector3(Math.abs(s.normal.x) > 0.5 ? 0.06 : w, h, Math.abs(s.normal.x) > 0.5 ? w : 0.06),
    );
    st.center.set(s.position.x, cy, s.position.z).addScaledVector(s.normal, 0.04);
    st.hung = true;
    st.dirty = true;
    st.extra = extra;
    writePool(st);
    writeShadow(st);
    applyLighting(st, true);
  }

  const WARM = new THREE.Color(1.0, 0.925, 0.80);
  const POOL_AMP = 0.30;
  const LENS_HDR = new THREE.Color(7.0, 6.3, 5.0);

  function applyLighting(st, force) {
    const i = st.slot.index;
    const g = st.gaze;
    const k = st.ramp * (1 + 0.5 * g);
    // pool
    const a = POOL_AMP * k * (st.slot.kind === 'hero' ? 0.85 : 1);
    for (let v = 0; v < 4; v++) {
      const vi = i * 4 + v;
      poolCol[vi * 3] = WARM.r * a;
      poolCol[vi * 3 + 1] = WARM.g * a;
      poolCol[vi * 3 + 2] = WARM.b * a;
    }
    poolGeo.attributes.color.needsUpdate = true;
    setShadowAlpha(i, 0.45 + 0.55 * st.ramp);
    // artwork
    if (st.artMat) {
      st.artMat.emissiveIntensity = ART_EMISSIVE * (0.07 + 0.93 * st.ramp) * (1 + 0.22 * g);
    }
    const light = (0.06 + 0.94 * st.ramp) * (1 + 0.2 * g);
    if (st.oakMat) st.oakMat.emissiveIntensity = 0.30 * light;
    if (st.paperMat) st.paperMat.emissiveIntensity = 0.40 * light;
    if (st.plaqueMat) st.plaqueMat.color.setScalar(0.20 + 0.62 * st.ramp + 0.1 * g);
    st.lastRamp = st.ramp;
    st.lastGaze = g;
  }

  // ---- volumetric daylight: analytic shafts from the skylight + dust motes ----
  const volU = { uT: { value: 0 }, uK: { value: 0.05 }, uSky: U.uSky, uShaft: { value: 1 } };
  const volMat = new THREE.ShaderMaterial({
    uniforms: volU,
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      uniform float uT, uK, uSky, uShaft;
      ${GLSL_NOISE}
      ${GLSL_SHAFT}
      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = vW - ro;
        float tEnd = length(rd);
        rd /= tEnd;
        vec3 inv = 1.0 / (rd + vec3(1e-6));
        vec3 bmin = vec3(-2.1, 0.0, -15.3), bmax = vec3(3.3, ${HY.toFixed(1)}, 16.8);
        vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
        vec3 tmn = min(t0, t1), tmx = max(t0, t1);
        float ta = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
        float tb = min(min(tmx.x, tmx.y), min(tmx.z, tEnd));
        if (tb <= ta) { gl_FragColor = vec4(0.0); return; }
        const int N = 28;
        float dt = (tb - ta) / float(N);
        float j = ign(gl_FragCoord.xy);
        float acc = 0.0;
        for (int i = 0; i < N; i++) acc += shaftDensity(ro + rd * (ta + (float(i) + j) * dt), uT);
        acc *= dt;
        float ph = 0.7 + 0.8 * pow(max(dot(rd, -SUNDIR), 0.0), 3.0);
        vec3 col = vec3(1.0, 0.94, 0.82) * acc * ph * uK * uSky * uShaft;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const volMesh = new THREE.Mesh(new THREE.BoxGeometry(HX * 2, HY, HZ * 2), volMat);
  volMesh.position.set(0, HY / 2, 0);
  volMesh.frustumCulled = false;
  volMesh.renderOrder = 10;
  volMesh.layers.set(1);
  hall.add(volMesh);

  const DUST = 3600;
  const dustGeo = new THREE.BufferGeometry();
  {
    const seeds = new Float32Array(DUST * 4);
    let rs = 12345;
    const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 40);
  }
  const dustU = { uT: volU.uT, uSky: U.uSky, uPx: { value: 800 }, uBright: { value: 2.4 } };
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      uniforms: dustU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uT, uSky, uPx;
        attribute vec4 aSeed;
        varying float vA;
        ${GLSL_NOISE}
        ${GLSL_SHAFT}
        void main() {
          float sp = 0.5 + aSeed.w;
          float y = mod(aSeed.y * 6.2 - uT * 0.015 * sp, 6.2);
          vec3 p = vec3((aSeed.x - 0.5) * 7.2 + 0.7 + sin(uT * 0.09 * sp + aSeed.w * 40.0) * 0.35 + sin(y * 0.9 + aSeed.z * 20.0) * 0.12,
                        y + 0.15,
                        (aSeed.z - 0.5) * 31.0 + cos(uT * 0.07 * sp + aSeed.x * 30.0) * 0.35);
          float dens = shaftDensity(p, uT);
          float tw = 0.65 + 0.35 * sin(uT * 0.9 * sp + aSeed.x * 60.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = uPx * 0.014 / max(-mv.z, 0.1);
          gl_PointSize = clamp(px, 1.2, 5.0);
          vA = dens * uSky * tw * (0.35 + 0.65 * fract(aSeed.w * 13.1)) * clamp(px, 0.25, 1.0)
             * smoothstep(0.0, 0.5, y) * smoothstep(6.2, 5.6, y);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBright;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vec3(1.0, 0.93, 0.80) * vA * uBright * a, 1.0);
        }`,
    }),
  );
  dust.frustumCulled = false;
  dust.layers.set(1);
  dust.renderOrder = 11;
  hall.add(dust);
  let motionT = 0;
  let reduced = !!reducedMotion;
  function setReducedMotion(v) {
    reduced = !!v;
  }

  const _ac = new THREE.Color();
  function refreshAmbient(sky) {
    const k = AMB_K * (0.05 + 0.95 * sky);
    _ac.copy(AMB_SKY).lerp(tintColor, ambTint);
    U.uAmbSky.value.set(_ac.r * k, _ac.g * k, _ac.b * k);
    _ac.copy(AMB_GROUND).lerp(tintColor, ambTint * 0.6);
    U.uAmbGround.value.set(_ac.r * k, _ac.g * k, _ac.b * k);
  }
  // ---- power / tint --------------------------------------------------------
  let power = 1;
  let powerDirty = true;
  function setPower(t) {
    const nt = clamp01(t);
    if (nt !== power) {
      power = nt;
      powerDirty = true;
    }
  }
  function applyPower() {
    const sky = 0.09 + 0.91 * smooth(0.0, 0.55, power);
    const day = 0.16 + 0.84 * smooth(0.0, 0.45, power);
    U.uSky.value = sky;
    U.uDay.value = day;
    refreshAmbient(sky);
    for (const m of envMats) m.envMapIntensity = m.userData.envBase * 0.22 * (0.15 + 0.85 * sky);
    const dm = scene.userData.diffuser.material;
    dm.color.setRGB(2.0 * sky, 1.97 * sky, 1.85 * sky);
    volU.uShaft.value = smooth(0.15, 0.7, power);
    scene.userData.mullMat.emissiveIntensity = 0.5 * sky;
    for (const st of slotState) st.ramp = smooth(0, 1, clamp01((power - st.tOn) / 0.15));
  }

  const tintBase = new THREE.Vector3(1, 1, 1);
  function setTint(hex, amount = 0) {
    const a = clamp01(amount);
    tintColor.set(hex);
    // normalise so tinting changes hue, not brightness
    const l = Math.max(1e-3, 0.2126 * tintColor.r + 0.7152 * tintColor.g + 0.0722 * tintColor.b);
    const n = new THREE.Vector3(tintColor.r / l, tintColor.g / l, tintColor.b / l);
    const k = Math.min(1, a * 1.8);
    U.uTint.value.copy(tintBase).lerp(n, k * 0.5);
    ambTint = a;
    refreshAmbient(U.uSky.value);
  }

  // ---- reveal --------------------------------------------------------------
  function reveal(slotIndex) {
    const st = slotState[slotIndex];
    if (!st || !st.hung || !st.developing) return;
    st.devPlaying = true;
    if (st.devT >= 1) st.devT = 0;
  }
  const isDeveloping = (i) => !!slotState[i]?.developing;

  // ---- update --------------------------------------------------------------
  const _dbs = new THREE.Vector2();
  let frame = 0;
  function update(dt, camera) {
    frame++;
    if (camera) {
      camera.layers.enable(1);
      dustU.uPx.value = renderer.getDrawingBufferSize(_dbs).y * 0.5 * camera.projectionMatrix.elements[5];
    }
    if (!reduced) motionT += dt;
    volU.uT.value = motionT;
    if (powerDirty) {
      applyPower();
      powerDirty = false;
      for (const st of slotState) st.dirty = true;
      // lens glints follow each pool
      for (let i = 0; i < fixtures.length; i++) {
        const st = slotState[fixtures[i].slot];
        const k = st.hung ? st.ramp : 0;
        lenses.instanceColor.setXYZ(i, LENS_HDR.r * k, LENS_HDR.g * k, LENS_HDR.b * k);
      }
      lenses.instanceColor.needsUpdate = true;
    }
    const ge = 1 - Math.exp(-dt * 3.2);
    let lensDirty = false;
    for (const st of slotState) {
      if (!st.hung) continue;
      if (Math.abs(st.gazeT - st.gaze) > 1e-3) {
        st.gaze += (st.gazeT - st.gaze) * ge;
        st.dirty = true;
        lensDirty = true;
      } else if (st.gaze !== st.gazeT) {
        st.gaze = st.gazeT;
        st.dirty = true;
        lensDirty = true;
      }
      if (st.devPlaying) {
        st.devT = Math.min(1, st.devT + dt / 1.8);
        // ease: slow start (blank), fast middle, slow settle
        const e = st.devT * st.devT * (3 - 2 * st.devT);
        st.artMat.userData.u.uDev.value = e;
        if (st.devT >= 1) {
          st.devPlaying = false;
          st.developing = false;
          st.artMat.userData.u.uDev.value = 1;
        }
      }
      if (st.dirty) {
        applyLighting(st);
        st.dirty = false;
      }
    }
    if (lensDirty) {
      for (let i = 0; i < fixtures.length; i++) {
        const st = slotState[fixtures[i].slot];
        const k = st.hung ? st.ramp * (1 + 0.35 * st.gaze) : 0;
        lenses.instanceColor.setXYZ(i, LENS_HDR.r * k, LENS_HDR.g * k, LENS_HDR.b * k);
      }
      lenses.instanceColor.needsUpdate = true;
    }
    // keep the floor reflection at half the drawing buffer
    if (high && (frame & 15) === 0) {
      renderer.getDrawingBufferSize(_dbs);
      const w = Math.max(256, Math.round(_dbs.x * REFL_SCALE));
      const h = Math.max(256, Math.round(_dbs.y * REFL_SCALE));
      if (w !== floor.userData.reflW || h !== floor.userData.reflH) {
        floor.getRenderTarget().setSize(w, h);
        floor.material.uniforms.uTexel.value.set(1 / w, 1 / h);
        floor.userData.reflW = w;
        floor.userData.reflH = h;
      }
    }
  }

  // lens glints for slots hung before the first update
  powerDirty = true;
  applyPower();

  const bounds = { minX: -HX + 0.45, maxX: HX - 0.45, minZ: -HZ + 0.45, maxZ: HZ - 0.45 };

  // every hall mesh receives (and the shell casts) the campus sun's shadows
  hall.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) o.receiveShadow = true;
  });

  return {
    scene,
    hall,
    bounds,
    colliders,
    floor,
    pickables,
    hang,
    reveal,
    isDeveloping,
    workCenter: (i) => slotState[i].center.clone(),
    workSize: (i) => ({ w: slotState[i].size.w, h: slotState[i].size.h }),
    workBox: (i) => slotState[i].box.clone(),
    setGaze(i, amount) {
      const st = slotState[i];
      if (st) st.gazeT = clamp01(amount);
    },
    setPower,
    setTint,
    setReducedMotion,
    update,
    dispose() {
      for (const st of slotState) release(st);
      floor.dispose?.();
    },
  };
}
