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
import { loadWorkTexture, prepareWorkTextures, sharpenWorkTexture } from './textures.js';
import { createControls } from './controls.js';
import { createUI, showFallback } from './ui.js';
import { createAudio } from './audio.js';
import { updateAudioListener } from './spatial-audio.js';
import { createMaterials } from './materials.js';
import { createWorld, areaAt } from './world.js';
import { groundAt } from './collision.js';
import { createProps } from './props.js';
import { gateHallCampus } from './mirror-campus-gate.js';
import { createInteractions } from './interactions.js';
import { createLightPool } from './light-pool.js';
import { createFirstMinute } from './first-minute.js';
import { createBursts } from './comic-bursts.js';

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
let resolveFirstMove, entryFlight = false;
const startup = { moved: false, whenMoved: new Promise(resolve => { resolveFirstMove = resolve; }) };
prepareWorkTextures();
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
let combat = null;
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
// The final light, shadow and fog configuration from the first frame (see light-pool.js).
const lightPool = createLightPool(THREE, room.scene, renderer);
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
  THREE, renderer, scene: room.scene, M, quality, reducedMotion, audio, startup, lightPool,
  events: room.scene.userData.workshopEvents ||= new EventTarget(),
  ui: {
    openApp: (url, title) => ui.openApp(url, title), toast: (t, ms) => ui.toast(t, ms),
    setPasswordOverlay: (open) => {
      state.overlay = open;
      if (open) controls.exitLock();
      controls.enabled = !open && state.entered && !state.exhibitionOpen;
    },
  },
};
// Ahead-of-time compile for the scene's real target (see post.sceneTarget); world.js uses it for
// each space before it is drawn.
ctx.precompile = (group) => {
  if (!renderer.compileAsync) return null;
  const previous = renderer.getRenderTarget();
  let pending = null;
  renderer.setRenderTarget(post.sceneTarget || null);
  try { pending = renderer.compileAsync(group, camera, room.scene); } catch (e) { pending = null; }
  renderer.setRenderTarget(previous);
  return pending ? pending.catch(() => {}) : null;
};
const interactions = createInteractions(ctx);
let hintStore = null; try { hintStore = window.localStorage; } catch (e) { hintStore = null; }
const firstMinute = createFirstMinute({ toast: (t, ms) => ui.toast(t, ms), storage: hintStore, touch: coarsePointer });
function isHouseSpeechActive(){
  const module=world?.modules.get('npcs'),actors=module?.actors||module?.combatActors;
  if(actors)for(let i=0;i<actors.length;i++){const n=actors[i];if(n.talkT>0&&n.d2<400)return true;}
  return false;
}
let houseSamples = null;
startup.whenMoved.then(async () => {
  const { createHouseSamples } = await import('./house-samples.js');
  houseSamples = createHouseSamples(ctx, { isSpeaking: isHouseSpeechActive });
  houseSamples.setMoved();
  houseSamples.configure({ fifthSlapVoice: 'alternate', approved: true });
}).catch(error => console.warn('[house samples]', error));
// The announcer calls the round when a porrada starts: first, second, third, then every
// later one is the final round. The four calls were cut from the 95.9 s pack (phrase bounds by
// silence detection, words checked by offline recognition at four pitch shifts) into a 6.8 s MP3.
const ROUND_CALLS = [
  { offset: 0, duration: 1.40 },    // "First round"
  { offset: 1.70, duration: 1.56 }, // "Second round"
  { offset: 3.56, duration: 1.38 }, // "Third round"
  { offset: 5.24, duration: 1.50 }, // "Final round"
];
const roundCall = { fight: 0, calls: 0, until: 0, busy: false };
function updateRoundCall(now) {
  const fight = room.scene.userData.combatState;
  if (!houseSamples || !fight) return;
  if (fight.active && fight.id !== roundCall.fight) { roundCall.fight = fight.id; roundCall.until = now + 2.5; }
  if (!fight.active || now > roundCall.until || roundCall.busy) return;
  const call = ROUND_CALLS[Math.min(roundCall.calls, ROUND_CALLS.length - 1)];
  roundCall.busy = true;
  houseSamples.play('announcer', { manual: true, ...call, maxDelay: 0.6 }).then((played) => {
    roundCall.busy = false;
    if (played) { roundCall.calls++; roundCall.until = 0; }
  }, () => { roundCall.busy = false; });
}
const interactionFrame = { camera };
// The map is small but shares the start with the Hall's artwork, and on a slow device it
// can arrive after the world stops waiting. Aborting it lost the map for good; instead the
// world waits until at most 8 s after start, and a late map is installed when it lands.
const interactionDeadline = performance.now() + 8000;
const interactionMap = fetch(new URL('../data/interactions.json', import.meta.url))
  .then(r => { if (!r.ok) throw new Error('interaction map ' + r.status); return r.json(); })
  .catch(err => { console.warn('[interactions]', err); return null; });
