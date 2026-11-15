// THE WORKSHOP — integration.
//
// Wires the room (room.js, post.js), the visitor (controls.js), the interface
// (ui.js) and the curator (curator.js) together. The one idea everything here
// serves: the room measures what you look at, and while you are looking
// elsewhere it re-hangs the walls you cannot see with works that resemble what
// held your gaze. See docs/gallery/BRIEF.md.
import * as THREE from 'three';
import { WORKS } from './catalogue.js';
import { createCurator, initialHang, encodeShow, decodeShow, titleFor } from './curator.js';
import { createRoom, SLOTS, EYE_HEIGHT, START } from './room.js';
import { createPost } from './post.js';
import { createPerf, deviceProfile } from './perf.js';
import { loadWorkTexture } from './textures.js';
import { createControls } from './controls.js';
import { createUI, showFallback } from './ui.js';
import { createAudio } from './audio.js';
import { createMaterials } from './materials.js';
import { createWorld, areaAt } from './world.js';
import { groundAt } from './collision.js';
import { createProps } from './props.js';

// Canvas roundRect arrived in Safari 16; NPC speech bubbles and the poster use it.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.max(0, Math.min(typeof r === 'number' ? r : (Array.isArray(r) ? r[0] || 0 : 0), w / 2, h / 2));
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const byId = new Map(WORKS.map(w => [w.id, w]));
const slotKinds = SLOTS.map(s => ({ index: s.index, id: s.id, kind: s.kind }));

// ---------------------------------------------------------------- tuning --

const GAZE_OUTER = Math.cos(THREE.MathUtils.degToRad(15)); // edge of the gaze cone
const GAZE_INNER = Math.cos(THREE.MathUtils.degToRad(5));  // fully "looking at"
const GAZE_NEAR = 7;          // full weight within this distance (m)
const GAZE_FAR = 16;          // no weight beyond this distance
const SAFE_AFTER = 1.2;       // a slot unseen this long may be re-hung (s)
const REHANG_EVERY = 0.5;     // curator poll interval (s)
const LABEL_AFTER = 0.35;     // dwell before the wall label appears (s)
const LABEL_LINGER = 1.6;     // label stays this long after the gaze leaves (s)
// Walking order used by Previous / Next in focus: left wall from the door to
// the end, the hero, the right wall back, then the door wall.
const TOUR = [6, 5, 4, 3, 2, 1, 0, 7, 8, 9, 10, 11, 12, 14, 13].filter((i) => i < SLOTS.length);
const RELAYS = 7;             // banks of track spots heard switching on at entry

const SCREEN_SITES = [
  { label: 'SayWhat', detail: 'desert crossing', url: 'https://pedrohfernandes-klk.github.io/SayWhat/' },
  { label: 'No Worries', detail: 'HrM', url: 'https://pedrohfernandes-klk.github.io/NO-WORRIES/' },
  { label: 'Português', detail: 'EPI', url: 'https://pedrohfernandes-klk.github.io/pt/' },
  { label: 'Lente', detail: 'EPI 2026/2027', url: 'https://pedrohfernandes-klk.github.io/lente/' },
];
const YOUTUBE = { label: 'YouTube (opens a new tab)', url: 'https://www.youtube.com/', newTab: true };

// ------------------------------------------------------------- the visit --

function readSharedShow() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const text = hash.get('show');
  if (!text) return null;
  const decoded = decodeShow(text, WORKS, SLOTS.length);
  if (!decoded) return null;
  const on = hash.get('on');
  const date = on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(`${on}T12:00:00`) : null;
  return { ...decoded, date: date && !isNaN(date) ? date : null };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function isoDay(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// The tier is fixed for the visit (it selects geometry density and the texture
// set at load); resolution and the expensive passes are the governor's
// (perf.js), which adapts from there.
//   high   1k maps: discrete GPUs, Apple silicon, strong desktops
//   medium 512 px maps, same scene: typical laptops, incl. 4-core with integrated graphics
//   low    lighter scene: phones, very low memory, software rendering
function pickQuality() {
  const q = params.get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  const d = deviceProfile(renderer);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  if ((coarse && small) || d.phone || (d.mem && d.mem <= 2) || d.software) return 'low';
  if (d.discrete || (!d.mobile && d.appleSilicon && d.cores >= 8)) return 'high';
  if (!d.mobile && !d.integrated && d.cores >= 8 && (!d.mem || d.mem >= 8)) return 'high';
  return 'medium';
}

const shared = readSharedShow();
const state = {
  entered: false,
  exhibitionOpen: false,
  focused: -1,            // slot the visitor deliberately approached
  gazeSlot: -1,           // slot currently held by the gaze
  gazeWeight: 0,
  labelSlot: -1,
  labelSince: 0,
  labelLastSeen: 0,
  lastVisible: new Float64Array(SLOTS.length).fill(-1e9),
  pendingReveal: new Set(),
  revealedSwaps: 0,
  swaps: [],
  swapping: false,
  frames: 0,
};

const ui = createUI({
  onEnter: () => enter(),
  onOpenExhibition: () => openExhibition(),
  onCloseExhibition: () => closeExhibition(),
  onNext: () => stepFocus(+1),
  onPrev: () => stepFocus(-1),
  onLeaveFocus: () => leaveFocus(true),
  onToggleSound: () => setSound(audio.muted),
  onOverlay: (open) => {
    state.overlay = open;
    if (open) controls.exitLock();
    controls.enabled = !open && state.entered && !state.exhibitionOpen;
  },
  onResumeAttentive: () => {
    curator.setFixed(false);
    history.replaceState(null, '', location.pathname + location.search);
    enter();
  },
});

// ----------------------------------------------------------------- sound --

const audio = createAudio();
let music = null;     // optional procedural soundtrack (music.js)
let player = null;    // optional first-person hands and gestures (player.js)
const SOUND_KEY = 'workshop.sound';
function readSoundPreference() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}
function setSound(on) {
  audio.setMuted(!on);
  music?.setMuted(!on);
  ui.setSound(on);
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}
setSound(readSoundPreference());

// ------------------------------------------------------------- renderer --

const canvas = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
} catch (err) {
  showFallback('This room needs WebGL 2, which this browser or device has switched off.');
  throw err;
}

const quality = pickQuality();
// Resolution and the expensive passes belong to the governor (perf.js): render
// resolution between 0.6x and 1x of min(devicePixelRatio, 2), starting low on
// weak machines and climbing while frames keep up. onChange is wired below.
const perf = createPerf({ renderer, quality, debug: TEST });
let pixelRatio = perf.pixelRatio;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);

