// The garden fountain: stone basin, two-tier pedestal, animated water (BRIEF §6).
// Built in world coordinates, centred on (46, 0, 29). All water is shader-driven
// (no per-frame allocation): ripples + foam in the basin surface, scrolling
// streak sheets for the overflowing bowls, a rising jet, GPU-ballistic droplets.
export function build(ctx) {
  const { THREE, M, quality, reducedMotion } = ctx;
  const low = quality === 'low';
  const CX = 46, CZ = 29;
  const group = new THREE.Group();
  group.name = 'fountain';
  group.position.set(CX, 0, CZ);

  // ---------- shared uniforms ----------
  const uT = { value: 0 };      // water time
  const uJ = { value: 0 };      // jet / sheet time (frozen when reducedMotion)
  const uScale = { value: 700 };

  // ---------- GLSL helpers ----------
  const NOISE = /* glsl */`
    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
    float vnp(vec2 p, float P){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      float a=h21(vec2(mod(i.x,P),i.y)), b=h21(vec2(mod(i.x+1.,P),i.y));
      float c=h21(vec2(mod(i.x,P),i.y+1.)), d=h21(vec2(mod(i.x+1.,P),i.y+1.));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
  `;

  // ---------- profile lathe with hard/smooth corners, metre UVs ----------
  // pts: [r, y, hard?] ordered so the solid lies on the LEFT of travel.
  function lathe(pts, seg) {
    const n = pts.length;
    const sn = [];
    for (let j = 0; j < n - 1; j++) {
      const dr = pts[j + 1][0] - pts[j][0], dy = pts[j + 1][1] - pts[j][1];
      const l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]);
    }
    const pos = [], nor = [], uv = [], idx = [];
    const cum = [0];
    for (let j = 0; j < n - 1; j++) cum.push(cum[j] + Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]));
    const vn_ = (j, side) => { // normal at point j for segment s (side: segment index)
      const s = side;
      const hard = pts[j][2] || j === 0 || j === n - 1;
      if (hard) return sn[s];
      const a = sn[j - 1], b = sn[j];
      const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    let base = 0;
    for (let s = 0; s < n - 1; s++) {
      for (let k = 0; k < 2; k++) {
        const j = s + k, nn = vn_(j, s);
        for (let i = 0; i <= seg; i++) {
          const th = (i / seg) * Math.PI * 2, c = Math.cos(th), sI = Math.sin(th);
          const r = pts[j][0];
          pos.push(r * c, pts[j][1], r * sI);
          nor.push(nn[0] * c, nn[1], nn[0] * sI);
          uv.push(th * Math.max(r, 0.3), cum[j]);
        }
      }
      for (let i = 0; i < seg; i++) {
        const a = base + i, b = base + i + 1, c2 = base + seg + 1 + i, d = base + seg + 2 + i;
        idx.push(a, c2, b, b, c2, d);
      }
      base += 2 * (seg + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function solid(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  }

  const SEG = low ? 48 : 96;
  const stone = M.get('whiteSandstone');
  const marble = M.get('marble', { tile: 0.9 });

  // ---------- basin: thick moulded coping ring + wall ----------
  const basinPts = [
    [3.44, 0.0, true], [3.42, 0.02, true], [3.42, 0.34, true],       // plinth skirt
    [3.50, 0.37, true], [3.50, 0.44, true], [3.46, 0.485, true],     // overhanging cyma
    [3.42, 0.50, true], [3.30, 0.50, true], [2.98, 0.50, true],      // flat top
    [2.88, 0.495, true], [2.84, 0.46, true], [2.80, 0.445, true],    // inner bevel + bead
    [2.78, 0.43, true], [2.78, 0.0, true],
  ];
  solid(lathe(basinPts, SEG), stone);

  // basin floor (marble, seen through the water)
  const floorGeo = new THREE.CircleGeometry(2.8, SEG);
  floorGeo.rotateX(-Math.PI / 2);
  { const p = floorGeo.attributes.position, u = []; for (let i = 0; i < p.count; i++) u.push(p.getX(i), p.getZ(i));
    floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    floorGeo.setAttribute('uv1', new THREE.Float32BufferAttribute(u, 2)); }
  const floor = new THREE.Mesh(floorGeo, M.get('terrazzo', { color: 0xb9c7c4 }));
  floor.position.y = 0.04; floor.receiveShadow = true; group.add(floor);

  // ---------- pedestal: base + baluster + lower bowl ----------
  const lowerPts = [
    [0.92, 0.04, true], [0.92, 0.22, true], [0.82, 0.235, true], [0.82, 0.30, true], [0.72, 0.315, true], [0.72, 0.34, true],
    [0.56, 0.38], [0.44, 0.50], [0.38, 0.68], [0.43, 0.86], [0.37, 1.00], [0.27, 1.08, true],
    [0.30, 1.10, true], [0.62, 1.15], [1.00, 1.25], [1.36, 1.40], [1.62, 1.55],
    [1.70, 1.60, true], [1.74, 1.625, true], [1.74, 1.64, true], [1.69, 1.65, true], // rim
    [1.62, 1.625, true], [1.56, 1.585], [1.30, 1.49], [0.80, 1.37], [0.30, 1.31], [0.0, 1.30, true],
  ];
  solid(lathe(lowerPts, SEG), marble);
  const upperPts = [
    [0.15, 1.28, true], [0.22, 1.31, true], [0.20, 1.40], [0.12, 1.50], [0.13, 1.68], [0.20, 1.80, true], [0.15, 1.84, true],
    [0.11, 1.92], [0.11, 2.18], [0.18, 2.26, true], [0.28, 2.30, true],
    [0.40, 2.33], [0.64, 2.41], [0.83, 2.52], [0.91, 2.605, true], [0.94, 2.635, true], [0.94, 2.65, true], [0.89, 2.665, true],
    [0.84, 2.64, true], [0.78, 2.605], [0.58, 2.52], [0.30, 2.465], [0.0, 2.455, true],
  ];
  solid(lathe(upperPts, SEG), marble);
  // nozzle boss
  { const nz = lathe([[0.09, 2.455, true], [0.09, 2.60, true], [0.06, 2.63, true], [0.05, 2.62, true], [0.05, 2.60, true]].slice(0, 4), 16);
    solid(nz, M.get('steel')); }

  // ---------- water surfaces ----------
  const waterMatBase = {
    color: 0x2c5a5c, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.8,
    envMapIntensity: 1.6, ior: 1.33, specularIntensity: 1,
  };
  // basin water: ripples radiating from the lower sheet landing ring, drop splashes, foam
  const basinWaterMat = new THREE.MeshPhysicalMaterial({ ...waterMatBase, color: 0x25494a, opacity: 0.86 });
  const uAmp = { value: reducedMotion ? 0.25 : 1 };
  basinWaterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT; sh.uniforms.uAmp = uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp; uniform float uT; uniform float uAmp;
        ${NOISE}
        const float RL = 2.23;
        float hf(vec2 p){
          float r = length(p), d = r - RL;
          float ang = atan(p.y, p.x);
          float mod_ = 0.7 + 0.3*sin(ang*7. + uT*0.7) + 0.15*sin(ang*13. - uT);
          float h = sin(24.*abs(d) - 5.0*uT) * exp(-abs(d)*1.15) * 0.012 * mod_;
          // jet-spray drop ripples
          vec2 q = p*1.7;
          vec2 c0 = floor(q);
          for(int a=0;a<2;a++) for(int b=0;b<2;b++){
            vec2 id = c0 + vec2(q.x - c0.x < 0.5 ? -1. : 0., q.y - c0.y < 0.5 ? -1. : 0.) + vec2(float(a), float(b));
            float sd = h21(id);
            if(sd > 0.4){
              float ph = fract(uT*0.42 + sd*7.);
              vec2 ctr = (id + 0.2 + 0.6*vec2(h21(id+3.1), h21(id+7.7))) / 1.7;
              float dd = length(p-ctr), R = ph*0.5;
              float x = (dd-R)/0.07;
              h += 0.011*(1.-ph)*sin(46.*(dd-R))*exp(-x*x);
            }
          }
          h += (vn(p*6.+vec2(uT*.35,uT*.2)) - .5)*0.004;
          return h;
        }
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 P = vWp.xz; float e = 0.02;
          float h0 = hf(P), hx = hf(P+vec2(e,0.)), hz = hf(P+vec2(0.,e));
          vec2 g = vec2(hx-h0, hz-h0)/e * 3.2 * uAmp;
          vec2 g2 = (vec2(vn(P*14.+uT*vec2(.5,.3)), vn(P*14.+9.+uT*vec2(-.4,.35))) - .5) * 0.07 * uAmp;
          normal = normalize(normal + (viewMatrix * vec4(-(g.x+g2.x), 0., -(g.y+g2.y), 0.)).xyz);
        }
        float rr = length(vWp.xz);
        float fn = vn(vWp.xz*24. + vec2(0., uT*0.5)) * .55 + vn(vWp.xz*55. - uT*.4) * .45;
        float foam = 0.8*exp(-pow((rr-RL)/0.11, 2.)) * smoothstep(0.42, 0.7, fn)
                   + 0.4*exp(-pow((rr-RL-0.35)/0.2, 2.)) * smoothstep(0.55, 0.8, fn)
                   + 0.5*exp(-pow((rr-2.8)/0.05, 2.)) * smoothstep(0.35, 0.8, fn)
                   + 0.7*exp(-pow((rr-0.93)/0.07, 2.)) * smoothstep(0.35, 0.8, fn);
        foam = clamp(foam, 0., 1.);
        diffuseColor.a = mix(diffuseColor.a, 0.97, foam);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92,.96,.97), foam*.75);
      `);
  };
  const bw = new THREE.CircleGeometry(2.86, SEG * 2);
  bw.rotateX(-Math.PI / 2);
  const basinWater = new THREE.Mesh(bw, basinWaterMat);
  basinWater.position.y = 0.42; basinWater.receiveShadow = true; basinWater.renderOrder = 2;
  group.add(basinWater);

  // caustics on the basin floor
  if (!low) {
    const cg = new THREE.CircleGeometry(2.78, 64); cg.rotateX(-Math.PI / 2);
    const cm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vP; uniform float uT; ${NOISE}
        void main(){
          vec2 p = vP*2.2;
          float a = abs(sin((vn(p+uT*.18)*6.283) + vn(p*1.7-uT*.14)*4.))
                  * abs(cos((vn(p*1.3+7.-uT*.16)*6.283) + vn(p*2.1+uT*.1)*4.));
          float c = pow(1.-a, 7.);
          float fade = smoothstep(2.78, 2.2, length(vP)) * smoothstep(0.85,1.1,length(vP));
          gl_FragColor = vec4(vec3(.55,.8,.8)*c*0.55*fade, 1.);
        }`,
    });
    const caus = new THREE.Mesh(cg, cm); caus.position.y = 0.06; caus.renderOrder = 1; group.add(caus);
  }

  // bowl water: glossy disc + foam overlay (centre foam, landing ring)
  function bowlWater(R, y, ringR, centreR) {
    const g = new THREE.CircleGeometry(R, 64); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ ...waterMatBase, color: 0x2f5c60, opacity: 0.9, envMapIntensity: 1.8 }));
    m.position.y = y; m.receiveShadow = true; group.add(m);
    const fm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uJ, uP: { value: new THREE.Vector3(ringR, centreR, R) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vP; uniform float uJ; uniform vec3 uP; ${NOISE}
        void main(){
          float r = length(vP);
          float n = vn(vP*14. + vec2(0., uJ*.8))*.6 + vn(vP*33. - uJ*.7)*.4;
          float ring = uP.x > 0. ? exp(-pow((r-uP.x)/0.09, 2.)) : 0.;
          float cen = exp(-pow(r/max(uP.y,0.01), 2.)*1.6);
          float wave = 0.18*(0.5+0.5*sin(r*44. - uJ*6.)) * exp(-abs(r-uP.x)*3.) * (uP.x>0.?1.:0.);
          float f = clamp(ring*smoothstep(0.3,0.7,n) + cen*smoothstep(0.25,0.65,n) + wave*.6, 0., 1.);
          f *= smoothstep(uP.z, uP.z-0.05, r);
          gl_FragColor = vec4(vec3(.93,.97,.98), f*0.9);
        }`,
    });
    const fo = new THREE.Mesh(g, fm); fo.position.y = y + 0.004; fo.renderOrder = 3; group.add(fo);
  }
  bowlWater(1.545, 1.585, 1.25, 0.0);
  bowlWater(0.80, 2.595, 0.0, 0.34);

  // ---------- falling sheets ----------
  function sheet(r0, y0, dx, drop, nu, nv, P, bandCount, flow) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      const s = j / nv;
      const r = r0 + dx * Math.pow(s, 0.9), y = y0 - drop * s * s;
      for (let i = 0; i <= nu; i++) {
        const th = (i / nu) * Math.PI * 2;
        pos.push(r * Math.cos(th), y, r * Math.sin(th));
        uv.push(i / nu, s);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uJ, uP: { value: new THREE.Vector3(P, bandCount, flow) } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uJ; uniform vec3 uP; ${NOISE}
        #include <common>
        void main(){
          float s = vUv.y, u = vUv.x;
          float P = uP.x;
          float fall = s*s*2.2 + s*.5;           // accelerating flow coordinate
          float n1 = vnp(vec2(u*P, fall*3.2*uP.z - uJ*2.6), P);
          float n2 = vnp(vec2(u*P*2.1+3.7, fall*7.0*uP.z - uJ*4.4), P*2.);
          float streak = n1*.65 + n2*.35;
          // scalloped tongues at the lip
          float scal = 0.5 + 0.5*sin(u*6.2831853*uP.y);
          float thick = mix(0.85, 0.55 + 0.45*scal, smoothstep(0.0, 0.5, s));
          float a = (0.18 + 0.82*smoothstep(0.3, 0.75, streak)) * thick;
          a *= smoothstep(0.0, 0.03, s);
          // sheet frays into drops toward the landing
          float fray = smoothstep(0.55, 1.0, s);
          a *= 1. - fray*smoothstep(0.35, 0.8, n2 + fray*.35);
          a *= smoothstep(1.0, 0.94, s);
          vec3 col = mix(vec3(.72,.86,.92), vec3(1.), streak*streak);
          col += vec3(.1,.12,.12)*(1.-s)*.6;
          // soft view-edge brightening
          gl_FragColor = vec4(col, clamp(a*0.95, 0., .92));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 4; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  const NU = low ? 72 : 144, NV = low ? 14 : 28;
  sheet(1.745, 1.645, 0.50, 1.225, NU, NV, 168, 12, 1.0);   // lower bowl -> basin
  sheet(0.945, 2.655, 0.30, 1.06, low ? 48 : 96, NV, 96, 8, 1.0);  // upper bowl -> lower bowl

  // ---------- central jet ----------
  {
    const JB = 2.60, JH = 2.15, nPts = 28;
    function jetGeo(rs) {
      const pts = [];
      for (let i = 0; i <= nPts; i++) {
        const v = i / nPts;
        const r = rs * (0.052 - 0.022 * v + 0.05 * Math.pow(v, 6) + 0.045 * Math.exp(-v * 40));
        pts.push(new THREE.Vector2(r, JB + JH * v));
      }
      return new THREE.LatheGeometry(pts, low ? 12 : 20);
    }
    const jetMat = (core) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: core ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uJ, uCore: { value: core ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uJ; uniform float uCore; ${NOISE}
        void main(){
          float v = vUv.y, u = vUv.x;
          float n = vnp(vec2(u*7., v*16. - uJ*7.5), 7.)*.6 + vnp(vec2(u*14.+2., v*34. - uJ*11.), 14.)*.4;
          float brk = smoothstep(0.55, 1.0, v);
          float a = 0.5 + 0.5*n;
          a *= 1. - brk*smoothstep(0.3, 0.75, n + brk*.35);
          a *= smoothstep(0., 0.02, v);
          float fr = pow(1. - abs(dot(normalize(vN), vV)), 1.5);
          float k = mix(0.45, 1.0, fr);
          vec3 col = mix(vec3(.78,.9,.96), vec3(1.), n);
          if(uCore > .5) gl_FragColor = vec4(col, a*k*0.85);
          else gl_FragColor = vec4(vec3(.5,.62,.7)*a*(0.25+fr)*0.22, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const core = new THREE.Mesh(jetGeo(1), jetMat(true)); core.renderOrder = 5; core.frustumCulled = false; group.add(core);
    const halo = new THREE.Mesh(jetGeo(1.9), jetMat(false)); halo.renderOrder = 5; halo.frustumCulled = false; group.add(halo);
  }

  // ---------- droplets & mist (GPU ballistic points) ----------
  const emitters = [];
  function points(count, o) {
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uT: o.jet ? uJ : uT, uScale,
        uR: { value: o.r || 0 }, uY0: { value: o.y }, uVh: { value: o.vh }, uVv: { value: o.vv },
        uLife: { value: o.life }, uSize: { value: o.size }, uFloor: { value: o.floor }, uAlpha: { value: o.alpha },
        uG: { value: o.g ?? 9.8 }, uIO: { value: o.io ?? 1 }, uOff: { value: o.off ?? 0 },
      },
      vertexShader: `attribute vec4 aSeed; uniform float uT,uScale,uR,uY0,uVh,uVv,uLife,uSize,uFloor,uAlpha,uG,uIO,uOff;
        varying float vA;
        void main(){
          float ph = fract(uT/uLife + aSeed.x);
          float tt = ph*uLife;
          float a = aSeed.y*6.2831853;
          vec3 o = vec3(cos(a)*uR, uY0, sin(a)*uR);
          o.xz += (aSeed.zw-.5)*uOff;
          float a2 = uR > 0.001 ? a + (aSeed.w > .5 ? 0. : 3.14159)*uIO + (aSeed.z-.5)*.9 : fract(aSeed.w*91.7)*6.2831853;
          float vh = uVh*(0.3+0.7*fract(aSeed.z*53.1));
          float vv = uVv*(0.35+0.65*fract(aSeed.w*13.7));
          vec3 pos = o + vec3(cos(a2),0.,sin(a2))*vh*tt + vec3(0., vv*tt - 0.5*uG*tt*tt, 0.);
          float alive = step(uFloor, pos.y);
          vA = uAlpha*alive*smoothstep(0.,.06,ph)*(1.-smoothstep(.75,1.,ph));
          vec4 mv = modelViewMatrix*vec4(pos,1.);
          gl_Position = projectionMatrix*mv;
          float sz = uSize*(0.6+0.8*fract(aSeed.x*37.3))*uScale/-mv.z;
          gl_PointSize = alive > .5 ? max(sz, 1.5) : 0.;
          if(sz < 1.5) vA *= sz/1.5;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-.5; float d = dot(c,c)*4.; float a = exp(-d*3.)*vA; if(a<.004) discard;
        gl_FragColor = vec4(vec3(.95,.98,1.), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false; p.renderOrder = 6;
    group.add(p);
    emitters.push(p);
    return p;
  }
  const K = low ? 0.4 : 1;
  const N = (n) => Math.max(20, Math.round(n * K));
  // jet-top spray, falling back into the upper bowl
  points(N(420), { jet: true, y: 4.70, vh: 0.55, vv: 1.2, life: 1.5, size: 0.028, floor: 2.6, alpha: 0.9, off: 0.1 });
  points(N(160), { jet: true, y: 4.30, vh: 0.25, vv: 0.4, life: 1.2, size: 0.02, floor: 2.6, alpha: 0.8, off: 0.1 });
  // splashes where sheets land
  points(N(520), { jet: true, r: 2.23, y: 0.425, vh: 0.55, vv: 2.1, life: 0.7, size: 0.024, floor: 0.425, alpha: 0.85, off: 0.1 });
  points(N(260), { jet: true, r: 1.25, y: 1.59, vh: 0.4, vv: 1.5, life: 0.6, size: 0.022, floor: 1.59, alpha: 0.85, off: 0.06 });
  points(N(110), { jet: true, r: 0.22, y: 2.60, vh: 0.5, vv: 1.4, life: 0.6, size: 0.02, floor: 2.6, alpha: 0.85, off: 0.05 });
  // soft mist drifting off the jet crown and the landing ring
  points(N(90), { jet: true, additive: false, y: 4.3, vh: 0.35, vv: 0.35, life: 3.2, size: 0.55, floor: -9, alpha: 0.035, g: -0.05, off: 0.3 });
  points(N(130), { jet: true, additive: false, r: 2.23, y: 0.5, vh: 0.4, vv: 0.45, life: 2.8, size: 0.5, floor: 0.4, alpha: 0.04, g: -0.08, off: 0.2 });

  // ---------- colliders ----------
  const colliders = [{ minX: 42.5, maxX: 49.5, minZ: 25.5, maxZ: 32.5, minY: 0, maxY: 0.5 }];

  // ---------- update ----------
  let t = 0;
  const FROZEN = 3.7;
  return {
    group,
    regions: [],
    colliders,
    pickables: [],
    position: new THREE.Vector3(46, 0.8, 29),
    update(dt, frame) {
      t += dt;
      uT.value = reducedMotion ? 0.8 : t;
      uJ.value = reducedMotion ? FROZEN : t;
      if (frame && frame.camera) {
        uScale.value = ctx.renderer.domElement.height * 0.5 * frame.camera.projectionMatrix.elements[5];
      }
    },
    onPick() {},
  };
}
