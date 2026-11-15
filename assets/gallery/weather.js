// Weather module: golden (default, canon: late afternoon) / sunny (radiant noon) /
// storm / rainbow / night with ~3 s crossfades.
// Usage: const weather = createWeather(ctx, { environment });
//   weather.set('storm'); each frame: weather.update(dt, { camera, ... });
// Extras: weather.setConstellations(bool), weather.setIndoor(bool) (hides rain),
//   weather.refreshShadows() (sun intensity changes need no shadow refresh).
// Publishes ctx.scene.userData.weather = { mode, night, storm, t, ...amounts }
//   (night/storm: booleans for the target mode; t: 0..1 crossfade progress;
//   nightK/stormK/rainK/bowK/wetK/flash: live 0..1 amounts) and dispatches a
//   { type: 'weather' } event on the scene when the mode changes.
// Materials may opt in to the night: material.userData.nightGlow = k (emissive x k
//   at night, e.g. lit windows / street lamps); userData.wet = false opts out of rain.
const SKY_JSON = new URL('../data/sky.json', import.meta.url);
const LAT = 38.72, LON = -9.14;
const D2R = Math.PI / 180;

const DOME_VS = `
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position,1.0)).xyz);
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * vDir * 10.0, 1.0);
  gl_Position = p.xyww;
}`;
const TAIL = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;
const NOISE = `
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z); }`;

const BILL_VS = `
uniform vec3 uDir, uRight, uUp; uniform float uSize; varying vec2 vUv;
void main(){
  vUv = position.xy;
  vec3 d = uDir + (uRight*position.x + uUp*position.y)*uSize;
  gl_Position = (projectionMatrix * vec4(mat3(viewMatrix)*d*10.0, 1.0)).xyww;
}`;

// Outdoor radiance scale (sun, sky IBL, background, fog): an outdoor exposure of
// ~0.92 x 0.78 = 0.72 puts a sunlit 18% grey near sRGB 0.55 and keeps light stone
// out of the clip, while the lamp-lit hall keeps its calibrated 0.92.
const EXPO = 0.78;
// The sun disc is capped out of the IBL (environment.js): interiors that only see
// the IBL (sun faded indoors) get its energy back while the visitor is inside.
const INDOOR_ENV = 3.0;

