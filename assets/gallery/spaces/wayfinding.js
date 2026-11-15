// W5: real enamel and stone, three shapes as redundant wayfinding cues.
// 3 material batches; no textures, new lights or animation. Metres, y up.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shape/colour pairs are unique. School deliberately has no printed/spoken name.
export const DESTINATIONS = [
  { id: 'hall', label: 'Hall', shape: 0, color: 0xfff3d6, x: 0, z: 19, y: 0 },
  { id: 'cinema', label: 'Cinema', shape: 2, color: 0xfff3d6, x: -4, z: 5.6, y: 7.2 },
  { id: 'terrace', label: 'Terraço', shape: 1, color: 0xfff3d6, x: -5.6, z: 16.4, y: 7.2 },
  { id: 'studio', label: 'Estúdio', shape: 1, color: 0xef7d57, x: -10, z: 44, y: 0 },
  { id: 'arcade', label: 'Arcada', shape: 2, color: 0xef7d57, x: 10, z: 44, y: 0 },
  { id: 'garden', label: 'Jardim', shape: 0, color: 0xa7f070, x: 25, z: 29, y: 0 },
  { id: 'amphitheatre', label: 'Anfiteatro', shape: 2, color: 0xa7f070, x: -25, z: 29, y: 0 },
  { id: 'school', label: '', shape: 1, color: 0xa7f070, x: 0, z: 53.2, y: 0 },
  { id: 'metro', label: 'Metro', shape: 1, color: 0x41a6f6, x: 78, z: 29, y: 0.09 },
  { id: 'market', label: 'Mercado', shape: 2, color: 0xffcd75, x: 94, z: 41.5, y: 0.35 },
  { id: 'quay', label: 'Marginal', shape: 0, color: 0x41a6f6, x: 25.5, z: 78, y: 0 },
  { id: 'ruins', label: 'Ruínas', shape: 2, color: 0x41a6f6, x: -43, z: -22, y: 0 },
  { id: 'plaza', label: 'Praça', shape: 0, color: 0xffcd75, x: 0, z: 41, y: 0 },
  { id: 'arraial', label: 'Arraial', shape: 1, color: 0xffcd75, x: 67, z: 26, y: 0 },
];

// Waypoints follow existing paths, not straight lines across water/buildings.
// [destination index, x, z, nextX, nextZ, floor]. Small inlays, no painted roads.
const ROUTE = [
  [0, 0, 21, 0, 18, 0], [0, 4.5, 28, 4.5, 21, 0], [0, -4.5, 35, -4.5, 21, 0],
  [3, -7.8, 43, -10.5, 44, 0], [4, 7.8, 43, 10.5, 44, 0],
  [5, 11, 29, 23, 29, 0], [5, 21, 29, 26, 29, 0],
  [6, -11, 29, -23, 29, 0], [6, -21, 29, -26, 29, 0],
  [7, 0, 47.8, 0, 52.5, 0], [7, 0, 51.3, 0, 54, 0],
  [8, 59, 29, 65, 29, 0], [8, 70, 29, 77, 29, 0],
  [9, 83.5, 41.5, 91, 41.5, 0.35], [9, 90, 41.5, 94, 41.5, 0.35],
  [10, 23.6, 54.7, 25.5, 55.5, 0], [10, 25.5, 65, 25.5, 75, 0],
  [10, 25.5, 74, 25.5, 78, 0], [12, 0, 44.8, 0, 41, 0],
  [11, -32.5, 4, -32.5, -18, 0], [11, -32.5, -19, -40, -22, 0],
  [13, 65, 29, 66.8, 27, 0],
];

export function build(ctx) {
  const { THREE, M } = ctx;
  const group = new THREE.Group(); group.name = 'wayfinding';
  const parts = [[], [], []], colliders = [], pickables = [];
  const materials = [
    M.get('steel', { color: 0x1a1c2c, roughness: 0.48 }).clone(),
    M.get('plaster', { color: 0xffffff, roughness: 0.42 }).clone(),
    M.get('sandstone', { color: 0xffffff, roughness: 0.78 }).clone(),
  ];
  const color = new THREE.Color();
  function add(k, g, x, y, z, tint = 0xffffff, yaw = 0) {
    g.rotateY(yaw); g.translate(x, y, z); M.boxUV(g);
    const c = new Float32Array(g.attributes.position.count * 3); color.set(tint);
    for (let i = 0; i < c.length; i += 3) { c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts[k].push(g);
  }
  function glyph(shape, r, depth) {
    if (shape === 1) return new THREE.BoxGeometry(r * 1.65, r * 1.65, depth);
    const g = new THREE.CylinderGeometry(r, r, depth, shape === 2 ? 3 : 20);
    g.rotateX(Math.PI / 2); return g;
  }
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  // Destination posts are on the edge of circulation, all same readable height.
  for (let i = 0; i < DESTINATIONS.length; i++) {
    const d = DESTINATIONS[i];
    const x = d.x + (d.id === 'studio' ? -0.1 : 0.72), z = d.z + 0.65;
    add(0, new THREE.BoxGeometry(0.09, 1.52, 0.09), x, d.y + 0.76, z);
    add(0, new THREE.BoxGeometry(0.58, 0.68, 0.07), x, d.y + 1.35, z);
    add(1, glyph(d.shape, 0.215, 0.085), x, d.y + 1.35, z, d.color);
    add(2, new THREE.BoxGeometry(0.3, 0.055, 0.3), x, d.y + 0.0275, z, 0xb9ad98);
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, minY: d.y, maxY: d.y + 1.7 });
    if (d.label) {
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.13), proxyMaterial);
      proxy.name = 'wayfinding-' + d.id; proxy.position.set(x, d.y + 1.35, z);
      proxy.userData.action = { type: 'custom', id: d.id, label: 'ORIENTAR' };
      proxy.userData.destination = d.id === 'hall' ? 'Hall. Cinema pelo elevador.' : d.label;
      group.add(proxy); pickables.push(proxy);
    }
  }
  for (let i = 0; i < ROUTE.length; i++) {
    const [id, x, z, nx, nz, y] = ROUTE[i], d = DESTINATIONS[id];
    // An ink perimeter makes the colour legible on either pale or dark paving.
    const border = glyph(d.shape, 0.27, 0.008); border.rotateX(-Math.PI / 2);
    add(2, border, x, y + 0.009, z, 0x1a1c2c);
    const face = glyph(d.shape, 0.205, 0.009); face.rotateX(-Math.PI / 2);
    add(2, face, x, y + 0.016, z, d.color);
    const angle = Math.atan2(nx - x, nz - z);
    const arrow = new THREE.CylinderGeometry(0.14, 0.14, 0.012, 3);
    // A triangle vertex starts towards +z after the rotation below.
    add(2, arrow, x + Math.sin(angle) * 0.52, y + 0.014, z + Math.cos(angle) * 0.52, 0xfff3d6, angle);
  }
  for (let k = 0; k < materials.length; k++) {
    const geometry = mergeGeometries(parts[k], false);
    for (let i = 0; i < parts[k].length; i++) parts[k][i].dispose();
    materials[k].vertexColors = true;
    const mesh = new THREE.Mesh(geometry, materials[k]); mesh.name = 'wayfinding-batch-' + k;
    mesh.receiveShadow = true; mesh.castShadow = k === 0;
    mesh.matrixAutoUpdate = false; mesh.raycast = () => {}; group.add(mesh);
  }
  function onPick(object) {
    const destination = object?.userData?.destination;
    if (destination) ctx.ui?.toast?.(destination);
  }
  return { group, regions: [], colliders, pickables, update() {}, onPick };
}
