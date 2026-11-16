import {createActorStream} from '../npc-stream.js';
import {idleSlice,afterFirstMove} from '../startup-idle.js';
// NPCs: six silly animal-headed people in suits who wander small loops around the
// campus, face the visitor when close, and talk (speech bubble + synthesised noise)
// when picked. Procedural low-poly-but-smooth models; no per-frame allocation.


async function buildReady(ctx) {
  const { createStatueAudio, createStatueDirector }=await import('../statue-director.js');
  const { reserveModuleVoice, finishModuleVoice }=await import('../audio-lease.js');
  const { createNpcComedy }=await import('../npc-comedy.js');
  const { createNpcPersonalities }=await import('../npc-onlookers.js');
  const { createFabinhe }=await import('../fabinhe.js');
  const { buildCharacter, createLinePicker, createNpcEffects, mergeNpcProps }=await import('../npc-models.js');
  await afterFirstMove(ctx.startup);await idleSlice();
  const { THREE, quality } = ctx;
  const {createReadableBubbles}=await import('../readable-bubbles.js');
  const readableBubbles=createReadableBubbles(THREE,{renderer:ctx.renderer,userData:ctx.scene.userData});
  const sourceAudio=ctx.audio;
  const statueAudio=createStatueAudio(ctx);ctx.scene.userData.statueAudio=statueAudio;
  let npcSpeechActive=false,npcSpeechPaused=false,statuesHeld=false,npcTime=0;
  const npcFrame={camera:null,time:0,level:0,weather:null};
  ctx={...ctx,audio:statueAudio.audio};
  let statueDirector=null;

  const castById = new Map();
  const chooseLine = createLinePicker();
  const lineKeys = { ouch: 'slap1', ouch2: 'slap2', ouch3: 'slap3', ha: 'bystander_laugh', sit: 'sit_beside', rude: 'gesture_rude', run: 'run_past' };
  const reduced = !!ctx.reducedMotion;
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'npcs';
  const SEG = low ? 12 : 20;
  const TAU = Math.PI * 2;

  // ---------- font for the bubbles ----------
  let fontReady = false;
  const onFont = [];
  try {
    if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
      const ff = new FontFace('Instrument Sans', `url(${new URL('../../fonts/instrument-sans-variable.woff2', import.meta.url)})`, { weight: '400 700' });
      ff.load().then((f) => { document.fonts.add(f); fontReady = true; onFont.forEach((fn) => fn()); }).catch(() => {});
    }
  } catch (e) { /* fall back to sans-serif */ }

  // ---------- materials ----------
  const matCache = {};
  const std = (color, rough = 0.8, metal = 0, extra) => {
    const key = color + '|' + rough + '|' + metal;
    if (!extra && matCache[key]) return matCache[key];
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {}));
    if (!extra) matCache[key] = m;
    return m;
  };
  const canvasTex = (draw, rx, ry) => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const pinstripe = canvasTex((g) => {
    g.fillStyle = '#1d2230'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8c96ad'; for (let i = 0; i < 128; i += 16) g.fillRect(i, 0, 2, 128);
  }, 4, 2);
  const tweedTex = canvasTex((g) => {
    g.fillStyle = '#7a5c3a'; g.fillRect(0, 0, 128, 128);
    let s = 7; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const cols = ['#9b7a4f', '#4e3a22', '#b59a6e', '#5f6b4a'];
    for (let i = 0; i < 900; i++) { g.fillStyle = cols[(r() * 4) | 0]; g.fillRect(r() * 128, r() * 128, 2, 2); }
  }, 3, 2);
  const suitPin = std(0xffffff, 0.7, 0, { map: pinstripe });
  const suitTweed = std(0xffffff, 0.95, 0, { map: tweedTex });
  const eyeWhite = std(0xfdfdf8, 0.15);
  const eyeBlack = std(0x07070a, 0.08, 0.1);
  const shoeMat = std(0x16110d, 0.3, 0.1);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const sph = (r) => new THREE.SphereGeometry(r, SEG, Math.max(8, SEG - 6));
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, SEG);
  const eye = (p, x, y, z, r, iris) => {
    add(p, sph(r), eyeWhite, x, y, z);
    const s = Math.sign(x) || 1;
    const i = add(p, sph(r * 0.62), iris ? std(iris, 0.2) : eyeBlack, x + s * r * 0.12, y, z + r * 0.55);
    add(i, sph(r * 0.32), eyeBlack, 0, 0, r * 0.3);
    add(i, sph(r * 0.12), std(0xffffff, 0.05), -s * r * 0.15, r * 0.2, r * 0.42);
  };

  // ---------- head builders (head local origin = centre of skull; face +z) ----------
  const heads = {
    bull(h, fur) {
      const f = std(fur, 0.85);
      const skull = add(h, sph(0.2), f); skull.scale.set(1, 1.05, 1.05);
      const snout = add(h, cap(0.12, 0.1), std(0xd9b3a2, 0.6), 0, -0.07, 0.19); snout.rotation.x = Math.PI / 2; snout.scale.set(1.2, 1, 0.9);
      add(h, sph(0.03), eyeBlack, -0.06, -0.06, 0.34); add(h, sph(0.03), eyeBlack, 0.06, -0.06, 0.34);
      const ring = add(h, new THREE.TorusGeometry(0.045, 0.01, 8, SEG), std(0xd9c26a, 0.25, 0.9), 0, -0.14, 0.33); ring.rotation.x = 0.2;
      eye(h, -0.09, 0.05, 0.16, 0.04); eye(h, 0.09, 0.05, 0.16, 0.04);
      const brow = add(h, new THREE.BoxGeometry(0.34, 0.025, 0.05), f, 0, 0.1, 0.18); brow.rotation.x = 0.2;
      for (const s of [-1, 1]) {
        const horn = add(h, new THREE.ConeGeometry(0.045, 0.3, 12), std(0xf2ead2, 0.4), s * 0.22, 0.16, 0.02);
        horn.rotation.z = -s * 1.15; horn.rotation.x = -0.15;
        const ear = add(h, sph(0.06), f, s * 0.2, 0.06, -0.04); ear.scale.set(1.4, 0.6, 0.8);
      }
    },
    goat(h, fur) {
      const f = std(fur, 0.9);
      const skull = add(h, sph(0.17), f); skull.scale.set(0.95, 1.1, 1.05);
      const snout = add(h, cap(0.085, 0.12), f, 0, -0.07, 0.15); snout.rotation.x = Math.PI / 2;
      add(h, sph(0.025), eyeBlack, 0, -0.07, 0.3);
      add(h, new THREE.ConeGeometry(0.05, 0.2, 10), std(0xe9e2d0, 0.95), 0, -0.2, 0.1).rotation.x = Math.PI * 0.85;
      const slit = std(0xe8c13a, 0.2);
      for (const s of [-1, 1]) {
        add(h, sph(0.04), eyeWhite, s * 0.1, 0.04, 0.12).scale.z = 0.8;
        const iris = add(h, sph(0.028), slit, s * 0.115, 0.04, 0.145); iris.scale.set(1, 1, 0.6);
        const pu = add(h, sph(0.02), eyeBlack, s * 0.12, 0.04, 0.158); pu.scale.set(0.35, 1.1, 0.5);
        const horn = add(h, new THREE.ConeGeometry(0.035, 0.32, 10), std(0xd8cdb0, 0.5), s * 0.07, 0.2, -0.03);
        horn.rotation.x = -0.7; horn.rotation.z = -s * 0.2;
        const ear = add(h, sph(0.06), f, s * 0.19, 0.06, -0.02); ear.scale.set(1.8, 0.35, 0.8); ear.rotation.z = -s * 0.3;
      }
    },
    pigeon(h, fur) {
      const f = std(fur, 0.8);
      const skull = add(h, sph(0.14), f); skull.scale.set(0.9, 1, 1.1);
      const beak = add(h, new THREE.ConeGeometry(0.035, 0.14, 10), std(0xe8dfd0, 0.5), 0, -0.02, 0.2); beak.rotation.x = Math.PI / 2;
      add(h, sph(0.03), std(0xf7f3ea, 0.6), 0, 0.015, 0.145);
      eye(h, -0.085, 0.03, 0.07, 0.04, 0xe8731a); eye(h, 0.085, 0.03, 0.07, 0.04, 0xe8731a);
      const col = add(h, new THREE.TorusGeometry(0.15, 0.04, 10, SEG), std(0x3f8f7a, 0.25, 0.4, { emissive: 0x2a1450, emissiveIntensity: 0.25 }), 0, -0.15, 0);
      col.rotation.x = Math.PI / 2; col.scale.set(1, 1, 1.2);
    },
    horse(h, fur) {
      const f = std(fur, 0.55);
      const skull = add(h, sph(0.15), f); skull.scale.set(0.95, 1.1, 1.1);
      const muzzle = add(h, cap(0.095, 0.3), f, 0, -0.14, 0.2); muzzle.rotation.x = Math.PI / 2 - 0.55; muzzle.scale.set(1, 1, 1.1);
      for (const s of [-1, 1]) {
        add(h, sph(0.018), eyeBlack, s * 0.04, -0.27, 0.37);
        eye(h, s * 0.12, 0.05, 0.07, 0.035);
        const ear = add(h, new THREE.ConeGeometry(0.04, 0.16, 8), f, s * 0.07, 0.2, -0.04); ear.rotation.z = -s * 0.15;
      }
      const mane = add(h, cap(0.035, 0.3), std(0x1b1410, 0.5), 0, 0.02, -0.15); mane.scale.set(1.2, 1, 1.4);
      const fore = add(h, cap(0.03, 0.08), std(0x1b1410, 0.5), 0, 0.17, 0.08); fore.rotation.x = 0.5;
    },
    cat(h, fur) {
      const f = std(fur, 0.9);
      const skull = add(h, sph(0.18), f); skull.scale.set(1.1, 0.95, 1);
      add(h, sph(0.025), std(0xf29aa6, 0.5), 0, -0.03, 0.18);
      for (const s of [-1, 1]) {
        eye(h, s * 0.075, 0.03, 0.14, 0.04, 0x7fd13a);
        const ear = add(h, new THREE.ConeGeometry(0.075, 0.15, 4), f, s * 0.11, 0.17, 0); ear.rotation.z = -s * 0.3;
        add(ear, new THREE.ConeGeometry(0.045, 0.1, 4), std(0xe6a0a0, 0.8), 0, -0.01, 0.03);
        for (let k = 0; k < 3; k++) {
          const w = add(h, new THREE.CylinderGeometry(0.003, 0.003, 0.2, 4), std(0xf4f0e8, 0.6), s * 0.17, -0.06 - k * 0.02, 0.15);
          w.rotation.z = Math.PI / 2; w.rotation.y = s * (0.3 + k * 0.15);
        }
      }
    },
    pig(h, fur) {
      const f = std(fur, 0.6);
      const skull = add(h, sph(0.2), f); skull.scale.set(1.05, 1, 1);
      const snout = add(h, new THREE.CylinderGeometry(0.085, 0.09, 0.09, SEG), std(0xe89a9f, 0.45), 0, -0.04, 0.2); snout.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        add(h, sph(0.015), eyeBlack, s * 0.03, -0.04, 0.25).scale.set(0.8, 1.6, 0.4);
        eye(h, s * 0.1, 0.07, 0.16, 0.038);
        const ear = add(h, new THREE.ConeGeometry(0.08, 0.13, 3), f, s * 0.14, 0.17, 0.02); ear.rotation.z = -s * 0.5; ear.rotation.x = 0.7;
      }
    },
  };

  const plaid = canvasTex((g) => {
    g.fillStyle = '#b3261e'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(15,15,15,0.55)'; for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 14, 128); g.fillRect(0, i, 128, 14); }
    g.fillStyle = 'rgba(240,240,240,0.35)'; for (let i = 20; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
  }, 3, 2);
  const suitPlaid = std(0xffffff, 0.9, 0, { map: plaid });
  const wood = std(0x8a6a44, 0.8), metalDark = std(0x222226, 0.5, 0.6);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 10);
  const hatOf = (h) => { const H = new THREE.Group(); h.add(H); h.userData.hat = H; return H; };

  Object.assign(heads, {
    walrus(h, fur) {
      const f = std(fur, 0.8);
      add(h, sph(0.22), f).scale.set(1.1, 1, 1.05);
      for (const s of [-1, 1]) {
        add(h, sph(0.1), std(0xa8826b, 0.8), s * 0.07, -0.08, 0.17);
        eye(h, s * 0.1, 0.07, 0.19, 0.028);
        const tusk = add(h, new THREE.ConeGeometry(0.03, 0.22, 10), std(0xf4eedc, 0.4), s * 0.07, -0.22, 0.2); tusk.rotation.x = Math.PI;
      }
      add(h, sph(0.04), eyeBlack, 0, -0.01, 0.27);
      const m = add(h, cap(0.035, 0.22), std(0x5a4030, 0.95), 0, -0.07, 0.26); m.rotation.z = Math.PI / 2; m.scale.set(1, 1, 1.3);
      const visor = add(hatOf(h), box(0.28, 0.02, 0.14), std(0xffffff, 0.6), 0, 0.17, 0.2); visor.rotation.x = -0.1;
    },
    rooster(h, fur) {
      const f = std(fur, 0.65);
      add(h, sph(0.12), f).scale.set(0.9, 1, 1.05);
      const gold = std(0xe9a23a, 0.4);
      for (const s of [-1, 1]) eye(h, s * 0.085, 0.03, 0.08, 0.035, 0xe8731a);
      const b1 = add(h, new THREE.ConeGeometry(0.04, 0.12, 10), gold, 0, -0.01, 0.17); b1.rotation.x = Math.PI / 2;
      const red = std(0xd01c28, 0.5);
      for (let k = 0; k < 4; k++) add(h, sph(0.035 - k * 0.003), red, 0, 0.13 + (k === 1 || k === 2 ? 0.02 : 0), 0.06 - k * 0.04);
      add(h, cap(0.02, 0.06), red, 0, -0.11, 0.13);
      const col = add(h, new THREE.TorusGeometry(0.12, 0.035, 8, SEG), gold, 0, -0.14, 0); col.rotation.x = Math.PI / 2;
    },
    tortoise(h, fur) {
      const f = std(fur, 0.9);
      add(h, sph(0.15), f).scale.set(1, 0.9, 1.15);
      const bk = add(h, new THREE.ConeGeometry(0.04, 0.09, 8), std(0x5f6e38, 0.8), 0, -0.04, 0.2); bk.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        eye(h, s * 0.075, 0.035, 0.12, 0.035);
        add(h, sph(0.042), f, s * 0.075, 0.05, 0.125).scale.y = 0.6;
        const br = add(h, box(0.07, 0.025, 0.03), std(0xf0f0f0, 0.95), s * 0.075, 0.1, 0.14); br.rotation.z = -s * 0.35;
      }
      const HT = hatOf(h);
      add(HT, cyl(0.17, 0.05), std(0x6b7078, 0.9), 0, 0.15, 0);
      add(HT, box(0.2, 0.02, 0.1), std(0x6b7078, 0.9), 0, 0.14, 0.17);
      for (let k = 0; k < 2; k++) { const r = add(h, new THREE.TorusGeometry(0.1, 0.012, 6, 14), f, 0, -0.13 - k * 0.03, 0); r.rotation.x = Math.PI / 2; }
    },
    raccoon(h, fur) {
      const f = std(fur, 0.9), dark = std(0x1a1a1c, 0.8);
      add(h, sph(0.17), f).scale.set(1.05, 0.95, 1);
      add(h, sph(0.085), std(0xeeeeee, 0.8), 0, -0.06, 0.13).scale.set(1, 0.8, 1);
      add(h, sph(0.03), eyeBlack, 0, -0.04, 0.215);
      for (const s of [-1, 1]) {
        add(h, sph(0.06), dark, s * 0.07, 0.035, 0.13).scale.set(1.2, 0.8, 0.6);
        eye(h, s * 0.065, 0.04, 0.15, 0.028);
        add(h, sph(0.06), f, s * 0.12, 0.14, -0.02).scale.set(1, 1, 0.5);
      }
      const HR = hatOf(h);
      add(HR, sph(0.18), std(0xc9231a, 0.7), 0, 0.1, -0.01).scale.set(1, 0.6, 1);
      add(HR, box(0.12, 0.07, 0.012), std(0xf2f2f2, 0.7), 0, 0.12, 0.175);
      add(HR, box(0.22, 0.015, 0.12), std(0xc9231a, 0.7), 0, 0.09, 0.2).rotation.x = -0.1;
    },
    velho(h, fur) {
      const skin = std(fur, 0.65), white = std(0xf2f2f0, 0.95);
      add(h, sph(0.17), skin).scale.set(0.95, 1.1, 1);
      add(h, sph(0.045), std(0xd99a82, 0.6), 0, -0.02, 0.17).scale.set(1, 1.3, 1.1);
      for (const s of [-1, 1]) {
        eye(h, s * 0.06, 0.04, 0.14, 0.028);
        const br = add(h, box(0.08, 0.025, 0.025), white, s * 0.06, 0.085, 0.15); br.rotation.z = -s * 0.25;
        add(h, sph(0.035), skin, s * 0.165, 0, -0.01).scale.set(0.5, 1.1, 0.8);
        add(h, sph(0.05), white, s * 0.15, 0.03, -0.04);
        const mu = add(h, cap(0.014, 0.08), white, s * 0.04, -0.075, 0.165); mu.rotation.z = Math.PI / 2 + s * 0.25;
      }
    },
    mano(h, fur) {
      const skin = std(fur, 0.6), dark = std(0x1a120d, 0.7);
      add(h, sph(0.17), skin).scale.set(0.95, 1.08, 1);
      add(h, sph(0.036), std(0xd99a82, 0.6), 0, -0.02, 0.17);
      add(h, sph(0.17), dark, 0, 0.04, -0.06).scale.set(0.98, 0.9, 0.9);
      for (const s of [-1, 1]) {
        eye(h, s * 0.065, 0.045, 0.14, 0.033);
        add(h, box(0.07, 0.016, 0.015), dark, s * 0.065, 0.09, 0.155).rotation.z = s * 0.2;
        add(h, sph(0.035), skin, s * 0.165, 0, -0.01).scale.set(0.5, 1, 0.8);
        const mu = add(h, cap(0.03, 0.1), dark, s * 0.06, -0.07, 0.17); mu.rotation.z = Math.PI / 2 + s * 0.45; mu.scale.z = 1.3;
        add(h, sph(0.032), dark, s * 0.135, -0.055, 0.16);
      }
      add(h, cap(0.028, 0.08), dark, 0, -0.065, 0.185).rotation.z = Math.PI / 2;
      const HC = hatOf(h), cc = std(0x1d3f8f, 0.8);
      add(HC, sph(0.18), cc, 0, 0.1, 0).scale.set(1, 0.6, 1.02);
      add(HC, box(0.2, 0.015, 0.1), cc, 0, 0.09, -0.19).rotation.x = 0.1;
    },
    chubby(h, fur) {
      const skin = std(fur, 0.6), dark = std(0x16100c, 0.6);
      add(h, sph(0.2), skin).scale.set(1.1, 1, 1.05);
      add(h, sph(0.12), skin, 0, -0.14, 0.06);
      add(h, sph(0.042), std(0xe08a7a, 0.55), 0, -0.02, 0.2);
      for (const s of [-1, 1]) {
        eye(h, s * 0.075, 0.05, 0.16, 0.028);
        add(h, sph(0.06), std(0xf08a88, 0.6), s * 0.13, -0.05, 0.14).scale.z = 0.6;
        add(h, sph(0.035), skin, s * 0.2, 0, -0.01).scale.set(0.5, 1, 0.8);
        const mu = add(h, cap(0.02, 0.07), dark, s * 0.045, -0.085, 0.2); mu.rotation.z = Math.PI / 2 + s * 0.2;
      }
      const HB = hatOf(h);
      const be = add(HB, sph(0.22), std(0x1d2a4a, 0.95), 0.02, 0.17, 0); be.scale.set(1.15, 0.32, 1.1); be.rotation.z = 0.15;
      add(HB, cyl(0.012, 0.05), dark, 0.02, 0.25, 0);
    },
    forcado(h, fur) {
      const skin = std(fur, 0.6), dark = std(0x16100c, 0.6);
      add(h, sph(0.17), skin).scale.set(0.95, 1.1, 1);
      add(h, sph(0.03), skin, 0, -0.02, 0.17).scale.set(1, 1.2, 1);
      add(h, sph(0.175), dark, 0, 0.03, -0.045).scale.set(0.97, 1, 0.95);
      for (const s of [-1, 1]) {
        eye(h, s * 0.065, 0.04, 0.14, 0.032);
        const br = add(h, box(0.07, 0.014, 0.015), dark, s * 0.065, 0.085, 0.15); br.rotation.z = -s * 0.2;
        add(h, sph(0.035), skin, s * 0.165, 0, -0.01).scale.set(0.5, 1, 0.8);
        const mu = add(h, cap(0.009, 0.075), dark, s * 0.04, -0.075, 0.165); mu.rotation.z = Math.PI / 2 + s * 0.35;
        add(h, sph(0.011), dark, s * 0.088, -0.062, 0.16);
      }
      add(h, box(0.05, 0.01, 0.01), std(0x8a2a2a, 0.5), 0, -0.115, 0.15);
      const HF = hatOf(h);
      add(HF, cyl(0.16, 0.08), std(0x1e7a3a, 0.8), 0, 0.14, -0.005);
      const piv = new THREE.Group(); piv.position.set(0, 0.17, 0); piv.rotation.z = -1.05; HF.add(piv);
      add(piv, new THREE.ConeGeometry(0.15, 0.5, SEG), std(0xc01818, 0.8), 0, 0.22, 0);
      add(piv, sph(0.035), std(0x1e7a3a, 0.8), 0, 0.48, 0);
    },
  });

  // ---------- character spec ----------
  const SPECS = [
    { name: 'bull', head: 'bull', fur: 0x5b3a2a, suit: suitPin, sleeve: suitPin, pants: suitPin, shirt: 0xf2f2ee, tie: 0xb3202a, shoe: 0x111111,
      home: [6.8, 37.4], r: 1.6, speed: 0.8, top: 2.12, sound: 'moo',
      lines: ["I'm not angry. This is just my face.", 'I have a meeting. It is with a different bull.', 'Do not wave anything red. Anything.', 'I was told there would be a china shop. Where is it.', 'This suit is pinstriped. Their suit is also pinstriped. Awkward.', 'I charge by the hour. Mostly I stand.', 'Nobody warns you how hard it is to button a jacket over this much neck.', 'Quarterly grass projections look strong.'] },
    { name: 'goat', head: 'goat', fur: 0xe4dccb, suit: suitTweed, sleeve: suitTweed, pants: std(0x4a4033, 0.95), shirt: 0xcbd7b0, tie: 0, shoe: 0x2a2018,
      home: [40, 29], r: 2.6, speed: 0.9, top: 2.05, sound: 'bleat',
      lines: ['Have you tried eating the carpet? Asking for me.', 'This tweed is forty percent sofa.', 'I will eat that. Not now. But I will.', 'Bleh. That was my whole opinion.', 'I climbed up here for no reason. Great reason.', 'Please do not check my pockets for cans. There is one can.', 'I am extremely professional. Maaa.', 'Fence? What fence?'] },
    { name: 'pigeon', head: 'pigeon', fur: 0x8c93a1, suit: std(0x1f8a8f, 0.55), sleeve: std(0x1f8a8f, 0.55), pants: std(0x1f8a8f, 0.55), shirt: 0xffffff, tie: 0, shoe: 0xf4f4f4, stripe: 0xffffff,
      home: [-6, 44.5], r: 1.6, speed: 1.0, top: 1.95, bob: true, sound: 'coo',
      lines: ['I have walked into this glass four times. Five.', 'Do you have any bread? Or a job?', 'Coo is a complete sentence.', 'The tracksuit is for speed. I never use it.', 'I saw a statue. We are not friends.', 'Do not look at my neck. It is just shiny.', "I live here now. Don't tell the hall.", 'Bob. Bob bob. That is the whole presentation.'] },
    { name: 'horse', head: 'horse', fur: 0x8a5a36, suit: std(0x0b0b10, 0.35), sleeve: std(0x0b0b10, 0.35), pants: std(0x0b0b10, 0.35), shirt: 0xffffff, tie: 0x0b0b10, bow: true, shoe: 0x050505, satin: true,
      home: [-3, 2], r: 0.7, speed: 0.6, top: 2.2, sound: 'neigh',
      lines: ['Neigh. Excuse me. I mean: good evening.', 'I am dressed for a gala that ended in 2019.', 'Why the long face? Because I have one.', 'This bow tie is load-bearing.', 'I cannot sit down in this. Nobody has ever asked.', 'Is this hay? No. Ah. Art.', 'I was in a race. I am still in it. Do not talk to me.', 'Four legs, two trouser legs. Do the maths.'] },
    { name: 'cat', head: 'cat', fur: 0xd98a3d, suit: std(0x15151a, 0.9), sleeve: std(0x15151a, 0.9), pants: std(0x2a2a30, 0.85), shirt: 0x15151a, tie: 0, turtle: true, shoe: 0x0c0c0c,
      home: [3, -8], r: 0.8, speed: 0.55, top: 2.1, sound: 'meow',
      lines: ['I am going to knock something over. Not yet.', 'The turtleneck is a lifestyle.', 'I was asleep. I am still asleep. Hello.', 'Everything on this table was mine first.', 'No, you pet me. Wait. Not like that.', 'I stared at that wall for an hour. It blinked first.', 'Sorry, I only respond to the sound of a can.', 'Meow, but intellectually.'] },
    { name: 'pig', head: 'pig', fur: 0xf0a8ac, suit: std(0x2b3a4a, 0.8), sleeve: std(0x2b3a4a, 0.8), pants: std(0x2b3a4a, 0.8), shirt: 0xf2f2ee, tie: 0, vest: true, shoe: 0x3a2a14,
      home: [8, 54.4], r: 1.5, speed: 0.85, top: 2.0, sound: 'oink',
      lines: ['Safety first. Snack second. Snack first, actually.', 'My vest makes me invisible to danger. Only danger.', 'I am inspecting the ground. It is fine. Tastes fine.', 'Mind the puddle. I made it. It is lovely.', 'Hi-vis means I am very important and very visible.', 'Is it lunch? It is always lunch.', 'Oink is just hello, in a hurry.', 'I have a hard hat at home. For emotional safety.'] },
    { name: 'walrus', head: 'walrus', fur: 0x8d6b57, suit: std(0xf4a0b5, 0.8), sleeve: std(0xf4a0b5, 0.8), pants: std(0xa6d96a, 0.9), shirt: 0xffffff, tie: 0, polo: true, shoe: 0xf0f0f0,
      home: [-15, 30], r: 2.4, speed: 0.7, top: 2.25, sound: 'walrus',
      lines: ["Back in my day we didn't have weather. We had nature, and it knew its place.", "I don't trust this skyline. Too many opinions.", 'They want to put art in a museum now? Indoctrination.', "I've been boycotting the sun since 1987. It still comes out.", 'Golf is not a sport. It is a position. On a lawn. Of authority.', 'Why is the pool reflecting? Who authorised that?', "I'm not saying I'm right. I'm saying I'm loud.", 'Everything was better when it was slightly worse.'] },
    { name: 'rooster', head: 'rooster', fur: 0xb5471f, suit: std(0x1a2a52, 0.7), sleeve: std(0x1a2a52, 0.7), pants: std(0xcfc3a0, 0.8), shirt: 0xf4f1e6, tie: 0xb3202a, pin: true, shoe: 0x3a2a1a,
      home: [15, 28], r: 2.2, speed: 0.95, top: 1.95, sound: 'crow',
      lines: ['I have never used an alarm clock. I am the alarm.', 'This pin? A rooster. Very exclusive. Only roosters.', 'Kids today cannot even crow. No project.', 'I demand to speak to the sunrise\'s manager.', 'Common sense is whatever I said last.', 'I refuse to follow trends. I lead them. Backwards.', 'Cock-a-doodle-DON\'T. I am busy.', 'This coop is run by amateurs. I would run it. Loudly.'] },
    { name: 'tortoise', head: 'tortoise', fur: 0x7d8f4e, suit: std(0xb08a3e, 0.95), sleeve: std(0xb08a3e, 0.95), pants: std(0x5a4a3a, 0.9), shirt: 0xe8e0c8, tie: 0x6b3a2a, shoe: 0x3a2a1a,
      home: [0, 39.55], r: 0, speed: 0, top: 1.85, sound: 'grunt', seated: true, fixed: true, yaw: Math.PI,
      props(g) {
        const b = new THREE.Group(); b.position.set(0, 0, 39.6); g.add(b);
        add(b, box(1.6, 0.06, 0.46), wood, 0, 0.44, 0); add(b, box(1.6, 0.4, 0.05), wood, 0, 0.72, 0.23);
        for (const x of [-0.7, 0.7]) { add(b, box(0.06, 0.44, 0.4), metalDark, x, 0.22, 0); add(b, box(0.06, 0.4, 0.06), metalDark, x, 0.62, 0.23); }
      },
      extra(body) { const sh = add(body, sph(0.3), std(0x6b5a2c, 0.6), 0, 1.15, -0.27); sh.scale.set(0.95, 1.05, 0.75); },
      lines: ['Comboios a voar? Isso não vai dar em nada.', 'Museus que se penduram sozinhos… no meu tempo os quadros sabiam estar quietos.', 'Ó da guarda! Um elevador de vidro!', 'Isto antigamente era tudo mato.', 'Esse espelho de água vai secar. Escrevam o que eu digo.', 'Cinema em cima de um museu? Vai tudo abaixo.', 'Telemóveis? No meu tempo tínhamos uma pedra e chegava.', 'Vai acabar mal. Já acabou mal. Vai acabar pior.', 'Se fosse no meu tempo é que era bom! Pá, esta gente se fosse…', 'Se fosse no meu tempo é que era bom! Pá, esta gente se fosse… pronto.'], pt: true },
    { name: 'raccoon', head: 'raccoon', fur: 0x8a8a8f, suit: suitPlaid, sleeve: suitPlaid, pants: std(0x3b5a8c, 0.9), shirt: 0xe8e8e8, tie: 0, shoe: 0x4a3520,
      home: [34, 38.3], r: 0, speed: 0, top: 1.85, sound: 'chitter', seated: true, fixed: true, yaw: -Math.PI / 2,
      props(g) {
        const c = new THREE.Group(); c.position.set(34.1, 0, 38.3); g.add(c);
        const fab = std(0x2f7fb8, 0.9);
        add(c, box(0.6, 0.05, 0.58), fab, 0, 0.42, 0);
        const bk = add(c, box(0.05, 0.5, 0.58), fab, 0.3, 0.66, 0); bk.rotation.z = 0.25;
        for (const x of [-0.26, 0.26]) for (const z of [-0.26, 0.26]) add(c, cyl(0.015, 0.42), metalDark, x, 0.21, z);
        const bq = new THREE.Group(); bq.position.set(34, 0, 39.7); g.add(bq);
        add(bq, sph(0.3), std(0x151517, 0.45, 0.3), 0, 0.85, 0).scale.set(1, 0.8, 1);
        add(bq, sph(0.06), metalDark, 0, 1.12, 0);
        for (let k = 0; k < 3; k++) { const a = k * 2.09; add(bq, cyl(0.015, 0.65), metalDark, Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2); }
      },
      extra(body) { for (let k = 0; k < 6; k++) { const t = add(body, cyl(0.075, 0.1), k & 1 ? std(0x151517, 0.9) : std(0xcfcfd2, 0.9), 0, 0.85 - k * 0.04, -0.3 - k * 0.1); t.rotation.x = Math.PI / 2 - 0.2; } },
      lines: ["I don't need a map. I got instincts and a cousin.", "This here fountain's been runnin' all day. Somebody pays for that!", "That barbecue ain't cold. It's... resting.", "I ain't lost. The road is.", 'Back in my day a bin was just a bin. Now it is a lifestyle.', 'I only buy things that are on sale and already mine.', 'Never trust a lawn that is too even.', 'This chair has seen things.'] },
    { name: 'forcado', head: 'forcado', fur: 0xeab596, suit: std(0x7a2430, 0.85), sleeve: std(0x7a2430, 0.85), pants: std(0xe0cfa0, 0.8), shirt: 0xffffff, tie: 0, sash: true, stock: true, shoe: 0x1a1208,
      home: [3, 21], r: 0, speed: 0, top: 2.05, sound: 'tut', fixed: true, proud: true, yaw: 0,
      lines: ['Tá bueno!', 'Tá bueno?', 'Tá bueno, tá bueno…'] },
    { name: 'velho', head: 'velho', fur: 0xe2ae90, suit: std(0x6e6a64, 0.95), sleeve: std(0x6e6a64, 0.95), pants: std(0x3d3a36, 0.9), shirt: 0xf0eadb, tie: 0, shoe: 0x2a2018, pt: true,
      home: [-21, 35.6], r: 1.4, speed: 0.5, top: 2.05, sound: 'grunt',
      lines: ['Tá bonito, tá!', 'Tá bonito, tá…', 'Tá bonito! Tá, tá.', 'Tá bonito, tá?', 'Tá bonito, tá!!', 'Hm. Tá bonito, tá.', 'Tá bonito, tá! Tá lindo.', 'Tá bonito, tá… tá.'] },
    { name: 'gordo', head: 'chubby', fur: 0xe8a98a, suit: std(0xf4f0e6, 0.8), sleeve: std(0xf4f0e6, 0.8), pants: std(0x4a4036, 0.9), shirt: 0xf4f0e6, tie: 0, braces: true, fat: 1.35, shoe: 0x2a1d12, pt: true,
      home: [20, 35.4], r: 1.8, speed: 0.55, top: 2.1, sound: 'walrus',
      lines: ['Isso é que era bom! Queriam era tudo metido num…', 'Isso é que era bom! Queriam era tudo metido…', 'Isso é que era bom! Queriam era…', 'Isso é que era bom! Queriam era tudo metido num… pá, deixa lá.', 'Isso é que era bom! Queriam era tudo num…', 'Isso é que era bom! Queriam…', 'Isso é que era bom! Queriam era tudo metido num… hm.', 'Isso é que era bom!…'] },
    { name: 'mano', head: 'mano', fur: 0xdea383, suit: std(0x3a3f4c, 0.95), sleeve: std(0x3a3f4c, 0.95), pants: std(0x1c2230, 0.9), shirt: 0x3a3f4c, tie: 0, phone: true, hoodie: true, shoe: 0xf2f2f2,
      home: [7.6, 41], r: 1.1, speed: 0.8, top: 2.05, sound: 'tut', ind: ['Ó mano! Tenho MB Way!'],
      lines: ['Tenho MB Way, tenho MB Way!', 'Faço-te MB Way já, mano.', 'Divide-se a conta? Tenho MB Way.', 'Aceitas MB Way? Tenho MB Way.', 'Tenho MB Way, mano! Tenho!', 'Não tens dinheiro? Tenho MB Way.', 'MB Way. Já foi. Tenho MB Way.', 'Mano. Tenho MB Way.'] },
  ];

  // ---------- speech bubble ----------
  const BW = 256, BH = 128;
  function rrect(g, x, y, w, h, r) {
    if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function drawBubble(n,text){n.talkT=Math.max(n.talkT,readableBubbles.setText(n,text));}

  const starsTex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.scale(0.125, 0.125);
    g.fillStyle = '#ffd42a'; g.strokeStyle = '#a66a00'; g.lineWidth = 5;
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094 - 1.57, cx = 128 + Math.cos(a) * 80, cy = 128 + Math.sin(a) * 80;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i & 1 ? 14 : 32, an = i * Math.PI / 5 - Math.PI / 2; g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
      g.closePath(); g.fill(); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;   // chunky pixel stars
    return t;
  })();

  // ---------- casting ----------
  const PESTERERS = { mano: 1, gordo: 1, walrus: 1, rooster: 1, bull: 1 };
  const ONLY = { forcado: 1 };                                             // says his one line, and nothing else, ever
  const OLD = { tortoise: 1, walrus: 1, velho: 1, gordo: 1, raccoon: 1 };   // the fist-shakers
  const LAUGHER = { pigeon: 1, goat: 1, pig: 1 };                          // laugh at anything; sometimes fall over doing it
  const BARK = { velho: 330, mano: 560 };                                  // these two bark now and then (Hz). Never explained.
  // The campus the wanderers respect: doorways (x, z, r) and building footprints (x0, x1, z0, z1).
  const DOORS = [0, 18.4, 2.4, -11, 44, 2.6, 11, 44, 2.6, 0, 52.6, 2.2];
  const BOXES = [-7, 7, -17.4, 17.4, -23.3, -10.7, 37.7, 50.3, 10.7, 23.3, 37.7, 50.3, -22.3, 22.3, 56, 72.3];
  // 0 campus, 1 hall, 2 studio, 3 arcade, 4 school rooms, 9 upstairs: nobody reacts through walls.
  function zoneAt(x, z, level) {
    if (level > 0) return 9;
    if (x > -6.6 && x < 6.6 && z > -17.1 && z < 17.1) return 1;
    if (z > 38 && z < 50 && x > -23 && x < -11) return 2;
    if (z > 38 && z < 50 && x > 11 && x < 23) return 3;
    if (z > 56.3 && z < 72 && x > -22 && x < 22) return 4;
    return 0;
  }
  const noop = () => {};
  // Cartoon proportions (overall size, leg length, head size): cabeçudos, beanpoles, tiny, enormous.
  const SHAPE = {
    bull: [1.22, 0.9, 1.05], goat: [1, 1.38, 0.8], pigeon: [0.66, 0.8, 1.5], horse: [1.04, 1.45, 1.2], cat: [0.95, 0.62, 1.55],
    pig: [0.95, 0.6, 1.45], walrus: [1.18, 0.8, 1.2], rooster: [1, 1.35, 0.74], tortoise: [1, 1, 1.3], raccoon: [1, 1, 1.35],
    forcado: [0.95, 0.68, 1.6], velho: [1, 1.3, 1.32], gordo: [1, 0.76, 1.28], mano: [0.86, 0.9, 1.42],
  };
  const starMat = new THREE.SpriteMaterial({ map: starsTex, transparent: true, depthWrite: false });
  // Walkers get a soft blob instead of a cast shadow: the sun's map is baked once
  // (shadowMap.autoUpdate is false), so a real one would stay behind as a ghost.
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  })();

  // ---------- build the characters ----------
  let personalities = null, comedy = null, fabinhe = null;
  const npcs = ctx.__npcShell.actors;
  const pickables = ctx.__npcShell.pickables;
  // A director may replace slots, never silently add another actor.
  const assignments = ctx.scene?.userData?.npcAssignments;
  const stationIds=['tortoise','raccoon','cat','walrus'];
  const slots=SPECS.map((legacy,index)=>{
    const id=Array.isArray(assignments)&&typeof assignments[index]==='string'?assignments[index]:legacy.name==='rooster'?'fabinhe':legacy.name;
    const berth=stationIds.indexOf(id);
    const home=berth>=0?[83.4+(berth%2)*.45,28.45+Math.floor(berth/2)*1.1]:legacy.home.slice();
    return {id,index,home,legacy,station:berth>=0};
  });
  ctx.__npcShell.slots.push(...slots);
  const colliders=ctx.__npcShell.colliders;
  const readyListeners=ctx.__npcShell.listeners;
  function onActorReady(fn){readyListeners.add(fn);return()=>readyListeners.delete(fn);}
  async function assemble(slot,entry){
    const idx=slot.index,legacy=slot.legacy;
    let S={...legacy,home:slot.home};
    if(entry&&!entry.legacy)S={...S,name:entry.id,head:entry.model.head,lines:entry.lines.talk,pt:true,phone:entry.model.clothing==='influencer',proud:false,fixed:false,seated:false,r:Math.max(.7,legacy.r),speed:.65,props:null,extra:null,...(entry.id==='fabinhe'?{sound:'tut',tie:null,braces:false,hoodie:false,stock:false,fat:1}:{})};
    if(slot.station)S={...S,r:0,speed:0,fixed:true,seated:false,props:null};
    castById.set(S.name,entry);
    const staged=new THREE.Group(),propSource=new THREE.Group();
    const root = new THREE.Group(); root.name = 'npc-' + S.name; root.rotation.order = 'YXZ';
    const shp = castById.get(S.name)?.model?.shape || SHAPE[S.name] || [1, 1, 1];
    const rig = buildCharacter(THREE, ctx.M, { ...S, ...castById.get(S.name)?.model, shape: shp, quality });
    const topH = rig.height;
    root.add(rig.mesh);
    const { body, head, arms, legs } = rig.bones;
    const hat = rig.bones.hat, hatReal = rig.hasHat;
    const stars = new THREE.Sprite(starMat);
    stars.scale.set(0.6, 0.6, 1); stars.visible = false; stars.renderOrder = 9; stars.raycast = noop; staged.add(stars);
    // bubble
    let bctx = null, btex = null, sprite = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = BW; c.height = BH; bctx = c.getContext('2d');
      btex = new THREE.CanvasTexture(c); btex.colorSpace = THREE.SRGBColorSpace;
      btex.magFilter = btex.minFilter = THREE.NearestFilter; btex.generateMipmaps = false;
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0); sprite.scale.set(0.01, 0.005, 1);
      sprite.renderOrder = 10; sprite.visible = false; sprite.raycast = noop; staged.add(sprite);
    }
    // pick hitbox
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.1, 10), hitMat);
    hit.scale.y = Math.max(0.6, topH / 2.1); hit.position.y = topH / 2; hit.userData.action = { type: 'custom', id: 'npc-' + S.name }; root.add(hit);
    hit.material.visible = false; // keep hit.visible for main.pickAt; skip drawing only
    root.userData.action = hit.userData.action;


    // waypoints around home
    const nPts = S.r > 1 ? 4 : 2;
    const pts = [];
    for (let k = 0; k < nPts; k++) {
      const a = (k / nPts) * TAU + idx;
      pts.push(S.home[0] + Math.cos(a) * S.r, S.home[1] + Math.sin(a) * S.r * (nPts === 2 ? 0.6 : 1));
    }
    root.position.set(pts[0], 0, pts[1]); root.scale.setScalar(rig.shape[0]);
    staged.add(root);
    if (S.props) S.props(propSource);
    let blob = null;
    if (!S.fixed) {
      root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      if (!hatReal) hat.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      if (blobMat) { blob = new THREE.Mesh(blobGeo, blobMat); blob.raycast = noop; blob.renderOrder = 1; blob.position.set(pts[0], 0.02, pts[1]); staged.add(blob); }
    }
    const n = {
      S, rig, root, body, head, arms, legs, hit, sprite, bctx, btex, pts, nPts, ti: 1,
      x: pts[0], z: pts[1], yaw: S.yaw !== undefined ? S.yaw : idx * 1.1, yawOff: 0, wait: 1 + idx * 0.7, ph: idx * 2, walk: 0,
      sillyCd: 4 + idx * 2.3, sillyT: -1, sillyDur: 1, sillyType: 0,
      talkT: 0, bubble: 0, near: false, mutterCd: 6, line: -1, seed: idx * 1.7,
      fixed: !!S.fixed, baseY: S.seated ? -0.3 : 0, baseYaw: S.yaw || 0, laughT: 0, laughAt: 0, laughCd: 10 + idx * 3, laughText: '', pointT: 0, pointAt: null,
      pester: !!PESTERERS[S.name], pestT: 0, pestCd: 8 + idx * 2, pestLvl: 0, pestSay: 0, fallType: -1, fallDir: 1, thud: true,
      stars, hat, hatReal, hatState: 0, hatT: 0, hvx: 0, hvy: 0, hvz: 0, hs: 0, slapSpin: false, slapTurns: 1, fat: S.fat || 1,
      goOn: false, gx: 0, gz: 0, gsp: 1, goT: -1, faceN: null, busy: false, gest: 0, kb: 0, reactCd: 0, armUp: 1.7, meant: true, monoCd: 25 + idx * 3, curText: '',
      d2: 1e9, near2: false, zone: zoneAt(S.home[0], S.home[1], 0), barker: !!BARK[S.name], barkCd: 14 + idx, jerk: 0, jerkAt: 0,
      seqStage: 0, seqT: 0, seqRest: '', glare: 0, fist: 0, gestAt: 0, gestKind: '', impT: -1, rofl: false, whistled: false,
      lastFall: -1, lastOf: new Map(), dirty: false, blob, pestSide: 1, bumpCd: 0, pushT: 0, ghostT: 0, col: null,
      talk: S.lines, sz: rig.shape[0], hs: rig.shape[2], bodyY0: rig.bodyY0, headY: rig.headY, bOff: Math.max(0.1, (rig.height - rig.bodyY0 - rig.headY) * rig.shape[0]) + 0.04,
      colW: Math.max(0.2, 0.3 * Math.max(1, S.fat || 1, castById.get(S.name)?.model?.bodyWidth || 1) * rig.shape[0]), colH: rig.height * rig.shape[0],
      shakeT: 0, lookOverT: 0, lookT: 0, brace: 0, sqT: 0, swingT: 0, snubT: 0, snapT: 0, snapDir: 1, freezeT: 0, whistleAt: 0,
      toVis: 0, lastTalk: -99, slaps: 0, lastSlapT: -99, grudge: -99, escalate: false, windT: 0, slapCd: 0, lingerT: 0, pestMode: 0,
      seqKind: 0, shoutCd: 25 + idx, fartCd: 200 + idx * 23, judgeAt: 0, murmurCd: 0, revengeAt: 0, barkFit: 0,
    };
    hit.userData.npc = n; root.userData.npc = n;
    n.slotIndex=idx;n.bairroTime=0;
    if(slot.station){n.baseY=.35;root.position.y=.35;if(blob)blob.position.y=.37;}
    n.col=colliders[idx];
    const own=R[S.name];n.talk=ONLY[S.name]?own.talk:S.lines.concat((own&&own.talk)||[]);
    const propsBatch=mergeNpcProps(THREE,propSource);if(propsBatch)staged.add(propsBatch);
    staged.remove(stars);if(blob)staged.remove(blob);
    await (ctx.yieldBuild?ctx.yieldBuild():idleSlice());
    n.staged=staged;return n;
  }
  const effects=createNpcEffects(THREE,group,npcs,blobGeo,blobMat,starMat);
  onFont.push(()=>{for(const n of npcs)if(n.talkT>0&&n.curText)drawBubble(n,n.curText);});
  const stream=createActorStream(ctx,{slots,assemble,commit(n){
    group.add(n.staged);delete n.staged;npcs.push(n);readableBubbles.register(n);pickables.push(n.hit,n.root);
    personalities.registerActor(n);comedy.registerActor(n);fabinhe.registerActor(n);
    if(n.S.name==='goat')GO=n;if(n.S.name==='pigeon')PG=n;if(n.S.name==='horse')HO=n;if(n.S.name==='cat')CA=n;if(n.S.name==='pig')PI=n;
    for(const listener of readyListeners){try{listener(n);}catch(error){console.error('NPC actor-ready listener',error);}}
  }});
  personalities = createNpcPersonalities(ctx, { npcs, castById, chooseLine, say });
  comedy = createNpcComedy(ctx, { npcs, say, startLaugh, fall: dominoFall });
  function dominoFall(n) {
    if(n.fixed||n.S.seated||n.sillyT>=0||n.busy)return;
    n.fallType=reduced?3:nextFall(n);n.fallDir=1;n.thud=false;n.whistled=false;n.whistleAt=0;n.impT=-1;n.rofl=false;
    n.freezeT=0;n.slapSpin=false;n.slapTurns=1;n.sqT=.3;n.sillyCd=9;
    startSilly(n,4,FALL_D[n.fallType]);
  }
  comedy.loadManifest(); // background: never delays the Enter button
  for(let i=0;i<npcs.length;i++)npcs[i].bairroTime=0;
  fabinhe = createFabinhe(ctx, { npcs, say });
  statueDirector=createStatueDirector(ctx,{actors:npcs,say:(n,text)=>comedy.thaw(n,text)});

  // ---------- sound ----------
  // Web Audio is read lazily from ctx.audio (null until the visitor enters) and
  // everything goes into its bus, so mute and the limiter apply. Voices fade with distance.
  let ac = null, bus = null, vol = 1, slapBuf = null, whiteBuf = null;
  function audioOn(n) {
    if(ctx.scene.userData.bairroEffects?.silenceUntil>performance.now()/1000)return false;
    if (ctx.scene.userData.questQuiet) return false;
    const A = ctx.audio;
    if (!A) return false;
    let c = null, b = null;
    try { if (A.muted) return false; c = A.context || null; b = A.bus || null; } catch (e) { return false; }
    if (!c || !b || c.state !== 'running') return false;
    if (c !== ac) { ac = c; slapBuf = whiteBuf = null; }
    bus = b; vol = 1;
    if (n) { const d = Math.sqrt(n.d2); if (d > 5) vol = 1 - (d - 5) / 25; }
    return vol > 0.04;
  }
  function buffers() {
    if (slapBuf) return;
    const sr = ac.sampleRate, len = (sr * 0.1) | 0, wl = (sr * 0.5) | 0;
    const sb = ac.createBuffer(1, len, sr), wb = ac.createBuffer(1, wl, sr);
    const d = sb.getChannelData(0), w = wb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    for (let i = 0; i < wl; i++) w[i] = Math.random() * 2 - 1;
    slapBuf = sb; whiteBuf = wb;
  }
  const lvl = (g) => Math.max(0.0002, g * vol);
  function tone(t0, type, dur, freqs, gain, lp, vibHz, vibDepth) {
    const lease = reserveModuleVoice(ctx, 2, true, dur + .06, bus, t0); if (!lease) return; t0 = Math.max(t0, lease.startAt);
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 2;
    const step = dur / (freqs.length - 1);
    o.frequency.setValueAtTime(freqs[0], t0);
    for (let i = 1; i < freqs.length; i++) o.frequency.linearRampToValueAtTime(freqs[i], t0 + i * step);
    if (vibHz) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = vibHz; lg.gain.value = vibDepth; l.connect(lg); lg.connect(o.frequency);
      lease.track(l); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(lvl(gain), t0 + Math.min(0.04, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(lease.gain);
    lease.track(o); finishModuleVoice(lease, o); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hiss(t0, dur, ftype, freq, q, gain, attack) {
    const lease = reserveModuleVoice(ctx, 2, true, dur + .06, bus, t0); if (!lease) return; t0 = Math.max(t0, lease.startAt);
    buffers();
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = whiteBuf; s.loop = true; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(lvl(gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(lease.gain); lease.track(s); finishModuleVoice(lease, s); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  // A crisp cartoon whack: a crack, a pitched "thwack" and the meat of it.
  function whack(n, big) {
    if (!audioOn(n)) return;
    try {
      const lease = reserveModuleVoice(ctx, 3, true, .2, bus); if (!lease) return;
      buffers();
      const t = Math.max(ac.currentTime + 0.005, lease.startAt), src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = slapBuf; f.type = 'bandpass'; f.frequency.value = 2300 + Math.random() * 700; f.Q.value = 0.8; g.gain.value = 1.1 * vol;
      src.connect(f); f.connect(g); g.connect(lease.gain); lease.track(src); finishModuleVoice(lease, src); src.start(t);
      tone(t, 'triangle', 0.09, [1300 + Math.random() * 300, 320], 0.32, 4000);
      tone(t, 'sine', 0.16, [230, 60], 0.45, 500);
      if (big) tone(t + 0.02, 'square', 0.07, [760, 380], 0.08, 2600);
    } catch (e) { /* audio unavailable */ }
  }
  function sfx(n, kind, dur) {
    if (!audioOn(n)) return;
    try {
      const t = ac.currentTime + 0.02;
      switch (kind) {
        case 'thud': tone(t, 'sine', 0.22, [120, 40], 0.5, 300); hiss(t, 0.12, 'lowpass', 600, 1, 0.25, 0.005); break;
        case 'boing': tone(t, 'sine', 0.45, [160, 340, 230], 0.16, 1600, 15, 60); break;
        case 'whistle': tone(t, 'sine', dur, [1600, 1250, 700, 320], 0.07, 5000, 5, 10); break;
        case 'whistleUp': tone(t, 'sine', dur, [380, 900, 1700], 0.06, 5000, 6, 12); break;
        case 'whirr': tone(t, 'triangle', dur, [300, 700, 950, 600], 0.06, 2400, 18, 40); break;
        case 'skid': hiss(t, 0.5, 'bandpass', 1400, 3, 0.18, 0.03); tone(t, 'sawtooth', 0.4, [180, 120], 0.05, 700); break;
        case 'bip': tone(t, 'sine', 0.22, [1000, 1000], 0.16, 6000); break;
        case 'burp': tone(t, 'sawtooth', 0.5, [96, 80, 70, 86, 64], 0.26, 420, 23, 14); hiss(t, 0.4, 'lowpass', 300, 1, 0.12, 0.05); break;
        case 'fart': tone(t, 'square', 0.6, [82, 70, 96, 60, 76], 0.15, 360, 31, 26); hiss(t, 0.55, 'lowpass', 260, 1, 0.14, 0.03); break;
        case 'tsk': for (let k = 0; k < 2 + ((Math.random() * 2) | 0); k++) hiss(t + k * 0.17, 0.03, 'highpass', 2800, 1, 0.22, 0.002); break;
        case 'sigh': hiss(t, 1.3, 'bandpass', 850, 1.5, 0.12, 0.35); tone(t + 0.1, 'sine', 1.1, [230, 200, 150], 0.03, 600); break;
        case 'aiai': for (let k = 0; k < 3; k++) tone(t + k * 0.28, 'triangle', 0.22, [330 - k * 20, 280 - k * 25], 0.1, 1400, 6, 8); break;
        default: break;
      }
    } catch (e) { /* audio unavailable */ }
  }
  function noise(n) {
    if (!audioOn(n)) return;
    try {
      const t = ac.currentTime + 0.02;
      switch (n.S.sound) {
        case 'moo': tone(t, 'sawtooth', 1.0, [150, 120, 100, 85], 0.22, 650, 5, 6); break;
        case 'bleat': tone(t, 'sawtooth', 0.7, [420, 400, 360], 0.16, 1800, 32, 60); break;
        case 'coo': tone(t, 'sine', 0.22, [260, 380, 300], 0.25, 1200); tone(t + 0.3, 'sine', 0.22, [260, 400, 300], 0.22, 1200); tone(t + 0.6, 'sine', 0.35, [280, 420, 260], 0.2, 1200); break;
        case 'neigh': tone(t, 'sawtooth', 1.1, [480, 900, 800, 520, 300], 0.14, 2200, 22, 40); break;
        case 'meow': tone(t, 'triangle', 0.7, [450, 850, 900, 600], 0.22, 2400, 6, 20); break;
        case 'grunt': tone(t, 'sawtooth', 0.5, [110, 80, 70], 0.2, 500, 7, 8); break;
        case 'walrus': tone(t, 'sawtooth', 0.6, [130, 90, 150, 80], 0.22, 700, 14, 10); break;
        case 'crow': tone(t, 'sawtooth', 0.9, [500, 900, 700, 1100, 600], 0.12, 2600, 12, 30); break;
        case 'chitter': for (let k = 0; k < 4; k++) tone(t + k * 0.09, 'square', 0.07, [900, 1300], 0.05, 2600); break;
        case 'tut': tone(t, 'triangle', 0.28, [200, 270, 210], 0.2, 1000); break;
        default: tone(t, 'square', 0.14, [230, 140], 0.1, 900); tone(t + 0.2, 'square', 0.18, [250, 120], 0.1, 900); break;
      }
    } catch (e) { /* audio unavailable */ }
  }
  // "Béu! béu!": two short barks, each a falling saw through a closing resonant filter (é → u).
  function barkSound(n, gap) {
    if (!audioOn(n)) return;
    try {
      const base = BARK[n.S.name] || 420 + (n.seed * 97) % 200;
      let t = ac.currentTime + 0.02;
      for (let k = 0; k < 2; k++) {
        const lease = reserveModuleVoice(ctx, 2, true, .22, bus, t); if (!lease) continue; t = Math.max(t, lease.startAt);
        const f0 = base * (0.9 + Math.random() * 0.2) * (k ? 0.93 : 1);
        const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 1.35, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + 0.13);
        lp.type = 'lowpass'; lp.Q.value = 6;
        lp.frequency.setValueAtTime(2700, t); lp.frequency.exponentialRampToValueAtTime(650, t + 0.15);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl(0.3), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        o.connect(lp); lp.connect(g); g.connect(lease.gain); lease.track(o); finishModuleVoice(lease, o); o.start(t); o.stop(t + 0.2);
        hiss(t, 0.05, 'bandpass', 1300, 1.2, 0.16, 0.004);
        t += gap;
      }
    } catch (e) { /* audio unavailable */ }
  }
  // Laugh voices, one per character: wave, Hz, syllables, gap s, syllable s, pitch drift
  // per syllable, lowpass, vibrato Hz, vibrato depth, gain, tail (1 snort, 2 wheeze, 3 squeak, 4 long last "HOOO").
  const LV = {
    bull: ['sawtooth', 115, 4, 0.21, 0.15, 0.96, 700, 7, 6, 0.17, 1],
    goat: ['sawtooth', 430, 7, 0.095, 0.08, 0.985, 2000, 30, 55, 0.11, 0],
    pigeon: ['sine', 330, 5, 0.17, 0.13, 0.97, 1300, 0, 0, 0.2, 0],
    horse: ['sawtooth', 720, 6, 0.1, 0.09, 0.93, 2400, 22, 40, 0.1, 0],
    cat: ['triangle', 520, 2, 0.4, 0.12, 0.9, 1800, 0, 0, 0.14, 0],
    pig: ['square', 190, 4, 0.19, 0.12, 0.97, 900, 0, 0, 0.1, 1],
    walrus: ['sawtooth', 140, 3, 0.32, 0.24, 0.92, 750, 14, 10, 0.17, 2],
    rooster: ['sawtooth', 640, 8, 0.075, 0.06, 0.965, 2600, 12, 30, 0.1, 0],
    tortoise: ['sawtooth', 200, 3, 0.5, 0.2, 0.95, 800, 5, 4, 0.15, 2],
    raccoon: ['square', 1150, 10, 0.055, 0.04, 0.99, 3000, 0, 0, 0.05, 0],
    forcado: ['triangle', 260, 3, 0.24, 0.14, 1.05, 1100, 0, 0, 0.18, 0],
    velho: ['sawtooth', 235, 5, 0.14, 0.1, 0.92, 1200, 9, 12, 0.13, 2],
    gordo: ['sawtooth', 120, 4, 0.27, 0.2, 0.97, 650, 6, 6, 0.19, 4],
    mano: ['square', 390, 6, 0.09, 0.07, 0.99, 1700, 0, 0, 0.07, 3],
  };
  let laughWin = -9, laughN = 0, clock = 0;
  // hyst: the hysterical version — higher, faster, more syllables, wobbling pitch.
  function laughSound(n, hyst) {
    const L = LV[n.S.name];
    if (!L) return;
    if (clock - laughWin > 1.5) { laughWin = clock; laughN = 0; }
    if (laughN >= (hyst ? 4 : 2) || !audioOn(n)) return;
    laughN++;
    try {
      const cnt = L[2] + (hyst ? 2 + ((Math.random() * 3) | 0) : 0), up = hyst ? 1.12 + Math.random() * 0.2 : 1;
      const vib = hyst ? Math.max(9, L[7]) * 1.4 : L[7], vd = hyst ? Math.max(18, L[8]) * 2 : L[8];
      let f = L[1] * up * (0.95 + Math.random() * 0.1), tt = ac.currentTime + 0.02;
      for (let k = 0; k < cnt; k++) {
        const d = L[4] * (k === cnt - 1 && L[10] === 4 ? 3 : 1) * (hyst ? 0.85 : 1);
        tone(tt, L[0], d, [f * 0.85, f * (hyst ? 1.3 : 1.15), f * 0.8], L[9], L[6], vib, vd);
        tt += L[3] * (hyst ? 0.75 : 1) * (0.85 + Math.random() * 0.3); f *= hyst ? L[5] * (0.97 + Math.random() * 0.08) : L[5];
      }
      const tail = hyst && L[10] === 0 ? 1 + ((Math.random() * 3) | 0) : L[10];
      if (tail === 1) hiss(tt, 0.14, 'lowpass', 420, 3, 0.4, 0.01);
      else if (tail === 2) hiss(tt + 0.05, 0.5, 'bandpass', 2600, 2.5, 0.07, 0.3);
      else if (tail === 3) tone(tt, 'sine', 0.14, [1700, 2400], 0.07, 4000);
    } catch (e) { /* audio unavailable */ }
  }

  // ---------- what they say ----------
  // Every character: 12+ lines of their own, plus lines for the moment (the visitor running
  // past, jumping, sitting nearby, the weather, being ignored or talked to again, cheeky
  // gestures, slaps once or again and again). Missing keys fall back to their language.
  const LEVOU_NPC = ['Já levaste na boca!', 'Já levaste na boca, já!', 'Ahah, já levaste na boca!', 'AHAHAHAHA!', 'AHAHAH! Já levaste na boca!', 'LMFAO! Mas é o #%&@, ainda levas nessa fuça, irmão!', 'Eh, calma, Zé!', 'Eh pá, calma, Zé!', 'Olha que lhe arrebentas a tromba, bro! Para lá com isso, #%&@!'];
  const LEVOU_F = ['Já levaste na boca!', 'Já levaste na boca, já!', 'Ahah, já levaste na boca!'];
  const LEVOU_VIS = ['Levas na boca, porko!', 'Levaste na boca, boneco!', 'Levaste na boca, ó boneco!', 'Toma lá, boneco!', 'AHAHAHAHA!', 'AHAHAH! Já levaste na boca!', 'Já levaste na boca!', 'LMFAO! Mas é o #%&@, ainda levas nessa fuça, irmão!'];
  const DEF = {
    en: {
      run: ['No running on the campus!', 'Where is the fire?', 'Slow down. It is a gallery, not a race.'],
      scream: ['AAAAH!', 'RUN!', 'Not the face!', 'I am not even ready!', 'Abort! Abort!'],
      jump: ['Show-off.', 'Oh, please.', 'Gravity is free, you know.', 'Wow. A jump. Thrilling.', 'Do you want a medal?'],
      sit: ['Comfortable? Good. Me neither.', 'Sitting down? I shall stand. In protest.'],
      sun: ['Lovely sun. Suspiciously lovely.', 'Sun is out. Everyone act natural.'],
      storm: ['Storm! Everybody look worried!', 'I left my umbrella in 2019.'],
      night: ['Night already? I was just getting bored.', 'It is dark. Perfect for standing about.'],
      rainbow: ['A rainbow! Nobody touch it.', 'A rainbow. Show-off.'],
      again: ['You again.', 'Back so soon? I have no new material.', 'Twice in one day. People will talk.'],
      ignored: ['Fine. Ignore me.', 'I was mid-sentence!', 'Rude. I had a good one.'],
      ouch: ['Ow!', 'OI!', 'Hey!'],
      ouch2: ['AGAIN?!', 'Twice! TWICE!', 'Is this a tradition?'],
      ouch3: ['THAT IS IT!', 'Right. RIGHT!', 'Oh you #%&@!'],
      up: ['How dare you.', 'I demand an apology. And my hat.', 'That was uncalled for. Also rude.', 'I was NOT ready for that.', 'I fell on purpose. Write that down.', 'I am telling the hall.'],
      rude: ['How RUDE.', 'I saw that. Pixels and all.', 'Well I never.', 'Oh, go and comb a monkey!'],
      smug: ['There. Balance restored.', 'PAF. You are welcome.', 'Who is laughing now? Them. At you.'],
      miss: ['Missed! On purpose!', 'Next time. NEXT TIME.'],
      tired: ['Fine… I am… out of breath.', 'You win. These shoes are for standing.'],
      floor: ['I am resting. Professionally.', 'Talk to me when I am vertical.', 'Five more minutes.', 'The floor and I are in a meeting.'],
      bump: ['Excuse YOU.', 'Personal space!', 'Oof. Hello.', 'There is a whole campus, you know.'],
      ahem: ['Ahem.', '…', 'I was laughing at something else.'],
      murmur: ['Tsk, tsk.', 'Honestly…', 'People these days…', 'Well I never…', '*long sigh*', 'Where will it all end…', 'In my day we stood still.', 'Look at this. Just look at it.'],
      pardon: ['Pardon.', 'Excuse me. That was the soup.'],
      who: ['Who did that?!', 'Not me. It was the pigeon.', '…Lovely weather.'],
      wind: ['Hold still…', 'Come here, you…'],
      tsk: ['Tsk.'],
    },
    pt: {
      run: ['Olha a pressa!', 'Devagar, que isto não é a maratona!', 'Onde é o incêndio, pá?', 'Calma, bro!', 'Pareces um pinguim com pressa!', 'Tens o cérebro em modo avião?', 'Desvia-te, ó camelo!'],
      scream: ['Ó bro, calma!', 'AI MÃE!', 'Foge!', 'Olha o carro!', 'Socorro! …Ah, és tu.'],
      jump: ['Exibicionista.', 'Ó pá, que salto.', 'Queres uma medalha?', 'No meu tempo saltava-se mais alto.', 'Olha este, é do mesmo tamanho sentado e de pé!'],
      sit: ['Senta-te, senta-te. Isso é que é vida.', 'Já cá estava primeiro, mas senta-te.'],
      sun: ['Que rico solinho!', 'Este sol até dá vontade de não fazer nada.'],
      storm: ['Ai, que vem aí chuva da grossa!', 'Eu bem disse que ia chover!'],
      night: ['Já é noite? Isto passa a correr.', 'A esta hora já devias estar em casa.'],
      rainbow: ['Olha, um arco-íris! Que bonito!', 'Arco-íris? Isso é para enganar os tolos.'],
      again: ['Outra vez tu?', 'Ainda aqui andas?', 'Já te disse tudo o que sabia. Era pouco.', 'Tens boa voz para escrever à máquina.'],
      ignored: ['Pronto, ninguém me liga.', 'Estava a falar contigo, pá!', 'Vai, vai. Vai pentear macacos!'],
      ouch: ['Ai!', 'Ui!', 'Ó pá!'],
      ouch2: ['Outra vez?!', 'Ó pá, outra vez?!', 'Mas isto é um vício?!'],
      ouch3: ['Ó seu #%&@!', 'Raios te partam!', 'Ai o caraças! Agora é que é!', 'Eh, calma, Zé!'],
      up: ['Ó pá! Isso é maneira?', 'Eu ia dizer uma coisa e esqueci-me!', 'No meu tempo isto não se fazia.', 'Respeito, pá!', 'Vou fazer queixa… a alguém.', 'Chapada de amador!', 'Aprende a bater, ó mão de manteiga!', "Isso doeu-me na alma, ó cara d'urso!", 'Bate-me outra vez e faço queixinhas ao gnomo!'],
      rude: ['Ó malcriado!', 'Na minha terra isso dava estalada!', 'Que falta de educação, pá!', 'Ó palerma!', 'Olha-me este cromo!', 'Vai dar banho ao cão!', 'Ó seu #%&@!', 'Ó porco!', 'Ó estupidozinho!', 'Ó cara de papo!'],
      smug: ['Toma lá, boneco!', 'Levaste na boca, boneco!', 'Já levaste na boca!', 'Levas na boca, porko!'],
      miss: ['Fugiste, hã? Para a próxima!', 'Ai o caraças, falhei!'],
      tired: ['Pronto… pronto… já não tenho idade para isto.', 'Vai, vai… vai dar banho ao cão!'],
      floor: ['Agora não, estou no chão.', 'Deixa-me estar aqui um bocadinho.', 'O chão até está fresquinho.', 'Volta mais tarde, pá.'],
      bump: ['Ó pá, olha a fila!', 'Com licença!', 'Ui! Devagar!', 'Há espaço para todos, pá.', 'Queres o quê?', "Cara d'urso!", "Queres o quê, ó cara d'urso?", 'Tás a olhar porquê? Devo-te dinheiro?', 'Ó pá, desampara-me a loja!', 'Olha-me este cromo da caderneta!', 'Tens cara de quem perde o autocarro.', 'Que cara de segunda-feira!', 'Ó cabeça de abóbora, chega-te pra lá!', 'Ó nabo!', 'Ó porco!', 'Ó estupidozinho!', 'Ó cara de papo!', 'Tens uma testa que parece um papo seco!', 'Ó cabeça de melão!', 'Ó nariz de batata!', 'Ó cara de pudim!', 'Ó bochechas de broa!', 'Ó chouriço!', 'Tens uma testa onde dava para pôr publicidade!', 'Tens um nariz que faz sombra ao meio-dia!', 'Ó cara de bacalhau demolhado!', 'Ó cabeça de alho chocho!', 'Ó grande totó!'],
      ahem: ['Hum.', '…', 'Eu não me estava a rir. Era tosse.'],
      murmur: ['Esta gente esquisita…', 'Tsk, tsk.', 'Ai, ai, ai…', 'Onde é que isto vai parar…', 'No meu tempo não era assim…', 'Olha-me para isto…', 'Credo!', 'Francamente…', 'Já não há respeito…', 'Isto agora é tudo assim…', 'Haja paciência…', 'Era o que faltava…', 'Isto não lembra a ninguém…', 'Cada um que me aparece…', 'Pois, pois…', 'Ora esta…', 'Ó trengo…', 'Ó nabo…', 'Olha-me este pato-bravo…', 'Cara de quem comeu e não gostou.', 'Olha este, é do mesmo tamanho sentado e de pé.'],
      pardon: ['Com licença.', 'Desculpem. Foi o feijão.'],
      who: ['Quem foi?!', 'Não fui eu. Foi o pombo.', '…Está bom tempo, não está?'],
      wind: ['Anda cá, anda…', 'Espera aí, boneco…'],
      tsk: ['Tsk.'],
    },
  };
  const R = {
    bull: {
      talk: ['I have a standing desk. I stand at it. Angrily.', 'My calendar just says "charge". I think it means a phone.', 'Red tape. Do not get me started on red tape.', 'I am on a call. The call is me, breathing.', 'Synergy. I just like the sound of it.'],
      run: ['Running? In THIS economy?', 'Walk. Running is for people without assistants.'], jump: ['Bulls do not jump. We appreciate.', 'A jump. Noted. Not approved.'],
      sit: ['Sit. Good. Now we are in a meeting.', 'You sat down. Is this a negotiation?'], sun: ['Sun is out. I am closing early.'], storm: ['A storm. Finally, weather with ambition.'],
      night: ['Night shift. Fewer red things.'], rainbow: ['A rainbow. Too many colours. One of them is red.'], again: ['You again. Book a slot.', 'Twice in one day. Are you an investor?'],
      ignored: ['I was mid-pitch.', 'Walk away. I charge by the hour anyway.'], ouch: ['MOOO!', 'MY HORNS!', 'Not the suit!', 'MOO?!'], smug: ['PAF. Invoice to follow.', 'That is what we call a hostile takeover.'],
      rude: ['Was that at me? I will allow it. Once.', 'Do that again and I charge. By the hour.'], ha: ['HUH HUH HUH!', 'HAW! HAW!'],
    },
    goat: {
      talk: ['I ate a brochure. Very informative.', 'Is that a tie? It looks delicious. On you.', 'I am not stubborn. I am consistent.', 'Every hill is my hill. Legally, no.', 'Maaa. That is "hello" in tweed.'],
      run: ['Run! Run like there is a cabbage at the end!'], jump: ['Amateur. I jump onto fridges.'], sit: ['Sitting? Bold. I would be on the backrest.'],
      sun: ['Sun! Perfect for chewing things outdoors.'], storm: ['Thunder. I am going to eat it.'], night: ['At night all the grass is mine. Also by day.'], rainbow: ['A rainbow. Seven flavours.'],
      again: ['Back for more opinions? I have one. It is grass.'], ignored: ['Fine. I will eat your silence.'], ouch: ['MAAA!', 'MEH-HEH!', 'Not the tweed!', 'BLEH!'],
      smug: ['Maaa. A headbutt, by hand.'], ha: ['MEHEHEHE!', 'Meh-heh-heh-heh!'],
    },
    pigeon: {
      talk: ['I know every crumb on this campus by name.', 'Statues are just tall benches for us.', 'I am not lost. I am commuting.', 'Coo. Coo. That was a business call.', 'If you drop it, it is mine. That is the law.'],
      run: ['Racing? I would fly, but it is a tracksuit day.'], jump: ['Nice. Now flap.'], sit: ['Sitting means crumbs. I will wait.'],
      sun: ['Sunbathing. In a tracksuit. Peak pigeon.'], storm: ['Storm! Everyone under the statue!'], night: ['Night pigeon. Same as day pigeon. Darker.'], rainbow: ['A rainbow. Like my neck, but worse.'],
      again: ['Coo. You came back. Bread?'], ignored: ['Coo… fine.'], ouch: ['COO!', 'COO-COO?!', 'My neck!', 'Feathers! Everywhere!'], smug: ['Coo-PAF.'], ha: ['Coo-hoo-hoo-hoo!', 'HOO HOO!'],
    },
    horse: {
      talk: ['I came for the canapés. They were tiny. I was not.', 'My tailor said hold still. I have not moved since.', 'The doors here are built for shorter guests.', 'Hay is so last season. Now it is "dried grass, curated".', 'Good evening. It is daytime. Good evening anyway.'],
      run: ['No galloping indoors. Or outdoors. Or ever.'], jump: ['Show jumping? I prefer show standing.'], sit: ['Sitting. I envy you deeply.'],
      sun: ['The sun makes this tuxedo very dramatic.'], storm: ['This storm is underdressed.'], night: ['Finally, the gala hour.'], rainbow: ['A rainbow. Black tie optional, apparently.'],
      again: ['We have been introduced. Twice now. Charming.'], ignored: ['I see. The long face is now justified.'], ouch: ['NEIGH!', 'My bow tie!', 'HRRRN!', 'Not at the gala!'],
      smug: ['A gentleman returns every slap. Politely.'], rude: ['In front of my bow tie?!', 'It is censored and I am STILL offended.'], ha: ['HYEH-HEH-HEH!', 'Hrrr-heh-heh!'],
    },
    cat: {
      talk: ['I sat in a box once. It changed me.', 'I am not ignoring you. I am curating my attention.', 'That painting moved. I moved first.', 'Purring is applause with my mouth closed.', 'Feed me and I will tolerate you for an hour.'],
      run: ['Running is for dogs.'], jump: ['Cute. I do that onto shelves. Silently.'], sit: ['You are sitting in my sun.'],
      sun: ['Sun patch. Do not speak to me.'], storm: ['Thunder. I was never here.'], night: ['Night. My shift. Zoomies pending.'], rainbow: ['A rainbow. Overrated. Shiny, though.'],
      again: ['You again. I suppose.'], ignored: ['Good. I was ignoring you first.'], ouch: ['MEOW!', 'HSSS!', 'Rude.', 'MRRAOW!'], smug: ['Paw. Of. Justice.'],
      rude: ['I saw that. I see everything.', 'Pixelated. Like my patience.'], ha: ['Heh.', 'Heh. Heh.'],
    },
    pig: {
      talk: ['Health and safety says no running. I say no stopping lunch.', 'This puddle is a listed monument.', 'I filled in a form about the form.', 'Snack break is a state of mind.', 'My clipboard is mostly crumbs.'],
      run: ['Oi! Walk! It says so on my vest!'], jump: ['Unsafe! Lovely, but unsafe!'], sit: ['Seated is the safest position. Well done.'],
      sun: ['Sun cream on. Snout first.'], storm: ['Storm! Hard hats! I have none!'], night: ['At night the vest really sings.'], rainbow: ['A rainbow. Very visible. I approve.'],
      again: ['Back for the safety briefing? Rule one: snacks.'], ignored: ['Noted. In my notebook of sadness.'], ouch: ['OINK!', 'SQUEEE!', 'My vest!', 'OINK OINK!'],
      smug: ['Safety slap. For your own good.'], ha: ['HONK! Ha! HONK!', 'Snrk-HAHA-snrk!'],
    },
    walrus: {
      talk: ['Grass used to be greener. I checked.', 'This plaza was better before they built it.', 'Progress? I tried it once. Too fast.', 'They put a cinema on a roof. A ROOF.', 'I am writing to the newspaper. The newspaper is me.'],
      run: ['Running! In my day we walked, and we were LATE!'], jump: ['Jumping. That is how it starts.'], sit: ['Sitting down already? Young people.'],
      sun: ['Too much sun. Somebody has turned it up.'], storm: ['I predicted this storm in 1987. Nobody listened.'], night: ['Night again? They keep doing that.'], rainbow: ['A rainbow. Showing off, frankly.'],
      again: ['You again. Have you come to agree with me?'], ignored: ['Walk away! That is what they all do!'], ouch: ['AWRK!', 'Outrageous!', 'I was RIGHT!', 'HRUMPH!'],
      smug: ['That is how we did it in my day. With a moustache.'], rude: ['Well I NEVER.', 'In my day we were rude with WORDS.', 'I am writing a letter. To nobody. Angrily.'], ha: ['HAR HAR HAR!', 'HAR! Serves you right!'],
      murmur: ['Tsk, tsk.', 'In my day…', 'Disgraceful. Probably.', '*long sigh*', 'They let anyone in now.', 'Look at this. LOOK at it.'],
    },
    rooster: {
      talk: ['I crowed at noon once. It was a statement.', 'Mornings are my brand. Afternoons are licensed.', 'My comb is natural. Do not ask.', 'I wake the sun up. You are welcome.', 'Feathers trimmed weekly. Opinions daily.'],
      run: ['Hurry, hurry! I love an audience!'], jump: ['Higher! Like me on a fence!'], sit: ['Seated? I prefer a perch.'],
      sun: ['The sun! Right on cue. My cue.'], storm: ['A storm. I did not authorise this.'], night: ['Night? I object to night.'], rainbow: ['A rainbow. It copied my feathers.'],
      again: ['Again? The dawn chorus costs extra.'], ignored: ['Rude. I was building up to a crow.'], ouch: ['BAWK!', 'BUH-KAWK!', 'My pin!', 'Not before sunrise!'],
      smug: ['Bawk. Justice, served at dawn.'], rude: ['How DARE you. I am a rooster of standing.', 'At dawn I would crow at you for that!'], ha: ['BWAHAHAHA!', 'BWAK-HA-HA-HA!'],
      murmur: ['Tsk. Amateurs.', 'Nobody respects the dawn any more.', 'Bawk. Honestly.'],
    },
    tortoise: {
      talk: ['Isto antigamente era tudo campo. E o campo era melhor.', 'Já espero pelo autocarro desde 1981. Hei de esperar mais.', 'Quadros que se acendem sozinhos? Isso é bruxaria moderna.', 'Devagar se vai ao longe. Eu vou devagar e fico aqui.'],
      run: ['Devagar! Ainda partes uma perna!'], jump: ['Saltos? No meu tempo isso dava castigo.'], sit: ['Senta-te. Já cá estava primeiro, mas senta-te.', 'Esse banco é o do senhor Alberto. Pronto, senta-te.'],
      sun: ['Este sol faz mal à cabeça. Põe chapéu!'], storm: ['Eu bem disse que ia chover! Ninguém me ouve!'], night: ['A esta hora devias estar em casa.'], rainbow: ['Arco-íris? Isso é para enganar os tolos.'],
      again: ['Outra vez tu? Já te disse tudo.'], ignored: ['Pronto, vai, vai. Ninguém liga aos velhos.'], ouch: ['Ai!', 'Ai, as minhas costas!', 'Ó da guarda!', 'Ai, ai, ai…'],
      rude: ['Ó malcriado!', 'Na minha terra isso dava estalada!', 'Nem se vê nada e já estou ofendido!'], ha: ['Eh eh eh…', 'Ah ah ah… ai, as costas.'],
    },
    raccoon: {
      talk: ['I found this hat. It found me, really.', 'Barbecue is a lifestyle, not a meal.', 'Do not touch the bins. They are under my protection.', 'I have a cousin in every dumpster.', 'Folding chair. Unfolding opinions.'],
      run: ["Where you goin' in such a hurry?"], jump: ['Careful! You will scare the coals!'], sit: ['Pull up a chair. Not mine.'],
      sun: ['Sun is out. Grill is out. Life is good.'], storm: ['Storm! Save the sausages!'], night: ['Night time is snack time.'], rainbow: ['A rainbow. Bet there is a bin at the end.'],
      again: ['Back again? Want a sausage? No? Me neither.'], ignored: ['Fine. More barbecue for me.'], ouch: ['EEK!', 'Hey! My chair!', 'Watch the barbecue!', 'EEK! EEK!'],
      rude: ['Hey! Not in front of the barbecue!', 'Back in my day we pointed with the WHOLE hand.'], ha: ['Hihihihihi!', 'Heeheehee!'],
      murmur: ['Tsk, tsk. Kids.', 'Back in my day…', 'Unbelievable. Pass the sauce.'],
    },
    // The forcado: "Tá bueno!", "Tá bueno?", "Tá bueno, tá bueno…" — and now and then "Sai cavalinho!".
    forcado: {
      talk: ['Tá bueno!', 'Tá bueno?', 'Tá bueno, tá bueno…', 'Tá bueno.', 'Tá bueno, tá bueno!', 'Tá… bueno?', 'Tá bueno! Tá bueno!', 'Tá bueno?!', 'Hm. Tá bueno.', 'Tá bueno… tá bueno…', 'Tá bueno, tá?', 'Tá BUENO!'],
      run: ['Eh, toiro! Sai cavalinho!'], scream: ['Eh, toiro! Sai cavalinho!'], shout: ['Sai cavalinho!', 'Eh, toiro! Sai cavalinho!'],
      ouch: ['TÁ BUENO!', 'TÁ BUENO?!', 'TÁ BUENO, TÁ BUENO!'], ouch2: ['TÁ BUENO?!', 'Tá bueno?!… TÁ BUENO!'], ouch3: ['TÁ BUENO, TÁ BUENO, TÁ BUENO!!', 'TÁ BUENO!! TÁ BUENO!!', 'TÁÁÁ BUENO!'],
      up: ['Tá bueno, tá bueno…', 'Tá bueno.', 'Tá bueno?'], rude: ['Tá bueno?', 'Tá bueno!', 'Tá bueno, tá bueno…'], ha: ['Tá bueno! Tá bueno!', 'Tá bueno, tá bueno!'],
      smug: ['Tá bueno!', 'Tá bueno, tá bueno!'], miss: ['Tá bueno?'], tired: ['Tá bueno…'], ignored: ['Tá bueno.', 'Tá bueno…'], again: ['Tá bueno, tá bueno…', 'Tá bueno?'],
      hyst: ['Tá bueno! Tá bueno!', 'TÁ BUENO! Tá bueno!'], hystV: ['Tá bueno! Tá bueno!', 'TÁ BUENO! Tá bueno!'],
    },
    velho: {
      talk: ['Tá bonito, tá! Muito bonito.', 'Tá bonito… tá bonito.', 'Ai, tá bonito, tá!', 'Tá bonito, tá. Pronto.'],
      run: ['Tá bonito, tá… a correr.'], jump: ['Tá bonito, tá! Salta, salta!'], sit: ['Tá bonito, tá. Senta-te.'],
      sun: ['Tá bonito, tá! Tá calor.'], storm: ['Tá bonito, tá… tá molhado.'], night: ['Tá bonito, tá. Tá escuro.'], rainbow: ['Ai! Tá bonito, tá!!'],
      again: ['Tá bonito, tá. Outra vez.'], ignored: ['Tá bonito, tá…'], up: ['Tá bonito, tá…', 'Hm. Tá bonito.', 'Tá bonito… tá.'], ouch: ['Ai!', 'Tá bonito, tá!', 'Ai, a minha anca!'],
      ouch2: ['Ai! Tá bonito, tá…', 'Outra vez?! Tá bonito, tá!'], smug: ['Tá bonito, tá! PAF!'], ha: ['Eh eh eh! Tá bonito, tá!', 'Ah ah ah!'],
      murmur: ['Tá bonito, tá… tsk, tsk.', 'Tá bonito, tá… ai, ai, ai…', 'Hm. Tá bonito, tá.', 'Olha-me para isto… tá bonito, tá.'],
    },
    gordo: {
      talk: ['Isso é que era bom! Pois era!', 'Isso é que era bom! Mas não é.', 'Isso é que era bom! E de borla!', 'Ah, isso é que era bom!'],
      run: ['Isso é que era bom, correr! Eu cá não.'], jump: ['Isso é que era bom! Saltar! Hm.'], sit: ['Isso é que era bom! Uma sesta.'],
      sun: ['Isso é que era bom! Uma imperial ao sol!'], storm: ['Isso é que era bom… ficar em casa.'], night: ['Isso é que era bom! Um jantarinho!'], rainbow: ['Isso é que era bom! Um pote de ouro!'],
      again: ['Isso é que era bom! Tu outra vez!'], ignored: ['Isso é que era bom! Ninguém me ouve.'], ouch: ['Ó pá!', 'Isso é que era bom!', 'Ai, a minha barriga!'],
      ouch2: ['Isso é que era bom… outra vez?!'], up: ['Isso é que era bom!', 'Ó pá! Isso é maneira?', 'Isso é que era bom! Queriam era…'], smug: ['Isso é que era bom! PAF!'],
      rude: ['Isso é que era bom! Ó malcriado!', 'Na minha terra isso dava estalada!', 'Malcriadão!'], ha: ['HO HO HO! Levou!', 'HO HO HO!'],
      murmur: ['Isso é que era bom… tsk.', 'Ai, ai, ai… onde é que isto vai parar…', 'Esta gente esquisita… isso é que era bom.'],
    },
    mano: {
      talk: ['Mano, pagas tu? Não? Tenho MB Way.', 'Tudo por MB Way, mano. Tudo.', 'O meu avô tinha cheques. Eu tenho MB Way.', 'Mano, a vida é simples: MB Way.', 'Tens criptomoedas, bro?', 'Bro, tens criptomoedas? Eu aceito. E tenho MB Way.'],
      run: ['Mano, corre! Eu pago por MB Way!', 'Calma, bro!', 'Calma aí, bro!'], scream: ['Ó bro, calma!', 'Calma aí, bro!'], jump: ['Bué alto, mano!'], sit: ['Senta-te, mano. Eu pago. MB Way.'],
      sun: ['Calor, mano. Gelado? Tenho MB Way.'], storm: ['Chuva, mano! Guarda-chuva por MB Way?'], night: ['Mano, à noite o MB Way até brilha.'], rainbow: ['Arco-íris, mano! Faço-lhe MB Way!'],
      again: ['Outra vez, mano? Tenho MB Way na mesma.'], ignored: ['Mano?! Mano… tenho MB Way…'], ouch: ['Ó mano!', 'Mano?!', 'Calma, bro!', 'Calma aí, bro!', 'Ó bro, calma!'],
      ouch2: ['Mano! Outra vez?! Isso pagas!'], ouch3: ['Anda cá, mano! Ó seu #%&@!', 'Mano! MANO! Ó seu #%&@!', 'Agora pagas, mano! Raios te partam!'], up: ['Mano… isso não se faz.', 'Faço-te MB Way do estalo, mano.', 'Tenho MB Way. E tenho memória.'],
      smug: ['MB Way de estalada, mano. Já foi.'], ha: ['Hahaha, mano! Levou!', 'Hehehe! Levou!'],
    },
  };
  for (let i = 0; i < npcs.length; i++) { const n = npcs[i], own = R[n.S.name]; n.talk = ONLY[n.S.name] ? own.talk : n.S.lines.concat((own && own.talk) || []); }
  const TROMBA = ["Ai, que tromba boa p'ra levar chapadões!", 'Olha-me esta tromba, a pedir chapadões!', "Que trombinha jeitosa p'ra um chapadão!"];
  DEF.pt.wind = DEF.pt.wind.concat(TROMBA);
  // Only this NPC signature may use an available Portuguese voice, rarely.
  const SPOKEN = { 'Tá bueno!': 1, 'Já levaste na boca!': 1, "Ai, que tromba boa p'ra levar chapadões!": 1 };
  let ptVoice = null, lastSpoke = -99, ownedSpeech = null;
  function stopSignatureSpeech() {
    if (!ownedSpeech) return;
    const speech = ownedSpeech; ownedSpeech = null;
    if (ctx.scene.userData.ttsOwner === speech) {
      ctx.scene.userData.ttsOwner = null;
      try { speech.synth.cancel(); } catch {}
    }
    speech.lease.release();
  }
  function speakMaybe(n, text) {
    if (!(comedy ? comedy.isSignature(n, text) : SPOKEN[text]) || clock - lastSpoke < 25 || Math.random() > 0.4 || !n.near2) return;
    let speechLease = null;
    try {
      const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
      if (!ss || ss.speaking || ss.pending || ctx.scene.userData.ttsOwner || typeof SpeechSynthesisUtterance === 'undefined' || !audioOn(n)) return;
      // Local voices only: pt-PT, another Portuguese voice, then a local fallback.
      let v = ptVoice;
      if (!v) {
        const vs = (ss.getVoices() || []).filter(voice => voice.localService === true);
        let br = null;
        for (let i = 0; i < vs.length; i++) { const l = vs[i].lang || ''; if (/^pt[-_]PT/i.test(l)) { v = vs[i]; break; } if (!br && /^pt/i.test(l)) br = vs[i]; }
        if (v || br) ptVoice = v = v || br; else v = null;
      }
      if (!v) return;
      speechLease = reserveModuleVoice(ctx, 3, true, Math.max(2, Math.min(15, text.length * .16 + 1)), bus);
      if (!speechLease) return;
      const u = new SpeechSynthesisUtterance(text);
      const speech = { utterance: u, lease: speechLease, synth: ss };
      ownedSpeech = speech; ctx.scene.userData.ttsOwner = speech;
      const done = () => {
        if (ownedSpeech === speech) ownedSpeech = null;
        if (ctx.scene.userData.ttsOwner === speech) ctx.scene.userData.ttsOwner = null;
        speechLease.release();
      };
      u.onend = done; u.onerror = done;
      speechLease.onRelease = () => {
        npcSpeechActive=false;npcSpeechPaused=false;
        if (ctx.scene.userData.ttsOwner !== speech) return;
        ctx.scene.userData.ttsOwner = null; if (ownedSpeech === speech) ownedSpeech = null;
        try { ss.cancel(); } catch {}
      };
      u.voice = v; u.lang = v.lang || 'pt-PT'; u.volume = 0.35; u.rate = 0.9 + (n.seed % 0.35); u.pitch = 0.7 + ((n.seed * 1.7) % 0.8);
      u.onstart=()=>{npcSpeechActive=true;};u.onend=u.onerror=()=>{npcSpeechActive=false;npcSpeechPaused=false;done();};
      ss.speak(u); lastSpoke = clock;
    } catch (e) { stopSignatureSpeech(); speechLease?.release(); /* no voice */ }
  }
  const BARK_TXT = 'Béu! Béu!';
  const BARK_MID = {
    velho: [['Tá bonito…', '…tá.'], ['Tá bonito, tá…', '…tá bonito.'], ['Tá…', '…bonito, tá!'], ['Hm. Tá bonito…', '…tá, tá.']],
    mano: [['Tenho MB…', '…Way. Tenho MB Way.'], ['Faço-te MB Way já, ma…', '…no.'], ['Mano, tenho…', '…MB Way.'], ['Divide-se a conta? Tenho…', '…MB Way.']],
  };
  const LAUGH_BUB = ['HAHAHA!', 'Hee hee hee!', 'Ha! Ha!', 'Hehehe…'];
  const TRIP = ['I meant that.', 'That was choreography.', 'Nobody saw that. Good.'];
  const DRAMA = ['*sigh* Another day. Another hill. Nobody climbs with me.', 'To eat, or not to eat. ...To eat.', 'Behold: the last blade of grass. I loved it once.', 'You cannot go home again. I tried. It was a fence.', 'O cruel tweed, why dost thou itch.', 'Mine is a life of grass and sorrow. Mostly grass.'];
  const ARG = ['You sat on my hay.', 'It was a cushion.', 'It was ARTISTICALLY hay.', 'I knock things over. You knew this.', 'You knocked over the Renaissance.', 'It was wobbly. Fine. I am leaving.'];
  const PSQ = ['WEEEEEE!', 'Not the tracksuit!', 'I am lunch! No, late!', 'SQUEEE!'];
  const PEST_EN = ['Excuse me.', 'Excuse me. Just one question.', 'Just one question. One. Two.', 'HELLO?! I AM TALKING TO YOU!'];
  const PEST_PT = ['Ó amigo…', 'Ó amigo… ó amigo…', 'Ó amigo… ó amigo… ÓÓ AMIGO!', 'ÓÓÓ AMIGO! ESTÁS SURDO?!'];
  const PEST_MB = ['Tenho MB Way.', 'Tenho MB Way, mano.', 'TENHO MB WAY, MANO!', 'MB WAY! MB WAY! MB WAY!'];
  const PEST_END = { en: ['Fine. I will email you.', 'Rude. It was a great question.', 'Forget it. It was about hats.'], pt: ['Pronto. Já não digo nada.', 'Está bem, está bem. Vou-me embora.', 'Pronto, pronto. Desculpa qualquer coisinha.'], mb: ['Pronto, mano. Fica sem MB Way.', 'Mano… depois não digas que não te avisei.'] };
  const PEST_LOST = { en: ['WAIT! …Okay. Do not wait.', 'Too fast! These shoes are for standing!'], pt: ['ESPERA! …Pronto, não esperes.', 'Ó amigo! Ó… pronto, foi-se.'], mb: ['Mano! MANO! …Tenho MB Way…', 'Volta, mano! Eu pago! Tenho MB Way!'] };
  const PEST_TALK = { en: ['…I forgot the question. Good day.', 'Thank you. That is all I wanted.'], pt: ['Ah, finalmente! …Já não me lembro. Obrigadinho.', 'Era só isso. Boa tarde.'], mb: ['Fixe, mano. Tenho MB Way. Era só isso.', 'Já sabes: MB Way. Fui.'] };
  const RUDE_K = {
    manguito: { pt: 'Manguitos?! No meu tempo levavas um puxão de orelhas!', en: 'Was that an ARM? At ME?' },
    pirete: { pt: 'Guarda lá esse dedo, malcriado!', en: 'Put that finger away. It is pixelated for a reason.' },
  };
  const GLAUGH = {
    manguito: ['HAHAHA! The arm thing!', 'HAHAHAHA! Do it again!', 'HAHA! I cannot see it and it is HILARIOUS!'],
    pirete: ['HAHAHA! A pixelated finger!', 'HAHAHAHA! Do it again!', 'HAHA! I cannot see it and it is HILARIOUS!'],
  };
  const MURMURERS = { tortoise: 1, walrus: 1, velho: 1, gordo: 1, raccoon: 1, rooster: 1, horse: 1 };
  const BURPERS = { gordo: 1, walrus: 1, raccoon: 1, pig: 1, bull: 1 };
  const FRIEND = { velho: 'gordo', gordo: 'velho', tortoise: 'walrus', walrus: 'tortoise', pig: 'pigeon', pigeon: 'pig', horse: 'cat', cat: 'horse', bull: 'rooster', rooster: 'bull', goat: 'raccoon', raccoon: 'goat', mano: 'gordo' };
  const CHASERS = { mano: 1, gordo: 1, walrus: 1, rooster: 1, bull: 1, goat: 1, pig: 1, pigeon: 1, velho: 1 };

  // ---------- comedy helpers ----------
  const E = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  // Falls: 0 backwards legs-up, 1 cartwheel to a sit, 2 spin and topple, 3 slow-motion timber,
  // 4 face-plant slide, 5 launched spinning flat on the back, 6 stiff plank. (fractions of the duration)
  const FALL_A = [0.12, 0.35, 0.36, 0.5, 0.25, 0.16, 0.22], FALL_B = [0.5, 0.62, 0.62, 0.8, 0.7, 0.62, 0.6];
  const FALL_C = [0.85, 0.88, 0.88, 1.0, 0.95, 0.9, 0.82], FALL_D = [4.2, 4.6, 4.4, 7.0, 4.6, 5.0, 4.2];
  const IMPACT = [0.12, 0.35, 0.46, 0.68, 0.25, 0.16, 0.22];
  const FREEZE = 0.42;                                      // the beat of frozen disbelief
  // Never the same line twice in a row from the same mouth.
  function pickFrom(n, pool) {
    const len = pool.length;
    if (len < 2) return pool[0];
    let k = (Math.random() * len) | 0;
    const prev = n.lastOf.get(pool);
    if (k === prev) k = (k + 1 + ((Math.random() * (len - 1)) | 0)) % len;
    if (pool[k] === n.curText) k = (k + 1) % len;
    n.lastOf.set(pool, k);
    return pool[k];
  }
  function pool(n, key) {
    const own = R[n.S.name];
    if (key === 'talk') return n.talk;
    if (own && own[key]) return own[key];
    if (ONLY[n.S.name]) return n.talk;                       // the forcado has one line, many deliveries
    return DEF[n.S.pt ? 'pt' : 'en'][key] || n.talk;
  }
  function line(n, key) {
    if (comedy) return comedy.line(n, key);
    const entry = castById.get(n.S.name);
    if (entry && !entry.legacy) return chooseLine(entry, lineKeys[key] || key);
    const p = pool(n, key);
    return p.length === 1 && p[0] === n.curText ? pickFrom(n, n.talk) : pickFrom(n, p);   // a one-line pool never repeats back to back
  }
  // A line: the bubble is redrawn on the next frame that has budget for it (flush() draws now).
  function say(n, text, withSound, up) {
    if (ctx.scene.userData.combatState?.active||ctx.scene.userData.tramHallQuiet||ctx.scene.userData.questQuiet||ctx.scene.userData.bairroEffects?.silenceUntil>performance.now()/1000) return;
    if (typeof text !== 'string' || !text) return;
    if (comedy && !comedy.allow(n, text)) return;
    n.curText = text; n.talkT = readableBubbles.setText(n,text); n.armUp = up || 1.7;
    if (n.near2) { const A = ctx.audio; if (A && typeof A.duck === 'function') { try { A.duck(n.talkT); } catch (e) { /* no score */ } } }
    personalities?.onEvent('speech', n);
    n.dirty = false; n.bubble = Math.min(n.bubble, 0.55); n.mutterCd = 14;
    if (withSound) noise(n);
    if (text.indexOf('#%&@') >= 0) { if (comedy) comedy.sound(n, 'bleep'); else sfx(n, 'bip'); }              // bleeped, like the censored gestures
    else speakMaybe(n, text);
    return true;
  }
  function flush(n) { if (n.dirty) { drawBubble(n, n.curText); n.dirty = false; } }
  function startSilly(n, type, dur) { n.sillyType = type; n.sillyDur = dur; n.sillyT = 0; n.meant = false; }
  function go(n, x, z, sp, t) { n.goOn = true; n.gx = x; n.gz = z; n.gsp = sp; n.goT = t; }
  function bark(n) {
    const gap = 0.2 + Math.random() * 0.07;
    say(n, BARK_TXT, false); n.talkT = Math.max(n.talkT,2.2);
    n.jerk = 1; n.jerkAt = gap; n.barkCd = 28 + Math.random() * 30;
    barkSound(n, gap);
  }
  // Two-beat lines: the sentence stops, something happens, the sentence resumes as if nothing.
  // kind 1: bark mid-sentence; 2: a burp, then "pardon"; 3: a fart, a look around, "who did that?"
  function beat(n, kind, first, rest, t) { if (first) say(n, first, kind === 1); n.seqStage = 1; n.seqKind = kind; n.seqT = t; n.seqRest = rest; }
  function midBark(n) { const p = pickFrom(n, BARK_MID[n.S.name]); beat(n, 1, p[0], p[1], 0.8 + Math.random() * 0.35); }
  function murmur(n) {
    say(n, line(n, 'murmur'), false);
    const r = Math.random();
    sfx(n, r < 0.45 ? 'tsk' : r < 0.75 ? 'sigh' : 'aiai');
    if (Math.random() < 0.5) n.shakeT = 1.2; else n.lookOverT = 1.6;
    n.murmurCd = 9 + Math.random() * 9;
  }
  // A murmur of judgement from whoever is near, a beat after the visitor does something.
  function judge(delay) {
    let best = null, bd = 400;
    for (let i = 0; i < npcs.length; i++) {
      const m = npcs[i];
      if (!MURMURERS[m.S.name] || m.zone !== camZone || m.d2 > bd || m.talkT > 0 || (m.sillyT >= 0 && m.sillyType === 4) || m.busy) continue;
      best = m; bd = m.d2;
    }
    if (best && best.judgeAt <= 0) best.judgeAt = delay;
  }
  function startLaugh(n, text, hyst) {
    if (comedy && !comedy.allowLaugh(n)) return;
    n.laughT = hyst ? 2.8 : 2.3;
    if (text) say(n, text, false);
    if (n.near2) { if (comedy) comedy.sound(n, 'laugh'); else if (!personalities?.sound('laugh', n)) laughSound(n, hyst); }
    if (LAUGHER[n.S.name] && !n.fixed && !reduced && n.sillyT < 0 && !n.busy && Math.random() < (hyst ? 0.2 : 0.12)) {
      // laughs so hard they fall over
      n.fallType = 0; n.fallDir = 1; n.thud = false; n.whistled = false; n.impT = -1; n.rofl = true; n.freezeT = 0;
      startSilly(n, 4, FALL_D[0]); n.laughT = FALL_D[0] * 0.8;
    }
  }
  // Somebody "levou na boca": everyone within 12 m bursts out laughing, each in their own silly
  // voice, the victim's friend first and loudest. vis: it was the visitor who got it.
  function hysterics(x, z, zone, victim, delay, vis) {
    let queued = 0;
    const fr = victim ? FRIEND[victim.S.name] : null;
    for (let i = 0; i < npcs.length; i++) {
      const m = npcs[i];
      if (m.combatHidden || m.combatControlled || m === victim || m.zone !== zone || (m.sillyT >= 0 && m.sillyType === 4) || m.windT > 0) continue;
      const ex = m.x - x, ez = m.z - z, q = ex * ex + ez * ez;
      if (q > 144) continue;
      const friend = fr === m.S.name;
      m.laughAt = delay + (friend ? 0.05 : 0.15 + Math.sqrt(q) * 0.04 + Math.random() * 0.3);
      m.laughText = friend && !ONLY[m.S.name] ? '#F' : vis ? '#V' : '#N';
      m.pointT = m.laughAt + 2.6; m.pointAt = victim; if (!m.busy && victim) m.faceN = victim;
      if (++queued >= 3) break;
    }
  }
  function laughLine(n, code) {
    if (comedy) return comedy.line(n, 'witness');
    const entry = castById.get(n.S.name);
    if (entry && !entry.legacy) return chooseLine(entry, 'bystander_laugh');
    if (code === '*') return line(n, 'ha');
    if (code === '#F') return pickFrom(n, LEVOU_F);
    if (code === '#N' || code === '#V') {
      const own = R[n.S.name], k = code === '#N' ? 'hyst' : 'hystV';
      if (own && own[k]) return pickFrom(n, own[k]);
      return Math.random() < 0.6 ? pickFrom(n, code === '#N' ? LEVOU_NPC : LEVOU_VIS) : line(n, 'ha');
    }
    return code;
  }
  function getUp(n) {
    if (n.rofl) return;                                   // fell over laughing: no hard feelings
    n.glare = 2.2;
    if (n.escalate) {
      // the third slap: they bark at you, or they come after you for three seconds
      n.escalate = false;
      if (ONLY[n.S.name]) say(n, line(n, 'ouch3'), true);
      else if (!n.barker && Math.random() < 0.4) { bark(n); n.barkFit = 2; }
      else if (canChase(n)) { say(n, line(n, 'ouch3'), true); startPest(n, 3, 2); }
      else if (!ONLY[n.S.name]) bark(n);
    } else if (n.barker && Math.random() < 0.3) bark(n);
    else say(n, line(n, 'up'), false);
    if (!n.escalate && n.pestT <= 0 && clock - n.grudge < 40 && Math.random() < 0.55 && canChase(n)) n.revengeAt = 1.2 + Math.random();
    // ...and the laughing stops. Abruptly.
    for (let i = 0; i < npcs.length; i++) {
      const m = npcs[i];
      if (m === n || m.pointAt !== n) continue;
      m.laughAt = 0;
      if (m.laughT <= 0) continue;
      m.laughT = 0; m.pointT = Math.min(m.pointT, 0.25);
      if (Math.random() < 0.6) say(m, line(m, 'ahem'), false);
      else m.talkT = Math.min(m.talkT, 0.3);
    }
  }
  // Following: never into the hall, the classrooms or the lift (zones), at most two at once.
  function canChase(n) { return !(ctx.scene.userData.bairroEffects?.patienceUntil>performance.now()/1000) && !reduced && CHASERS[n.S.name] && !n.fixed && n.zone === 0 && camZone === 0 && chasing < 2 && n.slapCd <= 0; }
  // mode 1: insistent (walking pace, lines), 2: angry (3 s, running), 3: revenge (walking pace, to slap back)
  function startPest(n, t, mode) {
    if (n.pestT <= 0) chasing++;
    n.pestT = t; n.pestMode = mode; n.pestLvl = 0; n.pestSay = mode === 1 ? 0.4 : 1.2; n.busy = true; n.lingerT = 0;
    n.pestSide = (pcx - n.x) * cfz - (pcz - n.z) * cfx >= 0 ? 1 : -1;      // stay on the side they came from
    if (mode !== 1) n.gest = 0.8;
  }
  function reconcileActor(n){if(!n||n.combatControlled)return false;if(n.pestT>0||n.windT>0||n.revengeAt>0)endPest(n,null);n.revengeAt=0;n.windT=0;n.lingerT=0;n.rancor=0;n.grudge=-Infinity;n.escalate=false;n.pestCd=60;return true;}
  function endPest(n, why) {
    if (n.pestT > 0) chasing = Math.max(0, chasing - 1);
    n.pestT = 0; n.goOn = false; n.busy = false; n.pestCd = 30 + Math.random() * 20; n.wait = 1.5; n.windT = 0; n.pestMode = 0;
    if (!why) return;
    if (why === 'tired') { say(n, line(n, 'tired'), false); return; }
    const P = why === 'talk' ? PEST_TALK : why === 'lost' ? PEST_LOST : PEST_END;
    say(n, ONLY[n.S.name] ? line(n, 'talk') : pickFrom(n, P[n.S.name === 'mano' ? 'mb' : n.S.pt ? 'pt' : 'en']), false);
  }
  // The slap back: a wind-up (step back and you are safe), then PAF.
  function windUp(n) { if(ctx.scene.userData.bairroEffects?.patienceUntil>performance.now()/1000)return; n.windT = 0.55; n.lingerT = 0; if (n.talkT <= 0.5) say(n, line(n, 'wind'), false); }
  function landSlap(n, d) {
    n.windT = 0; n.swingT = 0.3;
    if (d > 1.6) {                                        // whiff: spin round, embarrassed
      say(n, line(n, 'miss'), false); if (n.sillyT < 0 && !reduced) startSilly(n, 0, 0.7);
      n.slapCd = 7; if (n.pestT > 0) endPest(n, null);
      judge(0.6);
      return;
    }
    say(n, 'PAF!', false); flush(n); whack(n, true);
    const st = Math.min(1, 0.45 + (n.pestMode === 2 ? 0.35 : 0) + (clock - n.grudge < 40 ? 0.2 : 0));
    try { if (ctx.scene && ctx.scene.userData) ctx.scene.userData.visitorHit = { time: performance.now() / 1000, x: n.x, z: n.z, strength: st }; } catch (e) { /* nobody listening */ }
    hysterics(pcx, pcz, n.zone, null, 0.15, true);
    n.grudge = -99; n.slapCd = 9 + Math.random() * 4;
    n.seqStage = 1; n.seqKind = 4; n.seqT = 0.9; n.seqRest = line(n, 'smug');
    if (n.pestT > 0) endPest(n, null);
    // back off a couple of steps
    const ux = n.x - pcx, uz = n.z - pcz, ul = Math.sqrt(ux * ux + uz * uz) || 1;
    go(n, n.x + (ux / ul) * 2.4, n.z + (uz / ul) * 2.4, 1.6, 1.6); n.wait = 2;
  }
  function reactGesture(n, kind) {
    const nm = n.S.name;
    n.glare = 2.6;
    if (ONLY[nm]) { say(n, line(n, 'rude'), true); return; }
    if (n.barker) { bark(n); if (OLD[nm]) n.fist = 2.2; return; }
    if (LAUGHER[nm]) { n.glare = 0; startLaugh(n, pickFrom(n, GLAUGH[kind] || GLAUGH.pirete), true); if (n.sillyT < 0) n.laughT = 3; return; }
    const K = RUDE_K[kind];
    say(n, K && Math.random() < 0.35 ? (n.S.pt ? K.pt : K.en) : line(n, 'rude'), true);
    if (OLD[nm]) n.fist = 2.4; else n.gest = 0.9;
  }
  // Pushed into for half a second (a doorway, a corner): a side step towards home, collider off meanwhile.
  function stepAside(n, dx, dz, d2) {
    n.pushT = 0; n.ghostT = 1.0;
    if (n.S.seated) { n.ghostT = 1.6; return; }
    const d = Math.sqrt(d2) || 1, ux = dx / d, uz = dz / d;
    let sx = -uz, sz = ux;
    if (sx * (n.pts[0] - n.x) + sz * (n.pts[1] - n.z) < 0) { sx = -sx; sz = -sz; }
    go(n, n.x + sx * 1.1 - ux * 0.35, n.z + sz * 1.1 - uz * 0.35, 2.4, 0.9);
    n.wait = Math.max(n.wait, 1);
    if (n.talkT <= 0 && n.bumpCd <= 0) { n.bumpCd = 6; say(n, line(n, 'bump'), false); }
  }
  // Doorways and building walls: wanderers and followers are gently put back outside.
  function keepOut(n) {
    if (n.zone === 1) { n.x = Math.min(5.2, Math.max(-5.2, n.x)); n.z = Math.min(13.6, Math.max(-15.7, n.z)); return; }
    for (let k = 0; k < DOORS.length; k += 3) {
      const ex = n.x - DOORS[k], ez = n.z - DOORS[k + 1], r = DOORS[k + 2], q = ex * ex + ez * ez;
      if (q < r * r) { const d = Math.sqrt(q) || 1e-3; n.x = DOORS[k] + (ex / d) * r; n.z = DOORS[k + 1] + (ez / d) * r; }
    }
    for (let k = 0; k < BOXES.length; k += 4) {
      const x0 = BOXES[k], x1 = BOXES[k + 1], z0 = BOXES[k + 2], z1 = BOXES[k + 3];
      if (n.x > x0 && n.x < x1 && n.z > z0 && n.z < z1) {
        const l = n.x - x0, r = x1 - n.x, b = n.z - z0, t = z1 - n.z, m = Math.min(l, r, b, t);
        if (m === l) n.x = x0; else if (m === r) n.x = x1; else if (m === b) n.z = z0; else n.z = z1;
      }
    }
  }

  // ---------- drama director ----------
  let GO=null,PG=null,HO=null,CA=null,PI=null;
  let aSt = 0, aT = 22, aI = 0;           // argument: horse vs cat
  let cSt = 0, cT = 30, cAng = 0, cLeft = 0, cSq = 0;   // chase: pigeon after pig
  const PCX = 0, PCZ = 31, PRX = 6.2, PRZ = 9.5;
  function director(dt) {
    if(!GO||!PG||!HO||!CA||!PI)return;
    // argument
    if (aSt === 0) {
      aT -= dt;
      if (HO.S.name === 'horse' && CA.S.name === 'cat' && aT <= 0 && !HO.busy && !CA.busy && HO.talkT <= 0) {
        aSt = 1; HO.busy = CA.busy = true;
        const ex = HO.x - CA.x, ez = HO.z - CA.z, d = Math.sqrt(ex * ex + ez * ez) || 1;
        go(HO, CA.x + (ex / d) * 2.3, CA.z + (ez / d) * 2.3, 1.7, -1);
        HO.faceN = CA; CA.faceN = HO; CA.wait = 99;
      }
    } else if (aSt === 1) {
      const ex = HO.x - HO.gx, ez = HO.z - HO.gz;
      if (ex * ex + ez * ez < 0.1) { aSt = 2; aI = 0; aT = 0.3; HO.goOn = false; }
    } else if (aSt === 2) {
      aT -= dt;
      if (aT <= 0) {
        const sp = (aI & 1) ? CA : HO;
        say(sp, ARG[aI], false); sp.gest = 1.6;
        aI++; aT = 2.3;
        if (aI >= ARG.length) { aSt = 3; aT = 2.6; }
      }
    } else if (aSt === 3) {
      aT -= dt;
      if (aT <= 0) {
        say(CA, 'Hmph. Do not follow me.', false); CA.gest = 1;
        go(CA, 3, -14.5, 3.6, -1); CA.wait = 0;
        say(HO, 'Good! ...Come back.', false); HO.gest = 1.4;
        aSt = 4; aT = 6;
      }
    } else {
      aT -= dt;
      if (aT <= 0) {
        CA.goOn = false; HO.faceN = CA.faceN = null; HO.busy = CA.busy = false; CA.wait = 1;
        aSt = 0; aT = 50 + Math.random() * 25;
      }
    }
    // Assigned profiles do not inherit a legacy director role.
    // chase
    if (reduced || PG.S.name !== 'pigeon' || PI.S.name !== 'pig') return;
    if (cSt === 0) {
      cT -= dt;
      if (cT <= 0 && !PG.busy && !PI.busy) {
        cSt = 1; PG.busy = PI.busy = true;
        cAng = Math.atan2((PI.z - PCZ) / PRZ, (PI.x - PCX) / PRX); cSq = 0;
        say(PG, 'COO! COME HERE, BREAD THIEF!', false); say(PI, 'I did NOT take the bread!', false);
      }
    } else if (cSt === 1) {
      // The pig lives by the school: leave the forecourt through the gate first.
      if (PI.z > 51.5 && Math.abs(PI.x) > 1.2) go(PI, 0, 53, 3.6, -1);
      else go(PI, PCX + Math.cos(cAng + 0.5) * PRX, PCZ + Math.sin(cAng + 0.5) * PRZ, 3.6, -1);
      go(PG, PCX + Math.cos(cAng) * PRX, PCZ + Math.sin(cAng) * PRZ, 3.8, -1);
      const ex = PG.x - PCX - Math.cos(cAng) * PRX, ez = PG.z - PCZ - Math.sin(cAng) * PRZ;
      if (ex * ex + ez * ez < 4) { cSt = 2; cLeft = TAU * 1.6; }
    } else if (cSt === 2) {
      const da = 0.42 * dt; cAng += da; cLeft -= da;
      go(PI, PCX + Math.cos(cAng + 0.5) * PRX, PCZ + Math.sin(cAng + 0.5) * PRZ, 3.6, -1);
      go(PG, PCX + Math.cos(cAng) * PRX, PCZ + Math.sin(cAng) * PRZ, 3.8, -1);
      cSq -= dt;
      if (cSq <= 0) { cSq = 1.8; say(PI, pickFrom(PI, PSQ), true); PG.gest = 0.8; }
      if (cLeft <= 0) { PG.goOn = PI.goOn = false; PG.busy = PI.busy = false; say(PG, 'Coo. I forgot why I was running.', false); say(PI, 'Me too. Snack?', false); cSt = 0; cT = 40; }
    }
  }

  // ---------- update ----------
  const wrapA = (a) => a - TAU * Math.round(a / TAU);
  let pcx = 0, pcy = 0, pcz = 0, havePrev = false, vy = 0, cvx = 0, cvz = 0, cfx = 0, cfz = 1, camZone = 9, cs = 0;
  let lastGestT = null, chasing = 0, warned = false, sitT = 0, sitDone = false, wxMode = '', wxT = 0, wxCd = 40, judgeCd = 8;
  const VIS2 = 40 * 40;
  function warnOnce(where, err) {
    if (warned) return;
    warned = true;
    try { console.warn('[npcs] ' + where + ' failed; further errors are silenced', err); } catch (e) { /* none */ }
  }
  // A throw would make the world drop this module's update for good: contain it here.
  function setStatues(value){
    if(statuesHeld===!!value)return;statuesHeld=!!value;
    statueAudio.setPaused(!!value);comedy?.setPaused?.(!!value);
  }
  function update(dt, frame) {
    stream.update(frame);
    if (ctx.audio?.muted || ctx.scene.userData.questQuiet || ctx.scene.userData.combatState?.active) stopSignatureSpeech();
    if (!frame?.camera) return;
    statueAudio.update(frame.camera);statueDirector.update(dt,frame.camera);
    fabinhe.before(dt,frame);
    npcFrame.camera=frame.camera;npcFrame.level=frame.level;npcFrame.weather=frame.weather;
    if(ctx.scene.userData.npcStatues){setStatues(true);comedy.update(0,npcFrame);effects.update(frame.camera,starMat.rotation);readableBubbles.update(frame.camera);return;}
    setStatues(false);npcTime+=Math.min(.1,Math.max(0,dt));npcFrame.time=npcTime;
    try { comedy.update(dt,npcFrame);personalities.before(dt,npcFrame);step(dt,npcFrame);personalities.after(dt,npcFrame);fabinhe.after(dt,npcFrame);comedy.after();effects.update(frame.camera,starMat.rotation); }
    catch (err) { warnOnce('update', err); }
    readableBubbles.update(frame.camera);
  }

  // The visitor's cheeky gestures (written by main.js); react once per new event.
  function checkGesture() {
    const ud = ctx.scene && ctx.scene.userData;
    const g = ud && ud.lastGesture;
    if (!g || typeof g.time !== 'number' || g.time === lastGestT) return;
    lastGestT = g.time;
    if (typeof performance !== 'undefined' && Math.abs(performance.now() / 1000 - g.time) > 3) return;   // stale
    if (g.name !== 'manguito' && g.name !== 'pirete') { if (g.name === 'dance' || g.name === 'clap') judge(1.0); return; }
    let rank = 0;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      if (n.combatHidden || n.combatControlled || n.zone !== camZone || n.d2 > 64 || n.gestAt > 0 || (n.sillyT >= 0 && n.sillyType === 4)) continue;
      const d = Math.sqrt(n.d2) || 0.01, tx = (n.x - pcx) / d, tz = (n.z - pcz) / d;
      const atThem = cfx * tx + cfz * tz > 0.45;                        // done in their direction
      const sees = -(Math.sin(n.yaw) * tx + Math.cos(n.yaw) * tz) > 0.35;  // or they were looking
      if (!atThem && !sees) continue;
      n.gestAt = 0.25 + d * 0.05 + rank * 0.4 + Math.random() * 0.15; n.gestKind = g.name; rank++;
    }
    if (rank) judge(1.6);
  }
  // The weather: a word from whoever is near when it changes (and now and then).
  function weatherKey() {
    const W = ctx.scene && ctx.scene.userData && ctx.scene.userData.weather;
    const m = W && typeof W.mode === 'string' ? W.mode : '';
    return m === 'storm' ? 'storm' : m === 'night' ? 'night' : m === 'rainbow' ? 'rainbow' : m === 'sunny' || m === 'golden' ? 'sun' : '';
  }
  function nearestIdle(maxD2, skipOnly) {
    let best = null, bd = maxD2;
    for (let i = 0; i < npcs.length; i++) {
      const m = npcs[i];
      if (m.zone !== camZone || m.d2 > bd || m.talkT > 0 || m.busy || (m.sillyT >= 0 && m.sillyType === 4) || (skipOnly && ONLY[m.S.name])) continue;
      best = m; bd = m.d2;
    }
    return best;
  }

  function step(dt, frame) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const camO = frame && frame.camera ? frame.camera : null;
    const cam = camO ? camO.position : null;
    const rawDt=dt,effectNow=performance.now()/1000,fx=ctx.scene.userData.bairroEffects;
    const patience=!!(fx?.patienceUntil>effectNow),monday=!!(fx?.mondayUntil>effectNow);
    clock += dt;
    const time = frame && typeof frame.time === 'number' ? frame.time : clock;
    if (cam) {
      if (havePrev) { vy = (cam.y - pcy) / dt; cvx = (cam.x - pcx) / dt; cvz = (cam.z - pcz) / dt; }
      if (cvx * cvx + cvz * cvz > 400 || vy > 20 || vy < -20) { cvx = 0; cvz = 0; vy = 0; }   // a teleport is not a sprint
      pcx = cam.x; pcy = cam.y; pcz = cam.z; havePrev = true;
      cs = Math.sqrt(cvx * cvx + cvz * cvz);
      const me = camO.matrixWorld && camO.matrixWorld.elements;
      if (me) { const fx = -me[8], fz = -me[10], fl = Math.sqrt(fx * fx + fz * fz); if (fl > 1e-4) { cfx = fx / fl; cfz = fz / fl; } }
      camZone = zoneAt(pcx, pcz, (frame && frame.level) || 0);
      checkGesture();
      // sitting down near someone (eye height of a seated visitor, not moving)
      if (cam.y > 0.6 && cam.y < 1.35 && cs < 0.15) { sitT += dt; if (sitT > 1.5 && !sitDone) { sitDone = true; const m = nearestIdle(20, false); if (m) { say(m, line(m, 'sit'), false); m.toVis = 0; } else judge(0.5); } }
      else if (cam.y > 1.45) { sitT = 0; sitDone = false; }
      // weather small talk
      const wk = weatherKey();
      if (wk !== wxMode) { const first = !wxMode; wxMode = wk; wxT = first ? 0 : 3; }
      wxCd -= dt;
      if (wxT > 0) { wxT -= dt; if (wxT <= 0 && wk) { const m = nearestIdle(81, false); if (m) say(m, line(m, wk), false); } }
      else if (wxCd <= 0 && wk) { wxCd = 70 + Math.random() * 50; const m = nearestIdle(49, false); if (m) say(m, line(m, wk), false); }
      // the constant comic murmur of judgement
      judgeCd -= dt;
      if (judgeCd <= 0) { judgeCd = 7 + Math.random() * 7; judge(0.01); }
    } else camZone = 9;
    if (!comedy) director(dt);
    if (clock - lastSpoke < 8 || ctx.scene.userData.questQuiet) { try { const A = ctx.audio; if (A && (A.muted || ctx.scene.userData.questQuiet)) stopSignatureSpeech(); } catch (e) { /* none */ } }
    starMat.rotation = time * 5;
    let budget = 2;                                        // bubble redraws per frame
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i], S = n.S;
      if(patience&&!n.combatControlled){if(n.pestT>0||n.windT>0)endPest(n,null);n.revengeAt=0;n.windT=0;n.lingerT=0;}
      if(n.combatHidden){n.root.visible=false;n.stars.visible=false;if(n.sprite)n.sprite.visible=false;if(n.blob)n.blob.visible=false;n.col.minY=-51;n.col.maxY=-50;continue;}
      if(n.combatControlled){n.root.visible=true;if(n.sprite)n.sprite.visible=false;n.talkT=0;n.bubble=0;continue;}
      let dx = 0, dz = 0, d2 = 1e9;
      if (cam) { dx = cam.x - n.x; dz = cam.z - n.z; d2 = dx * dx + dz * dz; }
      n.d2 = d2;
      const here = !!cam && n.zone === camZone;
      const vis = d2 < VIS2;
      if (n.root.visible !== vis) {
        n.root.visible = vis;
        if (n.blob) n.blob.visible = vis;
        if (!vis) { n.stars.visible = false; if (n.sprite) n.sprite.visible = false; }
      }
      if (!vis) {
        n.col.minY = -51; n.col.maxY = -50;
        continue; // sleep simulation beyond 40m, retaining state for return
      }
      const sluggish=monday&&!n.fixed&&!n.routineOwned&&!n.fabinhePerforming&&n.sillyT<0&&n.hatState<=0;
      const dt=rawDt*(sluggish?.5:1);
      n.bairroTime+=dt;const time=n.bairroTime;
      const near = here && d2 < 16;
      n.near2 = here && d2 < 225;
      const down = n.sillyT >= 0 && n.sillyType === 4;
      const floor = down && n.fallType >= 0;
      n.reactCd -= dt;
      if (n.talkT > 0) { n.talkT -= rawDt; if (n.talkT <= 0) { n.talkT = 0; n.bubble = 0; } }
      if (n.glare > 0) n.glare -= dt;
      if (n.fist > 0) n.fist -= dt;
      if (n.jerkAt > 0) { n.jerkAt -= dt; if (n.jerkAt <= 0) n.jerk = 1; }
      if (n.jerk > 0) n.jerk = Math.max(0, n.jerk - dt * 5.5);
      if (n.bumpCd > 0) n.bumpCd -= dt;
      if (n.slapCd > 0) n.slapCd -= dt;
      if (n.shakeT > 0) n.shakeT -= dt;
      if (n.lookOverT > 0) n.lookOverT -= dt;
      if (n.lookT > 0) n.lookT -= dt;
      if (n.brace > 0) n.brace -= dt;
      if (n.sqT > 0) n.sqT -= dt;
      if (n.swingT > 0) n.swingT -= dt;
      if (n.snubT > 0) n.snubT -= dt;
      if (n.snapT > 0 && n.freezeT <= 0) n.snapT -= dt;
      if (n.seqStage) {
        n.seqT -= rawDt;
        if (n.seqT <= 0) {
          const k = n.seqKind;
          if (down && k !== 4) n.seqStage = 0;
          else if (n.seqStage === 1 && k !== 4) {
            if (k === 1) bark(n);
            else if (k === 2) { say(n, n.S.pt ? 'Uuuurp.' : 'Buuurp.', false); sfx(n, 'burp'); n.jerk = 0.6; }
            else { say(n, '…', false); sfx(n, 'fart'); n.lookT = 1.4; n.seqRest = line(n, 'who'); }
            n.seqStage = 2; n.seqT = k === 3 ? 1.5 : 0.8;
          } else { n.seqStage = 0; if (!down) say(n, k === 2 ? line(n, 'pardon') : n.seqRest, false); }
        }
      }
      if (n.gestAt > 0) { n.gestAt -= dt; if (n.gestAt <= 0 && !down) reactGesture(n, n.gestKind); }
      if (n.judgeAt > 0) { n.judgeAt -= dt; if (n.judgeAt <= 0 && !down && n.talkT <= 0 && here && d2 < 400) murmur(n); }
      if (n.murmurCd > 0) n.murmurCd -= dt;
      if (n.revengeAt > 0) { n.revengeAt -= dt; if (n.revengeAt <= 0 && !down && here && d2 < 144 && n.pestT <= 0 && canChase(n)) { say(n, line(n, 'wind'), false); startPest(n, 9, 3); } }
      if (n.toVis > 0) { n.toVis -= dt; if (here && d2 > 49 && n.talkT > 0 && !n.busy) { n.toVis = 0; say(n, line(n, 'ignored'), false); if (Math.random() < 0.4) judge(1.2); } }

      // reactions to the visitor
      if (here && n.reactCd <= 0 && !down && d2 > 0.04) {
        const d = Math.sqrt(d2);
        if (d2 < 25 && vy > 2.4) {
          say(n, line(n, 'jump'), false);
          if (!n.fixed) n.kb = 1;
          n.reactCd = 7;
          if (n.sillyT < 0 && !reduced && !n.fixed) startSilly(n, 1, 0.5);
          judge(1.1);
        } else if (d2 < 49 && cs > 5 && -(cvx * dx + cvz * dz) > 0.85 * cs * d) {
          // charged at: the forcado braces as for a bull; the rest flee
          say(n, line(n, 'scream'), false);
          n.reactCd = 9;
          if (ONLY[S.name]) n.brace = 1.8;
          else if (!n.busy && !n.fixed && !reduced) {
            const side = (i & 1) ? 3 : -3;
            go(n, n.x - (dx / d) * 6 - (dz / d) * side, n.z - (dz / d) * 6 + (dx / d) * side, 4.6, 1.8);
            n.wait = 0;
          }
        } else if (d2 < 30 && cs > 4.2 && n.talkT <= 0 && !n.busy) {
          say(n, line(n, 'run'), false); n.reactCd = 8; if (ONLY[S.name]) n.brace = 1.4;
        }
      }
      // the goat's monologues
      n.monoCd -= dt;
      if (n === GO && n.S.name === 'goat' && n.monoCd <= 0 && n.talkT <= 0 && here && d2 < 400 && !down) {
        say(n, pickFrom(n, DRAMA), false, 2.7); n.monoCd = 40 + Math.random() * 20;
      }
      // mutter when the visitor walks close
      n.mutterCd -= dt;
      if (near && d2 < 6.25 && !n.near && n.mutterCd <= 0 && n.talkT <= 0 && !n.busy && !down) {
        if (n.barker && Math.random() < 0.3) midBark(n);
        else if (MURMURERS[S.name] && n.murmurCd <= 0 && Math.random() < 0.4) murmur(n);
        else say(n, line(n, 'talk'), false);
        n.toVis = 3;
        if (Math.random() < 0.3) { n.laughAt = 1.4; n.laughText = ''; }
      }
      n.near = near;
      // now and then, a bark (the two barkers); the forcado calls the bull
      if (n.barker) {
        n.barkCd -= dt;
        if (n.barkCd <= 0) {
          if (here && d2 < 100 && n.talkT <= 0 && !down && !n.seqStage && !n.busy) bark(n);
          else n.barkCd = 5 + Math.random() * 5;
        }
      }
      if (n.barkFit > 0 && n.talkT < 1.4 && !down) { n.barkFit--; bark(n); }
      if (ONLY[S.name]) {
        n.shoutCd -= dt;
        if (n.shoutCd <= 0) { n.shoutCd = 30 + Math.random() * 40; if (here && d2 < 144 && n.talkT <= 0 && !down) { say(n, line(n, 'shout'), true); n.brace = 1.2; } }
      }
      // the rare comic fart, with an offended look around
      n.fartCd -= dt;
      if (n.fartCd <= 0) { n.fartCd = 240 + Math.random() * 300; if (here && d2 < 36 && n.talkT <= 0 && !down && !n.busy && !ONLY[S.name]) beat(n, 3, null, '', 0.05); }
      if (n.kb > 0 && d2 > 0.04) { const d = Math.sqrt(d2); n.x -= (dx / d) * 4 * n.kb * dt; n.z -= (dz / d) * 4 * n.kb * dt; n.kb -= dt * 2; }
      // Nobody ends up inside anybody (the collider is off now and then): shouldered aside.
      if (here && d2 < 0.42 && d2 > 1e-6 && !S.seated) {
        const d = Math.sqrt(d2), k = (0.65 - d) / d;
        n.x -= dx * k; n.z -= dz * k;
        if (n.bumpCd <= 0 && n.talkT <= 0 && !down) { n.bumpCd = 6; say(n, line(n, 'bump'), false); }
      }

      // Following and slapping back. Insistent ones trot alongside at walking pace (a running
      // visitor escapes easily), the angry ones run for three seconds, the revengeful ones walk
      // up to slap back. Linger within 1.2 m and you get one too. Never in front of the visitor's path.
      if (n.windT > 0) {
        n.windT -= dt;
        if (n.windT <= 0) landSlap(n, Math.sqrt(d2));
      } else if (here && !down && !S.seated && d2 < 1.44 && n.slapCd <= 0 && n.talkT < 2 && camZone === 0) {
        n.lingerT += dt;
        if (n.lingerT > (clock - n.grudge < 40 || n.pestMode >= 2 ? 0.3 : 2.4)) windUp(n);
      } else if (n.lingerT > 0) n.lingerT = Math.max(0, n.lingerT - dt);
      if (n.pestT > 0) {
        n.pestT -= dt;
        let hx0 = 0, hz0 = 0;
        if (cam) { hx0 = cam.x - S.home[0]; hz0 = cam.z - S.home[1]; }
        if (down) endPest(n, null);
        else if (!here || camZone !== 0 || d2 > 100 || hx0 * hx0 + hz0 * hz0 > 324) endPest(n, n.pestMode === 1 ? 'lost' : 'tired');
        else if (n.pestT <= 0) endPest(n, n.pestMode === 1 ? 'done' : 'tired');
        else if (n.windT <= 0) {
          const d = Math.sqrt(d2) || 1;
          let fx = cfx, fz = cfz;
          if (cs > 0.8) { fx = cvx / cs; fz = cvz / cs; }
          const sx = -fz * n.pestSide, sz = fx * n.pestSide;
          let px, pz;
          if (n.pestMode !== 1) { px = cam.x - (dx / d) * 0.95; pz = cam.z - (dz / d) * 0.95; }          // right up to you
          else if (cs > 0.8) { px = cam.x + sx * 1.35 - fx * 0.55; pz = cam.z + sz * 1.35 - fz * 0.55; }   // alongside, a step behind
          else { px = cam.x + fx * 1.7 + sx * 0.95; pz = cam.z + fz * 1.7 + sz * 0.95; }          // in view, off to one side
          const lx = px - S.home[0], lz = pz - S.home[1], ll = Math.sqrt(lx * lx + lz * lz);
          if (ll > 14) { px = S.home[0] + (lx * 14) / ll; pz = S.home[1] + (lz * 14) / ll; }
          go(n, px, pz, n.pestMode === 2 ? 3.0 : Math.min(1.6, 0.7 + d * 0.5), -1);
          n.pestSay -= dt;
          if (n.pestSay <= 0) {
            if (n.pestMode === 1) {
              const pp = ONLY[S.name] ? n.talk : S.name === 'mano' ? PEST_MB : S.pt ? PEST_PT : PEST_EN;
              if (n.pestLvl >= pp.length) endPest(n, 'done');
              else { say(n, pp[n.pestLvl], n.pestLvl === pp.length - 1); n.pestLvl++; n.pestSay = 2.8; n.gest = 0.45; n.toVis = 0; }
            } else { say(n, line(n, n.pestMode === 2 ? 'ouch3' : 'wind'), false); n.pestSay = 2.2; n.gest = 0.6; }
          }
        }
      } else if (n.pester && !reduced) {
        n.pestCd -= dt;
        if (here && n.pestCd <= 0 && d2 < 64 && !n.busy && !n.fixed && n.sillyT < 0 && n.reactCd <= 0 && !n.seqStage && canChase(n)) startPest(n, 16, 1);
      }

      // movement
      let moving = false, tyaw = n.yaw;
      if (n.goT > 0) { n.goT -= dt; if (n.goT <= 0) { n.goOn = false; n.goT = -1; } }
      if (n.fabinhePerforming) { moving = false; }
      else if (floor || n.windT > 0) {
        if (n.windT > 0) tyaw = Math.atan2(dx, dz);
      } else if (n.goOn) {
        const ex = n.gx - n.x, ez = n.gz - n.z, ed = Math.sqrt(ex * ex + ez * ez);
        if (ed > 0.1) {
          tyaw = Math.atan2(ex, ez); moving = true;
          if (n.pestT > 0 && d2 < 16) tyaw = Math.atan2(dx, dz);
          const sp = n.gsp * (n.pestT > 0 || Math.abs(wrapA(tyaw - n.yaw)) < 1.2 ? 1 : 0.3), stp = Math.min(ed, sp * dt);
          n.x += (ex / ed) * stp; n.z += (ez / ed) * stp; n.ph += sp * dt * 6;
        } else if (n.pestT > 0) tyaw = Math.atan2(dx, dz);
        else if (n.faceN) tyaw = Math.atan2(n.faceN.x - n.x, n.faceN.z - n.z);
      } else if (n.snubT > 0 && here) {
        tyaw = Math.atan2(-dx, -dz);                       // the cat turns its back on you
      } else if (n.glare > 0 && here) {
        tyaw = Math.atan2(dx, dz);
      } else if (n.faceN) {
        tyaw = Math.atan2(n.faceN.x - n.x, n.faceN.z - n.z);
      } else if (n.fixed) {
        tyaw = (near || n.talkT > 0 || n.brace > 0) && here ? Math.atan2(dx, dz) : n.baseYaw;
      } else if ((near || n.talkT > 0) && here) {
        tyaw = Math.atan2(dx, dz);
      } else if (n.wait > 0) {
        n.wait -= dt;
      } else if (!reduced || n.nPts > 2) {
        const tx = n.pts[n.ti * 2], tz = n.pts[n.ti * 2 + 1];
        const ex = tx - n.x, ez = tz - n.z, ed = Math.sqrt(ex * ex + ez * ez);
        if (ed < 0.15) {
          n.ti = (n.ti + 1) % n.nPts; n.wait = (reduced ? 6 : 1.5) + Math.random() * 4;
        } else {
          tyaw = Math.atan2(ex, ez); moving = true;
          const sp = S.speed * (reduced ? 0.5 : 1) * (Math.abs(wrapA(tyaw - n.yaw)) < 0.8 ? 1 : 0.2);
          const nx = n.x + (ex / ed) * sp * dt, nz = n.z + (ez / ed) * sp * dt, qx = pcx - nx, qz = pcz - nz, q2 = qx * qx + qz * qz;
          if (here && q2 < 0.72 && q2 < d2) { n.ti = (n.ti + 1) % n.nPts; n.wait = 0.6; moving = false; }   // never into the visitor
          else { n.x = nx; n.z = nz; n.ph += sp * dt * 7; }
        }
      } else n.wait = 3;
      // Knocked over and back up: the fixed ones drift back to the spot they guard.
      if (n.fixed) {
        if (n.sillyT < 0 && !n.goOn) {
          const qx = pcx - n.pts[0], qz = pcz - n.pts[1];
          if (!here || qx * qx + qz * qz > 1.44) { const k = Math.min(1, dt * 3); n.x += (n.pts[0] - n.x) * k; n.z += (n.pts[1] - n.z) * k; }
        }
      } else if (!(n.busy && n.pestT <= 0)) keepOut(n);       // the director's routes are their own
      n.yaw += wrapA(tyaw - n.yaw) * Math.min(1, dt * 5);
      // Collider: a box that follows them. Parked when far or behind walls; off on the floor, while
      // stepping aside, following the visitor or running a director's route; never switched on over the visitor.
      if (n.ghostT > 0) n.ghostT -= dt;
      const C = n.col;
      if (!here || d2 > 625) { if (C.maxY > -50) { C.minY = -51; C.maxY = -50; } n.pushT = 0; }
      else {
        if (d2 < 0.64 && !floor) { n.pushT += dt; if (n.pushT > 0.5 && n.windT <= 0) stepAside(n, dx, dz, d2); }
        else if (n.pushT > 0) n.pushT = Math.max(0, n.pushT - dt * 2);
        if (floor || n.ghostT > 0 || n.pestT > 0 || (n.busy && n.goOn) || (C.maxY < 0 && d2 < 0.81)) { if (C.maxY > -50) { C.minY = -51; C.maxY = -50; } }
        else {
          const hw = n.colW;
          C.minX = n.x - hw; C.maxX = n.x + hw; C.minZ = n.z - hw; C.maxZ = n.z + hw; C.minY = n.baseY || 0; C.maxY = C.minY + n.colH;
        }
      }
      if (n.hatState === 1) {
        n.hvy -= 9.8 * dt; const H = n.hat;
        H.position.x += n.hvx * dt; H.position.y += n.hvy * dt; H.position.z += n.hvz * dt;
        H.rotation.z += n.hs * dt; H.rotation.y += n.hs * 0.3 * dt;
        if (H.position.y <= 0.04 && n.hvy < 0) {
          H.position.y = 0.04; n.hvy *= -0.35; n.hvx *= 0.5; n.hvz *= 0.5; n.hs *= 0.5;
          if (n.hvy < 0.8) { n.hatState = 2; n.hatT = 0; H.rotation.x = 0; H.rotation.z = 0.0; }
        }
      } else if (n.hatState === 2) {
        n.hatT += dt;
        if (n.hatT > 2.4) {
          n.hatState = 0;
          if (n.hatReal) { n.head.add(n.hat); n.hat.position.set(0, 0, 0); n.hat.rotation.set(0, 0, 0); n.hat.scale.set(1, 1, 1); } else n.hat.visible = false;
        }
      }
      if (n.laughT > 0) n.laughT -= dt;
      if (n.pointT > 0) { n.pointT -= dt; if (n.pointT <= 0) { if (n.faceN === n.pointAt) n.faceN = null; n.pointAt = null; } }
      if (n.laughAt > 0) {
        n.laughAt -= dt;
        if (n.laughAt <= 0) {
          const code = n.laughText, hy = code === '#N' || code === '#V' || code === '#F';
          if (!down || n.rofl) startLaugh(n, code ? laughLine(n, code) : '', hy);
          n.laughText = '';
        }
      }
      n.laughCd -= dt;
      if (n.laughCd <= 0) {
        if (near && n.talkT <= 0 && n.laughT <= 0 && n.sillyT < 0 && !n.busy) startLaugh(n, line(n, 'ha'), false);
        n.laughCd = 15 + Math.random() * 15;
      }
      if (!vis) {
        // far away: keep the clock of a fall running, skip everything visual
        if (n.sillyT >= 0) { if (n.freezeT > 0) n.freezeT -= dt; else n.sillyT += dt; if (n.sillyT >= n.sillyDur) { n.sillyT = -1; n.impT = -1; n.rofl = false; n.meant = true; } }
        continue;
      }

      // silly animations
      n.sillyCd -= dt;
      if (n.sillyT < 0 && n.sillyCd <= 0 && n.talkT <= 0 && !n.busy) {
        n.sillyCd = 8 + Math.random() * 10;
        let ty = (Math.random() * 4) | 0;
        if (ty === 3 && S.name !== 'horse') ty = 1;
        if (S.name === 'horse' && Math.random() < 0.4) ty = 3;
        if (reduced && (ty === 0 || ty === 3)) ty = 2;
        if (n.fixed) ty = 2;
        startSilly(n, ty, ty === 0 ? 0.9 : ty === 1 ? 0.6 : ty === 2 ? 1.0 : 3.0);
      }
      let hop = 0, shake = 0, spin = 0, squash = 0, tilt = 0;
      let roll = 0, dip = 0, legsUp = 0, kneel = 0, sit = 0, crumple = 0, armF = 0, armsFwd = 0, flail = 0, twitch = 0, plank = 0;
      if (n.sillyT >= 0) {
        if (n.sillyType === 4 && n.freezeT > 0) { n.freezeT -= dt; shake = Math.sin(time * 70) * 0.04; }
        else n.sillyT += dt;
        const u = n.sillyT / n.sillyDur;
        if (u >= 1) { n.sillyT = -1; n.impT = -1; n.rofl = false; }
        else if (n.sillyType === 0) spin = E(u) * TAU;
        else if (n.sillyType === 1) { hop = Math.sin(u * Math.PI) * 0.45; squash = Math.sin(u * Math.PI * 2) * 0.04; }
        else if (n.sillyType === 2) shake = Math.sin(u * 34) * 0.6 * (1 - u);
        else if (n.sillyType === 4) {
          const ft = n.fallType;
          if (ft < 0) {
            if (n.slapSpin) { const q = Math.min(1, u / 0.55); spin = E(q) * TAU * n.slapTurns; hop = Math.sin(q * Math.PI) * 0.2; }
            else tilt = -0.4 * Math.sin(u * Math.PI * 3) * (1 - u);
            shake += Math.sin(u * 40) * 0.5 * (1 - u);
          } else if (n.freezeT <= 0) {
            const a = FALL_A[ft], b = FALL_B[ft], c = FALL_C[ft];
            const d = u < a ? E(u / a) : u < b ? 1 : u < c ? 1 - E((u - b) / (c - b)) : 0;
            if (u >= b && u < c) flail = Math.sin(Math.PI * (u - b) / (c - b));
            if (!n.whistled) {
              n.whistled = true;
              if (ft === 3) n.whistleAt = 0.5;                           // the timber whistles later
              else sfx(n, ft === 6 ? 'whistle' : ft === 1 ? 'whistleUp' : ft === 2 ? 'whirr' : ft === 4 ? 'skid' : '', IMPACT[ft] * n.sillyDur);
            }
            if (n.whistleAt > 0 && u >= n.whistleAt) { n.whistleAt = 0; sfx(n, 'whistle', (IMPACT[3] - 0.5) * n.sillyDur); }
            if (u >= IMPACT[ft] && !n.thud) { comedy?.notify('fall',n); n.thud = true; n.impT = n.sillyT; sfx(n, 'thud'); if (ft === 5 || ft === 0) sfx(n, 'boing'); n.sqT = 0.3; }
            if (ft === 0) { tilt = -1.6 * d; if (u > a && u < b) { legsUp = 1; tilt += Math.sin(u * 90) * 0.01; } }
            else if (ft === 1) {
              if (u < a) { const q = u / a; roll = -TAU * E(q) * n.fallDir; hop = Math.sin(E(q) * Math.PI) * 0.9; const v = 1.4 * 6 * q * (1 - q) / (a * n.sillyDur) * dt * n.fallDir; n.x += Math.cos(n.yaw) * v; n.z -= Math.sin(n.yaw) * v; }
              else { sit = d; dip = -0.62 * d; }
            } else if (ft === 2) {
              // spin and topple: two turns, then over sideways like a felled skittle
              if (u < a) { spin = E(u / a) * TAU * 2; hop = Math.sin((u / a) * Math.PI) * 0.15; }
              else { roll = 1.5 * n.fallDir * d; crumple = d * 0.4; }
              dip = -0.2 * crumple;
            } else if (ft === 3) {
              if (u < 0.3) { const l = E(u / 0.3); tilt = -0.35 * l; armF = l; }
              else if (u < 0.5) { const k = E((u - 0.3) / 0.2); tilt = -0.35 * (1 - k) + 0.1 * k; dip = -0.4 * k; kneel = k; armF = 1 - k; }
              else if (u < 0.8) { const f = E((u - 0.5) / 0.18); tilt = 0.1 + 1.5 * f; dip = -0.4 * (1 - f); kneel = 1 - f; }
              else tilt = 1.6 * (1 - E((u - 0.8) / 0.2));
            } else if (ft === 4) {
              tilt = 1.5 * d; armsFwd = d;
              if (u < b) { const v = 3.2 * (1 - E(u / b)) * dt; n.x += Math.sin(n.yaw) * v; n.z += Math.cos(n.yaw) * v; }
            } else if (ft === 5) {
              // launched: up, spinning, limbs everywhere; flat on the back, a twitch or two
              if (u < a) { const q = u / a; hop = Math.sin(q * Math.PI) * 1.25; spin = E(q) * TAU * 2; tilt = -1.55 * E(q); roll = Math.sin(q * Math.PI) * 0.7 * n.fallDir; flail = 1; }
              else { tilt = -1.55 * d; if (u < b) twitch = 1; }
            } else {
              // stiff plank: rigid as a board, accelerating like a felled tree, and back up the same way
              plank = 1;
              const q = u < a ? u / a : 1;
              tilt = n.fallDir * 1.55 * (u < a ? q * q : u < b ? 1 : 1 - E((u - b) / (c - b)));
              flail = 0;
            }
            // a rubber-ball bounce off the floor
            if (n.impT >= 0 && ft !== 1 && !reduced) {
              const bt = n.sillyT - n.impT;
              if (bt < 0.9) { const bb = Math.abs(Math.sin(bt * 10.5)) * Math.exp(-bt * 5) * (ft === 5 ? 0.34 : ft === 6 ? 0.12 : 0.2); hop += bb; squash -= bb * 0.3; }
            }
          }
          const gu = ft < 0 ? 0.5 : FALL_B[ft];
          if (u > gu && !n.meant) { n.meant = true; getUp(n); }
        } else {
          // slapstick trip: stumble, face-plant, rise with dignity
          if (u < 0.18) tilt = (u / 0.18) * 1.45;
          else if (u < 0.6) tilt = 1.45 + Math.sin(u * 40) * 0.02;
          else if (u < 0.85) tilt = 1.45 * (1 - (u - 0.6) / 0.25);
          if (u > 0.86 && !n.meant) { n.meant = true; say(n, pickFrom(n, TRIP), false); }
        }
      }
      if (n.gest > 0) { n.gest -= dt; hop += Math.abs(Math.sin(time * 12)) * 0.08; shake += Math.sin(time * 25) * 0.3; }
      if (floor && !n.fixed && !(n.busy && n.pestT <= 0)) keepOut(n);
      // squash and stretch on impact (the slap, the floor)
      if (n.sqT > 0) { const q = 0.3 - n.sqT; squash += 0.3 * Math.exp(-q * 9) * Math.cos(q * 32); }
      // the forcado's bullring: stamping, calling the bull, bracing for the charge, a proud turn to the crowd
      let bx0 = 0, bz0 = 0, bx1 = 0, bz1 = 0, bdip = 0, blean = 0, byaw = 0, bstamp = 0, bpose = false;
      if (S.proud && !down && n.talkT <= 0 && n.gest <= 0 && n.windT <= 0) {
        bpose = true;
        const P = n.brace > 0 ? 2 : ((time * 0.33 + n.seed) % 4), k = n.brace > 0 ? 0 : P - Math.floor(P), w0 = 1 - E((k - 0.75) / 0.25);
        const a = n.brace > 0 ? 2 : Math.floor(P), b = (a + 1) % 4;
        for (let s = 0; s < 2; s++) {
          const p = s === 0 ? a : b, wt = s === 0 ? w0 : 1 - w0;
          if (wt <= 0) continue;
          if (p === 0) { bx0 += 0.25 * wt; bz0 -= 0.55 * wt; bx1 += 0.25 * wt; bz1 += 0.55 * wt; bstamp += wt; blean -= 0.12 * wt; }          // chest out, stamping
          else if (p === 1) { bx0 -= 0.4 * wt; bz0 -= 1.35 * wt; bx1 -= 0.4 * wt; bz1 += 1.35 * wt; blean += 0.12 * wt; }                   // arms spread: "eh, toiro!"
          else if (p === 2) { bx0 -= 1.25 * wt; bz0 -= 0.2 * wt; bx1 -= 1.25 * wt; bz1 += 0.2 * wt; bdip -= 0.24 * wt; blean += 0.3 * wt; }  // crouch and brace
          else { bx0 += 0.25 * wt; bz0 -= 0.5 * wt; bx1 -= 2.7 * wt; bz1 += 0.1 * wt; byaw += Math.sin(time * 0.9) * 0.8 * wt; blean -= 0.1 * wt; } // a proud turn to the crowd
        }
      }

      // pose
      n.walk += ((moving ? 1 : 0) - n.walk) * Math.min(1, dt * 8);
      const w = n.walk, ph = n.ph, sw = Math.sin(ph);
      const breathe = Math.sin(time * 1.8 + n.seed) * 0.012;
      const at = tilt < 0 ? -tilt : tilt, rt = roll < 0 ? -roll : roll, lyA = Math.max(at, rt);
      const lift = lyA > 1 ? 0.2 * n.sz * Math.min(1, (lyA - 1) / 0.5) : 0;
      const jk = n.jerk * n.jerk * (reduced ? 0.4 : 1);
      const rootY = hop + n.baseY + dip + bdip + lift + (bstamp > 0 ? Math.abs(Math.sin(time * 9)) * 0.03 * bstamp : 0);
      n.root.position.set(n.x, rootY, n.z);
      n.root.rotation.y = n.yaw + spin + byaw;
      n.root.rotation.x = tilt;
      n.root.rotation.z = roll;
      n.body.position.y = n.bodyY0 + Math.abs(sw) * 0.04 * w + breathe + jk * 0.03;
      n.body.scale.set((1 + squash) * n.fat, 1 - squash, (1 + squash) * n.fat);
      const run = n.gsp > 2.5 && n.goOn ? 1.5 : 1;
      n.legs[0].rotation.x = sw * 0.6 * w * run - hop * 0.8 + (bstamp > 0 ? Math.max(0, Math.sin(time * 9)) * -0.5 * bstamp : 0);
      n.legs[1].rotation.x = -sw * 0.6 * w * run - hop * 0.8 + (bstamp > 0 ? Math.max(0, -Math.sin(time * 9)) * -0.5 * bstamp : 0);
      if (bdip < 0) { n.legs[0].rotation.x -= 0.9 * -bdip / 0.24 * 0.5; n.legs[1].rotation.x += 0.5 * -bdip / 0.24 * 0.5; }
      if (S.seated) { n.legs[0].rotation.x = -1.5; n.legs[1].rotation.x = -1.5; }
      const idle = Math.sin(time * 1.5 + n.seed) * 0.03;
      n.arms[0].rotation.x = -sw * 0.55 * w * run + idle;
      n.arms[1].rotation.x = sw * 0.55 * w * run - (n.talkT > 0 ? n.armUp : 0) + idle;
      n.arms[1].rotation.z = n.talkT > 0 ? -0.2 + Math.sin(time * 9) * 0.2 : 0;
      n.arms[0].rotation.z = hop > 0 ? 0.9 : 0;
      if (n.gest > 0) {
        const f = Math.sin(time * 18) * 0.7;
        n.arms[0].rotation.x = -2.2 + f; n.arms[1].rotation.x = -2.2 - f;
        n.arms[0].rotation.z = 0.5; n.arms[1].rotation.z = -0.5;
      }
      if (S.phone && n.talkT <= 0 && n.gest <= 0) {
        n.arms[1].rotation.x = -1.5 + Math.sin(time * 5 + n.seed) * 0.5; n.arms[1].rotation.z = 0.3 + Math.sin(time * 3.3) * 0.4;
      }
      if (S.proud) {
        n.body.rotation.x = -0.08 + blean;
        if (bpose) { const A = n.arms; A[0].rotation.x = bx0; A[0].rotation.z = bz0; A[1].rotation.x = bx1; A[1].rotation.z = bz1; }
      }
      if (floor) {
        const L0 = n.legs[0], L1 = n.legs[1], A0 = n.arms[0], A1 = n.arms[1];
        const fl = Math.sin(time * 22) * flail;
        if (legsUp > 0) { L0.rotation.x = L1.rotation.x = -1.5; }
        else if (sit > 0) { L0.rotation.x = L1.rotation.x = -1.5 * sit; }
        else if (crumple > 0) { L0.rotation.x = L1.rotation.x = -1.1 * crumple; }
        else if (kneel > 0) { L0.rotation.x = -1.5 * kneel; L1.rotation.x = 0.5 * kneel; }
        if (twitch > 0) { const tw = Math.sin(time * 3.3 + n.seed) > 0.55 ? Math.sin(time * 38) * 0.35 : 0; L0.rotation.x = -0.2 + tw; L1.rotation.x = -0.2 - tw; }
        if (plank > 0) { L0.rotation.x = L1.rotation.x = 0; A0.rotation.x = A1.rotation.x = 0; A0.rotation.z = -0.06; A1.rotation.z = 0.06; }
        if (flail > 0) { L0.rotation.x += fl * 0.5; L1.rotation.x -= fl * 0.5; A0.rotation.x = fl * 1.3 - 1.2; A1.rotation.x = -fl * 1.3 - 1.2; A0.rotation.z = -0.5; A1.rotation.z = 0.5; }
        if (armF > 0) { A1.rotation.x = -2.7 * armF; A1.rotation.z = 0.2; }
        if (armsFwd > 0) { A0.rotation.x = A1.rotation.x = -2.8 * armsFwd; }
        if (n.freezeT > 0) { A0.rotation.z = -0.45; A1.rotation.z = 0.45; }          // frozen, arms slightly out: did that just happen?
      }
      const look = near ? 0 : Math.sin(time * 0.45 + n.seed * 3) * 0.35 * (1 - w);
      const snap = n.snapT > 0 ? (n.freezeT > 0 ? 1 : E(n.snapT / 0.55)) : 0;
      n.head.rotation.y = look + shake + n.snapDir * 1.2 * snap + (n.shakeT > 0 ? Math.sin(time * 13) * 0.32 * Math.min(1, n.shakeT) : 0) + (n.lookT > 0 ? Math.sin((1.4 - n.lookT) * 8) * 1.0 : 0);
      n.head.rotation.x = Math.sin(ph * 2) * 0.05 * w + (n.talkT > 0 ? Math.sin(time * 14) * 0.06 : 0) - (n.talkT > 0 && n.armUp > 2 ? 0.35 : 0) - (S.proud ? 0.1 : 0) - (armF > 0 ? 0.3 * armF : 0) - jk * 0.55
        + (n.lookOverT > 0 ? Math.sin((1.6 - n.lookOverT) / 1.6 * TAU) * 0.32 : 0);
      n.head.rotation.z = flail > 0 ? Math.sin(time * 17 + n.seed) * 0.35 * flail : 0;
      n.head.position.z = (S.bob ? Math.sin(ph * 2) * 0.05 * w : 0) + jk * 0.05;
      {
        const lau = n.laughT > 0 && (!floor || n.rofl);
        const pnt = n.pointT > 0 && !floor;
        n.body.rotation.z = lau ? Math.sin(time * 34) * 0.045 : 0;
        if (lau) {
          n.body.rotation.x = 0.12 + Math.sin(time * 5) * 0.12; n.body.position.y += Math.abs(Math.sin(time * 17)) * 0.03;
          n.head.rotation.x -= 0.45; n.head.rotation.y += Math.sin(time * 34) * 0.08;
          n.arms[0].rotation.x = -0.35 + Math.sin(time * 14) * 0.5; n.arms[0].rotation.z = 0.15;
          if (!pnt) { n.arms[1].rotation.x = -0.35 - Math.sin(time * 14) * 0.5; n.arms[1].rotation.z = -0.15; }
        } else if (!S.proud) n.body.rotation.x = 0;
        if (pnt) { n.arms[1].rotation.x = -1.55; n.arms[1].rotation.z = 0.12; }
      }
      if (!floor) {
        const A0 = n.arms[0], A1 = n.arms[1];
        // offended: hands on hips, chin up — or an old fist shaken at the visitor
        if (n.fist > 0) { A1.rotation.x = -2.55 + Math.sin(time * 21) * 0.28; A1.rotation.z = 0.12; n.body.rotation.x = 0.1; n.head.rotation.x += 0.12; }
        if (n.glare > 0 && n.gest <= 0 && n.laughT <= 0 && n.windT <= 0) {
          A0.rotation.x = 0.3; A0.rotation.z = -0.6;
          if (n.fist <= 0) { A1.rotation.x = 0.3; A1.rotation.z = 0.6; }
          n.head.rotation.x -= 0.22;
        }
        // the wind-up (arm high and back, leaning away) and the swing across
        if (n.windT > 0) { const q = 1 - n.windT / 0.55; A1.rotation.x = -2.9 * E(q * 2); A1.rotation.z = 0.9 * E(q * 2); n.body.rotation.x = -0.15 * E(q * 2); n.body.rotation.y = 0.35 * E(q * 2); }
        else if (n.swingT > 0) { const q = n.swingT / 0.3; A1.rotation.x = -1.5; A1.rotation.z = -0.9 * q; n.body.rotation.y = -0.4 * q; }
        else n.body.rotation.y = 0;
      } else n.body.rotation.y = 0;

      let mondayMouth=0;
      if(sluggish&&!n.busy&&n.talkT<=0){const phase=(time+n.seed)%11;
        if(phase<1.2){const yawn=Math.sin(phase/1.2*Math.PI);mondayMouth=.4*yawn;n.arms[1].rotation.x-=.8*yawn;}
        if(moving&&!reduced&&phase>8&&phase<8.45){const stumble=Math.sin((phase-8)/.45*Math.PI);n.body.position.y-=.08*stumble;n.legs[1].rotation.x+=.3*stumble;}
      }
      n.rig.setExpression(n.talkT > 0 ? 0.3 + 0.3 * Math.sin(npcTime * 14) : mondayMouth,
        n.glare > 0 ? 1 : n.laughT > 0 ? -0.5 : 0);
      // where the head is, without a matrix update (root order YXZ: yaw, tilt, roll)
      const yawR = n.yaw + spin + byaw, hh = (n.body.position.y + n.headY) * n.sz;
      const ha = -hh * Math.sin(roll), hb = hh * Math.cos(roll), hc = hb * Math.sin(tilt);
      const cy = Math.cos(yawR), sy = Math.sin(yawR);
      const hx = n.x + ha * cy + hc * sy, hy = rootY + hb * Math.cos(tilt), hz = n.z - ha * sy + hc * cy;
      // Screen-space layout is shared, after every actor has updated.
      const st = down && !n.rofl && n.sillyT < n.sillyDur * 0.85;
      if (n.stars.visible !== st) n.stars.visible = st;
      if (st) n.stars.position.set(hx, hy + 0.3 * n.hs * n.sz, hz);
      if (n.blob) {
        const ly = Math.min(1, lyA / 1.4), s = (0.8 + 0.7 * ly) * n.fat * n.sz * Math.max(0.45, 1 - hop * 0.5);
        n.blob.position.set(n.x + (hx - n.x) * 0.5 * ly, 0.02, n.z + (hz - n.z) * 0.5 * ly);
        n.blob.scale.set(s, 1, s);
      }
    }
  }

  // ---------- slap (click) and talk (E) ----------
  let slapN = 0;
  function findNpc(object) {
    for (let o = object; o; o = o.parent) { const n = o.userData && o.userData.npc; if (n) return n; }
    return null;
  }
  function nextFall(n) {
    let f = (Math.random() * 7) | 0;
    if (f === n.lastFall) f = (f + 1 + ((Math.random() * 6) | 0)) % 7;
    n.lastFall = f;
    return f;
  }
  function slap(object) { if(ctx.scene.userData.npcStatues)return;try { doSlap(findNpc(object)); } catch (err) { warnOnce('slap', err); } }
  function doSlap(n) {
    if (!n) return;
    comedy?.notify('slap', n);
    fabinhe.onSlap(n);
    const S = n.S;
    n.seqStage = 0; n.gestAt = 0; n.windT = 0; n.judgeAt = 0;
    if (n.pestT > 0) endPest(n, null);
    n.pestCd = Math.max(n.pestCd, 40);
    if (clock - n.lastSlapT > 30) n.slaps = 0;
    n.slaps++; n.lastSlapT = clock; n.grudge = clock;
    let impact;
    if (n.sillyT >= 0 && n.sillyType === 4 && n.fallType >= 0) {
      const ft = n.fallType, dur = n.sillyDur;
      if (n.sillyT >= IMPACT[ft] * dur) {
        // Already down: flattened again, another bounce, and getting up has to wait.
        n.sillyT = Math.max(IMPACT[ft] * dur + 0.02, Math.min(n.sillyT, FALL_B[ft] * dur - 0.7));
        n.impT = n.sillyT; n.meant = false; n.rofl = false; n.sqT = 0.3;
        impact = 0.05;
      } else impact = IMPACT[ft] * dur - n.sillyT + n.freezeT;   // still in the air: the yelp is all they get
    } else {
      n.slapSpin = !reduced && ((slapN++ & 1) === 0);
      n.slapTurns = 1 + ((Math.random() * 2) | 0);
      n.fallType = S.seated ? -1 : reduced ? 3 : nextFall(n);
      n.fallDir = Math.random() < 0.5 ? -1 : 1; n.thud = false; n.whistled = false; n.whistleAt = 0; n.impT = -1; n.rofl = false;
      startSilly(n, 4, n.fallType < 0 ? 2.8 : FALL_D[n.fallType]);
      n.freezeT = n.fallType < 0 || reduced ? 0 : FREEZE;          // a beat of frozen disbelief
      n.gest = n.fallType < 0 ? 1.4 : 0;
      impact = n.fallType < 0 ? 0.25 : IMPACT[n.fallType] * n.sillyDur + n.freezeT;
    }
    // the face takes it: squash, the head snaps round
    n.sqT = 0.3; n.snapT = reduced ? 0 : 0.55; n.snapDir = Math.random() < 0.5 ? -1 : 1;
    n.sillyCd = 9; n.glare = 0; n.fist = 0; n.lingerT = 0;
    const k = n.slaps >= 3 ? 'ouch3' : n.slaps === 2 ? 'ouch2' : 'ouch';
    if (n.slaps >= 3) n.escalate = true;
    if (n.barker && Math.random() < 0.4) bark(n);       // the reply to a slap, sometimes: deadpan
    else { say(n, line(n, k), false); if (!personalities.sound('slap', n)) noise(n); }
    personalities.onEvent('slap', n);
    flush(n);
    whack(n, n.slaps >= 2);
    hysterics(n.x, n.z, n.zone, n, impact, false);
    judge(impact + 1.2);
    for (let i = 0; i < npcs.length; i++) {
      const m = npcs[i];
      if (m !== n && m.S.pt && !ONLY[m.S.name] && m.zone === n.zone && m.d2 < 100 && Math.random() < 0.5) { m.laughAt = impact + 1.7; m.laughText = pickFrom(m, TROMBA); m.glare = 3.5; break; }
    }
    if (n.hatState === 0) {
      const H = n.hat; group.add(H); H.visible = true; H.scale.setScalar(n.hs * n.sz); H.rotation.set(0, 0, 0);
      H.position.set(n.x, n.baseY + (n.bodyY0 + n.headY) * n.sz, n.z);
      const ax = n.x - pcx, az = n.z - pcz, d = Math.sqrt(ax * ax + az * az) || 1;
      n.hvx = (ax / d) * 2 + (Math.random() - 0.5) * 2.4; n.hvz = (az / d) * 2 + (Math.random() - 0.5) * 2.4;
      n.hvy = 4 + Math.random() * 1.5; n.hs = (Math.random() - 0.5) * 22; n.hatState = 1;
    }
  }

  function onPick(object) { if(ctx.scene.userData.npcStatues)return;try { talk(findNpc(object)); } catch (err) { warnOnce('talk', err); } }
  function talk(n) {
    if (!n) return;
    if (fabinhe.onTalk(n)) return;
    const S = n.S;
    n.seqStage = 0; n.lingerT = 0;
    if (n.windT > 0) return;                                   // mid wind-up: no time for chat
    if (n.pestT > 0) { endPest(n, 'talk'); flush(n); noise(n); n.lastTalk = clock; return; }   // finally listened to: they leave happy
    if (n.sillyT >= 0 && n.sillyType === 4) {
      // still down: an answer from the floor, without getting up
      if (n.barker && Math.random() < 0.35) bark(n);
      else say(n, line(n, 'floor'), true);
      flush(n);
      return;
    }
    personalities.onEvent('talk', n);
    comedy?.notify('talk', n);
    const again = clock - n.lastTalk < 25;
    n.lastTalk = clock;
    if (S.name === 'cat' && Math.random() < 0.25) {
      // the cat ignores you on purpose, and somebody enjoys it
      say(n, '…', false); n.snubT = 2.4;
      const m = nearestIdle(100, true);
      if (m && m !== n) { m.laughAt = 0.9; m.laughText = Math.random() < 0.5 ? 'Ahah, já levaste na boca!' : 'Já levaste na boca, já!'; }
    } else if (n === GO && n.S.name === 'goat' && Math.random() < 0.5) say(n, pickFrom(n, DRAMA), true, 2.7);
    else if (again && Math.random() < 0.55) say(n, line(n, 'again'), true);
    else if (n.barker && Math.random() < 0.35) midBark(n);
    else if (ONLY[S.name] && Math.random() < 0.12) { say(n, line(n, 'shout'), true); n.brace = 1.2; }
    else {
      say(n, line(n, 'talk'), true);
      if (BURPERS[S.name] && Math.random() < 0.15) beat(n, 2, null, '', 1.1);
    }
    flush(n);
    n.toVis = 3;
    if (Math.random() < 0.4 && !n.seqStage) { n.laughAt = 1.5; n.laughText = ''; }
    if (n.sillyT < 0) { const ty = (reduced || n.fixed) ? 2 : (Math.random() * 3) | 0; startSilly(n, ty, ty === 0 ? 0.9 : 0.8); }
    n.sillyCd = 6 + Math.random() * 6;
  }

  function combatImpact(n,ko,move){
    if(!n||ctx.scene.userData.npcStatues||ctx.scene.userData.questQuiet)return;
    n.glare=0;n.escalate=false;n.pestCd=Math.max(60,n.pestCd);n.sillyCd=8;
    if(move==='chapada'||move==='reves'||move==='sanduiche')fabinhe.onSlap(n);
    if(ko)comedy?.defeat?.(n);
    else if(move==='chapada'||move==='reves'||move==='sanduiche')comedy?.notify?.('slap',n);
  }
  function dispose(){stream.dispose();readyListeners.clear();stopSignatureSpeech();comedy.dispose();personalities.dispose();fabinhe.dispose();statueDirector.dispose();statueAudio.dispose();}
  return { group, regions: [], colliders, pickables, update, onPick, slap, fabinhe,dispose, setNavigation: personalities.setNavigation,
    statueDirector,statueAudio,actorSlots:slots,onActorReady,stream,actors:npcs,combatActors:npcs,findActor:findNpc,reconcileActor,combatImpact,setStatues,refreshEffects:(camera)=>effects.update(camera,starMat.rotation),get comedyMemory(){return comedy.memory;} };

}

