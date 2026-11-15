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

## 5. The complex (expansion — supersedes conflicting details above)

The client chose to grow the single room into a small, coherent complex, all of
it photorealistic, with the attentive hang working on both gallery floors:

```
                 z = -17 ─────────────── end walls ───────────────
   LEVEL 1  (y = 7.2)                         LEVEL 0  (y = 0)
   ┌──────────────────────┐                  ┌──────────────────────┐
   │   UPPER GALLERY      │ z -17 … 5        │                      │
   │   oak floor, saw-    │                  │       THE HALL       │ z -17 … 17
   │   tooth north lights │                  │   (sections 3–4)     │
   ├──────[glass door]────┤ z = 5            │                      │
   │   ROOF TERRACE       │ z 5 … 17         │                 [LIFT]│ x 3.2…5.4, z 14.9…16.95
   │  [skylight lantern]  │                  │                      │
   └──────────────[LIFT]──┘                  └────────[door]────────┘ z = 17
                                                  ENTRANCE PLAZA        z 17.4 … 50, x ±24
```

### 5.1 Levels and shell
- Ground y = 0. Hall ceiling 6.4; roof slab top **y = 7.2** = upper floor and
  terrace level. Upper gallery interior y ∈ [7.2, 12.2]; its sawtooth roof rises
  to ≈ 13.6. Building footprint x ∈ [−6.9, 6.9], z ∈ [−17.4, 17.4]
  (walls 0.4 thick, exterior faces at x = ±6.9, z = ±17.4).
- The hall's door (x ∈ [−1.3, 1.3], h 3.6, in the z = 17 wall) is now a real
  **open passage** to the plaza: deep reveal through the 0.4 m wall, no
  daylight plane.
- Hall slot **14 is removed** (the lift takes that corner). Hall slots are 0–13.

### 5.2 The glass lift
- Shaft footprint x ∈ [3.2, 5.4], z ∈ [14.9, 16.95], from y = 0 through the roof
  to a glazed head-house on the terrace (top ≈ y 10.6). Glass panels in slim
  dark-bronze frames; the car is visible through the shaft.
- Car: interior x ∈ [3.35, 5.25], z ∈ [15.05, 16.8], glass walls, handrail,
  lit ceiling, floor at `carY` ∈ [0, 7.2]. Doors: two-panel telescopic glass
  sliding doors on the shaft's −z face, opening x ∈ [3.7, 4.9] (1.2 m), at both
  levels, plus car doors moving with the car.
- Call panel on the shaft front face at x = 3.45, y = 1.1 (and y = 8.3); car
  panel inside on the +x wall with buttons **0** (Hall) and **1** (Upper gallery
  & terrace) and a floor indicator.
- Behaviour: call → car comes (if elsewhere) → chime → doors open (1.2 s) → stay
  open 6 s or while someone is in the threshold → close (1.4 s, reopen if the
  threshold is occupied) → travel with S-curve motion, max 1.0 m/s, ≈ 8–9 s
  for 7.2 m → chime → open. The visitor rides with it.

### 5.3 Upper gallery (level 1)
- Interior x ∈ [−6.5, 6.5], z ∈ [−17, 5], y ∈ [7.2, 12.2]. Wide-plank oiled
  oak floor, warm white walls, three sawtooth north-light roof monitors
  (diffuse daylight, no direct sun), slim track lights.
- Front wall at z = 5 is a full-height steel-framed glass façade with a centred
  glass door (x ∈ [−0.9, 0.9]) onto the terrace.
- Slots (continuing the index): **14** `hero` end wall z = −16.98, box 7.0 × 3.6,
  centre y = 7.2 + max(2.2, 0.8 + h/2); **15–17** `side` left wall x = −6.5 at
  z = −13.5, −8.5, −3.5 (far → near), normal +x; **18–20** `side` right wall
  x = +6.5, same z, normal −x. Boxes 3.6 × 3.4. Hanging heights as §3 + 7.2.

### 5.4 Roof terrace (level 1, outdoors)
- Deck x ∈ [−6.5, 6.5], z ∈ [5, 17] at y = 7.2: large-format stone or
  hardwood decking; frameless glass balustrade (h 1.1) on the three open edges.
- Skylight lantern over the hall: x ∈ [−1.8, 1.8], z ∈ [7.0, 15.0], 0.9 m
  high, sloped diffusing (frosted) glass in slim frames.
- Lift head-house at the lift footprint. A couple of outdoor benches facing the
  view. From here: the plaza below and the horizon.

### 5.5 Entrance plaza (level 0, outdoors)
- x ∈ [−24, 24], z ∈ [17.4, 50]. Pale large-format stone paving; a long
  reflecting pool x ∈ [6, 12], z ∈ [22, 40]; a grove of multi-stem trees
  on gravel x ∈ [−16, −8], z ∈ [24, 38]; benches; low boundary walls with
  clipped hedges at the edges; beyond, a believable distant landscape and sky.
- Late-afternoon sun (elevation ≈ 28°, from the south-west, i.e. from +z/−x),
  physically based sky, soft real shadows. The building façade: refined
  board-formed concrete or travertine, with the door glowing from inside.

### 5.6 Walking (centre regions)
The visitor's *centre* must lie inside the union of these rectangles
(they overlap at thresholds); AABB colliders still push out with radius 0.35.

Level 0: hall main x ∈ [−5.7, 5.7], z ∈ [−16.2, 14.1]; hall front-left
x ∈ [−5.7, 2.4], z ∈ [14.0, 16.2]; door x ∈ [−0.85, 0.85], z ∈ [15.5, 18.5];
plaza x ∈ [−23, 23], z ∈ [18.2, 49]. Lift threshold (only while the doors are
open at this level) x ∈ [3.75, 4.85], z ∈ [13.8, 15.6]; car x ∈ [3.75, 4.85],
z ∈ [15.45, 16.4] (only while open here, or while the visitor is inside).

