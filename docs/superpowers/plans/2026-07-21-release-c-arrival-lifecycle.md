# Release C Arrival Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make physical portals, fast-map destinations and minimap movement use one truthful room-arrival lifecycle.

**Architecture:** Keep `startCameraTransition()` and the existing portal visual approach intact. Extract only the duplicated post-arrival state work from `setPlayerLocation()` and `travelTo()` into one helper that records evidence, controls room-scoped Studio playback, resets transient controls, refreshes room UI and reports arrival. Callers remain responsible for their distinct movement presentation: direct placement for fast travel/minimap and doorway fade for portals.

**Tech Stack:** Vanilla ES modules in `index.html`, Three.js, Node built-in test runner.

## Global Constraints

- Preserve the `placeBuildReady()` and `roomBuildReady()` guards before a location changes.
- Preserve current reduced-motion behaviour and the portal approach/fade choreography.
- Do not create, merge or deploy a GitHub Pages release from this branch without Pedro’s required five yes/no answers.
- Keep `.hermes/` local and untracked.

---

## File Structure

- Modify: `index.html` — add `applyRoomArrival()` immediately before `setPlayerLocation()`; route direct and physical transitions through it.
- Modify: `tests/workshop-integration.test.mjs` — add source-level regression checks proving that both paths call the shared helper and no longer duplicate arrival evidence.

### Task 1: Extract the shared arrival lifecycle

**Files:**
- Modify: `index.html:12741-12970`

**Interfaces:**
- Consumes: `room`, `label`, `destination`, `newYaw`, `newPitch`; existing globals `currentRoom`, `rpgMode`, `studioMusicFollow`, `visitGuidanceScheduler` and `cameraTransition`.
- Produces: `applyRoomArrival({ room, label, pos, yaw, pitch=0 })`, which leaves the visitor at the room destination with room-specific media/UI state current.

- [ ] **Step 1: Write the failing regression test**

```js
test('physical and direct room travel share one arrival lifecycle', () => {
  assert.match(html, /function applyRoomArrival\(/);
  const direct = html.slice(html.indexOf('function setPlayerLocation'), html.indexOf('function fastTravel'));
  const portal = html.slice(html.indexOf('function travelTo'), html.indexOf('function resize'));
  assert.match(direct, /applyRoomArrival\(/);
  assert.match(portal, /applyRoomArrival\(/);
  assert.doesNotMatch(portal, /recordWorkshopEvidence\(\{kind:'arrival'/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/workshop-integration.test.mjs`

Expected: FAIL because `applyRoomArrival` does not exist.

- [ ] **Step 3: Add the helper and route direct placement through it**

```js
function applyRoomArrival({room,label,pos,newYaw,newPitch=0}){
  currentRoom=room;
  recordWorkshopEvidence({kind:'arrival',action:isHoodRoom(room)?'returned':'arrived',capability:isHoodRoom(room)?'return':null,room,roomLabel:visitRoomLabel(room),id:stableInteractionId('arrival',room,label),label:label||visitRoomLabel(room),source:'world'});
  // retain the existing Rooms guidance, Studio playback, archive, lighting,
  // camera, focus-state and panel-reset statements from setPlayerLocation.
}
function setPlayerLocation(room,pos,newYaw,label,newPitch=0){
  exitScreenControl();
  seatedStudioView=false;
  seatedAmphView=false;
  if($('playOverlay').classList.contains('show')) closePlayOverlay();
  applyRoomArrival({room,label,pos,newYaw,newPitch});
}
```

- [ ] **Step 4: Route physical portal arrival through the same helper**

```js
setTimeout(()=>{
  applyRoomArrival({
    room:portal.room,
    label:portal.label || visitRoomLabel(portal.room),
    pos:portal.targetPos,
    newYaw:portal.targetYaw,
    newPitch:0,
  });
  requestAnimationFrame(()=>overlay.classList.remove('show'));
}, reducedMotion ? 0 : 210);
```

- [ ] **Step 5: Run the regression test to verify it passes**

Run: `node --test tests/workshop-integration.test.mjs`

Expected: PASS with the shared-arrival subtest green.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/workshop-integration.test.mjs
git commit -m "refactor: unify room arrival lifecycle"
```

### Task 2: Verify transition presentation is retained

**Files:**
- Modify: `tests/workshop-integration.test.mjs`

**Interfaces:**
- Consumes: `travelTo()` and `startCameraTransition()` from `index.html`.
- Produces: Regression evidence that portals retain their physical approach/fade and fast travel remains direct.

- [ ] **Step 1: Write the failing regression test**

```js
test('physical portals retain their approach and fade around shared arrival', () => {
  const portal = html.slice(html.indexOf('function travelTo'), html.indexOf('function resize'));
  assert.match(portal, /startCameraTransition\(approach, faceYaw, 0, \.46\)/);
  assert.match(portal, /overlay\.classList\.add\('show'\)/);
  assert.match(portal, /applyRoomArrival\(/);
  assert.match(portal, /overlay\.classList\.remove\('show'\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/workshop-integration.test.mjs`

Expected: FAIL before Task 1 routes the portal through `applyRoomArrival()`.

- [ ] **Step 3: Keep the transition sequence explicit**

```js
if(!reducedMotion) startCameraTransition(approach, faceYaw, 0, .46);
setTimeout(jump, reducedMotion ? 0 : 480);
// `jump` owns the fade, calls applyRoomArrival and removes the fade next frame.
```

- [ ] **Step 4: Run focused and full verification**

Run: `node --test tests/workshop-integration.test.mjs && node --test tests/*.test.mjs && git diff --check`

Expected: All tests pass and no whitespace errors are reported.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/workshop-integration.test.mjs
git commit -m "test: protect portal arrival choreography"
```

## Self-Review

- **Spec coverage:** Task 1 removes duplicated arrival semantics; Task 2 protects the difference that should remain—portal choreography versus direct fast travel.
- **Placeholder scan:** No unspecified files, commands or interfaces remain.
- **Type consistency:** Both tasks use the same `applyRoomArrival({room,label,pos,newYaw,newPitch})` object contract.
