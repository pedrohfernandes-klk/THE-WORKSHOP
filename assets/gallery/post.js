// Post-processing: MSAA half-float scene -> gentle bloom -> tone map (OutputPass)
// -> display-referred "grade" (vignette, grain, shadow warmth, edge aberration,
// dither). The grade runs after tone mapping so grain and dither are perceptual
// and the half-float buffer keeps gradients free of banding.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  name: 'GalleryGrade',
  defines: {},
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.022 },
    uVignette: { value: 0.28 },
    uAberration: { value: 0.0012 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration, uAspect;
    varying vec2 vUv;
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      vec3 col;
      #ifdef ABERRATION
        vec2 off = c * r2 * uAberration * 14.0;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      #else
        col = texture2D(tDiffuse, vUv).rgb;
      #endif
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // very slight warm lift in the shadows
      float sh = 1.0 - smoothstep(0.0, 0.5, lum);
      col += vec3(0.0105, 0.0075, 0.0042) * sh * sh;
      // gentle cinematic contrast in the lower mids, keeps whites untouched
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.10);
      // vignette (soft, wide)
      float vig = smoothstep(0.18, 0.95, r2 * 1.45);
      col *= 1.0 - uVignette * vig;
      // film grain, strongest in the mids
      float g = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
      #ifdef GRAIN
        col += g * uGrain * (0.35 + 1.1 * lum * (1.0 - lum) * 2.0);
      #endif
      // triangular dither to kill 8-bit banding on the wall gradients
      float d = hash12(gl_FragCoord.xy * 1.37 + 17.0) + hash12(gl_FragCoord.yx * 0.91 + 3.0) - 1.0;
      col += d / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { quality = 'high' } = {}) {
  const high = quality !== 'low';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tone mapping is owned here (OutputPass applies it). Khronos Neutral keeps the
  // artworks' hue and saturation intact and only rolls off the true highlights.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    samples: high ? 4 : 2,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let bloom = null;
  if (high) {
    const s = renderer.getSize(new THREE.Vector2());
    bloom = new UnrealBloomPass(new THREE.Vector2(s.x, s.y), 0.34, 0.65, 1.05);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  if (high) grade.material.defines.ABERRATION = '';
  grade.material.defines.GRAIN = '';
  if (!high) grade.uniforms.uGrain.value = 0.014;
  grade.material.needsUpdate = true;
  composer.addPass(grade);

  let t = 0;
  function setSize(w, h) {
    composer.setSize(w, h);
    grade.uniforms.uAspect.value = w / Math.max(1, h);
  }
  const s0 = renderer.getSize(new THREE.Vector2());
  setSize(s0.x, s0.y);

  return {
    render(dt = 0.016) {
      if (!reduced) t += dt;
      grade.uniforms.uTime.value = t;
      composer.render(dt);
    },
    setSize,
    dispose() {
      composer.dispose?.();
      target.dispose();
    },
    composer,
  };
}