// Synchronous empty shell: no actor module imports, canvases, fonts or cast requests.
export function build(ctx){
  const group=new ctx.THREE.Group();group.name='npcs';
  const shell={actors:[],pickables:[],slots:[],listeners:new Set(),colliders:Array.from({length:14},()=>({minX:0,maxX:0,minZ:0,maxZ:0,minY:-51,maxY:-50}))};
  let ready=null,loading=false,disposed=false,navigation=null,clock=0,retryAt=0,attempts=0;
  let statues=!!ctx.scene.userData.npcStatues;
  function onActorReady(fn){shell.listeners.add(fn);return()=>shell.listeners.delete(fn);}
  function update(dt,frame){
    if(disposed)return;
    if(ready){ready.update(dt,frame);return;}
    if(Number.isFinite(frame?.time))clock=frame.time;
    if(loading||attempts>=3||clock<retryAt||ctx.startup&&!ctx.startup.moved)return;
    loading=true;attempts++;shell.slots.length=0;
    Promise.resolve().then(()=>buildReady({...ctx,__npcShell:shell})).then(out=>{
      if(disposed){out.dispose();return;}ready=out;
      statues=!!ctx.scene.userData.npcStatues;out.setStatues(statues);
      group.add(out.group);if(navigation)out.setNavigation(navigation);
    }).catch(error=>{loading=false;retryAt=clock+3;if(disposed)return;ctx.onActorError?.('npcs',error);console.warn('[npcs] startup attempt '+attempts+'/3',error);});
  }
  const api={group,regions:[],colliders:shell.colliders,pickables:shell.pickables,actors:shell.actors,combatActors:shell.actors,actorSlots:shell.slots,onActorReady,update,
    setNavigation(world){navigation=world;ready?.setNavigation(world);},
    dispose(){disposed=true;shell.listeners.clear();ready?.dispose();},
    get fabinhe(){return ready?.fabinhe;},get statueDirector(){return ready?.statueDirector;},get statueAudio(){return ready?.statueAudio;},get stream(){return ready?.stream;},get comedyMemory(){return ready?.comedyMemory;}};
  api.onPick=(a,b)=>ready?.onPick(a,b);api.slap=(a,b)=>ready?.slap(a,b);api.findActor=a=>ready?.findActor(a);
  api.reconcileActor=a=>ready?.reconcileActor(a);api.combatImpact=(a,b,c,d)=>ready?.combatImpact(a,b,c,d);
  api.setStatues=a=>{statues=!!a;ctx.scene.userData.npcStatues=statues;ready?.setStatues(statues);};api.refreshEffects=a=>ready?.refreshEffects(a);
  return api;
}
