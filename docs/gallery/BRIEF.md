# THE WORKSHOP — The Attentive Room

Working brief and module contracts. Every module below is owned by one author;
the contracts are fixed so the modules can be built in parallel and wired
together by `assets/gallery/main.js`.

## 1. The idea

THE WORKSHOP used to be a 15-district walkable campus. It becomes **one room**:
a tall, daylit gallery hall by HrM, rendered as well as a browser allows.

The room **hangs itself around your attention**. It measures how long you look
at each work. While you are looking elsewhere, walls you cannot see are quietly
re-hung with works that resemble what held your gaze — in colour, light,
material and series. When you turn around, the room has changed to reflect you.
Works you lingered on are never taken away.

At any moment the visitor can open **Your exhibition**: the room as it now
hangs, given a generated title, a catalogue listing how long they looked at each
work, the palette of their attention, a downloadable poster, and a link. Anyone
opening that link walks into exactly that hang, labelled as an exhibition
curated by one visitor's gaze.

No backend. Everything is static, deterministic and private to the browser.

## 2. Design language

Restraint, material, light. A contemporary museum, not a game.

- **Colour tokens** (UI): paper `#f4efe6`, ink `#15120e`, muted
  `rgba(21,18,14,.58)`, hairline `rgba(21,18,14,.14)`, accent oxblood `#9c3d33`,
  glass `rgba(250,247,241,.72)` + `backdrop-filter: blur(18px) saturate(1.2)`.
- **Type**: `Instrument Serif` 400 + italic for display and titles;
  `Instrument Sans` (variable wght 400–700) for everything else. Tabular
  numerals for durations and catalogue numbers. Small caps-like labels: 11px,
  uppercase, letter-spacing .14em. Fonts are local in `assets/fonts/`:
  `instrument-serif-400.woff2`, `instrument-serif-400-italic.woff2`,
  `instrument-sans-variable.woff2`.
- **Motion**: ease `cubic-bezier(.2,.7,.1,1)`, 400–900 ms. Everything honours
  `prefers-reduced-motion` (no camera bob, instant cuts, no grain animation).
- **No HUD clutter**: a wordmark, a wall label, one "Your exhibition" control,
  one transient hint line. Nothing else is permanently on screen.

## 3. The room (world units = metres, y up)

- Hall interior: `x ∈ [-6.5, 6.5]`, `z ∈ [-17, 17]`, `y ∈ [0, 6.4]`.
- **Entrance wall** at `z = +17` with a centred door opening 2.6 m wide × 3.6 m
  high, filled with bright daylight beyond (emissive; not walkable).
- **End wall** at `z = -17` carries the hero work.
- **Skylight**: ceiling opening `x ∈ [-1.8, 1.8]`, `z ∈ [-15, 15]`, a 0.8 m light
  well up to a glowing diffuser; mullions every 1.5 m along z plus one along x=0.
- **Track lights**: black tracks at `x = ±4.4`, `y = 6.36`, `z ∈ [-16, 16]`, with
  small spot fixtures aimed at each side slot; two fixtures for the hero near the
  end wall; a short cross-track near `z = 15.4` for the two door slots.
- **Floor**: polished warm-grey concrete with soft, blurred real reflections
  and faint saw-cut joints on a 4 m grid.
- **Walls**: warm white plaster, baked soft light (brighter mid/upper wall, gentle
  darkening into corners and at the ceiling line), a dark 2 cm shadow gap at the
  floor.
- **Benches**: two oak-and-blackened-steel benches on the axis, centred at
  `(0, z = -5)` and `(0, z = +5)`, footprint 0.6 (x) × 2.4 (z), seat 0.45 high.
- **Visitor**: eye height 1.62; start at `(0, 1.62, 13.5)` facing −z. Walkable
  area is the hall inset by 0.45 m from walls, minus bench footprints (+0.3 m).

### Slots (index order is part of the contract)

| index | kind | wall | centre x,z | normal | box w×h |
|---|---|---|---|---|---|
| 0 | `hero` | end | (0, −16.98) | +z | 8.0 × 4.6 |
| 1–6 | `side` | left x=−6.5 | z = −12.5, −7.5, −2.5, 2.5, 7.5, 12.5 | +x | 3.6 × 3.6 |
| 7–12 | `side` | right x=+6.5 | z = −12.5, −7.5, −2.5, 2.5, 7.5, 12.5 | −x | 3.6 × 3.6 |
| 13 | `door` | entrance | x = −3.9 | −z | 2.6 × 3.2 |
| 14 | `door` | entrance | x = +3.9 | −z | 2.6 × 3.2 |

**Display size** of a work (image area, excluding frame/mat): aim for a target
area by family — `matter` 5.0 m², `signal` 4.2 m², `archive` 1.3 m² (side and
door), any family 26 m² for `hero` — then clamp into the slot box keeping
aspect, minimum height 0.55. **Hanging centre height**: side/door
`max(1.6, 0.6 + h/2)`; hero `max(2.4, 0.8 + h/2)`.