ctx.prepareInteractions = async (built) => {
  let timer = 0;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, Math.max(0, interactionDeadline - performance.now()), undefined); });
  const data = await Promise.race([interactionMap, late]);
  clearTimeout(timer);
  if (data) { interactions.installMap(built, data); return; }
  if (data === undefined) interactionMap.then((map) => { if (map) interactions.installMap(built, map); });
};
let world = null;
const worldReady = createWorld(ctx, {
  ready: Promise.resolve().then(() => ready),
  hallColliders: [...(room.colliders || []), ...(props.colliders || [])],
  onProgress: (k) => { state.worldProgress = k; },
}).then((w) => {
  world = w;
  const npcs = w.modules.get('npcs');
  npcs?.setNavigation?.(w);
  npcs?.onActorReady?.(() => {
    w.registerPickables('npcs', npcs.pickables);
    w.modules.get('tram-ride')?.tram.initializePassengers(npcs.actors, false);
  });
  if (w.modules.get('tram-ride')) {
    w.modules.get('metro')?.setRideService?.(true);
    w.modules.get('tram-ride').tram.bindControls(controls);
    w.modules.get('tram-ride').tram.initializePassengers(w.modules.get('npcs')?.actors, false);
  }
  if (TEST) performance.mark('workshop:campus-built');
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
    gateHallCampus({ THREE, floor: room.floor, camera, world: w, renderer });
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

// W2: select once, read gaze without allocating; preserve shared-show mode.
let questWasFixed = false, questArtLocked = false;
const questSilence = room.scene.userData.questSilence = { requested: false, confirmed: false };
room.scene.userData.questArt = {
  select(out) {
    let best = -1, seconds = 0;
    for (let i = 0; i < curator.hang.length; i++) {
      const value = curator.seconds[curator.hang[i]] || 0;
      if (value > seconds) { seconds = value; best = i; }
    }
    if (best < 0) return false;
    const slot = SLOTS[best];
    out.id = curator.hang[best];
    out.x = slot.position.x + slot.normal.x * 2.4;
    out.z = slot.position.z + slot.normal.z * 2.4;
    out.y = 0;
    return true;
  },
  lock() {
    if (questArtLocked) return;
    questWasFixed = curator.fixed; questArtLocked = true; curator.setFixed(true);
  },
  release() {
    if (!questArtLocked) return;
    curator.setFixed(questWasFixed); questArtLocked = false;
  },
  isLooking(id) {
    return state.entered && !state.exhibitionOpen && !state.overlay && state.inHall &&
      state.gazeSlot >= 0 && curator.hang[state.gazeSlot] === id &&
      state.gazeWeight > 0.45 && controls.speed < 0.25;
  },
};


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
const ready = hangInitial().then(() => {
  ui.setProgress(1);
  if (TEST) performance.mark('workshop:entry-ready');
});
worldReady.then((w) => {
  if (!w) return;
  // Compile the campus's shaders off the main thread where the GPU allows.
  try { ctx.precompile(room.scene); } catch (e) { /* optional */ }
  if (state.entered) ui.toast('The doors are open.', 2400);
});

// ----------------------------------------------------------------- entry --

let powerTween = null;

async function enter() {
  if (state.entered) return;
  // Audio must start inside the click itself, before any await.
  audio.start().catch(() => {});
  music?.start(audio.context, audio.musicBus).catch(() => {});
  await ready;
  state.entered = true;
  ui.hideEntry();
  const from = 0.06;
  const duration = reducedMotion ? 0.01 : 3.2;
  powerTween = { t: 0, duration, from, relays: 0 };
  controls.enabled = true;
  // Step over the threshold as the lights come on.
  entryFlight = true;
  controls.flyTo({ position: START.position, target: START.target, duration: reducedMotion ? 0.2 : 3.4 }).finally(() => { entryFlight = false; });
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
  // The double pirete counts as a pirete for the people watching.
  player.onGestureStart = (name) => { room.scene.userData.lastGesture = { name: name === 'pirete_duplo' ? 'pirete' : name, time: performance.now() / 1000 }; };
  room.scene.add(camera);
  if (player.group && !player.group.parent) camera.add(player.group);
}).catch(() => { /* gestures are optional */ });
worldReady.then(async(w)=>{
  const {createCombat}=await import('./combat.js');
  const npcModule=w.modules.get('npcs');if(!npcModule?.combatActors)return;
  combat=createCombat(ctx,{camera,controls,world:w,npcModule,enableStatues:true,getPlayer:()=>player,
    canAct:()=>state.entered&&!state.overlay&&!state.exhibitionOpen,
    canStart:()=>!charging&&!paper?.holding,
    onSlap:()=>{state.slaps=(state.slaps||0)+1;}});
}).catch(err=>console.warn('[combat]',err));

let bairroEconomy=null;
Promise.all([ready,worldReady]).then(async()=>{
  const {createBairroEconomy}=await import('./bairro-economy.js');
  bairroEconomy=createBairroEconomy(ctx,{camera,controls,weather:()=>weather,
    canAct:()=>state.entered&&!state.overlay&&!state.exhibitionOpen,
    setOverlay:(open)=>{state.overlay=open;controls.enabled=!open&&state.entered&&!state.exhibitionOpen;}});
}).catch(err=>console.warn('[bairro]',err));

let sfx = null;
// Eerie and wacky sound layer: zones (the ruin's heartbeat, the stage choir)
// and one-shots that answer the visitor (boings, slide whistles, cushions).
import('./sfx.js').then((m) => { sfx = m.createSfx(audio); }).catch(() => { /* optional */ });
import('./music.js').then((m) => {
  music = m.createMusic({ audio, scene: room.scene });
  music.setMuted(audio.muted);
  if (state.entered) music.start(audio.context, audio.musicBus).catch(() => {});
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
    lightPool.adoptScene();
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
// 8, 9 and 0 are the cheeky ones (censored on screen): never picked by G. B shouts.
const GESTURE_KEYS = { Digit1: 'wave', Digit2: 'thumbs', Digit3: 'clap', Digit4: 'point', Digit5: 'shrug', Digit6: 'dance', Digit7: 'peace', Digit8: 'manguito', Digit9: 'pirete', Digit0: 'pirete_duplo' };
controls.onGesture = (code) => {
  if (code === 'KeyB') { shout(); return; }
  if (!player) return;
  const list = ['wave', 'thumbs', 'clap', 'point', 'shrug', 'dance', 'peace'];
  const name = code === 'KeyG' ? list[Math.floor(Math.random() * list.length)] : GESTURE_KEYS[code];
  if (!name) return;
  player.gesture(name);   // player.onGestureStart publishes it to the world
};

// ---- SAPAS!: every slap lands with a comic word over the face; a streak on the same face grows
// into a CHAPADÃO. The visitor can also provoke: manguito, pirete, double pirete, and a shout.
const bursts = createBursts({ reducedMotion });
const slapStreak = { n: null, count: 0, at: -1 };
const headScreen = new THREE.Vector3();
function sapas(n) {
  const now = performance.now() / 1000;
  if (!n) { bursts.pop('SAPAS!', innerWidth / 2, innerHeight * 0.42, { size: 1 }); return; }
  slapStreak.count = slapStreak.n === n && now - slapStreak.at < 2.6 ? slapStreak.count + 1 : 1;
  slapStreak.n = n; slapStreak.at = now;
  headScreen.set(n.x, (n.baseY || 0) + (n.S?.top || 1.9) * 0.92, n.z).project(camera);
  if (headScreen.z > 1) return;   // behind the camera
  const x = (headScreen.x * 0.5 + 0.5) * innerWidth, y = (-headScreen.y * 0.5 + 0.5) * innerHeight;
  const k = slapStreak.count;
  bursts.pop(k >= 3 ? 'CHAPADÃO' + '!'.repeat(Math.min(5, k)) : k === 2 ? 'SAPAS!!' : 'SAPAS!', x, y - 24, { size: Math.min(2.1, 0.9 + 0.35 * k), color: k >= 3 ? '#ff6b3d' : '#ffd84a' });
}
// The shout: the owner's own recording when it is free, else the browser's voice, and a bleep
// over the swear; people nearby take it like a pirete.
function shoutBleep(at = 0.55) {
  const ac = audio.context; if (!ac || audio.muted || ac.state !== 'running') return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
  o.type = 'sine'; o.frequency.value = 1000; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.01); g.gain.setValueAtTime(0.09, t + 0.32); g.gain.linearRampToValueAtTime(0.0001, t + 0.36);
  o.connect(g); g.connect(audio.bus || ac.destination); o.start(t); o.stop(t + 0.4); o.onended = () => { o.disconnect(); g.disconnect(); };
}
let lastShout = -10;
function shout() {
  if (!state.entered || state.overlay) return;
  const now = performance.now() / 1000; if (now - lastShout < 1.2) return; lastShout = now;
  bursts.pop('CALA-TEEEE, #%&@!', innerWidth / 2, innerHeight * 0.36, { size: 1.5, color: '#ff5a3c', tilt: -4 });
  room.scene.userData.lastGesture = { name: 'pirete', time: now };
  if (audio.muted) return;
  const samples = room.scene.userData.houseSamples;
  Promise.resolve(samples?.play?.('voice', { manual: true })).then((played) => {
    if (played) return;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined' || speechSynthesis.speaking || room.scene.userData.ttsOwner) { shoutBleep(0.05); return; }
    const voices = speechSynthesis.getVoices(), voice = voices.find((v) => /^pt[-_]PT$/i.test(v.lang)) || voices.find((v) => /^pt/i.test(v.lang)) || null;
    const u = new SpeechSynthesisUtterance('Cala-teeeee!'); if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'pt-PT';
    u.pitch = 1.25; u.rate = 0.95; u.volume = 0.9; speechSynthesis.speak(u); shoutBleep(0.75);
  }).catch(() => shoutBleep(0.05));
}
// The choice, on screen (and on touch): a hand button that opens the four provocations.
{
  const wrap = document.createElement('div'); wrap.className = 'taunts';
  Object.assign(wrap.style, { position: 'fixed', right: '12px', top: '64px', zIndex: '36', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' });
  const mk = (label, aria) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria);
    Object.assign(b.style, { minWidth: '44px', minHeight: '44px', padding: '0 12px', border: '1px solid #eee7d8', borderRadius: '22px', background: '#181a20', color: '#fff7e7', font: "700 15px/1 system-ui, sans-serif", cursor: 'pointer', touchAction: 'manipulation' }); return b; };
  const open = mk('🤌', 'Provocar'), menu = document.createElement('div');
  Object.assign(menu.style, { display: 'none', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' });
  const items = [['Manguito · 8', () => player?.gesture?.('manguito')], ['Pirete · 9', () => player?.gesture?.('pirete')], ['Pirete duplo · 0', () => player?.gesture?.('pirete_duplo')], ['CALA-TE! · B', () => shout()]];
  for (const [label, run] of items) { const b = mk(label, label.split(' · ')[0]); b.addEventListener('click', (e) => { e.stopPropagation(); run(); menu.style.display = 'none'; }); menu.appendChild(b); }
  open.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'; });
  wrap.append(open, menu); document.body.appendChild(wrap);
  const sync = () => { wrap.style.display = state.entered && !state.overlay && !state.exhibitionOpen && !room.scene.userData.combatState?.active ? 'flex' : 'none'; };
  setInterval(sync, 400); sync();
}

// With the mouse captured, the crosshair says what E / click will do.
let centreClock = 0;
function updateCentrePrompt(dt) {
  if (!controls.locked && !coarsePointer) return;
  centreClock += dt;
  if (centreClock < 0.15) return;
  centreClock = 0;
  const hit = pickAt(innerWidth / 2, innerHeight / 2, 9); // only hits under 9 m are used
  const label = hit && hit.distance < 9 && isPickable(hit.object) && withinReach(hit) ? labelFor(hit.object, hit) : null;
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
  if (!controls.seated && interactions.react(hit.object, hit)) return;
  // Anything you can stand on: walk there (with the mouse captured you walk with WASD).
  if (controls.seated) { controls.standUp(); return; }
  // A tap or a click on the floor walks there; E (use) never does.
  if (!controls.locked && !state.viaUse && hit.face && worldNormal(hit).y > 0.6) {
    leaveFocus(false);
    controls.walkTo(hit.point);
  }
};

const tmpN = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
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
    if (p.userData && (p.userData.action || p.userData.interaction || p.userData.prop || Number.isInteger(p.userData.slot))) return true;
  }
  return false;
}

function isProp(o, name) {
  for (let p = o; p; p = p.parent) if (p.userData && p.userData.prop === name) return true;
  return false;
}

function labelFor(o, hit) {
  if (isPaper(o)) return 'Pick up the paper ball';
  const slot = findSlot(o);
  if (slot !== -1 && state.inHall) return 'Approach the work';
  if (isProp(o, 'catalogue')) return 'Your exhibition catalogue';
  const found = world && world.actionFor(o);
  if (!found) return interactions.label(o, hit);
  const { action, module } = found;
  if (action.label) return action.label;            // a module can name its own action
  if (action.type === 'sit') return 'Sit';
  if (action.type === 'app') return action.title || 'Open';
  const OWN = { cat: 'Pet the cat', ghost: 'Buu?', photobooth: 'Take a photo',
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
// A slap lands at arm's length, a chat at conversation distance: no slapping
// people from across the plaza.
const SLAP_REACH = 2.1, TALK_REACH = 3.5;
function withinReach(hit) {
  const found = world && world.actionFor(hit.object);
  if (!found) return true;
  if (found.action.type === 'sit') return hit.distance <= SIT_REACH;
  if (found.module === 'npcs') return hit.distance <= TALK_REACH;
  return true;
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
  const questPick = room.scene.userData.lastModulePick ||
    (room.scene.userData.lastModulePick = { module: '', id: '', time: 0 });
  questPick.module = module;
  questPick.id = action.id || object.name || '';
  questPick.time = performance.now() / 1000;
  if (action.type === 'sit') {
    if (hit && hit.distance > SIT_REACH) { ui.toast('Get closer to sit', 1400); return; }
    sitOn(nearestSeat(action.seats, hit ? hit.point : object.getWorldPosition(new THREE.Vector3())));
    return;
  }
  if (module === 'npcs') {
    const npcs = world.modules.get('npcs');
    // The main action: a slapstick slap with a click; E (or a tap on touch) to talk.
    if (hit && hit.distance > TALK_REACH) { ui.toast(state.viaUse ? 'Get closer to talk' : 'Get closer', 1200); return; }
    if (!state.viaUse && !coarsePointer && npcs && typeof npcs.slap === 'function') {
      if (hit && hit.distance > SLAP_REACH) { ui.toast('Too far to slap', 1200); return; }
      // An isolated click remains a first-person slap. Guard entry is explicit in combat.
      npcs.slap(object);
      player?.gesture?.('slap') || player?.gesture?.('wave');
      state.slaps = (state.slaps || 0) + 1;
      sapas(npcs.findActor?.(object));
      return;
    }
    world.pick(object);
    return;
  }
  if (hit) interactions.react(hit.object, hit);
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
  const label = hit && isPickable(hit.object) ? labelFor(hit.object, hit) : null;
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
  const token = state.focusToken = (state.focusToken || 0) + 1;
  state.focused = slot;
  const work = byId.get(curator.hang[slot]);
  ui.setLabel(work, { seconds: curator.seconds[work.id] || 0, focused: true });
  state.labelSlot = slot;
  const view = viewpointFor(slot);
  state.flying = true;
  const arrived = await controls.flyTo(view);
  // A newer approach (a double-click, Next pressed twice) took this flight over: it owns the focus now.
  if (token !== state.focusToken) return;
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
  // The rail whine follows the walkable car (the light-rail's own train is parked in ride service).
  const tram = room.scene.userData.tramRide?.carrierGroup?.position || (world && world.modules.get('metro')?.position);
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
let tramImpulseSequence = 0;

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
let frameId = 0;

function frame() {
  if (!running) return;
  // One loop only: hiding the tab pauses the request frame() had already queued and
  // showing it queues another, so both would run and each re-queue itself (one more
  // full render per vsync after every tab switch). Cancelling the previous request
  // folds any duplicate into this loop, whatever the browser's timer precision.
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(frame);
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
  if (!startup.moved && state.entered && !entryFlight && controls.speed > 0.25) {
    startup.moved = true; resolveFirstMove();
    if (TEST) performance.mark('workshop:first-move');
  }
  if (startup.moved && state.inHall && state.gazeSlot >= 0 && state.gazeWeight > 0.6 && state.frames % 30 === 0) {
    const work = byId.get(curator.hang[state.gazeSlot]);
    if (work) sharpenWorkTexture(work, renderer, { maxEdge: quality === 'high' ? 2048 : quality === 'low' ? 768 : 1024 });
  }
  const pos = controls.position;
  const floor = controls.floor;
  if (world) {
    world.lift?.setVisitor(pos.x, floor, pos.z);
    interactions.beforeUpdate();
    world.update(dt, { camera, time: now, level: floor > 5 ? 1 : 0, weather: weather ? weather.mode : 'sunny' });
  }
  const tramRide = room.scene.userData.tramRide;
  controls.transportCarrier?.(tramRide?.carrier);
  combat?.update(dt);
  lightPool.update(camera, dt);
  bursts.update(dt);
  firstMinute.update({ entered: state.entered, inHall: !!state.inHall, slaps: state.slaps || 0, busy: !!(state.overlay || state.exhibitionOpen || room.scene.userData.combatState?.active) });
  const tramImpulse = room.scene.userData.tramImpulse;
  if (tramImpulse && tramImpulse.sequence !== tramImpulseSequence) {
    tramImpulseSequence = tramImpulse.sequence;
    if (!reducedMotion && tramRide?.carrier.riding) controls.applyImpulse?.(tramImpulse.x, tramImpulse.z, tramImpulse.duration);
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
  // The score follows the place, the pace and the sky (hall calm, outdoors driving, ruins dark, storms minor).
  if (music) {
    if (music.setScene) music.setScene({ area: state.place, indoor: !!state.indoor, x: pos.x, z: pos.z, speed: controls.speed, airborne, weather: room.scene.userData.weather });
    else music.setIntensity(Math.min(1, 0.25 + controls.speed / 5 + (state.inHall ? 0 : 0.25)));
  }
  music?.update?.(dt);
  if (paper) {
    if (charging) { charge = Math.min(1, charge + dt * 0.9); paper.setPower?.(charge); }
    paper.update(dt);
  }
  weather?.update(dt, { camera, time: now, level: floor > 5 ? 1 : 0 });
  // Look up on a clear night and the real constellations draw themselves in,
  // faintly; look back down and the sky is left as it is.
  if (weather && weather.setConstellations) {
    camera.getWorldDirection(tmpLook);
    weather.setConstellations(weather.mode === 'night' && !state.indoor && tmpLook.y > 0.5);
  }
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
    // Before entering, the camera stands in the hall: the sun must already be out
    // there too (at a low golden-hour sun its shadow texels streak the hall walls).
    const indoorNow = state.entered ? state.indoor : true;
    state.sunK = (state.sunK ?? 1) + ((indoorNow ? 0 : 1) - (state.sunK ?? 1)) * Math.min(1, dt * 4);
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
  bairroEconomy?.update();
  questSilence.requested = !!room.scene.userData.questQuiet ||
    (room.scene.userData.bairroEffects?.silenceUntil||0)>performance.now()/1000;
  audio.setQuiet?.(questSilence.requested);
  if (questSilence.requested && typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
  questSilence.confirmed = questSilence.requested && audio.quietConfirmed === true &&
    (typeof speechSynthesis === 'undefined' || (!speechSynthesis.speaking && !speechSynthesis.pending));
  updateAudioListener(audio,camera);
  audio.update(dt);
  houseSamples?.update(camera);
  updateRoundCall(performance.now() / 1000);
  room.update(dt, camera);
  interactions.update(dt, interactionFrame);
  // Walking or turning: the depth of field fades out (it only serves stillness).
  post.setMoving(controls.speed > 0.3 || !!state.flying || controls.turnRate > 0.6);
  // Behind an opaque overlay the room does not need to be redrawn every frame.
  combat?.renderCamera();
  try {
  const tramView=room.scene.userData.tramView;
  const tramRoll=reducedMotion?0:(tramView?.roll||0),tramFov=reducedMotion?0:(tramView?.fov||0),tramBaseFov=camera.fov;
  tramRide?.beforeRender?.();
  if(tramRoll)camera.rotateZ(tramRoll);
  if(tramFov){camera.fov+=tramFov;camera.updateProjectionMatrix();}
  try { if (!state.exhibitionOpen || state.frames % 8 === 0) post.render(dt); }
  finally {
    tramRide?.afterRender?.();
    if(tramRoll)camera.rotateZ(-tramRoll);
    if(tramFov){camera.fov=tramBaseFov;camera.updateProjectionMatrix();}
  }
  } finally { combat?.restoreCamera(); }
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
  // At most two automatic reloads in a row (the second at low quality); a weak phone that keeps
  // losing the context gets the fallback instead of a reload loop. Two calm minutes reset the count.
  const url = new URL(location.href);
  const tries = (performance.now() > 120000 ? 0 : (parseInt(url.searchParams.get('ctxlost') || '0', 10) || 0)) + 1;
  if (tries > 2) { showFallback('The graphics card keeps stopping on this device.'); return; }
  url.searchParams.set('ctxlost', String(tries));
  if (tries === 2) url.searchParams.set('quality', 'low');
  ui.toast('Graphics hiccup. Reloading…');
  setTimeout(() => location.replace(url.href), 1500);
});

applySize();
requestAnimationFrame(frame);

// --------------------------------------------------------- test surface --

if (TEST) {
  window.__gallery = {
    THREE, WORKS, SLOTS, state, curator, room, camera, controls, renderer, ready,
    get quality() { return quality; },
    get world() { return world; },
    props, ui, post, interactions, audio,
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