export function createWeather(ctx, { environment } = {}) {
  const { THREE, renderer, scene, reducedMotion } = ctx;
  const sun = environment && environment.sun;
  const q = ctx.quality;
  const low = q === 'low' || q === 0 || (typeof q === 'number' && q < 0.6) || (q && q.tier === 'low');
  const modes = ['golden', 'sunny', 'storm', 'rainbow', 'night'];
  const group = new THREE.Group(); group.name = 'weather';
  scene.add(group);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---- captured base state -------------------------------------------------
  const baseSun = sun ? sun.intensity : 2.6;
  const baseSunColor = sun ? sun.color.clone() : new THREE.Color(0xfff0dc);
  const baseEnv = scene.environmentIntensity ?? 1;
  const baseBg = scene.backgroundIntensity ?? 0.9;
  const sunnyEnvTex = scene.environment;
  const capped = !!(sunnyEnvTex && sunnyEnvTex.userData && sunnyEnvTex.userData.discCapped);
  const indoorEnv = capped ? INDOOR_ENV : 1;
  const fog = scene.fog;
  const baseFogColor = fog ? fog.color.clone() : new THREE.Color(0xa3a9b8);
  const baseFogDens = fog ? fog.density : 0.0012;
  const sunDir = new THREE.Vector3(-0.5, 0.5, 0.7);
  if (environment && environment.sunDirection) sunDir.copy(environment.sunDirection);
  else if (sun) sunDir.copy(sun.position).sub(sun.target.position);
  sunDir.normalize();
  // Sun elevation by mode, on the photographed sun's azimuth: radiant noon = the
  // photographed 48 deg; golden late afternoon 28 deg (canon); after the storm the
  // sun breaks through at 22 deg (a bow needs it below 42 deg). Weather draws the
  // sun itself over environment.backgroundNoSun, so there is never a second sun.
  const ownSun = !!(environment && environment.backgroundNoSun);
  const atElev = (deg) => {
    const v = new THREE.Vector3(sunDir.x, 0, sunDir.z); if (v.lengthSq() < 1e-6) v.set(-0.5, 0, 0.8);
    v.normalize().multiplyScalar(Math.cos(deg * D2R)); v.y = Math.sin(deg * D2R); return v;
  };
  const goldSunDir = ownSun ? atElev(28) : sunDir.clone(), bowSunDir = atElev(22);
  const AIM = { base: sunDir, gold: goldSunDir, bow: bowSunDir };
  const WANT = { golden: 'gold', sunny: 'base', storm: null, rainbow: 'bow', night: 'gold' };
  const lightDir = sunDir.clone(); // where the DirectionalLight currently points from
  let sunAim = 'base';

  // ---- parameter blending --------------------------------------------------
  const P = {
    sun: 1, env: 1, bg: 1, fogK: 1, rain: 0, bow: 0, night: 0, over: 0, flare: 1, moonL: 0, cons: 0, wet: 0, glow: 0, expo: EXPO, gold: 0,
  };
  const fogColor = baseFogColor.clone();
  const FOGC = {
    golden: baseFogColor.clone().lerp(new THREE.Color(0xc9b8a4), 0.3).multiplyScalar(0.7),
    sunny: baseFogColor,
    storm: new THREE.Color(0x3a4452),
    rainbow: baseFogColor.clone().lerp(new THREE.Color(0x8d97a4), 0.5),
    night: new THREE.Color(0x070b14),
  };
  const SUNC = { golden: new THREE.Color(0xffc98e), sunny: baseSunColor, storm: new THREE.Color(0xc9d3e2), rainbow: new THREE.Color(0xffdcb0), night: baseSunColor };
  const T = {
    // key:fill on the ground ~2.6:1 (warm key, cool sky fill), long raking shadows
    golden:  { sun: 0.85, env: 0.62, bg: 0.62, fogK: 1.05, rain: 0, bow: 0, night: 0, over: 0, flare: 1, moonL: 0, wet: 0, glow: 0.15, expo: 1.08, gold: 1 },
    // "sol radiante": high, hard, saturated noon light, ~3.2:1
    sunny:   { sun: 1.1, env: 1, bg: 1, fogK: 1, rain: 0, bow: 0, night: 0, over: 0, flare: 1, moonL: 0, wet: 0, glow: 0, expo: EXPO, gold: 0 },
    storm:   { sun: 0, env: 0.42, bg: 0.4, fogK: 2.8, rain: 1, bow: 0, night: 0, over: 1, flare: 0, moonL: 0, wet: 1, glow: 0.35, expo: 0.95, gold: 0 },
    rainbow: { sun: 0.9, env: 0.75, bg: 0.85, fogK: 1.25, rain: 0.2, bow: 1, night: 0, over: 1, flare: 0.8, moonL: 0, wet: 0.75, glow: 0, expo: 0.9, gold: 0.5 },
    night:   { sun: 0, env: 0.11, bg: 0, fogK: 1.15, rain: 0, bow: 0, night: 1, over: 0, flare: 0, moonL: 1, wet: 0.45, glow: 1, expo: 1, gold: 0 },
  };
  let mode = 'golden', tgt = T.golden, tgtFog = FOGC.golden, tMode = 0, time = 0, indoor = 0, indoorTgt = 0;
  let consOn = false;   // real sky first: no diagram lines unless asked (setConstellations)
  Object.assign(P, T.golden); fogColor.copy(FOGC.golden);

  // ---- published state -----------------------------------------------------
  let W = null;
  function publish() {
    W = { mode, night: mode === 'night', storm: mode === 'storm', t: 0, nightK: P.night, stormK: P.over * (mode === 'rainbow' ? 0 : 1), rainK: P.rain, bowK: P.bow, wetK: P.wet, flash: 0 };
    scene.userData.weather = W;
    if (scene.dispatchEvent) scene.dispatchEvent({ type: 'weather', weather: W });
  }
  publish(); W.t = 1;

  // ---- sky domes (drawn at far plane, independent of camera.far) -------------
  const domeGeo = track(new THREE.SphereGeometry(1, 32, 16));
  function dome(frag, uniforms, order, extra) {
    const m = track(new THREE.ShaderMaterial(Object.assign({
      vertexShader: DOME_VS, fragmentShader: frag, uniforms, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: false,
    }, extra || {})));
    const mesh = new THREE.Mesh(domeGeo, m);
    mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; mesh.name = 'weather-dome';
    group.add(mesh);
    return mesh;
  }

  // overcast dome (equirect HDR, lazy): storm and the clearing after it
  let overTex = null, overEnv = null, overLoading = false;
  const flashDir = new THREE.Vector3(0, 0.3, 1);
  const overU = {
    uTex: { value: null }, uA: { value: 0 }, uI: { value: 0.35 }, uFlash: { value: 0 }, uFlashDir: { value: flashDir },
    uSun: { value: bowSunDir }, uBreak: { value: 0 },
  };
  const overDome = dome(`
    uniform sampler2D uTex; uniform float uA, uI, uFlash, uBreak; uniform vec3 uFlashDir, uSun; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec2 uv = vec2(atan(d.z, d.x)*0.15915494+0.5, asin(clamp(d.y,-1.,1.))*0.31830989+0.5);
      vec3 c = texture2D(uTex, uv).rgb;
      float lum = dot(c, vec3(0.2126,0.7152,0.0722));
      // heavier, bruised storm deck: deepen the darks, keep the bright edges
      c = mix(vec3(lum), c, 0.75) * mix(1.0, 0.55 + 0.6*smoothstep(0.15, 0.9, lum), 0.7) * uI;
      // lightning lights the cloud from inside around the stroke
      float fd = max(dot(d, uFlashDir), 0.0);
      c += vec3(0.75,0.8,1.0) * uFlash * (pow(fd, 6.0)*3.0 + pow(fd, 40.0)*6.0) * smoothstep(-0.05, 0.12, d.y);
      // after the storm: the deck breaks around a low sun (silver lining, warm hole)
      float sd = max(dot(d, uSun), 0.0);
      c += vec3(1.0,0.82,0.6) * uBreak * (pow(sd, 8.0)*1.4 + pow(sd, 90.0)*6.0);
      // ...while the rain curtain opposite the sun stays slate
      c *= 1.0 - 0.45 * uBreak * smoothstep(-0.1, 0.7, -dot(d, uSun));
      gl_FragColor = vec4(c, uA);` + TAIL + `}`, overU, -4);
  function loadOvercast() {
    if (overLoading) return; overLoading = true;
    // materials.js owns and caches the storm sky (1k first, sharpened in place): no track()
    if (!ctx.M || typeof ctx.M.overcast !== 'function') return;
    ctx.M.overcast().then(({ background, environment: e }) => {
      overEnv = e; overTex = background; overU.uTex.value = background;
    }).catch(() => { overLoading = false; });
  }

  // night dome: deep gradient, Lisbon's light dome on the horizon, airglow and the
  // Milky Way placed by real galactic coordinates (rotates with the stars).
  const celInv = new THREE.Matrix3();
  const NGP = new THREE.Vector3(), GC = new THREE.Vector3(), GY = new THREE.Vector3();
  {
    const ev = (ra, dec, o) => { const a = ra * D2R, d = dec * D2R; o.set(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)); };
    ev(192.85948, 27.12825, NGP); ev(266.40500, -28.93617, GC);
    GC.addScaledVector(NGP, -GC.dot(NGP)).normalize();
    GY.crossVectors(NGP, GC).normalize(); // l = 90 deg (Cygnus)
  }
  const nightU = { uA: { value: 0 }, uCel: { value: celInv }, uNGP: { value: NGP }, uGC: { value: GC }, uGY: { value: GY }, uMW: { value: 1 } };
  const nightDome = dome(NOISE + `
    uniform float uA, uMW; uniform mat3 uCel; uniform vec3 uNGP, uGC, uGY; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -1., 1.);
      vec3 hor = vec3(0.020,0.032,0.065), top = vec3(0.0012,0.0024,0.0085);
      vec3 c = mix(hor, top, pow(clamp(h,0.,1.), 0.4));
      // Lisbon's light dome: warm sodium/LED glow hugging the horizon, stronger to the east
      float az = atan(d.z, d.x);
      float city = exp(-max(h,0.)*14.0) * (0.55 + 0.45*max(cos(az - 0.6), 0.0));
      c += vec3(0.055,0.032,0.016) * city;
      // airglow: a faint green band ~12 deg up
      float ag = (h - 0.2) / 0.08;
      c += vec3(0.0006,0.0022,0.0009) * exp(-ag*ag);
      c = mix(c, vec3(0.010,0.012,0.020), 1.0 - smoothstep(-0.25, 0.0, h));
      // Milky Way
      if (uMW > 0.0 && h > -0.08) {
        vec3 e = uCel * d;
        float b = degrees(asin(clamp(dot(e, uNGP), -1., 1.)));
        float l = degrees(atan(dot(e, uGY), dot(e, uGC)));
        float cen = exp(-l*l/(2.0*42.0*42.0));
        float w = 5.5 + 9.0*cen;
        float band = exp(-b*b/(2.0*w*w));
        if (band > 0.004) {
          float bulge = exp(-(l*l + b*b*2.6)/(2.0*13.0*13.0));
          vec3 p = e*7.0;
          float n = vn(p)*0.5 + vn(p*2.1+3.7)*0.3 + vn(p*4.3-1.3)*0.2;
          float clump = vn(e*19.0)*0.6 + vn(e*41.0)*0.4;
          // dust: the Great Rift (Cygnus..Sagittarius) and lanes along the plane
          float riftC = 1.2 + 2.4*sin(l*0.045);
          float rq = (b - riftC) / (1.3 + 1.8*cen);
          float rift = exp(-rq*rq) * (1.0 - smoothstep(20.0, 110.0, abs(l - 25.0)));
          float lanes = smoothstep(0.52, 0.78, vn(e*12.0 + 7.0)) * band;
          float dust = clamp(rift*(0.55 + 0.6*n) + lanes*0.55, 0.0, 0.92);
          float I = (band*(0.28 + 0.72*cen) + bulge*0.9) * (0.45 + 0.9*n) * (0.7 + 0.6*clump) * (1.0 - dust);
          vec3 mw = mix(vec3(0.62,0.70,0.95), vec3(1.0,0.86,0.66), clamp(cen*0.7 + bulge*0.8, 0.0, 1.0));
          // extinction toward the horizon
          float ext = smoothstep(-0.02, 0.35, h);
          c += mw * I * 0.1 * ext * uMW;
        }
      }
      gl_FragColor = vec4(c, uA);` + TAIL + `}`, nightU, -3);

  // rainbow dome. Light added by the rain curtain (premultiplied: rgb added,
  // alpha attenuates what is behind): primary at 40.6-42.4 deg (red outside),
  // a brighter sky inside it with faint supernumeraries, Alexander's dark band,
  // secondary at 50.4-53.6 deg with colours reversed. One sample per wavelength.
  const antiV = sunDir.clone().negate();
  const bowU = { uA: { value: 0 }, uAnti: { value: antiV } };
  const bowDome = dome(`
    uniform float uA; uniform vec3 uAnti; varying vec3 vDir;
    vec3 spec(float w){ // w: 0 violet .. 1 red (Zucconi bump fit), linear RGB
      vec3 x = vec3(3.54541723, 2.86670055, 2.29421995) * (w - vec3(0.69548916, 0.49416934, 0.28269708));
      return max(1.0 - x*x - vec3(0.02312400, 0.15225300, 0.52607238), 0.0);
    }
    void main(){
      vec3 d = normalize(vDir);
      float th = degrees(acos(clamp(dot(d, uAnti), -1., 1.)));
      if (th > 62.0) discard;
      vec3 add = vec3(0.0);
      float att = 0.0;
      if (th < 45.0) {
        for (int i = 0; i < 9; i++) {
          float w = (float(i) + 0.5) / 9.0;
          float x = th - mix(40.6, 42.35, w);            // >0: dark side (outside)
          float p = x > 0.0 ? exp(-x*x/0.09) : exp(x/0.55) + 0.09*exp(x/6.0);
          p *= 1.0 + (x < 0.0 ? 0.35*cos(x*5.2)*exp(x/1.6) : 0.0); // supernumeraries
          add += spec(w) * p;
        }
        add *= 1.2 / 9.0;
      }
      if (th > 48.0) {
        vec3 s2 = vec3(0.0);
        for (int i = 0; i < 7; i++) {
          float w = (float(i) + 0.5) / 7.0;
          float x = mix(53.6, 50.4, w) - th;             // >0: dark side (inside, toward the band)
          float p = x > 0.0 ? exp(-x*x/0.16) : exp(x/0.8) + 0.06*exp(x/5.0);
          s2 += spec(w) * p;
        }
        add += s2 * (0.5 / 7.0) * (1.0 - smoothstep(54.5, 60.0, th));
      }
      // Alexander's band: no added light, and the curtain dims what is behind it
      att = smoothstep(42.0, 43.2, th) * (1.0 - smoothstep(49.6, 50.8, th)) * 0.14;
      // the curtain is a rain shaft, not a stencil: soft at the ground and up high
      float f = smoothstep(-0.01, 0.05, d.y) * (1.0 - 0.35*smoothstep(0.35, 0.8, d.y));
      gl_FragColor = vec4(add * f * uA, att * f * uA);` + TAIL + `}`, bowU, -2, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });

  // ---- billboards: sun glow + moon ----------------------------------------
  const quad = track(new THREE.PlaneGeometry(2, 2));
  const UPV = new THREE.Vector3(0, 1, 0);
  function basis(dir, r, u) {
    r.crossVectors(dir, UPV); if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
    r.normalize(); u.crossVectors(r, dir).normalize();
  }
  function billboard(frag, dir, size, extra, additive, order) {
    const r = new THREE.Vector3(), u = new THREE.Vector3(); basis(dir, r, u);
    const uni = Object.assign({ uDir: { value: dir }, uRight: { value: r }, uUp: { value: u }, uSize: { value: size }, uA: { value: 0 } }, extra || {});
    const m = track(new THREE.ShaderMaterial({
      vertexShader: BILL_VS, fragmentShader: frag, uniforms: uni, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    }));
    const mesh = new THREE.Mesh(quad, m); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false;
    group.add(mesh);
    return { mesh, uni };
  }
  const flareDir = sunDir.clone();
  // the sun: a 1 deg disc far over the bloom threshold, its glare, and at golden
  // hour a wider, warmer aureole (forward scattering in the low, long air path)
  const flare = billboard(`
    uniform float uA, uGold, uDisc; varying vec2 vUv;
    void main(){
      float r = length(vUv);
      float g = 0.55*exp(-r*5.5) + 0.25*exp(-r*1.8) + 0.9*exp(-r*r*500.);
      vec3 warm = mix(vec3(1.,.86,.62), vec3(1.,.6,.3), uGold);
      float disc = (1. - smoothstep(0.0115, 0.0135, r)) * uDisc;
      vec3 c = warm*g*(1. + 0.9*uGold) + mix(vec3(1.,.95,.86), vec3(1.,.8,.55), uGold)*disc*60.;
      gl_FragColor = vec4(c*uA, 1.);` + TAIL + `}`, flareDir, 0.7, { uGold: { value: 1 }, uDisc: { value: ownSun ? 1 : 0 } }, true, -1);
  const moonDir = new THREE.Vector3(0.3, 0.6, -0.7).normalize();
  const sunW = sunDir.clone().negate();
  let moonFrac = 0.5;
  const moon = billboard(`
    uniform float uA; uniform vec3 uDir, uRight, uUp, uSun; varying vec2 vUv;
    void main(){
      float r = length(vUv);
      float disc = 1. - smoothstep(0.235,0.25,r);
      vec2 q = vUv/0.25; float z = sqrt(max(0.,1.-dot(q,q)));
      vec3 n = vec3(q, z);
      vec3 s = vec3(dot(uSun,uRight), dot(uSun,uUp), dot(uSun,-uDir));
      float lit = smoothstep(-0.03,0.1,dot(n,s));
      // maria: darker basaltic patches, brighter highlands
      float mott = 0.86 + 0.14*sin(q.x*7.+1.)*sin(q.y*9.-.5)*sin(q.x*3.+q.y*5.);
      mott *= 1.0 - 0.22*(1.0 - smoothstep(0.0, 0.25, length(q - vec2(-0.25, 0.3)))) - 0.18*(1.0 - smoothstep(0.0, 0.3, length(q - vec2(0.2, 0.05))));
      vec3 col = vec3(0.92,0.92,0.95)*mott*(0.03+0.97*lit)*(0.75 + 0.25*z)*2.6;
      float halo = (exp(-r*8.)*0.35 + exp(-r*2.6)*0.07);
      vec3 rgb = mix(vec3(0.55,0.65,0.9), col, disc);
      float a = max(disc, halo) * uA * smoothstep(-0.08,0.1,uDir.y);
      gl_FragColor = vec4(rgb, a);` + TAIL + `}`, moonDir, 0.095, { uSun: { value: sunW } }, false, 1);

  // ---- celestial sphere (real stars) -----------------------------------------
  const celestial = new THREE.Group(); celestial.matrixAutoUpdate = false; group.add(celestial);
  let stars = null, consLines = null, skyLoading = false, lastCel = -1e9;
  const starU = { uT: { value: 0 }, uA: { value: 0 }, uPx: { value: Math.min(renderer.getPixelRatio ? renderer.getPixelRatio() : 1, 2) }, uTw: { value: reducedMotion ? 0 : 1 } };
  const consU = { uA: { value: 0 } };
  const CEL_VS = `
    varying vec3 vDir;
    void celDir(vec3 p){ vDir = normalize(mat3(modelMatrix)*p);
      gl_Position = (projectionMatrix*vec4(mat3(viewMatrix)*vDir*10.0,1.0)).xyww; }`;

  function bvColor(bv, out) {
    const a = [0.55, 0.7, 1.0], b = [1.0, 0.96, 0.88], c = [1.0, 0.62, 0.34];
    const t = Math.max(-0.3, Math.min(1.8, bv));
    let k, x, y;
    if (t < 0.6) { k = (t + 0.3) / 0.9; x = a; y = b; } else { k = (t - 0.6) / 1.2; x = b; y = c; }
    out[0] = x[0] + (y[0] - x[0]) * k; out[1] = x[1] + (y[1] - x[1]) * k; out[2] = x[2] + (y[2] - x[2]) * k;
  }
  function eqVec(raDeg, decDeg, o, i) {
    const a = raDeg * D2R, d = decDeg * D2R, cd = Math.cos(d);
    o[i] = cd * Math.cos(a); o[i + 1] = cd * Math.sin(a); o[i + 2] = Math.sin(d);
  }
  function loadSky() {
    if (skyLoading) return; skyLoading = true;
    fetch(SKY_JSON.href).then((r) => r.json()).then((data) => {
      const S = data.stars, n = S.length;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), br = new Float32Array(n);
      const tmp = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const [ra, dec, mag, bv] = S[i];
        eqVec(ra, dec, pos, i * 3);
        bvColor(Number.isFinite(bv) ? bv : 0.6, tmp);
        col[i * 3] = tmp[0]; col[i * 3 + 1] = tmp[1]; col[i * 3 + 2] = tmp[2];
        const m = Number.isFinite(mag) ? mag : 6;
        size[i] = Math.max(1.0, Math.min(6.5, 1.3 + (6.5 - m) * 0.66));
        // perceptual flux: faint stars stay visible, the brightest (Sirius, Vega,
        // Arcturus...) push past the bloom threshold and glow
        br[i] = Math.max(0.2, Math.min(2.6, 0.28 + 0.16 * (6.5 - m) + 0.06 * Math.pow(Math.max(0, 3.2 - m), 2)));
      }
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aBr', new THREE.BufferAttribute(br, 1));
      const m = track(new THREE.ShaderMaterial({
        uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `
          attribute vec3 aCol; attribute float aSize, aBr; uniform float uT, uPx, uTw;
          varying vec3 vC; varying float vB; ` + CEL_VS + `
          void main(){
            celDir(position);
            float ph = dot(position, vec3(12.9898,78.233,37.719))*43758.5;
            // scintillation grows toward the horizon (more air)
            float alt = max(vDir.y, 0.03);
            float tw = 1.0 - uTw*(0.12 + 0.25*(1.0 - alt))*(0.5+0.5*sin(uT*(1.5+fract(ph)*3.0) + ph));
            // atmospheric extinction: dimmer and redder low down
            float ext = exp(-0.22*(1.0/alt - 1.0));
            vC = aCol * mix(vec3(1.0, 0.72, 0.5), vec3(1.0), ext);
            vB = aBr*tw*ext*smoothstep(-0.04,0.06,vDir.y);
            gl_PointSize = aSize*uPx*(0.9+0.1*tw);
          }`,
        fragmentShader: `
          uniform float uA; varying vec3 vC; varying float vB;
          void main(){
            float r = length(gl_PointCoord-0.5)*2.0;
            float a = smoothstep(1.0,0.0,r); a *= a;
            gl_FragColor = vec4(vC*vB*a*uA*1.6, 1.0);` + TAIL + `}`,
      }));
      stars = new THREE.Points(g, m); stars.frustumCulled = false; stars.renderOrder = -1; stars.visible = false;
      celestial.add(stars);

      // constellations
      const segs = [];
      for (const c of data.constellations || []) for (const line of c.lines || []) {
        for (let k = 0; k + 1 < line.length; k++) segs.push(line[k], line[k + 1]);
      }
      const cp = new Float32Array(segs.length * 3);
      for (let i = 0; i < segs.length; i++) eqVec(segs[i][0], segs[i][1], cp, i * 3);
      const cg = track(new THREE.BufferGeometry());
      cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
      const cm = track(new THREE.ShaderMaterial({
        uniforms: consU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: CEL_VS + `void main(){ celDir(position); }`,
        fragmentShader: `uniform float uA; varying vec3 vDir;
          void main(){ gl_FragColor = vec4(vec3(0.35,0.5,0.85)*0.2*uA*smoothstep(0.0,0.12,vDir.y), 1.0);` + TAIL + `}`,
      }));
      consLines = new THREE.LineSegments(cg, cm); consLines.frustumCulled = false; consLines.renderOrder = -1; consLines.visible = false;
      celestial.add(consLines);
      lastCel = -1e9;
    }).catch(() => { skyLoading = false; });
  }

  // Equatorial -> world rotation for Lisbon at the current instant; moon + sun positions.
  const tmpV = new THREE.Vector3();
  function eclToEq(lon, lat, out) {
    const e = 23.4393 * D2R, cl = Math.cos(lat);
    const x = Math.cos(lon) * cl, y = Math.sin(lon) * cl, z = Math.sin(lat);
    out.set(x, y * Math.cos(e) - z * Math.sin(e), y * Math.sin(e) + z * Math.cos(e));
  }
  function refreshCelestial() {
    const now = Date.now();
    const D = now / 86400000 + 2440587.5 - 2451545.0;
    const gmst = (((280.46061837 + 360.98564736629 * D) % 360) + 360) % 360;
    const th = (gmst + LON) * D2R, ph = LAT * D2R;
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    celestial.matrix.set(
      -st, ct, 0, 0,
      cp * ct, cp * st, sp, 0,
      sp * ct, sp * st, -cp, 0,
      0, 0, 0, 1);
    celestial.matrixWorldNeedsUpdate = true;
    celInv.setFromMatrix4(celestial.matrix).transpose(); // orthonormal: world -> equatorial
    // moon (low-precision series)
    const L = (218.316 + 13.176396 * D) * D2R, M = (134.963 + 13.064993 * D) * D2R, F = (93.272 + 13.22935 * D) * D2R;
    eclToEq(L + 6.289 * D2R * Math.sin(M), 5.128 * D2R * Math.sin(F), tmpV);
    moonDir.copy(tmpV).applyMatrix4(celestial.matrix).normalize();
    // sun
    const g = (357.529 + 0.98560028 * D) * D2R, Ls = (280.459 + 0.98564736 * D + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
    eclToEq(Ls, 0, tmpV);
    sunW.copy(tmpV).applyMatrix4(celestial.matrix).normalize();
    moonFrac = 0.5 * (1 - moonDir.dot(sunW)); // illuminated fraction
    basis(moonDir, moon.uni.uRight.value, moon.uni.uUp.value);
    lastCel = time;
  }
  refreshCelestial();

  // ---- lights (always present: a light count change would recompile everything) ----
  const flashLight = new THREE.HemisphereLight(0xdfe8ff, 0x556677, 0); flashLight.name = 'lightning-fill';
  const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0); moonLight.name = 'moonlight';
  const moonTarget = new THREE.Object3D(); moonLight.target = moonTarget;
  group.add(flashLight, moonLight, moonTarget);

  // ---- materials that react: wet ground, night lamps, the landscape's haze -----------
  // Scanned once, lazily (first storm / night), never per frame.
  let wetList = null, glowList = null, hazeU = [], hazeTries = 0, hazeAt = 0, lastWet = -1, lastGlow = -1;
  const _box = new THREE.Box3(), _size = new THREE.Vector3();
  function scanWet() {
    wetList = [];
    const seen = new Set();
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || !m.isMeshStandardMaterial || seen.has(m) || m.transparent || m.envMap || m.userData.wet === false) continue;
        if (m.metalness > 0.5 || m.roughness < 0.2) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); _box.getSize(_size);
        // ground-like: wide, flat, near the ground (paving, paths, terrain, lawns, steps)
        if (!(m.userData.wet === true || (Math.max(_size.x, _size.z) > 5 && _size.y < 3.5 && _box.max.y < 6))) continue;
        seen.add(m);
        wetList.push({ m, r: m.roughness, c: m.color.clone() });
      }
    });
  }
  function scanGlow() {
    glowList = [];
    const seen = new Set();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || seen.has(m) || m.userData.nightGlow === false || (m.envMap && !m.userData.nightGlow)) continue;
        const tag = typeof m.userData.nightGlow === 'number' ? m.userData.nightGlow : 0;
        if (m.isMeshStandardMaterial && m.emissive) {
          const e = m.emissive, warm = e.r > 0.5 && e.r >= e.b * 1.15;
          if (tag || (warm && m.emissiveIntensity >= 1.5 && !m.transparent)) { seen.add(m); glowList.push({ m, k: tag || 1.6, base: m.emissiveIntensity, basic: false }); }
        } else if (m.isMeshBasicMaterial && m.color && m.visible !== false && !m.map) {
          const c = m.color, lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          // warm lamp lenses / strips / downlights (not screens, not signs)
          if (tag || (lum > 0.6 && c.r >= c.g && c.g >= c.b && c.r - c.b > 0.12 && m.toneMapped !== false && !m.transparent)) {
            seen.add(m); glowList.push({ m, k: tag || 2.2, base: c.clone(), basic: true });
          }
        }
      }
    });
  }
  function findHaze() {
    hazeTries++;
    const found = [];
    scene.traverse((o) => {
      const m = o.material;
      if (!m || Array.isArray(m) || !m.customProgramCacheKey) return;
      let key = '';
      try { key = String(m.customProgramCacheKey()); } catch (e) { return; }
      if (key.indexOf('landscape') !== 0) return;
      const u = (m.userData && m.userData.uHaze) || (renderer.properties && renderer.properties.get(m).uniforms && renderer.properties.get(m).uniforms.uHaze);
      if (u && u.value && found.indexOf(u) < 0) found.push(u);
    });
    if (found.length) hazeU = found;
  }

  // ---- rain ---------------------------------------------------------------------
  const N = low ? 4000 : 12000;
  const BOX = new THREE.Vector3(56, 34, 56);
  const rainGeo = track(new THREE.BufferGeometry());
  {
    const seed = new Float32Array(N * 2 * 4), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
      for (let k = 0; k < 2; k++) { const j = (i * 2 + k); seed[j * 4] = a; seed[j * 4 + 1] = b; seed[j * 4 + 2] = c; seed[j * 4 + 3] = d; end[j] = k; }
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  }
  const rainU = {
    uCam: { value: new THREE.Vector3() }, uShift: { value: new THREE.Vector3() }, uBox: { value: BOX },
    uVel: { value: new THREE.Vector3(2.5, -9, 1.2) }, uAmt: { value: 0 }, uLen: { value: 0.05 },
    uCol: { value: new THREE.Vector3(0.3, 0.34, 0.4) },
    // no rain inside the hall, even seen through its doors or if indoor detection lags
    uHallMin: { value: new THREE.Vector3(1e9, 1e9, 1e9) }, uHallMax: { value: new THREE.Vector3(-1e9, -1e9, -1e9) },
  };
  {
    const h = scene.getObjectByName('hall');
    if (h) {
      const hb = new THREE.Box3().setFromObject(h);
      if (!hb.isEmpty()) { rainU.uHallMin.value.set(hb.min.x + 0.3, hb.min.y - 1, hb.min.z + 0.3); rainU.uHallMax.value.set(hb.max.x - 0.3, hb.max.y, hb.max.z - 0.3); }
    }
  }
  const rainMat = track(new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      attribute vec4 aSeed; attribute float aEnd;
      uniform vec3 uCam, uShift, uBox, uVel, uHallMin, uHallMax; uniform float uAmt, uLen; varying float vA;
      void main(){
        vec3 rel = (fract(aSeed.xyz + uShift) - 0.5) * uBox;
        vec3 w = uCam + rel - uVel * uLen * (0.6 + 0.8*aSeed.w) * aEnd;
        float fade = 1.0 - smoothstep(0.55, 1.0, length(rel.xz)/(uBox.x*0.5));
        fade *= smoothstep(0.0, 1.5, length(rel));
        vA = mix(0.6, 0.04, aEnd) * fade * step(aSeed.w, uAmt);
        if (all(greaterThan(w, uHallMin)) && all(lessThan(w, uHallMax))) vA = 0.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA);` + TAIL + `}`,
  }));
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.renderOrder = 5; rain.visible = false; rain.name = 'rain';
  group.add(rain);
  let rainT = 0;

  // ---- lightning ------------------------------------------------------------------
  // main channel + two branches as one LineSegments; HDR colour so bloom thickens it
  const BOLT_PTS = 18, BR_PTS = 7, SEGS = (BOLT_PTS - 1) + 2 * (BR_PTS - 1);
  const boltGeo = track(new THREE.BufferGeometry());
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGS * 2 * 3), 3));
  const boltMat = track(new THREE.LineBasicMaterial({ color: 0xeaf0ff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true }));
  boltMat.color.setRGB(3.2, 3.4, 4.0);
  const bolt = new THREE.LineSegments(boltGeo, boltMat); bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 6;
  group.add(bolt);
  let nextFlash = 5 + Math.random() * 6, flashT = -1, boltLife = 0, strokes = 3;
  const camPos = new THREE.Vector3();
  const chan = new Float32Array(BOLT_PTS * 3);
  function strike() {
    flashT = 0; strokes = 2 + Math.floor(Math.random() * 3);
    const az = Math.random() * Math.PI * 2;
    // mostly distant rumbles, sometimes close enough to make you jump
    const dist = Math.random() < 0.25 ? 260 + Math.random() * 200 : 550 + Math.random() * 650;
    const cx = camPos.x + Math.cos(az) * dist, cz = camPos.z + Math.sin(az) * dist;
    let x = cx, z = cz;
    for (let i = 0; i < BOLT_PTS; i++) {
      const t = i / (BOLT_PTS - 1);
      chan[i * 3] = x; chan[i * 3 + 1] = 420 * (1 - t); chan[i * 3 + 2] = z;
      x += (Math.random() - 0.5) * 55 * (1 - t * 0.4); z += (Math.random() - 0.5) * 55 * (1 - t * 0.4);
    }
    const a = boltGeo.attributes.position.array;
    let o = 0;
    for (let i = 0; i + 1 < BOLT_PTS; i++) {
      for (let k = 0; k < 3; k++) { a[o + k] = chan[i * 3 + k]; a[o + 3 + k] = chan[(i + 1) * 3 + k]; }
      o += 6;
    }
    for (let b = 0; b < 2; b++) {
      const s = 3 + Math.floor(Math.random() * 6);
      let bx = chan[s * 3], by = chan[s * 3 + 1], bz = chan[s * 3 + 2];
      const dx = (Math.random() - 0.5) * 70, dz = (Math.random() - 0.5) * 70;
      for (let i = 0; i + 1 < BR_PTS; i++) {
        a[o] = bx; a[o + 1] = by; a[o + 2] = bz;
        bx += dx * (0.5 + Math.random()); by -= 18 + Math.random() * 22; bz += dz * (0.5 + Math.random());
        a[o + 3] = bx; a[o + 4] = Math.max(0, by); a[o + 5] = bz; o += 6;
      }
    }
    boltGeo.attributes.position.needsUpdate = true;
    flashDir.set(cx - camPos.x, 160, cz - camPos.z).normalize();
    if (!reducedMotion) { boltLife = 0.32; bolt.visible = true; }
    // sound travels at 343 m/s: the thunder arrives after the flash
    if (ctx.audio && typeof ctx.audio.thunder === 'function') ctx.audio.thunder(dist / 343);
  }
  function flashValue() {
    if (flashT < 0) return 0;
    if (reducedMotion) return 0.12 * Math.exp(-flashT * 2.5);
    // return strokes: 2-4 pulses within ~0.35 s, then the afterglow
    let v = 0;
    for (let i = 0; i < 4; i++) {
      if (i >= strokes) break;
      const t0 = i * 0.042 + (i > 1 ? 0.012 : 0), x = flashT - t0; // all strokes within ~150 ms
      if (x >= 0) v = Math.max(v, Math.exp(-x * 30) * (1 - i * 0.18));
    }
    return flashT > 1.0 ? 0 : v + 0.12 * Math.exp(-flashT * 3);
  }

  // ---- mode switching ---------------------------------------------------------------
  function set(m) {
    if (!modes.includes(m) || m === mode) return;
    mode = m; tgt = T[m]; tgtFog = FOGC[m]; tMode = 0;
    if (m === 'storm' || m === 'rainbow') loadOvercast();
    if ((m === 'storm' || m === 'rainbow' || m === 'night') && !wetList) scanWet();
    if (m === 'storm') nextFlash = 1.5 + Math.random() * 3;
    if (m === 'night') { loadSky(); refreshCelestial(); }
    if (!glowList) scanGlow();
    hazeTries = Math.min(hazeTries, 20); hazeAt = time + 1;
    publish();
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  const sunCol = SUNC.golden.clone();
  let sweepKey = null, sweepT = 0, sweepFrame = 0;
  const sweepFrom = new THREE.Vector3();
  function applyAim() {
    flareDir.copy(lightDir); basis(flareDir, flare.uni.uRight.value, flare.uni.uUp.value);
    antiV.copy(lightDir).negate();
    if (environment && environment.setSunDirection) environment.setSunDirection(lightDir);
  }
  function aimSun(which) { // snap: while the direct sun is dim, at start, on dispose
    sunAim = which; sweepKey = null;
    lightDir.copy(AIM[which]); applyAim();
  }
  const baseBackground = scene.background;
  if (ownSun) scene.background = environment.backgroundNoSun;
  aimSun('gold');
  function update(dt, frame) {
    if (dt > 0.25) dt = 0.25;
    time += dt; tMode += dt;
    const cam = frame && frame.camera;
    if (cam) { const e = cam.matrixWorld.elements; camPos.set(e[12], e[13], e[14]); }
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key in P) {
      let target = tgt[key] === undefined ? P[key] : tgt[key];
      if (key === 'rain' && mode === 'rainbow') target = 0.22 * Math.exp(-tMode / 14);
      if (key === 'wet' && mode === 'rainbow') target = 0.75 * Math.exp(-tMode / 60);
      // the bow comes as the shower thins and the sun breaks through
      if (key === 'bow' && mode === 'rainbow') target = sunAim === 'bow' ? 0.15 + 0.85 * Math.min(1, Math.max(0, (tMode - 2.5) / 5)) : 0;
      if (key === 'cons') target = (mode === 'night' && consOn) ? 1 : 0;
      P[key] = lerp(P[key], target, key === 'wet' ? k * 0.35 : k);
    }
    fogColor.lerp(tgtFog, k);
    if (W) { W.t = Math.min(1, tMode / 3); W.nightK = P.night; W.stormK = mode === 'rainbow' ? 0 : P.over; W.rainK = P.rain; W.bowK = P.bow; W.wetK = P.wet; }

    // sun elevation per mode: snap while the direct sun is dim (one shadow re-render),
    // else sweep it across the sky in 2.5 s (shadow map re-rendered every other frame)
    const sunAbs = baseSun * P.sun;
    const wantAim = WANT[mode] || sunAim;
    if (wantAim !== sunAim) {
      if (sunAbs < 0.6) aimSun(wantAim);
      else {
        if (sweepKey !== wantAim) { sweepKey = wantAim; sweepFrom.copy(lightDir); sweepT = 0; }
        sweepT = Math.min(1, sweepT + dt / 2.5);
        const s = sweepT * sweepT * (3 - 2 * sweepT);
        lightDir.copy(sweepFrom).lerp(AIM[wantAim], s).normalize();
        if (sweepT >= 1) { sunAim = wantAim; sweepKey = null; applyAim(); } else if ((++sweepFrame & 1) === 0) applyAim();
      }
    }

    // flash
    if (mode === 'storm') {
      nextFlash -= dt;
      if (nextFlash <= 0) { strike(); nextFlash = 5 + Math.random() * 10; }
    }
    let f = 0;
    if (flashT >= 0) { flashT += dt; f = flashValue(); if (flashT > 1.2) flashT = -1; }
    if (boltLife > 0) { boltLife -= dt; boltMat.opacity = Math.min(1, boltLife * 10) * (0.55 + 0.45 * Math.random()) * Math.min(1, f * 3 + 0.2); if (boltLife <= 0) bolt.visible = false; }
    if (W) W.flash = f;

    // scene state (outdoor radiance x EXPO; interiors that only see the IBL get the disc back)
    const env = lerp(P.expo, indoorEnv, indoor);
    if (sun) {
      // never toggle visibility: a light-count change recompiles every material
      sun.intensity = baseSun * P.sun * P.expo;
      const ck = SUNC[mode] || SUNC.sunny;
      sunCol.lerp(ck, k); sun.color.copy(sunCol);
    }
    scene.environmentIntensity = baseEnv * P.env * env + f * 0.6 * (1 - indoor);
    scene.backgroundIntensity = baseBg * P.bg * lerp(P.expo, 1, indoor);
    const stormish = P.over > 0.5 && overEnv;
    scene.environment = stormish ? overEnv : sunnyEnvTex;
    if (fog) { fog.color.copy(fogColor).multiplyScalar(lerp(P.expo, 1, P.night)); fog.density = baseFogDens * P.fogK; }
    flashLight.intensity = f * 4.0 * (1 - 0.85 * indoor); // indoors only what the windows let in
    // the landscape's own distance haze follows the fog (linear radiance, paler by day)
    // (re-found after a mode change: an environment swap can recompile it)
    if (time > hazeAt && hazeTries < 24) { hazeAt = time + (hazeU.length ? 6 : 1.5); findHaze(); }
    if (fog) for (let i = 0; i < hazeU.length; i++) hazeU[i].value.set(fog.color.r, fog.color.g, fog.color.b).multiplyScalar(1.06 - 0.06 * P.night);

    // wet ground: darker and glossier (water fills the micro-roughness)
    if (wetList && Math.abs(P.wet - lastWet) > 0.002) {
      lastWet = P.wet;
      const w = P.wet;
      for (let i = 0; i < wetList.length; i++) {
        const e = wetList[i];
        e.m.roughness = e.r * (1 - 0.62 * w) + 0.06 * w;
        e.m.color.copy(e.c).multiplyScalar(1 - 0.32 * w);
      }
    }
    // night lamps come up (a dark-adapted eye; bloom gives them their glow)
    if (glowList && Math.abs(P.glow - lastGlow) > 0.002) {
      lastGlow = P.glow;
      for (let i = 0; i < glowList.length; i++) {
        const e = glowList[i], g = 1 + (e.k - 1) * P.glow;
        if (e.basic) e.m.color.copy(e.base).multiplyScalar(g); else e.m.emissiveIntensity = e.base * g;
      }
    }

    // domes
    const overOn = overTex && P.over > 0.004;
    overDome.visible = !!overOn; overU.uA.value = Math.min(1, P.over * 1.6);
    const breakK = mode === 'rainbow' ? Math.min(1, tMode / 4) : 0;
    overU.uBreak.value = lerp(overU.uBreak.value, breakK, k);
    overU.uI.value = 0.9 * (0.4 + 0.3 * overU.uBreak.value) * lerp(P.expo, 1, indoor); overU.uFlash.value = f;
    nightDome.visible = P.night > 0.004; nightU.uA.value = P.night;
    bowDome.visible = P.bow > 0.004 && lightDir.y < 0.74; bowU.uA.value = P.bow * Math.min(1, P.sun * baseSun / 3) * (1 - 0.6 * P.rain);
    flare.mesh.visible = P.flare > 0.01 && lightDir.y > -0.05; flare.uni.uA.value = 0.55 * P.flare * (1 - P.night) * (mode === 'rainbow' ? overU.uBreak.value : 1); flare.uni.uGold.value = P.gold;
    // night extras
    const nv = P.night > 0.004;
    moon.mesh.visible = nv; moon.uni.uA.value = P.night;
    if (stars) { stars.visible = nv; starU.uA.value = P.night; starU.uT.value = time; }
    if (consLines) { consLines.visible = P.cons > 0.004; consU.uA.value = P.cons * P.night; }
    if (nv && time - lastCel > 30) refreshCelestial();
    const mh = moonDir.y > 0.1;
    // moonlight follows the phase; with the moon down, a faint sky/city glow keeps the campus readable
    moonLight.intensity = P.moonL * (mh ? 0.12 + 0.5 * moonFrac : 0.1);
    if (mh) moonLight.position.copy(moonDir).multiplyScalar(100); else moonLight.position.set(30, 80, 50);

    // rain
    indoor = lerp(indoor, indoorTgt, 1 - Math.exp(-dt * 6));
    const amt = P.rain * (1 - indoor) * (reducedMotion ? 0.6 : 1);
    rain.visible = amt > 0.01;
    if (rain.visible) {
      const sp = reducedMotion ? 0.5 : 1, wind = mode === 'storm' ? 1.4 : 0.6;
      rainU.uVel.value.set(2.8 * wind * sp, -9.5 * sp, 1.2 * wind * sp);
      rainT += dt;
      const v = rainU.uVel.value;
      const fr = (x) => ((x % 1) + 1) % 1;
      rainU.uShift.value.set(fr(v.x * rainT / BOX.x - camPos.x / BOX.x), fr(v.y * rainT / BOX.y - camPos.y / BOX.y), fr(v.z * rainT / BOX.z - camPos.z / BOX.z));
      rainU.uCam.value.copy(camPos);
      rainU.uAmt.value = amt;
      // streaks are refracted sky: about as bright as the ambient, blazing in a flash
      const amb = 0.18 + 0.5 * P.env * (1 - P.over * 0.5);
      rainU.uCol.value.set(0.62, 0.7, 0.82).multiplyScalar(amb + f * 2.5);
    }
  }

  function dispose() {
    scene.remove(group);
    for (const d of disposables) if (d && d.dispose) d.dispose();
    aimSun('base'); scene.background = baseBackground;
    if (sun) { sun.intensity = baseSun; sun.visible = true; sun.color.copy(baseSunColor); }
    scene.environment = sunnyEnvTex; scene.environmentIntensity = baseEnv; scene.backgroundIntensity = baseBg;
    if (fog) { fog.color.copy(baseFogColor); fog.density = baseFogDens; }
    if (wetList) for (const e of wetList) { e.m.roughness = e.r; e.m.color.copy(e.c); }
    if (glowList) for (const e of glowList) { if (e.basic) e.m.color.copy(e.base); else e.m.emissiveIntensity = e.base; }
  }

  return {
    modes,
    get mode() { return mode; },
    set, update, dispose,
    setConstellations(b) { consOn = !!b; },
    setIndoor(b) { indoorTgt = b ? 1 : 0; },
    refreshShadows() { if (environment && environment.refreshShadows) environment.refreshShadows(); },
  };
}