**Frames**: `canvas` = gallery-wrapped, 4 cm deep, edges dark linen, no frame;
`frame` = 3 cm thin black frame, 2.5 cm deep; `mat` = 4 cm natural oak frame
with an off-white window mat (mat border ≈ 18% of the shorter side).

A small wall **plaque** (white, 0.22 × 0.14 m) sits 0.25 m right of each side
and door work at y = 1.35, showing title / medium / catalogue number.

## 4. Module contracts

All browser modules are ES modules under `assets/gallery/`. `three` resolves
through the page importmap; addons import from
`three/addons/...` (mapped to `./assets/vendor/three/addons/`). Available
addons: postprocessing `EffectComposer, Pass, ShaderPass, MaskPass, RenderPass,
UnrealBloomPass, OutputPass`; shaders `CopyShader, LuminosityHighPassShader,
OutputShader`; `objects/Reflector.js`; `environments/RoomEnvironment.js`. No
CDN, no other dependency.

### 4.1 `catalogue.js` (generated by `scripts/build-catalogue.py`)

```js
export const WORKS = [{
  id, src, title, no, family /* 'matter'|'signal'|'archive' */,
  frame /* 'canvas'|'frame'|'mat' */, series /* string|null */, artist /* string|null */,
  medium, note,
  w, h, aspect,                       // pixel size, aspect = w/h
  palette: [{ hex: '#rrggbb', share }],   // 5 k-means colours, share desc, sums to 1
  accent: '#rrggbb',                  // most chromatic colour with share >= 0.08
  f: {
    L,     // mean CIE L* 0..100
    Lsd,   // std of L*
    C,     // mean chroma (CIE LCh)
    a, b,  // mean a*, b*
    edge,  // mean gradient magnitude of L* on a 128px-wide copy, /100
    hue,   // 12 bins of 30°, chroma-weighted, sums to 1 (all zeros if C < 4)
  },
}];
```

### 4.2 `curator.js` — pure logic, no DOM, no THREE

```js
export const KEEP_SECONDS = 4;        // a work looked at this long is never removed
export function workVector(work): number[]            // normalised embedding
export function similarity(a, b): number              // 0..1, colour first, material second, +series bonus
export function initialHang(works, slots, seed = 1): string[]   // ids by slot index
export function fits(work, slot): boolean
export function createCurator({ works, slots, hang, fixed = false }): Curator
export function encodeShow({ hang, seconds }): string   // 'ce1~42.uw04~13.br02' (slot order; ~N optional whole seconds)
export function decodeShow(text, works, slotCount): { hang, seconds } | null
export function titleFor(hang, works, seconds = {}): string     // deterministic

Curator {
  hang: string[]                       // current ids by slot
  seconds: Record<id, number>          // raw dwell seconds, never decays (catalogue)
  fixed: boolean; setFixed(bool)
  observe(dt, gazes: {slot, weight}[], now)   // weight 0..1 per gazed slot this frame
  proposeSwap(safe: boolean[], now): null | { slot, from, to }  // safe[i] = slot i unseen long enough
  commitSwap(swap, now)
  candidates(n = 3): string[]          // likely next incoming ids (prefetch)
  palette(n = 6): { hex, share }[]     // attention-weighted palette of what you looked at
  summary(date = new Date()): { title, hang, works: [{ id, seconds }], palette, totalSeconds, date }
}
```

Rules for `proposeSwap`: nothing until total attention ≥ 5 s; at most one swap
every 3.5 s; only `safe` slots; never a slot swapped in the last 25 s; never
removes a work with ≥ `KEEP_SECONDS`; incoming work must `fits` the slot, be
unhung, not removed in the last 60 s, and beat the outgoing work's taste score by
≥ 0.06; choose the slot with the largest improvement. Hero (`slot 0`) only after
40 s of total attention. `fixed` ⇒ always `null`. Taste = attention-weighted
mean of work vectors (attention decays with a 120 s half-life for taste only).

`fits`: `hero` needs aspect ≥ 1.15 and family ≠ `archive`; `door` needs aspect
≤ 1.6; `side` takes anything.

Titles: English, 2–6 words, the voice of a confident small museum. Built from
the hang's traits (dominant hue name such as rust, ochre, cobalt, rose,
verdigris, bone, ink; light vs dark; vivid vs muted; dominant family —
matter → surfaces/residue/ground, signal → signals/glare/broadcast, archive →
plates/specimens/diagrams). Examples of the bar: *A Grammar of Rust*,
*Residue, in Cobalt*, *Bone, Ink and Weather*, *The Long Look at Ochre*,
*Small Hours of Signal*.

### 4.3 `room.js`, `post.js`, `textures.js` — the world

