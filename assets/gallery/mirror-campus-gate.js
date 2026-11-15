// Conservative portal culling for the Hall floor only. No allocations per pass.
// Install after world creation; leave environment/facade available to the Hall.
export function gateHallCampus({ THREE, floor, camera, world, renderer }) {
  if (!floor?.getRenderTarget || !world?.groups) return () => {};
  const original = floor.onBeforeRender;
  const groups = Object.entries(world.groups)
    .filter(([name, group]) => group && name !== 'environment' && name !== 'facade')
    .map(([, group]) => group);
  const visibility = new Uint8Array(groups.length);
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  // Reflect the entire generous doorway box across floor y=0. Testing this
  // virtual aperture against the main camera also accounts for floor reflection.
  const doorway = new THREE.Box3(
    new THREE.Vector3(-2.4, -6.5, 16.0),
    new THREE.Vector3(2.4, 0.3, 18.6),
  );
  let installed = true;
  function wrapped(r, scene, cam, geometry, material, group) {
    const p = camera.position;
    if (cam !== camera || scene.overrideMaterial || renderer.shadowMap.needsUpdate
      || p.x < -5.7 || p.x > 5.7 || p.z < -16 || p.z > 15.4 || p.y > 5.5) {
      return original.call(this, r, scene, cam, geometry, material, group);
    }
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    if (frustum.intersectsBox(doorway)) {
      return original.call(this, r, scene, cam, geometry, material, group);
    }
    for (let i = 0; i < groups.length; i++) {
      visibility[i] = groups[i].visible ? 1 : 0;
      groups[i].visible = false;
    }
    try { return original.call(this, r, scene, cam, geometry, material, group); }
    finally {
      for (let i = 0; i < groups.length; i++) groups[i].visible = visibility[i] === 1;
    }
  }
  floor.onBeforeRender = wrapped;
  return function dispose() {
    if (installed && floor.onBeforeRender === wrapped) floor.onBeforeRender = original;
    installed = false;
  };
}
