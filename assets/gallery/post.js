// Post-processing. One scene render per frame, then a short full-screen chain:
//
//   scene -> MSAA half-float target (colour + depth)
//         -> [GTAO from that depth, normals rebuilt from depth] folded into the
//            MSAA resolve copy (AO multiply)
//         -> depth of field (only while looking at a work)
//         -> gentle bloom
//         -> one display pass: exposure + Khronos Neutral tone map + sRGB, then
//            the "grade" (vignette, grain, shadow warmth, edge aberration, dither)
//
// The grade runs after tone mapping so grain and dither are perceptual, and the
// half-float buffer keeps gradients free of banding. GTAO no longer renders its
// own normal/depth G-buffer: that was a second full-campus render every frame
// (with a full scene traversal on each side of it), and the pool mirror used to
// re-render the campus again inside it.
//
// Quality steps (setQuality) only toggle passes, change uniforms or resize
// targets: no step recompiles a shader. Every program is compiled on the first
// frames (behind the entry screen), so a later step cannot hitch on a compile.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Display pass: what OutputPass did (exposure, Neutral tone map, sRGB) and the
// grade, in one full-screen pass instead of two.
const GradeShader = {
  name: 'GalleryGrade',
  defines: {},
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uTime: { value: 0 },
    uGrain: { value: 0.022 },
    uVignette: { value: 0.22 },
    uAberration: { value: 0.0002 },
    uAspect: { value: 1 },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure, uTime, uGrain, uVignette, uAberration, uAspect;
    varying vec2 vUv;
    // three r170 NeutralToneMapping (tonemapping_pars_fragment); exposure is applied by display()
    vec3 neutralTM(vec3 color) {
      const float StartCompression = 0.8 - 0.04;
      const float Desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < StartCompression) return color;
      float d = 1. - StartCompression;
      float newPeak = 1. - d * d / (peak + d - StartCompression);
      color *= newPeak / peak;
      float g = 1. - 1. / (Desaturation * (peak - newPeak) + 1.);
      return mix(color, vec3(newPeak), g);
    }
    // sRGB transfer (three's sRGBTransferOETF, as OutputPass applied it)
    vec3 toSRGB(vec3 v) {
      v = max(v, vec3(0.0));
      return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
    }
    vec3 display(vec3 c) { return toSRGB(neutralTM(c * uExposure)); }
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
        // the tone map mixes channels, so each fringe sample is mapped on its own
        vec2 off = c * r2 * uAberration * 14.0;
        col.r = display(texture2D(tDiffuse, vUv + off).rgb).r;
        col.g = display(texture2D(tDiffuse, vUv).rgb).g;
        col.b = display(texture2D(tDiffuse, vUv - off).rgb).b;
      #else
        col = display(texture2D(tDiffuse, vUv).rgb);
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