// near 0.1 / far 3000: the landscape, aircraft and Skyliner are hundreds of metres
// away, and a 24-bit depth buffer still resolves ~0.15 m at 500 m.
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 3000);
// The entry shot: a step outside the threshold, looking down the dim hall.
const ENTRY_POSITION = START.position.clone().add(new THREE.Vector3(0, 0, 2.4));
camera.position.copy(ENTRY_POSITION);
camera.lookAt(START.target);

const room = createRoom(renderer, { quality, reducedMotion });
const post = createPost(renderer, room.scene, camera, { quality });
perf.attach(post);
const mirrors = [];   // reflectors the governor resizes (the hall floor follows the drawing buffer in room.js)
perf.onChange = () => { applySize(); };
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const controls = createControls(camera, canvas, {
  bounds: room.bounds,
  colliders: room.colliders,
  eyeHeight: EYE_HEIGHT,
  reducedMotion,
  pointerLock: !coarsePointer,   // desktop plays like a game: click to capture the mouse
});
controls.enabled = false;
controls.lookAt(START.target);

// ----------------------------------------------------------- the campus --

const M = createMaterials(renderer, { quality });
const props = createProps(room.scene, { quality, reducedMotion });
const ctx = {
  THREE, renderer, scene: room.scene, M, quality, reducedMotion, audio,
  ui: { openApp: (url, title) => ui.openApp(url, title), toast: (t) => ui.toast(t) },
};
let world = null;
const worldReady = createWorld(ctx, {
  hallColliders: [...(room.colliders || []), ...(props.colliders || [])],
  onProgress: (k) => { state.worldProgress = k; },
}).then((w) => {
  world = w;
  controls.setWorld({ regions: w.regions, colliders: w.colliders });
  // A mirror only needs re-rendering from the side where it can be seen: the
  // hall floor from inside the hall, the pool from outdoors. Elsewhere it keeps
  // its last image (it is barely visible through a doorway), which roughly
  // halves the cost of every outdoor frame.
  // Only for the visitor's own view: never inside an override pass (a
  // normal/depth pass sets scene.overrideMaterial) or another camera's render
  // (a mirror seen in a mirror): each would re-render the whole campus again.
  // The governor (perf.js) may refresh mirrors every 2nd/3rd frame at its lower
  // steps; a mirror that has been idle renders at once.
  const gate = (mesh, visible) => {
    if (!mesh || typeof mesh.onBeforeRender !== 'function') return;
    const render = mesh.onBeforeRender;
    let last = -1;
    mesh.onBeforeRender = function (r, scene, cam, ...rest) {
      if (cam !== camera || room.scene.overrideMaterial || !visible()) return;
      if (last >= 0 && state.frames - last >= 0 && state.frames - last < perf.mirrorEvery) return;
      last = state.frames;
      render.call(this, r, scene, cam, ...rest);
    };
  };
  if (room.floor && room.floor.getRenderTarget) {
    gate(room.floor, () => !state.entered || state.inHall);
    room.floor.userData.scale = perf.mirrorScale; // read by room.js once it supports it
  }
  w.groups.pool?.traverse((o) => { if (o.getRenderTarget) { gate(o, () => !state.indoor); mirrors.push(o); } });
  sizeMirrors();
  if (w.lift) {
    w.lift.onEvent = (name) => {
      if (name === 'chime') (audio.chime || audio.reveal)();
      else if (name === 'doors-open' || name === 'doors-close') audio.doors?.();
    };
  }
  return w;
}).catch((err) => { console.error('[world] failed', err); return null; });
// Heavy foliage lives on layer 1 (skipped by reflections and clicks).
camera.layers.enable(1);

const hang = shared ? shared.hang : initialHang(WORKS, slotKinds, 1);
const curator = createCurator({ works: WORKS, slots: slotKinds, hang, fixed: !!shared });

room.setPower(0.06);

// ------------------------------------------------------------ first hang --

async function hangInitial() {
  let done = 0;
  ui.setProgress(0);
  await Promise.all(hang.map(async (id, slot) => {
    const work = byId.get(id);
    try {
      const texture = await loadWorkTexture(work, renderer);
      room.hang(slot, work, texture, { develop: false });
    } catch (err) {
      console.warn(`Could not load ${work.src}`, err);
    }
    done++;
    ui.setProgress(done / hang.length);
  }));
}

if (shared) {
  ui.showEntry({
    mode: 'shared',
    title: titleFor(shared.hang, WORKS, shared.seconds),
    dateText: shared.date ? formatDate(shared.date) : undefined,
  });
} else {
  ui.showEntry({ mode: 'attentive' });
}

// Enter as soon as the hall's works hang: the rest of the campus streams in
// behind the visitor, and the doors open to it the moment it is ready.
const ready = hangInitial().then(() => { ui.setProgress(1); });
worldReady.then((w) => {
  if (!w) return;
  // Compile the campus's shaders off the main thread where the GPU allows.
  try { renderer.compileAsync?.(room.scene, camera).catch(() => {}); } catch (e) { /* optional */ }
  if (state.entered) ui.toast('The doors are open.', 2400);
});

// ----------------------------------------------------------------- entry --

let powerTween = null;

async function enter() {
  if (state.entered) return;
  // Audio must start inside the click itself, before any await.
  audio.start().catch(() => {});
  music?.start().catch(() => {});
  await ready;
  state.entered = true;
  ui.hideEntry();
  const from = 0.06;
  const duration = reducedMotion ? 0.01 : 3.2;
  powerTween = { t: 0, duration, from, relays: 0 };
  controls.enabled = true;
  // Step over the threshold as the lights come on.
  controls.flyTo({ position: START.position, target: START.target, duration: reducedMotion ? 0.2 : 3.4 });
  const touch = matchMedia('(pointer: coarse)').matches;
  // The intro owns the hint line until the visitor acts. The prompt updaters
  // rewrite the line whenever their prompt changes, and state.prompt started
  // undefined, so their first null wiped the intro: within 0.15 s on phones
  // (centre prompt), on the first mouse move on desktop (hover prompt).
  // Starting at null lets only a real prompt ("E · Sit") take the line.
  state.prompt = null;
  ui.hint(touch
    ? 'Drag to look · Tap or hold to walk'
    : 'Click to look around · WASD to walk · Shift to run');
}

controls.onFirstInput = () => {
  // Retire the intro, never a live prompt that has since taken the line.
  setTimeout(() => { if (state.prompt === null) ui.hint(null); }, 3200);
};

// ----------------------------------------------------------- game layer --

