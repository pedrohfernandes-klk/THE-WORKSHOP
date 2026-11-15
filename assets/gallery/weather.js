// Weather module: sunny / storm / rainbow / night with ~3 s crossfades.
// Usage: const weather = createWeather(ctx, { environment });
//   weather.set('storm'); each frame: weather.update(dt, { camera, ... });
// Extras: weather.setConstellations(bool), weather.setIndoor(bool) (hides rain),
//   weather.refreshShadows() (sun intensity changes need no shadow refresh).
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const TEX = new URL('../textures/', import.meta.url);
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
const HSV = `
vec3 hsv(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }`;

const BILL_VS = `
uniform vec3 uDir, uRight, uUp; uniform float uSize; varying vec2 vUv;
void main(){
  vUv = position.xy;
  vec3 d = uDir + (uRight*position.x + uUp*position.y)*uSize;
  gl_Position = (projectionMatrix * vec4(mat3(viewMatrix)*d*10.0, 1.0)).xyww;
}`;

export function createWeather(ctx, { environment } = {}) {
  const { THREE, renderer, scene, reducedMotion } = ctx;
  const sun = environment && environment.sun;
  const q = ctx.quality;
  const low = q === 'low' || q === 0 || (typeof q === 'number' && q < 0.6) || (q && q.tier === 'low');
  const modes = ['sunny', 'storm', 'rainbow', 'night'];
  const group = new THREE.Group(); group.name = 'weather';
  scene.add(group);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---- captured base state -------------------------------------------------
  const baseSun = sun ? sun.intensity : 2.6;
  const baseEnv = scene.environmentIntensity ?? 1;
  const baseBg = scene.backgroundIntensity ?? 0.9;
  const sunnyEnvTex = scene.environment;
  const fog = scene.fog;
  const baseFogColor = fog ? fog.color.clone() : new THREE.Color(0xc9d2dd);
  const baseFogDens = fog ? fog.density : 0.0012;
  const sunDir = new THREE.Vector3(-0.5, 0.5, 0.7);
  if (environment && environment.sunDirection) sunDir.copy(environment.sunDirection);
  else if (sun) sunDir.copy(sun.position).sub(sun.target.position);
  sunDir.normalize();

  // ---- parameter blending --------------------------------------------------
  const P = {
    sun: 1, env: 1, bg: 1, fogK: 1, rain: 0, bow: 0, night: 0, over: 0, flare: 1, moonL: 0, cons: 0,
  };
  const fogColor = baseFogColor.clone();
  const FOGC = { sunny: baseFogColor, storm: new THREE.Color(0x3d4856), rainbow: baseFogColor.clone().lerp(new THREE.Color(0xb8c4d0), 0.4), night: new THREE.Color(0x04070d) };
  const T = {
    sunny:   { sun: 1.1, env: 1, bg: 1, fogK: 1, rain: 0, bow: 0, night: 0, over: 0, flare: 1, moonL: 0 },
    storm:   { sun: 0.15 / baseSun, env: 0.35, bg: 0.4, fogK: 2.6, rain: 1, bow: 0, night: 0, over: 1, flare: 0, moonL: 0 },
    rainbow: { sun: 0.85, env: 0.9, bg: 0.85, fogK: 1.1, rain: 0.2, bow: 1, night: 0, over: 0, flare: 0.5, moonL: 0 },
    night:   { sun: 0, env: 0.08, bg: 0, fogK: 1.2, rain: 0, bow: 0, night: 1, over: 0, flare: 0, moonL: 1 },
  };
  let mode = 'sunny', tgt = T.sunny, tgtFog = FOGC.sunny, tMode = 0, time = 0, indoor = 0, indoorTgt = 0;
  let consOn = true;

  // ---- sky domes (drawn at far plane, independent of camera.far) -------------
  const domeGeo = track(new THREE.SphereGeometry(1, 32, 16));
  function dome(frag, uniforms, order, blending) {
    const m = track(new THREE.ShaderMaterial({
      vertexShader: DOME_VS, fragmentShader: frag, uniforms, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: blending || THREE.NormalBlending, fog: false,
    }));
    const mesh = new THREE.Mesh(domeGeo, m);
    mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; mesh.name = 'weather-dome';
    group.add(mesh);
    return mesh;
  }

  // overcast dome (equirect HDR, lazy)
  let overTex = null, overEnv = null, overLoading = false;
  const overU = { uTex: { value: null }, uA: { value: 0 }, uI: { value: 0.35 } };
  const overDome = dome(`
    uniform sampler2D uTex; uniform float uA, uI; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec2 uv = vec2(atan(d.z, d.x)*0.15915494+0.5, asin(clamp(d.y,-1.,1.))*0.31830989+0.5);
      vec3 c = texture2D(uTex, uv).rgb * uI;
      gl_FragColor = vec4(c, uA);` + TAIL + `}`, overU, -4);
  function loadOvercast() {
    if (overLoading) return; overLoading = true;
    new RGBELoader().loadAsync(new URL('sky-overcast.hdr', TEX).href).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      overEnv = pm.fromEquirectangular(hdr).texture; pm.dispose();
      overTex = hdr; overU.uTex.value = hdr; track(hdr); track(overEnv);
    }).catch(() => { overLoading = false; });
  }

  // night dome gradient
  const nightU = { uA: { value: 0 } };
  const nightDome = dome(`
    uniform float uA; varying vec3 vDir;
    void main(){
      float h = clamp(vDir.y, -1., 1.);
      vec3 hor = vec3(0.028,0.05,0.10), top = vec3(0.0015,0.003,0.012);
      vec3 c = mix(hor, top, pow(clamp(h,0.,1.), 0.45));
      c = mix(c, vec3(0.012,0.02,0.04), smoothstep(0.,-0.3,h));
      gl_FragColor = vec4(c, uA);` + TAIL + `}`, nightU, -3);

  // rainbow dome
  const antiV = sunDir.clone().negate();
  const bowU = { uA: { value: 0 }, uAnti: { value: antiV } };
  const bowDome = dome(HSV + `
    uniform float uA; uniform vec3 uAnti; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float th = degrees(acos(clamp(dot(d, uAnti), -1., 1.)));
      float prim = smoothstep(39.6,40.9,th)*(1.-smoothstep(41.9,42.7,th));
      vec3 c1 = hsv(vec3((1.-clamp((th-40.4)/2.0,0.,1.))*0.78, 1., 1.));
      float sec = smoothstep(49.4,50.6,th)*(1.-smoothstep(52.6,54.0,th));
      vec3 c2 = hsv(vec3(clamp((th-50.2)/3.2,0.,1.)*0.78, 0.9, 1.));
      float inner = smoothstep(30.,41.,th)*(1.-smoothstep(41.,42.5,th))*0.05;
      float a1 = prim*0.5, a2 = sec*0.22;
      float dark = smoothstep(42.6,44.5,th)*(1.-smoothstep(48.5,50.,th))*0.12;
      float a = max(a1+a2+inner, dark);
      vec3 rgb = (c1*a1 + c2*a2 + vec3(1.)*inner)/max(a1+a2+inner, 1e-4);
      float f = smoothstep(-0.015,0.03,d.y);
      gl_FragColor = vec4(rgb*1.3, a*uA*f);` + TAIL + `}`, bowU, -2);

  // ---- billboards: sun glow + moon ----------------------------------------
  const quad = track(new THREE.PlaneGeometry(2, 2));
  function basis(dir, r, u) {
    r.crossVectors(dir, new THREE.Vector3(0, 1, 0)); if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
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
  const flare = billboard(`
    uniform float uA; varying vec2 vUv;
    void main(){
      float r = length(vUv);
      float g = 0.55*exp(-r*5.5) + 0.25*exp(-r*1.8) + 0.9*exp(-r*r*500.);
      gl_FragColor = vec4(vec3(1.,.86,.62)*g*uA, 1.);` + TAIL + `}`, sunDir, 0.7, null, true, -1);
  const moonDir = new THREE.Vector3(0.3, 0.6, -0.7).normalize();
  const sunW = sunDir.clone().negate();
  const moon = billboard(`
    uniform float uA; uniform vec3 uDir, uRight, uUp, uSun; varying vec2 vUv;
    void main(){
      float r = length(vUv);
      float disc = 1. - smoothstep(0.235,0.25,r);
      vec2 q = vUv/0.25; float z = sqrt(max(0.,1.-dot(q,q)));
      vec3 n = vec3(q, z);
      vec3 s = vec3(dot(uSun,uRight), dot(uSun,uUp), dot(uSun,-uDir));
      float lit = smoothstep(-0.03,0.1,dot(n,s));
      float mott = 0.88 + 0.12*sin(q.x*7.+1.)*sin(q.y*9.-.5)*sin(q.x*3.+q.y*5.);
      vec3 col = vec3(0.86,0.88,0.93)*mott*(0.04+0.96*lit)*2.2;
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
    const a = [0.6, 0.75, 1.0], b = [1.0, 0.96, 0.88], c = [1.0, 0.68, 0.42];
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
        size[i] = Math.max(1.0, Math.min(5.5, 1.4 + (6.5 - m) * 0.62));
        br[i] = Math.max(0.22, Math.min(1.0, 0.3 + (6.5 - m) * 0.2));
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
            float tw = 1.0 - uTw*0.22*(0.5+0.5*sin(uT*(1.5+fract(ph)*3.0) + ph));
            vC = aCol; vB = aBr*tw*smoothstep(-0.04,0.06,vDir.y);
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
          void main(){ gl_FragColor = vec4(vec3(0.35,0.5,0.85)*0.22*uA*smoothstep(-0.04,0.06,vDir.y), 1.0);` + TAIL + `}`,
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
    // moon (low-precision series)
    const L = (218.316 + 13.176396 * D) * D2R, M = (134.963 + 13.064993 * D) * D2R, F = (93.272 + 13.22935 * D) * D2R;
    eclToEq(L + 6.289 * D2R * Math.sin(M), 5.128 * D2R * Math.sin(F), tmpV);
    moonDir.copy(tmpV).applyMatrix4(celestial.matrix).normalize();
    // sun
    const g = (357.529 + 0.98560028 * D) * D2R, Ls = (280.459 + 0.98564736 * D + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
    eclToEq(Ls, 0, tmpV);
    sunW.copy(tmpV).applyMatrix4(celestial.matrix).normalize();
    basis(moonDir, moon.uni.uRight.value, moon.uni.uUp.value);
    lastCel = time;
  }
  refreshCelestial();

  // ---- lights ----------------------------------------------------------------
  const flashLight = new THREE.HemisphereLight(0xdfe8ff, 0x556677, 0); flashLight.name = 'lightning-fill';
  const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0); moonLight.name = 'moonlight';
  const moonTarget = new THREE.Object3D(); moonLight.target = moonTarget;
  group.add(flashLight, moonLight, moonTarget);

  // ---- rain ---------------------------------------------------------------------
  const N = low ? 4000 : 12000;
  const BOX = new THREE.Vector3(56, 34, 56);
  const rainGeo = track(new THREE.BufferGeometry());
  {
    const seed = new Float32Array(N * 2 * 4), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
      for (let k = 0; k < 2; k++) { const j = (i * 2 + k); seed.set([a, b, c, d], j * 4); end[j] = k; }
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  }
  const rainU = {
    uCam: { value: new THREE.Vector3() }, uShift: { value: new THREE.Vector3() }, uBox: { value: BOX },
    uVel: { value: new THREE.Vector3(2.5, -9, 1.2) }, uAmt: { value: 0 }, uLen: { value: 0.045 },
  };
  const rainMat = track(new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      attribute vec4 aSeed; attribute float aEnd;
      uniform vec3 uCam, uShift, uBox, uVel; uniform float uAmt, uLen; varying float vA;
      void main(){
        vec3 rel = (fract(aSeed.xyz + uShift) - 0.5) * uBox;
        vec3 w = uCam + rel - uVel * uLen * aEnd;
        float fade = 1.0 - smoothstep(0.55, 1.0, length(rel.xz)/(uBox.x*0.5));
        fade *= smoothstep(0.0, 1.5, length(rel));
        vA = mix(0.55, 0.06, aEnd) * fade * step(aSeed.w, uAmt);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.72,0.8,0.92), vA);` + TAIL + `}`,
  }));
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.renderOrder = 5; rain.visible = false; rain.name = 'rain';
  group.add(rain);
  const offT = new THREE.Vector3();
  let rainT = 0;

  // ---- lightning ------------------------------------------------------------------
  const BOLT_PTS = 18;
  const boltGeo = track(new THREE.BufferGeometry());
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_PTS * 3), 3));
  const boltMat = track(new THREE.LineBasicMaterial({ color: 0xeaf0ff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  const bolt = new THREE.Line(boltGeo, boltMat); bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 6;
  group.add(bolt);
  let nextFlash = 5 + Math.random() * 6, flashT = -1, boltLife = 0;
  const camPos = new THREE.Vector3();
  function strike() {
    flashT = 0;
    const az = Math.random() * Math.PI * 2, dist = 500 + Math.random() * 400;
    const cx = camPos.x + Math.cos(az) * dist, cz = camPos.z + Math.sin(az) * dist;
    const a = boltGeo.attributes.position.array;
    let x = cx, z = cz;
    for (let i = 0; i < BOLT_PTS; i++) {
      const t = i / (BOLT_PTS - 1);
      a[i * 3] = x; a[i * 3 + 1] = 380 * (1 - t); a[i * 3 + 2] = z;
      x += (Math.random() - 0.5) * 50 * (1 - t * 0.4); z += (Math.random() - 0.5) * 50 * (1 - t * 0.4);
    }
    boltGeo.attributes.position.needsUpdate = true;
    if (!reducedMotion) { boltLife = 0.15; bolt.visible = true; }
    if (ctx.audio && typeof ctx.audio.thunder === 'function') ctx.audio.thunder((dist / 343) * (0.8 + Math.random() * 0.4));
  }
  function flashValue() {
    if (flashT < 0) return 0;
    if (reducedMotion) return 0.12 * Math.exp(-flashT * 2.5);
    return flashT > 0.7 ? 0 : Math.exp(-flashT * 7) * (0.55 + 0.45 * Math.abs(Math.sin(flashT * 38)));
  }

  // ---- mode switching ---------------------------------------------------------------
  function set(m) {
    if (!modes.includes(m) || m === mode) return;
    mode = m; tgt = T[m]; tgtFog = FOGC[m]; tMode = 0;
    if (m === 'storm') { loadOvercast(); nextFlash = 2 + Math.random() * 4; }
    if (m === 'night') { loadSky(); refreshCelestial(); }
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  function update(dt, frame) {
    if (dt > 0.25) dt = 0.25;
    time += dt; tMode += dt;
    const cam = frame && frame.camera;
    if (cam) { const e = cam.matrixWorld.elements; camPos.set(e[12], e[13], e[14]); }
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key in P) {
      let target = tgt[key] === undefined ? P[key] : tgt[key];
      if (key === 'rain' && mode === 'rainbow') target = 0.22 * Math.exp(-tMode / 14);
      if (key === 'cons') target = (mode === 'night' && consOn) ? 1 : 0;
      P[key] = lerp(P[key], target, k);
    }
    fogColor.lerp(tgtFog, k);

    // flash
    if (mode === 'storm') {
      nextFlash -= dt;
      if (nextFlash <= 0) { strike(); nextFlash = 6 + Math.random() * 9; }
    }
    let f = 0;
    if (flashT >= 0) { flashT += dt; f = flashValue(); if (flashT > 1.2) flashT = -1; }
    if (boltLife > 0) { boltLife -= dt; boltMat.opacity = Math.min(1, boltLife * 12) * (0.6 + 0.4 * Math.random()); if (boltLife <= 0) bolt.visible = false; }

    // scene state
    if (sun) { sun.intensity = baseSun * P.sun; sun.visible = P.sun > 0.002; }
    scene.environmentIntensity = baseEnv * P.env + f * 0.6;
    scene.backgroundIntensity = baseBg * P.bg;
    const stormish = P.over > 0.5 && overEnv;
    scene.environment = stormish ? overEnv : sunnyEnvTex;
    if (fog) { fog.color.copy(fogColor); fog.density = baseFogDens * P.fogK; }
    flashLight.intensity = f * 5.0;

    // domes
    const overOn = overTex && P.over > 0.004;
    overDome.visible = !!overOn; overU.uA.value = Math.min(1, P.over * 1.6); overU.uI.value = 0.9 * (0.4 + f * 4.5);
    nightDome.visible = P.night > 0.004; nightU.uA.value = P.night;
    bowDome.visible = P.bow > 0.004; bowU.uA.value = P.bow;
    flare.mesh.visible = P.flare > 0.01 && sunDir.y > -0.05; flare.uni.uA.value = 0.55 * P.flare * (1 - P.night);
    // night extras
    const nv = P.night > 0.004;
    moon.mesh.visible = nv; moon.uni.uA.value = P.night;
    if (stars) { stars.visible = nv; starU.uA.value = P.night; starU.uT.value = time; }
    if (consLines) { consLines.visible = P.cons > 0.004; consU.uA.value = P.cons * P.night; }
    if (nv && time - lastCel > 30) refreshCelestial();
    const mh = moonDir.y > 0.12;
    moonLight.intensity = P.moonL * (mh ? 0.28 : 0.1);
    if (mh) moonLight.position.copy(moonDir).multiplyScalar(100); else moonLight.position.set(30, 80, 50);

    // rain
    indoor = lerp(indoor, indoorTgt, k);
    const amt = P.rain * (1 - indoor) * (reducedMotion ? 0.6 : 1);
    rain.visible = amt > 0.01;
    if (rain.visible) {
      const sp = reducedMotion ? 0.5 : 1, wind = mode === 'storm' ? 1.4 : 0.6;
      rainU.uVel.value.set(2.8 * wind * sp, -9 * sp, 1.2 * wind * sp);
      rainT += dt;
      const v = rainU.uVel.value;
      const fr = (x) => ((x % 1) + 1) % 1;
      rainU.uShift.value.set(fr(v.x * rainT / BOX.x - camPos.x / BOX.x), fr(v.y * rainT / BOX.y - camPos.y / BOX.y), fr(v.z * rainT / BOX.z - camPos.z / BOX.z));
      rainU.uCam.value.copy(camPos);
      rainU.uAmt.value = amt;
    }
  }

  function dispose() {
    scene.remove(group);
    for (const d of disposables) if (d && d.dispose) d.dispose();
    if (sun) { sun.intensity = baseSun; sun.visible = true; }
    scene.environment = sunnyEnvTex; scene.environmentIntensity = baseEnv; scene.backgroundIntensity = baseBg;
    if (fog) { fog.color.copy(baseFogColor); fog.density = baseFogDens; }
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