// Renders the scene into an MSAA half-float target (with a depth texture), then
// resolves into the composer's read buffer. The resolve copy also applies the
// ambient occlusion (what GTAOPass's copy + multiply-blend passes did), so AO
// costs no extra full-resolution pass. Keeps every other composer target
// single-sampled and makes MSAA independent of how many passes swap buffers.
class ScenePass extends Pass {
  constructor(scene, camera, target) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.needsSwap = false;
    this.ao = null;          // GTAOPass used as an AO generator only (output Off)
    this.aoCompute = false;
    this.aoApply = false;
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        name: 'GalleryResolve',
        uniforms: { tDiffuse: { value: null }, tAO: { value: null }, uAO: { value: 0 } },
        vertexShader: QUAD_VS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform sampler2D tAO;
          uniform float uAO;
          varying vec2 vUv;
          void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            // GTAOBlendShader with multiply blending, folded in (uniform branch: no fetch when off)
            if (uAO > 0.0) c.rgb *= mix(1.0, texture2D(tAO, vUv).r, uAO);
            gl_FragColor = c;
          }`,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.target);
    if (!renderer.autoClear) renderer.clear(); // render() clears itself when autoClear is on
    renderer.render(this.scene, this.camera);
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = this.target.texture;
    u.uAO.value = 0;
    if (this.ao && this.aoCompute) {
      this.ao.render(renderer, writeBuffer, readBuffer); // AO + denoise into its own small targets
      u.tAO.value = this.ao.pdRenderTarget.texture;
      if (this.aoApply) u.uAO.value = this.ao.blendIntensity;
    }
    renderer.setRenderTarget(readBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

// Cheap depth of field: gather blur driven by the scene's depth texture.
// Fades in/out with `amount`.
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
  vertexShader: QUAD_VS,
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

  // Tone mapping is owned here (the display pass applies it). Khronos Neutral
  // keeps the artworks' hue and saturation intact and only rolls off the true
  // highlights. renderer.toneMapping stays set for anything that reads it.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const maxSamples = high ? 4 : 2;
  const msaa = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    samples: maxSamples,
    colorSpace: THREE.LinearSRGBColorSpace,
    // Resolved with the colour (three blits depth too): GTAO and the depth of
    // field read it instead of rendering the campus a second time.
    depthTexture: new THREE.DepthTexture(Math.max(2, size.x), Math.max(2, size.y), THREE.UnsignedIntType),
  });
  const chainTarget = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const composer = new EffectComposer(renderer, chainTarget);
  const scenePass = new ScenePass(scene, camera, msaa);
  composer.addPass(scenePass);

  const db = new THREE.Vector2(Math.max(2, size.x), Math.max(2, size.y)); // drawing-buffer size
  let aoMode = 'off';
  let aoShift = 1;          // AO resolution = drawing buffer >> aoShift (1: half, 2: quarter)
  let gtao = null;
  let focus = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, Math.max(2, size.x >> 1), Math.max(2, size.y >> 1));
    // AO from the scene pass's depth; normals are rebuilt from depth (no G-buffer render).
    gtao.setGBuffer(msaa.depthTexture);
    gtao.output = GTAOPass.OUTPUT.Off; // ScenePass applies it
    gtao.blendIntensity = 0.8;
    gtao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.6, thickness: 1.4, scale: 1.1, samples: 12, distanceFallOff: 1.0 });
    gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-400, -10, -400), new THREE.Vector3(400, 80, 400))); // the whole campus, not just the hall
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    const baseSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => baseSetSize(Math.max(2, w >> aoShift), Math.max(2, h >> aoShift));
    scenePass.ao = gtao;
    aoMode = 'full';

    focus = new ShaderPass(FocusShader);
    focus.uniforms.tDepth.value = msaa.depthTexture;
    focus.enabled = false;
    composer.addPass(focus);
  }

  let bloom = null;
  let bloomScale = 1;
  if (high) {
    const s = renderer.getSize(new THREE.Vector2());
    // Threshold is scene-linear (bloom runs before the display pass/exposure) and
    // the high-pass knee is hard: keep it above lit art whites (~1.2-1.46) and
    // sunlit stone (~1.3) so only lamps, lenses (7.0), the skylight diffuser
    // (2.0), glints and the sun bloom.
    bloom = new UnrealBloomPass(new THREE.Vector2(s.x, s.y), 0.20, 0.55, 1.6);
    const baseBloomSize = bloom.setSize.bind(bloom);
    // bloomScale 0.5 starts the mip chain at a quarter of the drawing buffer
    bloom.setSize = (w, h) => baseBloomSize(Math.max(4, Math.round(w * bloomScale)), Math.max(4, Math.round(h * bloomScale)));
    composer.addPass(bloom);
  }

  const grade = new ShaderPass(GradeShader);
  if (high) grade.material.defines.ABERRATION = '';
  grade.material.defines.GRAIN = '';
  grade.material.toneMapped = false; // tone mapping is done in the shader itself
  if (!high) grade.uniforms.uGrain.value = 0.014;
  grade.material.needsUpdate = true;
  composer.addPass(grade);

  let t = 0;
  let focusDist = 4;
  let focusTarget = 0;
  let focusAmt = 0;
  let dofAllowed = true;
  let moving = false;
  let warm = 2; // first frames: compile every program a quality step may switch on later

  function setSize(w, h) {
    // A composer built on a supplied target starts at pixel ratio 1; keep the
    // chain at the drawing-buffer resolution or hi-DPI screens go soft.
    const pr = renderer.getPixelRatio();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    db.set(Math.max(2, Math.floor(w * pr)), Math.max(2, Math.floor(h * pr)));
    msaa.setSize(db.x, db.y);
    gtao?.setSize(db.x, db.y);
    grade.uniforms.uAspect.value = w / Math.max(1, h);
    if (focus) focus.uniforms.uTexel.value.set(1 / db.x, 1 / db.y);
  }
  const s0 = renderer.getSize(new THREE.Vector2());
  setSize(s0.x, s0.y);

  // Quality steps for the governor (perf.js). Only toggles, uniforms and target
  // sizes change: no shader is recompiled.
  function setQuality({ ao, bloomScale: bs, dof, samples } = {}) {
    if (ao !== undefined && gtao) {
      const mode = ao === 'half' || ao === 'off' ? ao : 'full';
      const shift = mode === 'half' ? 2 : 1;
      aoMode = mode;
      if (shift !== aoShift) { aoShift = shift; gtao.setSize(db.x, db.y); }
    }
    if (bs !== undefined && bloom) {
      const k = Math.min(1, Math.max(0.25, bs));
      if (k !== bloomScale) { bloomScale = k; bloom.setSize(db.x, db.y); }
    }
    if (dof !== undefined) dofAllowed = !!dof;
    if (samples !== undefined) {
      const n = Math.min(maxSamples, Math.max(0, samples | 0));
      // A sample-count change needs fresh renderbuffers: dispose, re-created on next use.
      if (n !== msaa.samples) { msaa.samples = n; msaa.dispose(); }
    }
  }

  return {
    render(dt = 0.016) {
      if (!reduced) t += dt;
      grade.uniforms.uTime.value = t;
      grade.uniforms.uExposure.value = renderer.toneMappingExposure;
      const prewarm = warm > 0;
      if (prewarm) warm--;
      scenePass.aoCompute = !!gtao && (aoMode !== 'off' || prewarm);
      scenePass.aoApply = !!gtao && aoMode !== 'off';
      if (focus) {
        // Off while walking or turning (it fades out within ~0.3 s), and at the
        // governor's lower steps.
        const target = dofAllowed && !moving ? focusTarget : 0;
        const rate = target < focusAmt && (moving || !dofAllowed) ? 12 : 3.5;
        focusAmt += (target - focusAmt) * (1 - Math.exp(-dt * rate));
        if (Math.abs(target - focusAmt) < 0.004) focusAmt = target;
        focus.enabled = focusAmt > 0.01 || prewarm;
        if (focus.enabled) {
          const u = focus.uniforms;
          u.uAmount.value = focusAmt > 0.01 ? focusAmt : 0;
          u.uFocus.value = focusDist;
          u.uNear.value = camera.near;
          u.uFar.value = camera.far;
        }
      }
      composer.render(dt);
    },
    setSize,
    setQuality,
    // the visitor is walking or turning (depth of field fades out)
    setMoving(v) { moving = !!v; },
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
    // what runs this frame (for tests and the perf notes)
    stats() {
      return {
        passes: composer.passes.filter((p) => p.enabled).map((p) => (p === scenePass ? 'scene' : p === focus ? 'dof' : p === bloom ? 'bloom' : p === grade ? 'grade' : p.constructor.name)),
        ao: gtao ? aoMode : 'none',
        aoSize: gtao ? [gtao.width, gtao.height] : null,
        bloomScale: bloom ? bloomScale : 0,
        samples: msaa.samples,
        size: [msaa.width, msaa.height],
        dof: focus ? focusAmt : 0,
      };
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