const crosshair = document.getElementById('crosshair');
import('./player.js').then((m) => {
  player = m.createPlayer(camera, { reducedMotion, audio });
  // Every gesture, from any caller, is published for the world (NPCs react).
  player.onGestureStart = (name) => { room.scene.userData.lastGesture = { name, time: performance.now() / 1000 }; };
  room.scene.add(camera);
  if (player.group && !player.group.parent) camera.add(player.group);
}).catch(() => { /* gestures are optional */ });
let sfx = null;
// Eerie and wacky sound layer: zones (the ruin's heartbeat, the stage choir)
// and one-shots that answer the visitor (boings, slide whistles, cushions).
import('./sfx.js').then((m) => { sfx = m.createSfx(audio); }).catch(() => { /* optional */ });
import('./music.js').then((m) => {
  music = m.createMusic();
  music.setMuted(audio.muted);
  if (state.entered) music.start().catch(() => {});
}).catch(() => { /* music is optional */ });

// Paper-ball basketball: pick up crumpled paper (E / click), hold F or the
// right mouse button to charge, release to throw at a litter bin.
let paper = null;
let charge = 0, charging = false;
state.score = 0;
const BINS = [[-13, 26.6], [13, 26.6], [-13, 36.6], [13, 36.6]].map(([x, z]) => ({ x, y: 0, z, r: 0.19, h: 0.8 }));
const SPAWNS = [[-12.2, 24], [12.2, 24], [-12.2, 29.5], [12.2, 29.5], [-12.2, 35], [12.2, 35], [-6, 21], [6, 21], [-4, 54.6], [4, 54.6]].map(([x, z]) => ({ x, y: 0, z }));
import('./paperball.js').then((m) => {
  room.scene.add(camera);
  paper = m.createPaperGame({
    THREE, scene: room.scene, camera, bins: BINS, spawns: SPAWNS, reducedMotion,
    groundAt: (x, z) => (world ? groundAt(world.regions, x, z, controls.floor, 1.5) : 0),
    onScore: ({ points, swish }) => {
      state.score += points;
      ui.toast(`${swish ? 'Swish! ' : 'Basket! '}+${points} · ${state.score} points`, 2200);
      audio.score?.();
    },
  });
}).catch(() => { /* optional */ });
function isPaper(o) {
  for (let p = o; p; p = p.parent) if (p.userData && p.userData.action && p.userData.action.id === 'paperball') return true;
  return false;
}
function startCharge() { if (paper && paper.holding && !charging) { charging = true; charge = 0; } }
function releaseCharge() {
  if (!charging) return;
  charging = false;
  if (paper && paper.holding) { paper.throw(charge); audio.jump?.(); }
  charge = 0;
}
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && state.entered && !state.overlay) startCharge(); });
addEventListener('keyup', (e) => { if (e.code === 'KeyF') releaseCharge(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => { if (e.button === 2 && state.entered && !state.overlay) startCharge(); });
addEventListener('mouseup', (e) => { if (e.button === 2) releaseCharge(); });

// Weather and time: sunny, storm, rainbow, a real starry night.
let weather = null;
// Each change is narrated as something happening in the world, with a hint at where to look.
const WEATHER_LABEL = { golden: 'Golden hour', sunny: 'A new day', storm: 'A storm rolls in', rainbow: 'Rainbow · sun at your back', night: 'Night falls · look up' };
function cycleWeather() {
  if (!weather) return;
  const i = weather.modes.indexOf(weather.mode);
  const next = weather.modes[(i + 1) % weather.modes.length];
  weather.set(next);
  ui.toast(WEATHER_LABEL[next] || next, 3200);
  const b = document.getElementById('weather-btn');
  if (b) b.dataset.mode = next;
}
worldReady.then((w) => {
  if (!w) return;
  return import('./weather.js').then((m) => {
    // Hand the weather the sun's true strength, not the indoor-dimmed value.
    const env = w.modules.get('environment');
    if (env && env.sun && state.sunBase !== undefined) env.sun.intensity = state.sunBase;
    weather = m.createWeather(ctx, { environment: env });
  });
}).catch((err) => console.warn('[weather] unavailable', err));
addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat && state.entered && !state.overlay) cycleWeather(); });
document.getElementById('weather-btn')?.addEventListener('click', () => cycleWeather());

controls.onLockChange = (locked) => {
  crosshair.classList.toggle('is-on', locked);
  if (!locked && state.entered && !state.overlay && !state.exhibitionOpen) ui.hint('Click to play · Esc releases the mouse');
  else if (locked) ui.hint(null);
};
controls.onUse = () => {
  if (!state.entered || state.overlay) return;
  state.viaUse = true;   // E talks; a click slaps
  try { controls.onTap?.(innerWidth / 2, innerHeight / 2); } finally { state.viaUse = false; }
};
// 8 and 9 are the two cheeky ones (censored on screen): never picked by G.
const GESTURE_KEYS = { Digit1: 'wave', Digit2: 'thumbs', Digit3: 'clap', Digit4: 'point', Digit5: 'shrug', Digit6: 'dance', Digit7: 'peace', Digit8: 'manguito', Digit9: 'pirete' };
controls.onGesture = (code) => {
  if (!player) return;
  const list = ['wave', 'thumbs', 'clap', 'point', 'shrug', 'dance', 'peace'];
  const name = code === 'KeyG' ? list[Math.floor(Math.random() * list.length)] : GESTURE_KEYS[code];
  if (!name) return;
  player.gesture(name);   // player.onGestureStart publishes it to the world
};

// With the mouse captured, the crosshair says what E / click will do.
let centreClock = 0;
function updateCentrePrompt(dt) {
  if (!controls.locked && !coarsePointer) return;
  centreClock += dt;
  if (centreClock < 0.15) return;
  centreClock = 0;
  const hit = pickAt(innerWidth / 2, innerHeight / 2, 9); // only hits under 9 m are used
  const label = hit && hit.distance < 9 && isPickable(hit.object) && withinReach(hit) ? labelFor(hit.object) : null;
  crosshair.classList.toggle('is-target', !!label);
  const text = label ? `${coarsePointer ? 'Tap' : 'E'} · ${label}` : null;
  if (text !== state.prompt) { state.prompt = text; ui.hint(text); }
}

// -------------------------------------------------------- focus & taps --

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

