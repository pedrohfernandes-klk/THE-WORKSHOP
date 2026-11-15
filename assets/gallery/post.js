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
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const GradeShader = {
  name: 'GalleryGrade',
  defines: {},
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.022 },
    uVignette: { value: 0.22 },
    uAberration: { value: 0.0002 },
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
      float vig = smoothstep(0.15, 0.95, r2 * 1.45);
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


// Renders the scene into an MSAA half-float target, then resolves into the
// composer's read buffer. Keeps every other composer target single-sampled and
// makes MSAA independent of how many passes happen to swap buffers.
class ScenePass extends Pass {
  constructor(scene, camera, target) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.needsSwap = false;
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.quad.material.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(readBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

// Cheap depth of field: gather blur driven by the depth the GTAO pass already
// rendered. Fades in/out with `amount`.
const FocusShader = {
  name: 'GalleryFocus',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uFocus: { value: 4 },
    uAmount: { value: 0 },
    uMaxCoc: { value: 7 },
    uTexel: { value: new THREE.Vector2(1 / 1440, 1 / 900) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform highp sampler2D tDepth;
    uniform float uNear, uFar, uFocus, uAmount, uMaxCoc;
    uniform vec2 uTexel;
    varying vec2 vUv;
    #include <packing>
    float depthAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float cocOf(float d) {
      float x = abs(d - uFocus) / max(uFocus, 0.6);
      return smoothstep(0.16, 1.15, x) * uMaxCoc * uAmount;
    }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec4 c0 = texture2D(tDiffuse, vUv);
      float cc = cocOf(depthAt(vUv));
      if (cc < 0.35) { gl_FragColor = c0; return; }
      float rot = ign(gl_FragCoord.xy) * 6.2831853;
      vec3 acc = c0.rgb;
      float ws = 1.0;
      for (int i = 0; i < 18; i++) {
        float f = (float(i) + 0.5) / 18.0;
        float a = float(i) * 2.39996323 + rot;
        vec2 off = vec2(cos(a), sin(a)) * sqrt(f) * cc * uTexel;
        vec2 uv = vUv + off;
        float ci = cocOf(depthAt(uv));
        float w = clamp((ci + 0.5) / (cc + 0.5), 0.0, 1.0);
        acc += min(texture2D(tDiffuse, uv).rgb, vec3(8.0)) * w;
        ws += w;
      }
      gl_FragColor = vec4(acc / ws, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { quality = 'high' } = {}) {
  const high = quality !== 'low';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tone mapping is owned here (OutputPass applies it). Khronos Neutral keeps the
  // artworks' hue and saturation intact and only rolls off the true highlights.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;

  // the Reflector must not re-render the mirror inside the AO normal pass
  scene.traverse((o) => {
    if (o.isReflector && !o.userData.__postWrapped) {
      o.userData.__postWrapped = true;
      const orig = o.onBeforeRender;
      o.onBeforeRender = function (...a) {
        if (scene.overrideMaterial) return;
        orig.apply(this, a);
      };
    }
  });

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const msaa = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    samples: high ? 4 : 2,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const chainTarget = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const composer = new EffectComposer(renderer, chainTarget);
  const scenePass = new ScenePass(scene, camera, msaa);
  composer.addPass(scenePass);

  let gtao = null;
  let focus = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, Math.max(2, size.x >> 1), Math.max(2, size.y >> 1));
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.8;
    gtao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.6, thickness: 1.4, scale: 1.1, samples: 12, distanceFallOff: 1.0 });
    gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-400, -10, -400), new THREE.Vector3(400, 80, 400))); // the whole campus, not just the hall
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    const baseSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => baseSetSize(Math.max(2, w >> 1), Math.max(2, h >> 1)); // AO at half resolution
    composer.addPass(gtao);

    focus = new ShaderPass(FocusShader);
    focus.uniforms.tDepth.value = gtao.depthTexture;
    focus.enabled = false;
    composer.addPass(focus);
  }

  let bloom = null;
  if (high) {
    const s = renderer.getSize(new THREE.Vector2());
    bloom = new UnrealBloomPass(new THREE.Vector2(s.x, s.y), 0.20, 0.55, 1.1);
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
  let focusDist = 4;
  let focusTarget = 0;
  let focusAmt = 0;
  function setSize(w, h) {
    // A composer built on a supplied target starts at pixel ratio 1; keep the
    // chain at the drawing-buffer resolution or hi-DPI screens go soft.
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    msaa.setSize(Math.max(2, Math.floor(w * pr)), Math.max(2, Math.floor(h * pr)));
    grade.uniforms.uAspect.value = w / Math.max(1, h);
    if (focus) focus.uniforms.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
  }
  const s0 = renderer.getSize(new THREE.Vector2());
  setSize(s0.x, s0.y);

  return {
    render(dt = 0.016) {
      if (!reduced) t += dt;
      grade.uniforms.uTime.value = t;
      if (focus) {
        focusAmt += (focusTarget - focusAmt) * (1 - Math.exp(-dt * 3.5));
        if (Math.abs(focusTarget - focusAmt) < 0.004) focusAmt = focusTarget;
        focus.enabled = focusAmt > 0.01;
        if (focus.enabled) {
          const u = focus.uniforms;
          u.uAmount.value = focusAmt;
          u.uFocus.value = focusDist;
          u.uNear.value = camera.near;
          u.uFar.value = camera.far;
        }
      }
      composer.render(dt);
    },
    setSize,
    // calibrate interior vs exterior brightness
    setExposure(v) {
      renderer.toneMappingExposure = v;
    },
    // distance in metres to the work being looked at; null fades the effect out
    setFocus(d) {
      if (d == null || !isFinite(d)) {
        focusTarget = 0;
      } else {
        focusDist = Math.max(0.8, d);
        focusTarget = 1;
      }
    },
    dispose() {
      composer.dispose?.();
      msaa.dispose();
      chainTarget.dispose();
      scenePass.dispose();
      gtao?.dispose();
    },
    composer,
  };
}
