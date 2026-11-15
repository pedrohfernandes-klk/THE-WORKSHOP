// Artwork texture loading. One GPU texture per image, shared by every slot that
// ever hangs it. Textures are never disposed by the room (they are cached).
import * as THREE from 'three';

const cache = new Map();
const loader = new THREE.TextureLoader();
// Resolve catalogue paths ("assets/extracted/x.webp") against the site root, no
// matter which page imports this module.
const ROOT = new URL('../../', import.meta.url);

export function loadWorkTexture(work, renderer) {
  const key = work.src;
  let hit = cache.get(key);
  if (hit) return hit;
  hit = new Promise((resolve, reject) => {
    loader.load(
      new URL(work.src, ROOT).href,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      (err) => {
        cache.delete(key);
        reject(err);
      },
    );
  });
  cache.set(key, hit);
  return hit;
}