Level 1: upper gallery x ∈ [−5.7, 5.7], z ∈ [−16.2, 4.2]; gallery door
x ∈ [−0.85, 0.85], z ∈ [3.8, 6.0]; terrace main x ∈ [−5.9, 5.9],
z ∈ [5.6, 14.1]; terrace front-left x ∈ [−5.9, 2.4], z ∈ [14.0, 16.4]; lift
threshold and car as level 0. Lantern collider x ∈ [−2.15, 2.15],
z ∈ [6.65, 15.35].

### 5.7 Rendering organisation
- Scene groups: `hall` (room.js), `upper` (upper.js), `exterior` (exterior.js),
  `lift` (lift.js). main.js hides the interior the visitor cannot see
  (hall while on level 1 outside the lift, upper while on level 0), and shows
  both during a ride.
- The sun is a real DirectionalLight with shadows rendered **once** (static
  scene: `shadowMap.autoUpdate = false`, update on build). Every interior mesh
  receives shadows and the building shell casts them, so sunlight only enters
  where it physically could (through the door).
- Heavy exterior detail (foliage, gravel, distant scenery) lives on layer 1:
  rendered by the main camera, skipped by floor/pool reflections.

## 6. The campus (phase 2 — supersedes §5 where they differ)

The client wants the classic museum's beloved spaces kept and made spectacular
and photoreal — "it must look like GTA 6": the **Cinema**, the **Studio**, the
**Arcade**, the **gardens** and the **amphitheatre** — plus the working glass
lift. Built by many specialists in parallel, each owning exactly one module.

### 6.1 Site plan (metres; y up; ground y = 0; the hall is §3)

| Space | Where | Notes |
|---|---|---|
| Hall | x ±6.5, z ±17, y 0–6.4 | §3–4. Shell exterior faces x ±6.9, z ±17.4; roof slab top y 7.2 |
| Glass lift | shaft x 3.2–5.4, z 14.9–16.95, y 0 → head-house top 10.6 | §5.2 |
| Cinema (level 1) | interior x ±6.5, z −17…5, y 7.2–13.2 | raked seating rising toward z = 5; screen on z = −16.8 wall; glazed foyer façade at z = 5 with doors x ±0.9 |
| Roof terrace (level 1) | x ±6.9, z 5.4–17.4, y 7.2 | §5.4 (lantern x ±1.8, z 7–15, h 0.9) |
| Entrance plaza | x ±24, z 17.4–52, y 0 | paving; axis from the hall door |
| Reflecting pool | x ±3.5, z 24–38 | stone coping top y 0.45 |
| Parterres | x ±(5.5…10), z 21–35 | formal clipped-box beds, gravel |
| Allées | trees at x = ±18, z = 21…35 every 3.5 | on gravel |
| Studio pavilion | footprint x −23…−11, z 38–50 | door on its east face (x = −11) centred z = 44, 1.6 wide |
| Arcade pavilion | footprint x 11…23, z 38–50 | door on its west face (x = 11) centred z = 44, 1.6 wide |
| Plaza boundary | low walls + clipped hedges on x = ±24 and z = 52 | openings: x = −24 and x = +24 at z 27–31; z = 52 at x ±2 |
| Amphitheatre (west) | x −62…−28, z 14–46 | sunken: rim y = 0, orchestra/stage y = −4.2; stage centred (−54, 30) facing east; tiers face west toward it; path from the plaza opening |
| Garden (east) | x 28–64, z 14–50 | lawns, specimen trees, pergola walk, flower borders, fountain, sculpture, benches |
| Landscape | everything else to ~600 m | rolling terrain, distant tree lines, real HDR sky |

Sun: from the HDR sky photograph (`M.sky().sunDirection`).

### 6.2 Space module contract

Each module is `assets/gallery/spaces/<name>.js`:

```js
export function build(ctx) {
  // ctx = { THREE, renderer, scene, M /* materials.js */, quality, reducedMotion,
  //         audio /* may be null */, ui: { openApp(url, title), toast(text) } }
  return {
    group,          // THREE.Group, built in WORLD coordinates per §6.1, added to ctx.scene by the caller
    regions,        // [{ minX, maxX, minZ, maxZ, y } | { ..., ramp: { axis: 'x'|'z', from, to, y0, y1 } }]
                    //   where the visitor's CENTRE may stand (eye = floor + 1.62); overlap neighbours at thresholds
    colliders,      // [{ minX, maxX, minZ, maxZ, minY, maxY }]  solid obstacles (radius 0.35 is added by controls)
    pickables,      // Object3D[] with userData.action = { type: 'app', url, title } | { type: 'custom', id }
    update(dt, frame) {},   // frame = { camera, time, level } — no allocations
    onPick(object) {},      // for userData.action.type === 'custom'
  };
}
```

Rules for every module: materials from `ctx.M.get(name)` (photographed PBR;
call `ctx.M.boxUV(geometry)` so textures are at real scale), real-world
dimensions, `castShadow`/`receiveShadow` on solid meshes, `InstancedMesh` for
repeats, no per-frame allocation, nothing outside its footprint, no external
files beyond `assets/` (textures in `assets/textures/`, artworks in
`assets/extracted/`, apps in `assets/apps/`, games in `assets/extracted/*.html`,
the film `assets/video/because-you-say-so.mp4`). `quality === 'low'` builds a
lighter version (fewer instances, no fine detail).
