# Garden Study Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor capture their current Workshop view, preserve it locally with editable location notes, and use it as a Garden Making Table study.

**Architecture:** A small ES module owns deterministic Garden Study record normalization and IndexedDB persistence. `index.html` captures the existing WebGL canvas only on explicit visitor action, creates a study record containing room/date/camera metadata, and opens the Garden desk on that study. The desk remains a room-specific editor and exports PNGs explicitly; no account, upload or server is introduced.

**Tech Stack:** Browser IndexedDB, WebGL canvas capture, existing Three.js renderer, native Canvas 2D, Node `node:test`, Playwright browser smoke.

## Global Constraints

- Store every study only on the current browser/device; do not add a network request, account, public sharing or background upload.
- Capture only after an explicit visitor action and never while focus is in a browser control or dialog.
- Preserve editable `room`, `capturedAt`, camera position and viewing direction in each capture.
- Keep the Garden desk keyboard-accessible and Escape-closeable through the existing dialog helper.
- Avoid collection/progression language: a study is working material, not a reward.
- Do not commit, push, merge or deploy until rendered desktop/mobile review receives explicit approval.

---

### Task 1: Local Garden Study records and storage

**Files:**
- Create: `assets/js/workshop-garden-study.js`
- Create: `tests/workshop-garden-study.test.mjs`

**Interfaces:**
- Produces `normalizeGardenStudy(input, now)`, `createGardenStudyStore(indexedDB)`, and `formatGardenStudyCaption(study)`.
- A normalized record has `{id, imageDataUrl, room, capturedAt, camera:{position:{x,y,z}, direction:{x,y,z}}, title, notes}`.

- [ ] **Step 1: Write a failing normalization test**

```js
const study = normalizeGardenStudy({ imageDataUrl:'data:image/png;base64,a', room:'maze', camera:{position:{x:1,y:2,z:3},direction:{x:0,y:0,z:-1}} }, ()=>'2026-07-22T18:00:00.000Z');
assert.equal(study.room, 'maze');
assert.equal(study.capturedAt, '2026-07-22T18:00:00.000Z');
assert.equal(study.notes, '');
assert.match(study.id, /^garden-study-/);
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module is absent.**

Run: `node --test tests/workshop-garden-study.test.mjs`

- [ ] **Step 3: Implement the smallest normalizer and caption formatter.**

```js
export function normalizeGardenStudy(input={}, now=()=>new Date().toISOString()) {
  if (!String(input.imageDataUrl || '').startsWith('data:image/')) throw new TypeError('Garden Study requires a captured image');
  return { id: input.id || `garden-study-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, imageDataUrl: input.imageDataUrl, room: String(input.room || 'unknown'), capturedAt: input.capturedAt || now(), camera: input.camera, title: String(input.title || ''), notes: String(input.notes || '') };
}
```

- [ ] **Step 4: Re-run the focused test and confirm it passes.**

- [ ] **Step 5: Add an IndexedDB fake-backed test for `put`, `get`, `list` and `remove`; then implement only those store methods.**

- [ ] **Step 6: Run `node --test tests/workshop-garden-study.test.mjs` and commit this independent slice.**

### Task 2: Explicit in-world capture

**Files:**
- Modify: `index.html` renderer setup near `new THREE.WebGLRenderer`
- Modify: `index.html` world keyboard / interaction handling and Garden table opening near `openGardenMaker`
- Modify: `tests/workshop-integration.test.mjs`

**Interfaces:**
- Consumes `normalizeGardenStudy` and the store from Task 1.
- Produces `captureGardenStudyFromWorld()` and an explicit capture control that calls it.

- [ ] **Step 1: Write a failing source-level contract test** requiring `preserveDrawingBuffer:true`, `captureGardenStudyFromWorld`, active-dialog rejection, canvas PNG capture and metadata including `currentRoom`, camera position and camera direction.
- [ ] **Step 2: Run `node --test tests/workshop-integration.test.mjs` and confirm the new assertion fails.**
- [ ] **Step 3: Add the explicit capture action.** It must read `renderer.domElement.toDataURL('image/png')`, normalize/save the record, announce success, and open the Garden desk on the new study. It must return without capture when any accessible dialog is open or an ordinary control owns keyboard input.
- [ ] **Step 4: Run the focused integration test until it passes.**
- [ ] **Step 5: Commit this independent slice.**

### Task 3: Garden Study editor and return visits

**Files:**
- Modify: `index.html` `openGardenMaker` implementation
- Modify: `tests/workshop-integration.test.mjs`

**Interfaces:**
- Consumes a saved study record from Tasks 1–2.
- Produces a desk view with image-backed canvas, editable title/notes/caption fields, recent-study selection and explicit PNG export.

- [ ] **Step 1: Write a failing integration contract test** requiring a `Garden Study` editor region, title and notes controls, a caption toggle/remove operation, a recent-study list and `Garden Study` data being loaded before the editor canvas is drawn.
- [ ] **Step 2: Run the focused test and confirm it fails.**
- [ ] **Step 3: Replace the current blank-only desk header with a compact study strip.** The strip contains `Capture view`, `title`, `notes`, a location caption checkbox, recent studies and existing paint/collage/export controls. Opening a study draws its image as the base canvas before any new marks.
- [ ] **Step 4: Persist edits after deliberate input/change actions; restore the most-recent study when the table opens.**
- [ ] **Step 5: Run focused tests and commit.**

### Task 4: Browser verification and visual review

**Files:**
- Create or modify: `tests/browser-garden-study-smoke.mjs`

- [ ] **Step 1: Add a Playwright smoke path:** enter the scene, invoke the explicit capture control, confirm the Garden desk opens, enter a note, close/reopen and verify the note/caption remains.
- [ ] **Step 2: Run it against a local static server; confirm no page errors and a non-empty capture image.**
- [ ] **Step 3: Run the full Node suite, browser smoke, inline-module syntax extraction and `git diff --check`.**
- [ ] **Step 4: Inspect rendered desktop and mobile flows:** capture control, study strip, caption/readability, table route and close/return behavior.
- [ ] **Step 5: Present screenshots for explicit aesthetic approval. Do not commit the final review/change set, push, merge or deploy without that approval.**

## Self-review

- Capture has one clear source: the current explicit WebGL view.
- Persistent state is local-only and bounded by browser storage; no account/cloud behavior is implied.
- Every required user-facing datum—image, room, date, camera metadata and notes—has an owning record field and an editor path.
- The plan covers automated behavior tests plus required rendered desktop/mobile proof.