controls.onTap = (x, y) => {
  if (!state.entered || state.exhibitionOpen) return;
  if (state.overlay) return;
  const hit = pickAt(x, y);
  if (!hit) return;
  if (paper && isPaper(hit.object)) { if (paper.tryPickUp(hit.object)) ui.toast('Hold F, release to throw', 2400); return; }
  const slot = findSlot(hit.object);
  if (slot !== -1 && state.inHall) { focusSlot(slot); return; }
  if (isProp(hit.object, 'catalogue')) { openExhibition(); return; }
  const found = world && world.actionFor(hit.object);
  if (found) { leaveFocus(false); act(found, hit); return; }
  // Anything you can stand on: walk there (with the mouse captured you walk with WASD).
  if (controls.seated) { controls.standUp(); return; }
  // A tap or a click on the floor walks there; E (use) never does.
  if (!controls.locked && !state.viaUse && hit.face && worldNormal(hit).y > 0.6) {
    leaveFocus(false);
    controls.walkTo(hit.point);
  }
};

const tmpN = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
function worldNormal(hit) {
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  return tmpN.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
}

function pickAt(x, y, far = 60) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.layers.set(0);
  raycaster.far = far;
  const hits = raycaster.intersectObjects(room.scene.children, true);
  for (const hit of hits) {
    const o = hit.object;
    if (!o.visible || o.isSprite || o.isPoints || o.isLine) continue;
    const m = o.material;
    // Skip invisible helpers and see-through glass/light shafts, but keep pick proxies.
    if (m && !Array.isArray(m) && m.transparent && m.opacity < 0.35 && !isPickable(o)) continue;
    return hit;
  }
  return null;
}

function isPickable(o) {
  for (let p = o; p; p = p.parent) {
    if (p.userData && (p.userData.action || p.userData.prop || Number.isInteger(p.userData.slot))) return true;
  }
  return false;
}

function isProp(o, name) {
  for (let p = o; p; p = p.parent) if (p.userData && p.userData.prop === name) return true;
  return false;
}

function labelFor(o) {
  if (isPaper(o)) return 'Pick up the paper ball';
  const slot = findSlot(o);
  if (slot !== -1 && state.inHall) return 'Approach the work';
  if (isProp(o, 'catalogue')) return 'Your exhibition catalogue';
  const found = world && world.actionFor(o);
  if (!found) return null;
  const { action, module } = found;
  if (action.label) return action.label;            // a module can name its own action
  if (action.type === 'sit') return 'Sit';
  if (action.type === 'app') return action.title || 'Open';
  const OWN = { floppies: 'Pick up the floppy', cat: 'Pet the cat', ghost: 'Buu?', photobooth: 'Take a photo',
    radio: 'Radio on / off', vending: 'Buy something', duck: 'Squeeze the duck', gnome: 'Hm?', murals: 'Look closer', arraial: 'Ask for a song' };
  if (OWN[module]) return OWN[module];
  if (module === 'lift') return /go-1/.test(action.id) ? 'Up · Cinema & terrace' : /go-0/.test(action.id) ? 'Down · The Hall' : 'Call the lift';
  if (module === 'cinema' || module === 'amphitheatre') return 'Choose what plays on this screen';
  if (module === 'npcs') return coarsePointer ? 'Talk' : 'Click: slap · E: talk';
  return 'Use';
}

