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
import { loadWorkTexture } from './textures.js';
import { createControls } from './controls.js';
import { createUI, showFallback } from './ui.js';
import { createAudio } from './audio.js';

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
const TOUR = [6, 5, 4, 3, 2, 1, 0, 7, 8, 9, 10, 11, 12, 14, 13];
const RELAYS = 7;             // banks of track spots heard switching on at entry

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

function pickQuality() {
  const q = params.get('quality');
  if (q === 'low' || q === 'high') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const weak = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency || 8) <= 4;
  return (coarse && small) || weak ? 'low' : 'high';
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
  onResumeAttentive: () => {
    curator.setFixed(false);
    history.replaceState(null, '', location.pathname + location.search);
    enter();
  },
});

// ----------------------------------------------------------------- sound --

const audio = createAudio();
const SOUND_KEY = 'workshop.sound';
function readSoundPreference() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}
function setSound(on) {
  audio.setMuted(!on);
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
const maxRatio = quality === 'high' ? 1.75 : 1.25;
let pixelRatio = Math.min(devicePixelRatio || 1, maxRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.05, 120);
// The entry shot: a step outside the threshold, looking down the dim hall.
const ENTRY_POSITION = START.position.clone().add(new THREE.Vector3(0, 0, 2.4));
camera.position.copy(ENTRY_POSITION);
camera.lookAt(START.target);

const room = createRoom(renderer, { quality, reducedMotion });
const post = createPost(renderer, room.scene, camera, { quality });
const controls = createControls(camera, canvas, {
  bounds: room.bounds,
  colliders: room.colliders,
  eyeHeight: EYE_HEIGHT,
  reducedMotion,
});
controls.enabled = false;
controls.lookAt(START.target);

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

const ready = hangInitial().then(() => {
  // Compile every material once behind the entry screen, so the first steps
  // into the room do not hitch on shader compilation.
  try { renderer.compile(room.scene, camera); } catch (e) { /* optional */ }
  ui.setProgress(1);
});

// ----------------------------------------------------------------- entry --

let powerTween = null;

async function enter() {
  if (state.entered) return;
  // Audio must start inside the click itself, before any await.
  audio.start().catch(() => {});
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
  ui.hint(touch
    ? 'Drag to look · Tap the floor to walk · Tap a work to approach'
    : 'Drag to look · Click the floor to walk · Click a work to approach');
}

controls.onFirstInput = () => {
  setTimeout(() => ui.hint(null), 2600);
};

// -------------------------------------------------------- focus & taps --

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

controls.onTap = (x, y) => {
  if (!state.entered || state.exhibitionOpen) return;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([...room.pickables, room.floor], true);
  for (const hit of hits) {
    const slot = findSlot(hit.object);
    if (slot !== -1) { focusSlot(slot); return; }
    if (hit.object === room.floor || isDescendant(hit.object, room.floor)) {
      leaveFocus(false);
      controls.walkTo(hit.point);
      return;
    }
  }
};

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
  const from = state.focused !== -1 ? state.focused : (state.gazeSlot !== -1 ? state.gazeSlot : TOUR[0]);
  const i = TOUR.indexOf(from);
  const next = TOUR[(i + direction + TOUR.length) % TOUR.length];
  focusSlot(next);
}

addEventListener('keydown', (event) => {
  if (!state.entered || state.exhibitionOpen) return;
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
  if (state.entered) controls.enabled = true;
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
  wideCamera.copy(camera);
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
          ui.toast('The room is re-hanging itself around what holds your gaze.');
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
let slowFrames = 0;
let fastFrames = 0;
let running = true;

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
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
  // Walking away from a work you approached ends the focus.
  if (state.focused !== -1 && !state.flying && controls.speed > 0.45) leaveFocus(false);

  if (!state.exhibitionOpen) {
    updateVisibility(now);
    measureGaze(dt, now);
    updateLabelAndTint(dt, now);

    rehangClock += dt;
    if (rehangClock > REHANG_EVERY) { rehangClock = 0; maybeRehang(now); }
    prefetchClock += dt;
    if (prefetchClock > 3) { prefetchClock = 0; prefetch(); }
    paletteClock += dt;
    if (paletteClock > 1) { paletteClock = 0; ui.setPalette(curator.palette(6)); }
  }

  audio.setMotion({ speed: Math.min(controls.speed, 3.2), moving: state.entered && controls.speed > 0.25 });
  audio.update(dt);
  room.update(dt, camera);
  // Behind an opaque overlay the room does not need to be redrawn every frame.
  if (!state.exhibitionOpen || state.frames % 8 === 0) post.render(dt);
  adaptQuality(dt);
}

// Hold the frame rate by trading resolution, never by dropping the room's
// materials mid-visit.
function adaptQuality(dt) {
  if (!state.entered) return;
  if (dt > 1 / 38) { slowFrames++; fastFrames = 0; }
  else if (dt < 1 / 58) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
  if (slowFrames > 90 && pixelRatio > 0.85) {
    pixelRatio = Math.max(0.85, pixelRatio - 0.2);
    applySize();
    slowFrames = 0;
  } else if (fastFrames > 600 && pixelRatio < Math.min(devicePixelRatio || 1, maxRatio)) {
    pixelRatio = Math.min(Math.min(devicePixelRatio || 1, maxRatio), pixelRatio + 0.15);
    applySize();
    fastFrames = 0;
  }
}

function applySize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
}

addEventListener('resize', applySize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; }
  else if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  running = false;
  ui.toast('The graphics card took a break. Reloading the room…', 4000);
  setTimeout(() => location.reload(), 1500);
});

applySize();
requestAnimationFrame(frame);

// --------------------------------------------------------- test surface --

if (TEST) {
  window.__gallery = {
    THREE, WORKS, SLOTS, state, curator, room, camera, controls, renderer, ready,
    get quality() { return quality; },
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
