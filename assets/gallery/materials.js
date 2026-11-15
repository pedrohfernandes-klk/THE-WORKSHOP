// materials.js — the shared library of photographed (CC0, Poly Haven) PBR
// materials and the real sky. Every space in the complex builds from these, so
// the whole place reads as one consistent, physically lit world.
//
//   const M = createMaterials(renderer, { quality });
//   const mat = M.get('paving');                 // MeshStandardMaterial, textures stream in
//   M.boxUV(geometry);                           // UVs in metres, so textures keep real scale
//   const { background, environment, sunDirection } = await M.sky();
//
// UV convention: 1 UV unit = 1 metre. Each material carries its real-world tile
// size, so call M.boxUV(geometry) (or write metre UVs yourself) on every
// geometry that uses a textured material.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const BASE = new URL('../textures/', import.meta.url);

// name: [poly haven id, tile size in metres, extra material params]
const LIBRARY = {
  plaster:        ['painted_plaster_wall', 3.0, { color: 0xf3efe7, normalScale: 0.35 }],
  concreteFloor:  ['concrete_floor_01', 3.5, { roughness: 0.55, normalScale: 0.4 }],
  concreteWall:   ['concrete_wall_008', 3.0, { normalScale: 0.8 }],
  paving:         ['rectangular_paving', 2.4, { normalScale: 0.9 }],
  gravel:         ['gravel_floor', 1.6, { normalScale: 1.2 }],
  grass:          ['leafy_grass', 2.2, { normalScale: 1.0 }],
  leaves:         ['forest_leaves_02', 1.4, { normalScale: 1.4 }],
  bark:           ['bark_platanus', 1.2, { normalScale: 1.4 }],
  sandstone:      ['large_sandstone_blocks', 2.5, { normalScale: 1.0 }],
  whiteSandstone: ['white_sandstone_blocks_02', 2.5, { normalScale: 0.9 }],
  marble:         ['marble_01', 1.5, { roughness: 0.35, normalScale: 0.5 }],
  oak:            ['oak_veneer_01', 1.2, { normalScale: 0.4 }],
  deck:           ['wood_floor_deck', 2.0, { normalScale: 0.9 }],
  oakPlanks:      ['oak_wood_planks', 2.0, { normalScale: 0.6 }],
  velvet:         ['velour_velvet', 0.6, { color: 0x9a1f24, normalScale: 0.8 }],
  leather:        ['brown_leather', 0.8, { normalScale: 0.6 }],
  darkWood:       ['dark_wood', 1.5, { normalScale: 0.6 }],
  steel:          ['metal_plate', 1.0, { metalness: 1, roughness: 0.42, normalScale: 0.3 }],
  terrain:        ['aerial_grass_rock', 12.0, { normalScale: 1.0 }],
  terrazzo:       ['terrazzo_tiles', 1.6, { roughness: 0.4, normalScale: 0.3 }],
  fabric:         ['fabric_pattern_07', 0.8, { normalScale: 0.7 }],
};

export const MATERIAL_NAMES = Object.keys(LIBRARY);

export function createMaterials(renderer, { quality = 'high' } = {}) {
  const loader = new THREE.TextureLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const textures = new Map();     // `${id}/${kind}` -> Texture (shared image)
  const materials = new Map();    // cache key -> material

  function texture(id, kind) {
    const key = `${id}/${kind}`;
    if (!textures.has(key)) {
      const t = loader.load(new URL(`${id}/${kind}.webp`, BASE).href);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      textures.set(key, t);
    }
    return textures.get(key);
  }

  // A per-material view of a shared texture: own repeat, same GPU image.
  function view(id, kind, repeat) {
    const src = texture(id, kind);
    const t = src.clone();               // shares src.source, so the image arrives by itself
    t.repeat.set(repeat, repeat);
    if (!src.image) {
      t.version = 0;                     // nothing to upload yet (clone() marks it dirty)
      let tries = 0;
      const check = () => { if (src.image) t.needsUpdate = true; else if (++tries < 500) setTimeout(check, 120); };
      check();
    }
    return t;
  }

  /**
   * get(name, { tile, color, roughness, metalness, side, transparent, opacity, envMapIntensity })
   * `tile` overrides the real-world tile size in metres.
   */
  function get(name, opts = {}) {
    const entry = LIBRARY[name];
    if (!entry) throw new Error(`Unknown material "${name}". Known: ${MATERIAL_NAMES.join(', ')}`);
    const key = name + JSON.stringify(opts);
    if (materials.has(key)) return materials.get(key);
    const [id, tile, extra] = entry;
    const repeat = 1 / (opts.tile || tile);
    const params = {
      map: view(id, 'diff', repeat),
      roughness: 1, metalness: 0,
      ...withoutNormalScale(extra),
    };
    if (opts.color !== undefined) params.color = opts.color;
    const mat = new THREE.MeshStandardMaterial(params);
    if (quality !== 'low') {
      const arm = view(id, 'arm', repeat);
      mat.normalMap = view(id, 'nor', repeat);
      const ns = extra.normalScale ?? 1;
      mat.normalScale.set(ns, ns);
      mat.roughnessMap = arm;
      mat.aoMap = arm;
      mat.aoMapIntensity = 0.85;
      if ((extra.metalness ?? 0) > 0) mat.metalnessMap = arm;
    }
    for (const k of ['roughness', 'metalness', 'side', 'transparent', 'opacity', 'envMapIntensity']) {
      if (opts[k] !== undefined) mat[k] = opts[k];
    }
    mat.name = name;
    materials.set(key, mat);
    return mat;
  }

  let skyPromise = null;
  /** The real sky: an HDR photograph used as background and as image-based light. */
  function sky() {
    if (!skyPromise) {
      skyPromise = new RGBELoader().loadAsync(new URL('sky.hdr', BASE).href).then((hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = pmrem.fromEquirectangular(hdr).texture;
        pmrem.dispose();
        return { background: hdr, environment, sunDirection: findSun(hdr) };
      });
    }
    return skyPromise;
  }

  return { get, texture, sky, boxUV, names: MATERIAL_NAMES };
}

function withoutNormalScale(extra) {
  const { normalScale, ...rest } = extra;
  return rest;
}

/**
 * Rewrites a geometry's UVs as metres, projected along each vertex's dominant
 * normal axis (box mapping). Call after any scaling baked into the geometry.
 * `offset` shifts the pattern (e.g. so adjoining pieces don't repeat visibly).
 */
export function boxUV(geometry, { scale = 1, offset = [0, 0] } = {}) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// The brightest region of the equirectangular sky is the sun: point the
// DirectionalLight there so shadows agree with the photograph.
function findSun(hdr) {
  const { data, width, height } = hdr.image;
  const stride = data.length / (width * height);
  let best = -1, bx = 0, by = 0;
  const toFloat = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (x) => x;
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * stride;
      const l = toFloat(data[i]) + toFloat(data[i + 1]) + toFloat(data[i + 2]);
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const phi = (bx / width) * Math.PI * 2;      // around
  const theta = (by / height) * Math.PI;       // from the zenith
  // Matches three's equirectangular convention.
  return new THREE.Vector3(-Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)).normalize();
}