// The big screens show the client's own work first; YouTube is a quiet second option.
// Every bench, chair, sofa, tier and stone edge can be sat on: the module lists
// its seats; the visitor takes the one nearest to where they clicked.
function nearestSeat(seats, point) {
  let best = null, bd = Infinity;
  for (const s of seats || []) {
    const d = (s.x - point.x) ** 2 + (s.z - point.z) ** 2 + ((s.y - point.y) * 0.5) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
// Seats are within arm's reach, as in any first-person game: no gliding onto a
// bench across the plaza.
const SIT_REACH = 4.5;
function withinReach(hit) {
  const found = world && world.actionFor(hit.object);
  return !(found && found.action.type === 'sit' && hit.distance > SIT_REACH);
}
function sitOn(seat) {
  if (!seat) return;
  controls.sit(seat);
  ui.hint(coarsePointer ? 'Seated · tap the floor to stand' : 'Seated · WASD or Space to stand up');
  state.seatHint = true;
  setTimeout(() => clearSeatHint(), 4000);
}
// The seated hint leaves when its moment is over: after 4 s, or as soon as the
// visitor stands (the frame loop calls this), whichever comes first.
function clearSeatHint() {
  if (!state.seatHint) return;
  state.seatHint = false;
  ui.hint(null);
  state.prompt = undefined;   // let the crosshair prompt post itself again
}

function act(found, hit) {
  const { action, module, object } = found;
  if (action.type === 'sit') {
    if (hit && hit.distance > SIT_REACH) { ui.toast('Get closer to sit', 1400); return; }
    sitOn(nearestSeat(action.seats, hit ? hit.point : object.getWorldPosition(new THREE.Vector3())));
    return;
  }
  if (module === 'npcs') {
    const npcs = world.modules.get('npcs');
    // The main action: a slapstick slap with a click; E (or a tap on touch) to talk.
    if (!state.viaUse && !coarsePointer && npcs && typeof npcs.slap === 'function') {
      npcs.slap(object);
      player?.gesture?.('slap') || player?.gesture?.('wave');
      state.slaps = (state.slaps || 0) + 1;
      return;
    }
    world.pick(object);
    return;
  }
  if (module === 'cinema' || module === 'amphitheatre') {
    const secondary = [YOUTUBE];
    if (module === 'cinema') secondary.unshift({ label: 'Film sound on/off', run: () => world.pick(object) });
    ui.openChooser({
      eyebrow: module === 'cinema' ? 'The Cinema' : 'The Amphitheatre',
      title: 'What should this screen show?',
      items: SCREEN_SITES.map((s) => ({ ...s, title: `${s.label} · on the big screen` })),
      secondary,
    });
    return;
  }
  world.pick(object);
}

// Hover prompts say what a click will do, so they speak only where a click acts at
// the cursor (pen, or no pointer lock). With a mouse, a click first captures the
// pointer and the crosshair prompt speaks; while captured, clientX/Y stay frozen
// where the click was, so picking there raced that prompt (flickering, wrong
// labels) and raycast the whole campus every 110 ms.
let hoverAt = 0;
const clickCaptures = !coarsePointer && typeof canvas.requestPointerLock === 'function';
canvas.addEventListener('pointermove', (e) => {
  if (!state.entered || state.overlay || state.exhibitionOpen || e.buttons || e.pointerType === 'touch' || (e.pointerType === 'mouse' && clickCaptures)) return;
  const t = performance.now();
  if (t - hoverAt < 110) return;
  hoverAt = t;
  const hit = pickAt(e.clientX, e.clientY);
  const label = hit && isPickable(hit.object) ? labelFor(hit.object) : null;
  canvas.style.cursor = label ? 'pointer' : 'grab';
  if (label !== state.prompt) { state.prompt = label; ui.hint(label); }
});

function findSlot(object) {
  for (let o = object; o; o = o.parent) {
    if (o.userData && Number.isInteger(o.userData.slot)) return o.userData.slot;
  }
  return -1;
}

function isDescendant(object, ancestor) {
  for (let o = object; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

const tmpV = new THREE.Vector3();

function viewpointFor(slot) {
  const centre = room.workCenter(slot);
  const size = room.workSize(slot);
  const { normal } = SLOTS[slot];
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fill = 0.62;
  const byHeight = size.h / (2 * Math.tan(vFov / 2) * fill);
  const byWidth = size.w / (2 * Math.tan(vFov / 2) * camera.aspect * fill);
  const distance = THREE.MathUtils.clamp(Math.max(byHeight, byWidth), 1.5, 10);
  const position = centre.clone().addScaledVector(normal, distance);
  position.y = EYE_HEIGHT;
  const b = room.bounds;
  position.x = THREE.MathUtils.clamp(position.x, b.minX + 0.05, b.maxX - 0.05);
  position.z = THREE.MathUtils.clamp(position.z, b.minZ + 0.05, b.maxZ - 0.05);
  // Look a little below the centre of tall works, as a person would.
  const target = centre.clone();
  target.y = THREE.MathUtils.lerp(centre.y, EYE_HEIGHT, 0.25);
  return { position, target };
}

async function focusSlot(slot) {
  state.focused = slot;
  const work = byId.get(curator.hang[slot]);
  ui.setLabel(work, { seconds: curator.seconds[work.id] || 0, focused: true });
  state.labelSlot = slot;
  const view = viewpointFor(slot);
  state.flying = true;
  const arrived = await controls.flyTo(view);
  state.flying = false;
  if (!arrived && state.focused === slot) { leaveFocus(false); return; }
  // Soften the room behind the work once the visitor stands before it.
  if (arrived && state.focused === slot) post.setFocus?.(view.position.distanceTo(room.workCenter(slot)));
}

function leaveFocus(stepBack) {
  if (state.focused === -1) return;
  const slot = state.focused;
  state.focused = -1;
  state.labelSlot = -1;
  ui.setLabel(null);
  post.setFocus?.(null);
  if (stepBack) {
    tmpV.copy(camera.position).addScaledVector(SLOTS[slot].normal, 1.6);
    tmpV.y = 0;
    controls.walkTo(tmpV.clone());
  }
}

function stepFocus(direction) {
  if (!state.inHall) return;
  const from = state.focused !== -1 ? state.focused : (state.gazeSlot !== -1 ? state.gazeSlot : TOUR[0]);
  const i = TOUR.indexOf(from);
  const next = TOUR[(i + direction + TOUR.length) % TOUR.length];
  focusSlot(next);
}

addEventListener('keydown', (event) => {
  if (!state.entered || state.exhibitionOpen || state.overlay || event.defaultPrevented) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
  if (event.key === 'Escape' && state.focused !== -1) { leaveFocus(true); }
  else if (event.key === ']' || event.key === '.') { stepFocus(+1); }
  else if (event.key === '[' || event.key === ',') { stepFocus(-1); }
});

// ----------------------------------------------------------- exhibition --

function shareLink(summary, date) {
  const seconds = Object.fromEntries(summary.works.map(w => [w.id, w.seconds]));
  const show = encodeShow({ hang: summary.hang, seconds });
  return `${location.origin}${location.pathname}#show=${show}&on=${isoDay(date)}`;
}

function openExhibition() {
  if (state.exhibitionOpen) return;
  state.exhibitionOpen = true;
  controls.exitLock();
  controls.enabled = false;
  let summary, date, isShared = false;
  if (curator.fixed && shared) {
    isShared = true;
    date = shared.date || new Date();
    const works = shared.hang
      .map(id => ({ id, seconds: Math.round(shared.seconds[id] || 0) }))
      .sort((a, b) => b.seconds - a.seconds);
    summary = {
      title: titleFor(shared.hang, WORKS, shared.seconds),
      hang: shared.hang,
      works,
      palette: paletteOf(shared.hang, shared.seconds),
    };
  } else {
    date = new Date();
    summary = curator.summary(date);
    // The link carries whole seconds, so title the show from whole seconds too:
    // whoever opens the link must read exactly the title the visitor saw.
    summary.title = titleFor(summary.hang, WORKS, Object.fromEntries(summary.works.map(w => [w.id, w.seconds])));
  }
  ui.openExhibition({
    title: summary.title,
    dateText: formatDate(date),
    works: summary.works.map(({ id, seconds }) => ({ work: byId.get(id), seconds })),
    palette: summary.palette,
    link: shareLink(summary, date),
    shared: isShared,
  });
}

// A shared exhibition carries its hang and dwell times, not its palette, so
// rebuild that palette the same way the curator would: colours weighted by
// how long each work held the original visitor.
function paletteOf(ids, seconds) {
  const p = createCurator({ works: WORKS, slots: slotKinds, hang: ids, fixed: true, seconds }).palette(6);
  return p.length ? p : byId.get(ids[0]).palette;
}

function closeExhibition() {
  if (!state.exhibitionOpen) return;
  ui.closeExhibition();
  state.exhibitionOpen = false;
  if (state.entered && !state.overlay) controls.enabled = true;
}

// ----------------------------------------------------------- the re-hang --

const frustum = new THREE.Frustum();
const wideFrustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
const wideCamera = new THREE.PerspectiveCamera();
const box = new THREE.Box3();
const forward = new THREE.Vector3();
const toWork = new THREE.Vector3();

function updateVisibility(now) {
  camera.updateMatrixWorld();
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);
  // A generous frustum decides what is "possibly seen": wider than the real
  // view, so a work is never swapped at the very edge of the visitor's vision.
  wideCamera.copy(camera, false);   // not recursive: the camera carries the hands and the held ball
  wideCamera.fov = Math.min(150, camera.fov * 1.45);
  wideCamera.aspect = camera.aspect * 1.2;
  wideCamera.updateProjectionMatrix();
  wideCamera.updateMatrixWorld();
  projScreen.multiplyMatrices(wideCamera.projectionMatrix, wideCamera.matrixWorldInverse);
  wideFrustum.setFromProjectionMatrix(projScreen);
  for (let i = 0; i < SLOTS.length; i++) {
    box.copy(room.workBox(i)).expandByScalar(0.6);
    if (wideFrustum.intersectsBox(box)) state.lastVisible[i] = now;
    if (state.pendingReveal.has(i)) {
      box.copy(room.workBox(i));
      if (frustum.intersectsBox(box)) {
        state.pendingReveal.delete(i);
        room.reveal(i);
        audio.reveal();
        state.revealedSwaps++;
        if (state.revealedSwaps === 1) {
          ui.toast('Behind you, the walls change.');
        }
      }
    }
  }
}

function measureGaze(dt, now) {
  camera.getWorldDirection(forward);
  let best = -1, bestWeight = 0;
  for (let i = 0; i < SLOTS.length; i++) {
    const centre = room.workCenter(i);
    toWork.subVectors(centre, camera.position);
    const distance = toWork.length();
    if (distance < 0.01) continue;
    // A work seen from the side (or from behind its own wall) is not being looked at.
    if (toWork.dot(SLOTS[i].normal) > -0.15 * distance) continue;
    const cosA = forward.dot(toWork) / distance;
    const cone = THREE.MathUtils.smoothstep(cosA, GAZE_OUTER, GAZE_INNER);
    if (cone <= 0) continue;
    const near = 1 - THREE.MathUtils.smoothstep(distance, GAZE_NEAR, GAZE_FAR);
    const weight = cone * near;
    if (weight > bestWeight) { bestWeight = weight; best = i; }
  }
  // Looking is stillness: walking or turning fast is passing by, not looking.
  const still = THREE.MathUtils.clamp(1 - controls.speed / 2.4, 0.3, 1)
    * THREE.MathUtils.clamp(1 - controls.turnRate / 1.6, 0.15, 1);
  let weight = bestWeight * still;
  if (best !== -1 && best === state.focused) weight = Math.min(1, weight * 1.3);
  state.gazeSlot = weight > 0.05 ? best : -1;
  state.gazeWeight = weight;

  if (state.entered && !state.exhibitionOpen && state.gazeSlot !== -1) {
    curator.observe(dt, [{ slot: state.gazeSlot, weight }], now);
  }
  for (let i = 0; i < SLOTS.length; i++) room.setGaze(i, i === state.gazeSlot ? weight : 0);
}

let tintLevel = 0;
let tintHex = '#ffffff';

function updateLabelAndTint(dt, now) {
  if (state.focused !== -1) {
    const work = byId.get(curator.hang[state.focused]);
    if (state.frames % 15 === 0) ui.setLabel(work, { seconds: curator.seconds[work.id] || 0, focused: true });
  } else if (state.gazeSlot !== -1 && state.gazeWeight > 0.45) {
    if (state.labelSlot !== state.gazeSlot) {
      if (state.labelSince === 0 || state.pendingLabel !== state.gazeSlot) {
        state.pendingLabel = state.gazeSlot;
        state.labelSince = now;
      } else if (now - state.labelSince > LABEL_AFTER) {
        state.labelSlot = state.gazeSlot;
        state.labelSince = 0;
      }
    }
    state.labelLastSeen = now;
    if (state.labelSlot !== -1 && state.frames % 15 === 0) {
      const work = byId.get(curator.hang[state.labelSlot]);
      ui.setLabel(work, { seconds: curator.seconds[work.id] || 0 });
    }
  } else if (state.labelSlot !== -1 && now - state.labelLastSeen > LABEL_LINGER) {
    state.labelSlot = -1;
    ui.setLabel(null);
  }
  // The room's light takes on, very slightly, the colour of what you look at.
  const target = state.gazeSlot !== -1 ? state.gazeWeight : 0;
  if (state.gazeSlot !== -1) tintHex = byId.get(curator.hang[state.gazeSlot]).accent;
  tintLevel += (target - tintLevel) * Math.min(1, dt * 1.2);
  room.setTint(tintHex, 0.12 * tintLevel);
}

let rehangClock = 0;
let placeClock = 0;
state.inHall = true;

// Where is the visitor? Announce arrivals, and stop drawing interiors that
// cannot be seen from here.
function updatePlace(pos, floor) {
  const area = areaAt(pos.x, floor, pos.z);
  const name = area ? area.name : null;
  state.inHall = name === 'The Hall';
  const inLift = !!(world && world.lift && world.lift.isInside(pos.x, pos.z));
  if (room.hall) room.hall.visible = floor < 5 || inLift || !state.entered;
  const cinema = world && world.groups.cinema;
  if (cinema) cinema.visible = !(state.inHall && floor < 3) || inLift;
  updateSoundscape(area, pos, floor, inLift);
  if (state.entered && name && name !== state.place) {
    state.place = name;
    if (state.frames > 30) (ui.place ? ui.place(name) : ui.toast(name, 2400));
  }
  if (!state.inHall && state.labelSlot !== -1 && state.focused === -1) { state.labelSlot = -1; ui.setLabel(null); }
}

// The sound of where you are: what's underfoot, the room's acoustics, and the
// things around you (fountain, tram, rain).
const FOUNTAIN = new THREE.Vector3(46, 0.8, 29);
function surfaceAt(area, pos, inLift) {
  if (inLift) return 'metal';
  const n = area ? area.name : '';
  if (n === 'The Hall') return 'concrete';
  if (n === 'The Cinema' || n === 'Roof terrace' || n === 'Studio' || n === 'Sala de Português') return 'wood';
  if (n === 'Arcade' || n === 'Sala Lente' || n === 'The School' || n === 'The Plaza' || n === 'The Amphitheatre') return 'stone';
  if (n === 'The Garden') {
    const onPath = Math.abs(pos.z - 29) < 1.6 || Math.abs(pos.x - 46) < 1.6 || Math.hypot(pos.x - 46, pos.z - 29) < 5.6;
    return onPath ? 'gravel' : 'grass';
  }
  return pos.x < -30 && pos.z < -15 ? 'gravel' : 'grass';
}
function acousticsAt(area, inLift) {
  if (inLift) return 'lift';
  const n = area ? area.name : '';
  if (n === 'The Hall') return 'hall';
  if (n === 'The Cinema') return 'cinema';
  if (n === 'Studio' || n === 'Arcade' || n === 'Sala Lente' || n === 'Sala de Português') return 'small';
  return 'outdoor';
}
function updateSoundscape(area, pos, floor, inLift) {
  audio.setSurface?.(surfaceAt(area, pos, inLift));
  audio.setEnvironment?.(acousticsAt(area, inLift));
  state.indoor = acousticsAt(area, inLift) !== 'outdoor';
  weather?.setIndoor?.(state.indoor);
  // Lawns and borders can't be seen from indoors: don't draw ~1M grass triangles there.
  for (const n of ['grass', 'flowers']) { const g = world && world.groups[n]; if (g) g.visible = !state.indoor; }
  const tram = world && world.modules.get('metro')?.position;
  const mode = weather ? weather.mode : 'sunny';
  audio.setSources?.({
    fountain: Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z, (floor + 1.6) - FOUNTAIN.y),
    tram: tram ? Math.hypot(pos.x - tram.x, pos.z - tram.z) : 1e6,
    rain: mode === 'storm' ? (state.inHall || (area && area.name !== 'Roof terrace' && floor < 5 && /Hall|Cinema|Studio|Arcade|Sala/.test(area.name)) ? 0.35 : 1) : mode === 'rainbow' ? 0.15 : 0,
    ruins: Math.hypot(pos.x + 49, pos.z + 33),   // the wind moans in the ruins at night
  });
}

let coverClock = 0;
function updateCatalogueCover(dt) {
  coverClock += dt;
  if (coverClock < 4) return;
  coverClock = 0;
  try {
    const s = curator.summary(new Date());
    props.setCatalogueCover?.({ title: titleFor(s.hang, WORKS, Object.fromEntries(s.works.map((w) => [w.id, w.seconds]))), palette: s.palette.length ? s.palette : byId.get(s.hang[0]).palette });
  } catch (e) { /* cosmetic */ }
}
let prefetchClock = 0;

async function maybeRehang(now) {
  if (state.swapping || curator.fixed || !state.entered) return;
  const safe = state.lastVisible.map((seen, i) =>
    now - seen > SAFE_AFTER && i !== state.focused && !state.pendingReveal.has(i) && !room.isDeveloping(i));
  const swap = curator.proposeSwap(safe, now);
  if (!swap) return;
  state.swapping = true;
  try {
    const work = byId.get(swap.to);
    const texture = await loadWorkTexture(work, renderer);
    // The visitor may have turned while the image loaded.
    const t = performance.now() / 1000;
    if (t - state.lastVisible[swap.slot] > SAFE_AFTER * 0.5 && curator.hang[swap.slot] === swap.from) {
      room.hang(swap.slot, work, texture, { develop: true });
      curator.commitSwap(swap, t);
      state.pendingReveal.add(swap.slot);
      state.swaps.push({ ...swap, at: t });
    }
  } catch (err) {
    console.warn('Re-hang skipped', err);
  } finally {
    state.swapping = false;
  }
}

function prefetch() {
  if (curator.fixed) return;
  for (const id of curator.candidates(3)) {
    const work = byId.get(id);
    if (work) loadWorkTexture(work, renderer).catch(() => {});
  }
}

// --------------------------------------------------------------- loop --

const clock = new THREE.Clock();
let paletteClock = 0;
let running = true;

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  try {
    step();
  } catch (err) {
    // One failing subsystem must never freeze the whole world: report once, keep going.
    if (!state.frameError) { state.frameError = String(err && err.stack || err); console.error('[frame]', err); }
    try { post.render(0); } catch (e) { /* nothing more to do */ }
  }
}

function step() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now() / 1000;
  state.frames++;

  if (powerTween) {
    powerTween.t += dt;
    const k = Math.min(1, powerTween.t / powerTween.duration);
    const power = powerTween.from + (1 - powerTween.from) * k;
    room.setPower(power);
    // The spots switch on from the door to the far wall; each bank's relay is heard.
    while (powerTween.relays < RELAYS && power >= 0.08 + 0.72 * (powerTween.relays / (RELAYS - 1))) {
      audio.lightsOn(powerTween.relays, RELAYS);
      powerTween.relays++;
    }
    if (k >= 1) powerTween = null;
  } else if (!state.entered && !reducedMotion) {
    // Before entry the hall breathes very slightly, so it reads as a place.
    const sway = Math.sin(now * 0.18) * 0.02;
    camera.lookAt(START.target.x + sway * 8, START.target.y + Math.sin(now * 0.11) * 0.08, START.target.z);
  }

  if (state.entered) controls.update(dt);
  const pos = controls.position;
  const floor = controls.floor;
  if (world) {
    world.lift?.setVisitor(pos.x, floor, pos.z);
    world.update(dt, { camera, time: now, level: floor > 5 ? 1 : 0, weather: weather ? weather.mode : 'sunny' });
  }
  props.update?.(dt, camera);
  if (state.entered) updateCentrePrompt(dt);
  if (state.seatHint && !controls.seated) clearSeatHint();
  const airborne = controls.airborne;
  const justJumped = airborne && !state.wasAirborne;
  const justLanded = !airborne && state.wasAirborne;
  if (justJumped) audio.jump?.();
  if (justLanded) audio.land?.(0.6);
  state.wasAirborne = airborne;
  // Visible speed: the view opens a little when running, like a camera
  // operator pulling back; it settles when you stop. Off with reduced motion.
  if (!reducedMotion) {
    // Follows the run as it ramps in (controls.sprint), at most +6°, eased the
    // same at any frame rate (exact exponential, ~0.3 s).
    const run = THREE.MathUtils.clamp(Math.min((controls.speed - 2.2) / 2.6, controls.sprint ?? 1), 0, 1);
    const fovTarget = 52 + run * 6 + (airborne ? 1 : 0);
    if (Math.abs(camera.fov - fovTarget) > 0.01) {
      camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-dt * 3.5));
      camera.updateProjectionMatrix();
    }
  }
  // Slapped back by an NPC (npcs.js publishes scene.userData.visitorHit): the
  // head snaps aside and settles, with a thud. Applied after the controls have
  // set this frame's orientation, so nothing accumulates.
  const hitEv = room.scene.userData.visitorHit;
  if (hitEv && hitEv.time !== state.lastHitTime) {
    state.lastHitTime = hitEv.time;
    const k = Number.isFinite(hitEv.strength) ? hitEv.strength : 0.6;
    state.jolt = Math.min(1, (state.jolt || 0) + 0.45 + 0.55 * k);
    state.joltSide = Math.sign(pos.x - (Number.isFinite(hitEv.x) ? hitEv.x : pos.x - 1)) || 1;
    audio.land?.(0.8);
  }
  if (state.jolt > 0.002) {
    state.jolt *= Math.exp(-dt * 6);
    if (!reducedMotion) {
      camera.rotateZ(state.joltSide * state.jolt * 0.09 * Math.cos(now * 38));
      camera.rotateX(state.jolt * 0.035 * Math.sin(now * 29));
    }
  }
  // Eerie and wacky sound layer (optional module).
  sfx?.update(dt, { x: pos.x, y: floor, z: pos.z, area: state.place || null, speed: controls.speed, airborne, justJumped, justLanded, seated: controls.seated, indoor: !!state.indoor });
  if (player) {
    player.update(dt, { speed: controls.speed, jumping: controls.airborne, turnRate: controls.turnRate, stepPhase: controls.stepPhase });
  }
  if (music) music.setIntensity(Math.min(1, 0.25 + controls.speed / 5 + (state.inHall ? 0 : 0.25)));
  music?.update?.(dt);
  if (paper) {
    if (charging) { charge = Math.min(1, charge + dt * 0.9); paper.setPower?.(charge); }
    paper.update(dt);
  }
  weather?.update(dt, { camera, time: now, level: floor > 5 ? 1 : 0 });
  // The world's sound follows the sky: crickets and owls at night, gusts and rain in a storm.
  audio.setWeather?.(room.scene.userData.weather || { mode: weather ? weather.mode : 'sunny' });
  // What the visitor has done, for modules that keep score (newspaper, quests).
  const stats = room.scene.userData.stats || (room.scene.userData.stats = {});
  stats.slaps = state.slaps || 0; stats.score = state.score || 0; stats.place = state.place || null;
  // Indoors the sun cannot reach: fade its direct light out (no shader
  // recompile, no shadow-map artefacts on interior walls), back in outside.
  const sun = world && world.modules.get('environment')?.sun;
  if (sun) {
    if (state.sunBase === undefined) state.sunBase = sun.intensity;
    state.sunK = (state.sunK ?? 1) + ((state.indoor ? 0 : 1) - (state.sunK ?? 1)) * Math.min(1, dt * 4);
    sun.intensity = (weather ? sun.intensity : state.sunBase) * state.sunK;
  }
  placeClock += dt;
  if (placeClock > 0.25) { placeClock = 0; updatePlace(pos, floor); }
  // Walking away from a work you approached ends the focus.
  if (state.focused !== -1 && !state.flying && controls.speed > 0.45) leaveFocus(false);

  if (!state.exhibitionOpen) {
    updateCatalogueCover(dt);
    if (state.inHall) {
      updateVisibility(now);
      measureGaze(dt, now);
      updateLabelAndTint(dt, now);
    } else {
      // Outside the hall nothing in it is being looked at; pending reveals wait.
      if (state.gazeSlot !== -1 || state.gazeWeight > 0) {
        for (let i = 0; i < SLOTS.length; i++) room.setGaze(i, 0);
        state.gazeWeight = 0;
      }
      state.gazeSlot = -1;
    }

    rehangClock += dt;
    if (rehangClock > REHANG_EVERY) { rehangClock = 0; maybeRehang(now); }
    prefetchClock += dt;
    if (prefetchClock > 3) { prefetchClock = 0; prefetch(); }
    paletteClock += dt;
    if (paletteClock > 1) { paletteClock = 0; ui.setPalette(curator.palette(6)); }
  }

  audio.setMotion({ speed: Math.min(controls.speed, 3.2), moving: state.entered && controls.speed > 0.25, airborne: controls.airborne });
  audio.update(dt);
  room.update(dt, camera);
  // Walking or turning: the depth of field fades out (it only serves stillness).
  post.setMoving(controls.speed > 0.3 || !!state.flying || controls.turnRate > 0.6);
  // Behind an opaque overlay the room does not need to be redrawn every frame.
  if (!state.exhibitionOpen || state.frames % 8 === 0) post.render(dt);
  // Hold the frame rate by trading resolution and passes, never by swapping the
  // room's materials mid-visit (perf.js). It only listens once the campus is in.
  perf.update(performance.now(), { active: state.entered && !!world && !state.exhibitionOpen && !state.overlay });
}