```js
// textures.js
export function loadWorkTexture(work, renderer): Promise<THREE.Texture>  // cached; sRGB, mipmaps, max anisotropy

// room.js
export const SLOTS: { index, id, kind, position: Vector3, normal: Vector3, box: {w, h} }[]
export const EYE_HEIGHT = 1.62
export const START = { position: Vector3(0, 1.62, 13.5), target: Vector3(0, 1.62, 0) }
export function createRoom(renderer, { quality /* 'high'|'low' */ }): Room

Room {
  scene: THREE.Scene
  bounds: { minX, maxX, minZ, maxZ }      // walkable rectangle
  colliders: { minX, maxX, minZ, maxZ }[] // benches etc.
  floor: THREE.Mesh                        // for click-to-walk raycasts
  pickables: THREE.Object3D[]              // artwork meshes, userData.slot = index
  hang(slot, work, texture, { develop = false })  // (re)build that slot; develop ⇒ starts blank until reveal()
  reveal(slot)                             // play the 1.8 s "develop" dissolve
  isDeveloping(slot): boolean
  workCenter(slot): Vector3; workSize(slot): { w, h }; workBox(slot): THREE.Box3
  setGaze(slot, amount 0..1)               // the light leans toward what you look at
  setPower(t 0..1)                         // entry: 0 = dark hall, 1 = all lights on; spots switch on in a sequence along the hall as t rises
  setTint(hex, amount 0..1)                // subtle ambient tint toward a colour
  update(dt, camera)
}

// post.js
export function createPost(renderer, scene, camera, { quality }): { render(dt), setSize(w, h), dispose() }
```

### 4.4 `controls.js` — moving through the room

```js
export function createControls(camera, dom, { bounds, colliders, eyeHeight, reducedMotion }): Controls
Controls {
  enabled: boolean
  update(dt)
  lookAt(target: Vector3)                  // instant
  flyTo({ position, target, duration? }): Promise<boolean>   // true = arrived, false = interrupted
  walkTo(point: Vector3): Promise<boolean> // glide to a floor point (clamped/collided), keeps heading
  onTap: (clientX, clientY) => void        // click/tap that was not a drag
  onFirstInput: () => void                 // once, on first deliberate user input
  readonly speed: number                   // m/s, smoothed
  readonly turnRate: number                // rad/s, smoothed
  dispose()
}
```

Input: drag to look (mouse and touch, no pointer lock), WASD / arrows to walk,
Shift to hurry, wheel to dolly, taps reported through `onTap`. Damped,
weighty, never floaty. Pitch clamped to ±60°. Collision against bounds and
colliders with a 0.35 m radius.

### 4.5 `index.html` + `ui.js` — the interface

```js
export function createUI(handlers: {
  onEnter(), onOpenExhibition(), onCloseExhibition(),
  onNext(), onPrev(), onLeaveFocus(), onResumeAttentive()
}): UI

UI {
  showEntry({ mode: 'attentive'|'shared', title?, dateText? })
  setProgress(0..1)                       // loading progress on the entry control
  hideEntry()
  setLabel(work | null, { seconds = 0, focused = false })
  setPalette([{ hex, share }])            // live strip on the "Your exhibition" control
  hint(text | null)
  toast(text, ms = 5200)
  openExhibition({ title, dateText, works: [{ work, seconds }], palette, link, shared })
  closeExhibition()
  renderPoster(sameSummary): Promise<Blob> // 1080×1350 PNG
}
```

`index.html` owns all markup and CSS, the importmap, the CSP, and loads
`assets/gallery/main.js` as the only script. The canvas is `#stage`.

### 4.6 `main.js` — integration (owned by the lead)

Renderer, render loop, gaze and visibility, the re-hang cycle, share links
(`#show=<encodeShow>`), quality adaptation, and `window.__gallery` for tests.

### 4.7 `props.js` — the furniture and details that make the hall real

```js
export function createProps(scene, { quality, reducedMotion }): Props
Props {
  colliders: { minX, maxX, minZ, maxZ }[]   // added to the walkable colliders
  pickables: THREE.Object3D[]               // userData.prop = 'catalogue' for the lectern
  setCatalogueCover({ title, palette })     // redraws the printed catalogue's cover
  update(dt, camera)
}
```

Few objects, each one impeccable and placed where a real museum would place
it, never in front of a work or on the walking axis: a lectern near the
entrance holding the printed exhibition catalogue (diegetic: clicking it opens
*Your exhibition*; its cover shows the live title and palette), the
attendant's chair in a far corner, the green exit sign over the door, a wall
extinguisher by the door, ceiling sprinkler heads and smoke detectors, linear
floor grilles along the long walls.

### 4.8 `audio.js` — the sound of the room

```js
export function createAudio(): Audio
Audio {
  start(): Promise<void>     // call from a user gesture (Enter)
  muted: boolean; setMuted(bool)
  setMotion({ speed, moving })   // drives footsteps (cadence from speed)
  lightsOn(i, count)         // a relay clunk + hum for the i-th spot switching on
  reveal()                   // the soft cue when a re-hung work develops
  update(dt)
}
```

Entirely procedural (Web Audio, no files): a quiet room tone with the hall's
long reverb, footsteps on polished concrete, the lights' relays at entry, a
barely-there cue on reveal. Restrained: a museum, not a game soundtrack.
