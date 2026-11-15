// W5: four spatial batches of night-only light impressions, never real lights.
// Analytic soft pools + window cards: no texture download, no secondary cameras.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const VERT = `
attribute float cardKind;
varying vec2 vUV;
varying float vKind;
#include <fog_pars_vertex>
void main() {
  vUV = uv; vKind = cardKind;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform float uNight;
varying vec2 vUV;
varying float vKind;
#include <fog_pars_fragment>
void main() {
  vec2 q = vUV * 2.0 - 1.0;
  float alpha;
  if (vKind < 0.5) {
    float r = length(q);
    alpha = pow(max(0.0, 1.0 - r), 2.0) * 0.3;
  } else {
    vec2 edge = min(vUV, 1.0 - vUV);
    float rim = smoothstep(0.0, 0.04, min(edge.x, edge.y));
    float mullion = smoothstep(0.015, 0.025, abs(fract(vUV.x * 3.0 + 0.5) - 0.5));
    alpha = rim * mullion * (0.16 + 0.16 * (1.0 - vUV.y));
  }
  if (alpha < 0.002) discard;
  // Approximate 2700 K warm source in linear RGB. It adds reflected warmth,
  // not a uniform opaque disc; existing surface texture and shadows stay visible.
  gl_FragColor = vec4(vec3(1.0, 0.48, 0.19), alpha * uNight);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function build(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group(); group.name = 'lightpools';
  const night = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uNight: night },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fog: true, side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  // Ground levels and lamps are taken from furniture.js and W1 marginal.js.
  const cells = [
    { x: -13.5, z: 28.5, minX: -17, maxX: -10, minZ: 16, maxZ: 41, near: false, parts: [] },
    { x: 13.5, z: 28.5, minX: 10, maxX: 17, minZ: 16, maxZ: 41, near: false, parts: [] },
    { x: 0, z: 42, minX: -22, maxX: 23, minZ: 37, maxZ: 50, near: false, parts: [] },
    { x: 4, z: 82.4, minX: -21, maxX: 29, minZ: 79, maxZ: 84, near: false, parts: [] },
  ];
  function card(cell, x, y, z, w, h, kind = 0, yaw = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    g.setAttribute('cardKind', new THREE.Float32BufferAttribute([kind, kind, kind, kind], 1));
    if (!kind) g.rotateX(-Math.PI / 2); else g.rotateY(yaw);
    g.translate(x, y, z); cell.parts.push(g);
  }
  for (const z of [20, 28.5, 36.8]) {
    card(cells[0], -13.5, 0.018, z, 6.1, 6.1);
    card(cells[1], 13.5, 0.018, z, 6.1, 6.1);
  }
  for (const x of [-4.5, 4.5]) card(cells[2], x, 0.018, 46, 6.1, 6.1);
  // Existing Studio north window: x−21.6…−17.6, y1…3.1, glass z38.12.
  card(cells[2], -19.6, 2.05, 38.105, 3.88, 1.98, 1, Math.PI);
  // Existing Arcade north shopfront glass: x11.3…22.7, y0.57…3.47, z38.1.
  card(cells[2], 17, 2.02, 38.085, 11.25, 2.75, 1, Math.PI);
  for (const x of [-18, -9, 2, 13, 26]) card(cells[3], x, 0.018, 82.0, 4.7, 3.3);
  // These are surface hints, not obstructions or click targets.
  const noPick = () => {};
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const geometry = mergeGeometries(cell.parts, false);
    for (let j = 0; j < cell.parts.length; j++) cell.parts[j].dispose();
    cell.parts = null;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'lightpools-cell-' + i;
    mesh.matrixAutoUpdate = false; mesh.raycast = noPick; mesh.renderOrder = 1;
    mesh.visible = false; cell.mesh = mesh; group.add(mesh);
  }
  function update(dt, frame) {
    const p = frame?.camera?.position;
    if (!p) return;
    let anyNear = false;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const dx = Math.max(cell.minX - p.x, 0, p.x - cell.maxX);
      const dz = Math.max(cell.minZ - p.z, 0, p.z - cell.maxZ);
      cell.near = dx * dx + dz * dz <= 1600;
      if (!cell.near) cell.mesh.visible = false;
      else anyNear = true;
    }
    if (!anyNear) return;
    const w = ctx.scene?.userData?.weather || frame.weather;
    const mode = typeof w === 'string' ? w : w?.mode;
    const n = typeof w?.nightK === 'number' ? w.nightK : (mode === 'night' || w?.night ? 1 : 0);
    night.value = Math.max(0, Math.min(1, n || 0));
    for (let i = 0; i < cells.length; i++) cells[i].mesh.visible = cells[i].near && night.value > 0.001;
  }
  return { group, regions: [], colliders: [], pickables: [], update, onPick() {} };
}