function applySize() {
  pixelRatio = perf.pixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
  sizeMirrors();
}

// The pool mirror: half the drawing buffer's long side (as pool.js builds it),
// times the governor's mirror scale. The hall floor follows the drawing buffer
// in room.js.
const _mirrorDb = new THREE.Vector2();
function sizeMirrors() {
  if (room.floor && room.floor.userData) room.floor.userData.scale = perf.mirrorScale;
  if (!mirrors.length) return;
  renderer.getDrawingBufferSize(_mirrorDb);
  const w = Math.max(256, Math.round(Math.min(2048, Math.max(_mirrorDb.x, _mirrorDb.y) * 0.5 * perf.mirrorScale)));
  const h = Math.round(w * 0.56);
  for (const m of mirrors) {
    const rt = m.getRenderTarget();
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
  }
}

addEventListener('resize', applySize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; }
  else if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  running = false;
  ui.toast('Graphics hiccup. Reloading…', 4000);
  setTimeout(() => location.reload(), 1500);
});

applySize();
requestAnimationFrame(frame);

// --------------------------------------------------------- test surface --

if (TEST) {
  window.__gallery = {
    THREE, WORKS, SLOTS, state, curator, room, camera, controls, renderer, ready,
    get quality() { return quality; },
    get world() { return world; },
    props, ui, post,
    get pixelRatio() { return pixelRatio; },
    // Stand in front of a slot and look at it, as a visitor would.
    async lookAtSlot(slot) {
      const v = viewpointFor(slot);
      await controls.flyTo({ ...v, duration: 0.05 });
    },
    // Turn to face the hall's far end (so walls behind are unseen).
    async faceEnd() {
      await controls.flyTo({ position: START.position, target: START.target, duration: 0.05 });
    },
    // Fast-forward attention on one slot (the real gaze path is exercised too,
    // but SwiftShader in CI renders a few frames a second).
    dwell(slot, seconds) {
      const now = performance.now() / 1000;
      for (let t = seconds; t > 0; t -= 0.25) curator.observe(Math.min(0.25, t), [{ slot, weight: 1 }], now);
    },
    // Render once and read a grid of pixels straight back, before the browser
    // composites: proves the room actually drew something.
    samplePixels(grid = 12) {
      post.render(0);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(4);
      const lum = [];
      for (let y = 1; y <= grid; y++) {
        for (let x = 1; x <= grid; x++) {
          gl.readPixels(Math.floor((x / (grid + 1)) * w), Math.floor((y / (grid + 1)) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          lum.push(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]);
        }
      }
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
      return { mean, sd };
    },
    encodeShow, decodeShow, titleFor, openExhibition, closeExhibition, enter,
  };
}
