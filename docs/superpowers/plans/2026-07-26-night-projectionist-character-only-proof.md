# Night Projectionist Character-Only Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one licensed, authored, rigged Night Projectionist and a standalone neutral browser proof that can be judged as a complete human before any Workshop room, behaviour or dialogue integration.

**Architecture:** Keep the proof outside the live Warehouse: a dedicated static HTML page loads one local GLB through a focused ES module, normalises it to a canonical stage, exposes truthful diagnostics, and provides fixed review cameras plus three authored motion clips. Asset provenance and limits are encoded in a JSON manifest and checked by Node and Playwright tests. The implementation remains uncommitted until Pedro explicitly approves the rendered complete human.

**Tech Stack:** Blender 4.5.12 LTS only when local authoring is explicitly required; glTF 2.0 binary (`.glb`); Three.js 0.170.0 and `GLTFLoader`; static HTML/CSS/ES modules; Node.js 22; Node built-in test runner; Playwright 1.47+; Python 3.11 static server.

## Global Constraints

- The approved design source is `docs/superpowers/specs/2026-07-26-night-projectionist-character-design.md` at commit `51de637` or a descendant.
- This plan implements **Stage A only: complete human plus neutral/minimal workbench proof**.
- Do not modify `index.html`, `assets/js/workshop-foundation.js`, `assets/js/workshop-visit.js`, `assets/js/workshop-record.js`, `assets/js/workshop-garden-study.js`, or any room builder.
- Do not implement a booth, projection-room aperture, Venue geometry, room placement, route, dialogue, voice, captions, relationship state, Reel 6, persistence, interaction marker, quest, NPC platform, merge or deployment.
- The character is exactly 52, lean and ordinary, with greying practical hair, thin metal spectacles, pale shirt, uneven rolled sleeves, charcoal waistcoat, softened cardigan, dark trousers and repaired shoes.
- Preserve the A/C hybrid: expressive asymmetry disciplined by archival restraint.
- Preserve the six-zone tattoo atlas, fragmented multilingual writing, one oxide-red neck repair and all prohibitions in the specification.
- Required GLB animation clip names are exactly `working`, `magnetic` and `fracture`.
- The GLB canonical forward direction is `+Z`; feet sit at `y=0`; exported height is `1.78m` after proof normalisation.
- Asset budget: GLB at or below `32 MiB`, no more than `150,000` rendered triangles, no texture edge above `2048px`, no more than `24` loaded textures and no more than `40` geometries.
- Mobile renderer pixel ratio is capped at `1.5`; desktop is capped at `2`. Automated mobile coverage uses a touch-enabled mobile Chromium context, and final approval additionally requires one physical-phone browser check on the local network.
- No animation autoplays when `prefers-reduced-motion: reduce`; manual review controls remain available.
- The rejected Rocketbox `Male_Adult_05`, its idle animation and any cosmetically similar base are forbidden.
- Lighting, darkness, glazing, props and dialogue cannot rescue a generic figure.
- **Pre-commit visual exception:** normal task-by-task implementation commits are forbidden. Keep Tasks 1–8 uncommitted. Commit the complete implementation only in Task 9 after Pedro’s explicit rendered approval.
- Temporary candidate files, `.blend` sources, contact sheets and screenshots live under `%LOCALAPPDATA%\Temp\hermes-projectionist-*`, never in the repository.
- If no candidate passes licence and complete-human preflight, stop. Do not substitute primitives, a mannequin or another anonymous stock avatar.

## File Map

### Create during the uncommitted proof

- `projectionist-character-proof.html` — standalone review shell; never linked from the live site.
- `assets/css/projectionist-character-proof.css` — neutral, responsive review-stage styling only.
- `assets/js/projectionist-character-proof.js` — GLB loading, normalisation, camera presets, motion playback, diagnostics and render lifecycle.
- `assets/models/projectionist/night-projectionist.glb` — approved complete-human hypothesis.
- `assets/models/projectionist/manifest.json` — provenance, asset budget and canonical clip contract.
- `assets/models/projectionist/ATTRIBUTION.md` — exact licence/source/derivative record.
- `assets/models/projectionist/LICENSES.md` — verbatim upstream licence/notice text for every embedded component.
- `assets/models/projectionist/tattoo-fragments.json` — complete audited inventory of every textual/glyph tattoo fragment.
- `assets/models/projectionist/APPROVAL.json` — Pedro’s exact approval tied to the GLB and retained-evidence hashes; created only after approval.
- `tests/projectionist-character-proof.test.mjs` — static and GLB-structure contract tests.
- `tests/browser-projectionist-character-proof.mjs` — real loader, view, motion, responsive and performance evidence.

### Modify during the uncommitted proof

- `package.json` — add the focused Node test to `npm test` and add `test:projectionist`.

### Do not create or modify

- Any production-room file or `index.html`.
- Any dialogue, audio or visitor-state module.
- Any committed screenshots, `.blend` authoring source, temporary contact sheet or browser probe outside the two named reusable tests.

## Plan Approval Boundary

This document is the review artefact; creating it does not start implementation. After Pedro approves the plan, make one documentation-only commit before Task 1:

```bash
git add -- docs/superpowers/plans/2026-07-26-night-projectionist-character-only-proof.md
git commit -m "Document Night Projectionist character-only proof plan"
git status --short --branch --untracked-files=all
```

Expected: the plan commit is the only new commit after the approved specification, and the worktree is clean. Task 1 records that committed plan SHA as its base. Do not combine plan approval with model/proof implementation.

---

### Task 1: Establish the clean, uncommitted execution baseline

**Files:**
- Read: `docs/superpowers/specs/2026-07-26-night-projectionist-character-design.md`
- Read: `docs/superpowers/plans/2026-07-26-night-projectionist-character-only-proof.md`
- Modify: none

**Interfaces:**
- Consumes: approved spec commit `51de637`.
- Produces: recorded `BASE_SHA`; clean execution invariant; temporary authoring directory outside the repository.

- [ ] **Step 1: Verify the approved specification is an ancestor**

```bash
git merge-base --is-ancestor 51de637 HEAD
```

Expected: exit `0`.

- [ ] **Step 2: Verify the branch contains no implementation work**

```bash
git status --short --untracked-files=all
git diff --check
```

Expected: clean output because the approved plan has already received its documentation-only commit; no model, proof page, runtime module or test exists. If the plan is still untracked, stop and complete the Plan Approval Boundary first.

- [ ] **Step 3: Record the immutable execution base**

```bash
AUTHORING_DIR="$LOCALAPPDATA/Temp/hermes-projectionist-authoring"
mkdir -p "$AUTHORING_DIR/evidence"
BASE_SHA=$(git rev-parse HEAD)
printf '%s\n' "$BASE_SHA" | tee "$AUTHORING_DIR/evidence/base-sha.txt"
```

Expected: the SHA containing the approved spec and, after plan approval, this plan. The value is preserved outside the repository for later fresh task workers; do not hard-code it into production files.

- [ ] **Step 4: Create the external authoring workspace**

```bash
AUTHORING_DIR="$LOCALAPPDATA/Temp/hermes-projectionist-authoring"
mkdir -p "$AUTHORING_DIR/candidates" "$AUTHORING_DIR/source" "$AUTHORING_DIR/evidence"
python - <<'PY'
from pathlib import Path
import shutil
root = Path.cwd()
target = Path.home() / 'AppData/Local/Temp/hermes-projectionist-authoring/evidence/package.before.json'
shutil.copyfile(root / 'package.json', target)
PY
sha256sum package.json > "$AUTHORING_DIR/evidence/package.before.sha256"
printf '%s\n' "$AUTHORING_DIR"
```

Expected: all candidate previews and `.blend` files remain outside the Git worktree.

- [ ] **Step 5: Verify the canonical baseline suite**

```bash
npm test
```

Expected: `49` tests pass before proof work begins.

**Checkpoint:** No commit. Report `BASE_SHA`, baseline test count and tool availability.

### Task 2: Define the asset and standalone-proof contract with failing tests

**Files:**
- Create: `tests/projectionist-character-proof.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: no model or proof files.
- Produces: exact required paths, GLB node/clip/budget contract and proof-page boundary.

- [ ] **Step 1: Create the failing contract test**

Create `tests/projectionist-character-proof.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const url = path => new URL(path, root);

async function parseGlb(path) {
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF', 'asset is a binary glTF');
  assert.equal(bytes.readUInt32LE(4), 2, 'asset uses glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB header length matches file length');
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      const text = bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\u0000+$/, '').trim();
      return { bytes, json: JSON.parse(text) };
    }
    offset += 8 + length;
  }
  assert.fail('GLB contains no JSON chunk');
}

const requiredFiles = [
  'projectionist-character-proof.html',
  'assets/css/projectionist-character-proof.css',
  'assets/js/projectionist-character-proof.js',
  'assets/models/projectionist/night-projectionist.glb',
  'assets/models/projectionist/manifest.json',
  'assets/models/projectionist/ATTRIBUTION.md',
  'assets/models/projectionist/LICENSES.md',
  'assets/models/projectionist/tattoo-fragments.json'
];

for (const path of requiredFiles) {
  test(`character proof contains ${path}`, async () => {
    assert.ok((await stat(url(path))).isFile());
  });
}

test('manifest preserves provenance, character contract and budgets', async () => {
  const manifest = JSON.parse(await readFile(url('assets/models/projectionist/manifest.json'), 'utf8'));
  assert.equal(manifest.id, 'night-projectionist');
  assert.equal(manifest.character.age, 52);
  assert.equal(manifest.character.identity, 'Scandinavian; country unspecified');
  assert.equal(manifest.asset.file, 'night-projectionist.glb');
  assert.match(manifest.asset.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.asset.sourceUrl, /^(https:\/\/|urn:the-workshop:)/);
  assert.ok(manifest.asset.sourceRevision.length >= 7);
  assert.ok(manifest.asset.licence.length > 0);
  assert.deepEqual(manifest.asset.clips, ['working', 'magnetic', 'fracture']);
  assert.deepEqual(manifest.asset.evidenceFrames, {
    working:[{label:'start',at:.05},{label:'hand-contact',at:.45},{label:'listening-stillness',at:.72},{label:'end',at:.9}],
    magnetic:[{label:'start',at:.05},{label:'facial-warmth',at:.35},{label:'frame-gesture',at:.65},{label:'end',at:.9}],
    fracture:[{label:'start',at:.05},{label:'warmth-closes',at:.35},{label:'neck-contact',at:.65},{label:'end',at:.9}]
  });
  assert.deepEqual(manifest.asset.tattooZones, [
    'private-neck-mark', 'nested-frame-field', 'interrupted-heart',
    'left-arm-archive', 'right-arm-gestures', 'buried-text-strata'
  ]);
  assert.equal(manifest.budgets.maxBytes, 32 * 1024 * 1024);
  assert.equal(manifest.budgets.maxTriangles, 150000);
  assert.equal(manifest.budgets.maxTextureEdge, 2048);
  assert.ok(Array.isArray(manifest.asset.components) && manifest.asset.components.length >= 1);
  for (const component of manifest.asset.components) {
    assert.match(component.sourceUrl, /^(https:\/\/|urn:the-workshop:)/);
    assert.ok(component.sourceRevision.length >= 7);
    assert.ok(component.licence.length > 0);
    assert.ok(component.noticeHeading.length > 0);
    assert.equal(component.redistributionVerified, true);
  }
});

test('attribution repeats the approved manifest provenance', async () => {
  const manifest = JSON.parse(await readFile(url('assets/models/projectionist/manifest.json'), 'utf8'));
  const attribution = await readFile(url('assets/models/projectionist/ATTRIBUTION.md'), 'utf8');
  assert.match(attribution, new RegExp(manifest.asset.sha256));
  assert.ok(attribution.includes(manifest.asset.sourceUrl));
  assert.ok(attribution.includes(manifest.asset.sourceRevision));
  assert.ok(attribution.includes(manifest.asset.licence));
  const licences = await readFile(url('assets/models/projectionist/LICENSES.md'), 'utf8');
  for (const component of manifest.asset.components) assert.ok(licences.includes(component.noticeHeading));
});

test('tattoo fragment inventory is non-lexical and fully reviewed', async () => {
  const inventory = JSON.parse(await readFile(url('assets/models/projectionist/tattoo-fragments.json'), 'utf8'));
  assert.ok(inventory.fragments.length > 0);
  assert.ok(inventory.review.reviewer.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(inventory.review.date));
  const countryNames = /denmark|danish|sweden|swedish|norway|norwegian|finland|finnish|iceland|icelandic/i;
  for (const fragment of inventory.fragments) {
    assert.equal(fragment.translation, null);
    assert.equal(fragment.countrySignal, null);
    assert.doesNotMatch(fragment.glyphs, countryNames);
    assert.doesNotMatch(fragment.glyphs, /[A-Za-zÀ-ÿ]{5,}/);
  }
});

test('GLB is complete, bounded and carries the three authored clips', async () => {
  const { bytes, json } = await parseGlb(url('assets/models/projectionist/night-projectionist.glb'));
  const manifest = JSON.parse(await readFile(url('assets/models/projectionist/manifest.json'), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.asset.sha256);
  assert.ok(bytes.length <= 32 * 1024 * 1024, `GLB is ${bytes.length} bytes`);
  assert.ok((json.skins?.length ?? 0) >= 1, 'GLB contains a rig');
  assert.ok((json.meshes?.length ?? 0) >= 1, 'GLB contains meshes');
  assert.ok(json.meshes.some(mesh => mesh.primitives?.some(primitive => primitive.targets?.length)),
    'GLB contains morph targets for authored facial registers');
  assert.ok((json.buffers ?? []).every(buffer => !buffer.uri), 'GLB embeds every buffer');
  assert.ok((json.images ?? []).every(image => !image.uri), 'GLB embeds every image');
  assert.deepEqual((json.animations ?? []).map(item => item.name), ['working', 'magnetic', 'fracture']);
  const nodeNames = new Set((json.nodes ?? []).map(node => node.name));
  for (const name of ['Projectionist_Root', 'Forward_+Z', 'Back_-Z', 'Body', 'Hair', 'Glasses', 'Shirt', 'Waistcoat', 'Cardigan', 'Trousers', 'Shoes']) {
    assert.ok(nodeNames.has(name), `GLB contains node ${name}`);
  }
});

test('proof is standalone and cannot enter the live Warehouse', async () => {
  const [page, module, live] = await Promise.all([
    readFile(url('projectionist-character-proof.html'), 'utf8'),
    readFile(url('assets/js/projectionist-character-proof.js'), 'utf8'),
    readFile(url('index.html'), 'utf8')
  ]);
  assert.match(page, /id="projectionistProofCanvas"/);
  for (const view of [
    'front','three-quarter','profile','back','face','glasses','hands',
    'tattoos','neck','chest','left-arm','right-arm'
  ]) assert.match(page, new RegExp(`data-proof-view="${view}"`));
  assert.match(page, /data-proof-motion="working"/);
  assert.match(module, /window\.__projectionistCharacterProof/);
  assert.doesNotMatch(page + module, /dialogue|Reel 6|relationship|quest|Venue|booth/i);
  assert.doesNotMatch(live, /projectionist-character-proof|night-projectionist\.glb|__projectionistCharacterProof/);
});
```

- [ ] **Step 2: Add the focused script without removing canonical tests**

Replace `package.json` with this complete content:

```json
{
  "name": "the-workshop",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "THE WORKSHOP — a walkable museum of rooms, images and machines.",
  "scripts": {
    "test": "node --test tests/workshop-foundation.test.mjs tests/workshop-integration.test.mjs tests/workshop-visit.test.mjs tests/workshop-record.test.mjs tests/workshop-garden-study.test.mjs tests/projectionist-character-proof.test.mjs",
    "test:browser": "node tests/browser-hotfix-smoke.mjs",
    "test:instrument": "node tests/browser-instrument-smoke.mjs",
    "test:projectionist": "node --test tests/projectionist-character-proof.test.mjs && node tests/browser-projectionist-character-proof.mjs",
    "test:all": "npm test && npm run test:browser && npm run test:instrument",
    "serve": "python -m http.server 8834"
  },
  "devDependencies": {
    "playwright": "^1.47.0"
  }
}
```

Record the exact plan-owned package state for guarded rollback:

```bash
sha256sum package.json > "$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/package.proof.sha256"
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/projectionist-character-proof.test.mjs
```

Expected: FAIL because the proof page, module, stylesheet, manifest, attribution and GLB do not exist.

**Checkpoint:** No commit. Keep the RED output.

### Task 3: Preflight complete-human routes before downloading or authoring

**Files:**
- Repository: none
- External evidence: `%LOCALAPPDATA%\Temp\hermes-projectionist-authoring\candidates\candidate-matrix.md`
- External evidence: `%LOCALAPPDATA%\Temp\hermes-projectionist-authoring\evidence\candidate-contact-sheet.png`

**Interfaces:**
- Consumes: approved visual specification and forbidden Rocketbox reference.
- Produces: one Pedro-approved candidate route, or a hard stop.

- [ ] **Step 1: Inventory local capability and record exact versions**

```bash
{
  printf 'node='; node --version
  printf 'npm='; npm --version
  printf 'python='; python --version
  if command -v blender >/dev/null 2>&1; then
    printf 'blender='; blender --version
  else
    printf 'blender=NOT_INSTALLED\n'
  fi
} > "$AUTHORING_DIR/evidence/tooling.txt"
```

Expected on the current machine: Blender is not installed.

- [ ] **Step 2: Screen at least three lawful routes from official source pages**

For each route, record in `candidate-matrix.md`:

```markdown
| Route/component | Official URL | Exact revision/version | Licence | Verbatim notice saved | Embedded redistribution | Complete body | Rig | Face/age | Hands | Clothing fit | Authoring cost | Verdict |
```

Allowed route classes:

1. a complete rigged human with explicit redistribution terms;
2. a lawful human generator whose output licence permits repository distribution;
3. original or commissioned complete-human authoring.

Do not use search-result thumbnails as proof. Preserve the official source URL, licence URL and revision. Assemble every required upstream licence and notice verbatim in `$AUTHORING_DIR/evidence/LICENSES.md`; include separate entries for base mesh, rig, hair, each clothing source, textures and animations.

- [ ] **Step 3: Apply the hard rubric**

Score each category `0`, `1` or `2`:

- licence and redistribution;
- complete head–neck–shoulder–body continuity;
- visible age plausibility;
- authored face potential;
- hands and footwear;
- clothing-layer compatibility;
- rig and facial-motion capacity;
- tattoo UV capacity;
- ordinary, non-heroic proportions;
- freedom from game/utility/mascot coding.

Reject any route with:

- a zero in licence, complete body, face/age, hands or clothing;
- a total below `16/20`;
- visual similarity to Rocketbox `Male_Adult_05`;
- an attribution or redistribution ambiguity.

- [ ] **Step 4: Build one contact sheet from official previews**

The contact sheet must show neutral front or three-quarter views at equal scale with route name, revision and licence beneath each candidate. Do not retouch previews to make weak candidates look stronger.

- [ ] **Step 5: Obtain Pedro’s explicit candidate-route approval**

Present the contact sheet and matrix. State which route is recommended and why. Stop until Pedro approves one route.

If no route passes, report the blocker and offer exactly these two next decisions:

- commission/source a complete rigged human;
- explicitly authorise a longer original-human build in Blender 4.5.12 LTS.

Do not proceed with a generic fallback.

- [ ] **Step 6: Write and independently review the approved route’s exact external authoring addendum**

Before Task 4, create `$AUTHORING_DIR/evidence/route-authoring-addendum.md`. It records, without alternatives:

- downloaded source filenames and SHA-256 values;
- every embedded mesh, texture, rig, hair, clothing and animation component plus licence/notice;
- source-to-canonical object and bone-name mapping;
- exact modifier/retarget order;
- exact UV/tattoo transfer method;
- exact facial-control and NLA-track creation steps;
- exact Blender commands or UI operations required by that approved source;
- exact rejection and rollback commands for that route.

Run a fresh-context review of that external addendum and append the dated PASS verdict to the same file. Task 4 is blocked until the addendum passes. Do not modify this tracked plan during execution. This gate is deliberate: source-specific human authoring cannot be truthfully prescribed before the source is selected, while keeping the addendum external prevents it from conflicting with Task 9’s exact repository allowlist.

**Checkpoint:** No repository commit or asset copy.

### Task 4: Author and export the complete human outside the repository

**Files:**
- External source: `%LOCALAPPDATA%\Temp\hermes-projectionist-authoring\source\night-projectionist.blend`
- External export: `%LOCALAPPDATA%\Temp\hermes-projectionist-authoring\source\night-projectionist.glb`
- Repository: none until all checks below pass

**Interfaces:**
- Consumes: the approved route and independently passed `$AUTHORING_DIR/evidence/route-authoring-addendum.md` from Task 3.
- Produces: one complete GLB with canonical node names and `working`, `magnetic`, `fracture` clips.

- [ ] **Step 1: Install authoring tooling only if the approved route requires it**

Use the official Blender page verified during planning:

- Blender `4.5.12 LTS`;
- official Windows installer or portable archive from `https://www.blender.org/download/lts/4-5/`;
- support stated through July 2027.

Record installer URL and SHA-256 in `$AUTHORING_DIR/evidence/tooling.txt`. Do not add Blender binaries to the repository.

- [ ] **Step 2: Establish the canonical object contract in the `.blend` file**

Use these exact exported names:

```text
Projectionist_Root
Forward_+Z
Back_-Z
Body
Hair
Glasses
Shirt
Waistcoat
Cardigan
Trousers
Shoes
Armature
```

The exported GLB/Three.js contract is metre units, Y-up, feet on `y=0`, facing `+Z`. Blender source is Z-up: place feet on source `z=0`, face source `-Y`, and create non-rendering root-child empties `Forward_+Z` at source local `[0,-0.1,1.6]` and `Back_-Z` at `[0,0.1,1.6]`. Blender’s glTF exporter converts those to the canonical Y-up/+Z contract. Apply object scale before export; Task 7 verifies the converted bounds and marker ordering after `GLTFLoader` parsing.

- [ ] **Step 3: Author the approved physical design**

Required visible result:

- 52-year-old face with crow’s-feet, tired-alert eyes and asymmetrical warmth;
- lean, sinewy, ordinary body rather than heroic shoulders or fashion proportions;
- greying practical hair disrupted by work;
- thin metal spectacles fitted to the face;
- pale cotton shirt, uneven rolled sleeves, charcoal waistcoat, softened cardigan, narrow dark trousers and repaired shoes;
- no bald utility-worker silhouette, biker styling, rock-star posture, theatrical eccentricity or generic idle.

Inspect the full head–neck–shoulder silhouette before adding tattoos. If the untattooed figure already reads generic, reject or rework it; tattoos are not permitted as rescue.

- [ ] **Step 4: Author the six-zone tattoo atlas as deforming skin detail**

Implement exactly:

```text
private-neck-mark
nested-frame-field
interrupted-heart
left-arm-archive
right-arm-gestures
buried-text-strata
```

Use softened blue-black, dense charcoal and only one oxide-red neck repair. Keep hands mostly clear. Test elbow, clavicle and neck deformation in posed frames. No logos, titles, portraits, quotations, weapons, skulls, branded cinema imagery or identifiable film references.

Create the complete inventory at `$AUTHORING_DIR/evidence/tattoo-fragments.json`. Every visible textual/glyph fragment must have an ID, exact glyph sequence, script family, `translation:null`, `countrySignal:null` and body zone. Reject any fragment that forms a recoverable quotation, complete offensive word, identifiable film phrase or nationality. Review the rendered atlas at 200% once normally and once mirrored; record reviewer/date in the inventory.

- [ ] **Step 5: Author the three exact motion clips**

- `working`: `6–10s`, looping; fine-motor bench work, stillness to listen, truthful hand contact.
- `magnetic`: `4–7s`, one-shot; body opens diagonally and one hand describes a frame/camera path.
- `fracture`: `3–5s`, one-shot; warmth closes, eye contact breaks, hand finds the neck mark without melodrama.

`magnetic` must visibly warm the eyes and open the face through facial morph targets before the gesture peaks. `fracture` must visibly reverse that warmth, break eye contact and tighten the mouth/neck without a horror expression. `working` remains tired-alert and equipment-focused. All three registers must be visible without dialogue or lighting changes.

Each clip must begin and end in a compatible neutral stance. No arms-down stock idle, broad gesticulation, horror beat, theatrical limp or locomotion.

Author the decisive evidence beats at these exact normalized clip times, with a tolerance of `±0.05`. The route addendum must map the source rig/facial controls to every named beat; do not shift timing merely to rescue a weak capture:

```json
{
  "working": [
    { "label": "start", "at": 0.05 },
    { "label": "hand-contact", "at": 0.45 },
    { "label": "listening-stillness", "at": 0.72 },
    { "label": "end", "at": 0.9 }
  ],
  "magnetic": [
    { "label": "start", "at": 0.05 },
    { "label": "facial-warmth", "at": 0.35 },
    { "label": "frame-gesture", "at": 0.65 },
    { "label": "end", "at": 0.9 }
  ],
  "fracture": [
    { "label": "start", "at": 0.05 },
    { "label": "warmth-closes", "at": 0.35 },
    { "label": "neck-contact", "at": 0.65 },
    { "label": "end", "at": 0.9 }
  ]
}
```

At `hand-contact`, both contact pose and occupational hand placement must read from the hands camera. At `facial-warmth` and `warmth-closes`, facial morph values must differ from `start`. At `frame-gesture` and `neck-contact`, the named gesture must be fully legible. Review full-speed playback as well as these deterministic evidence frames.

- [ ] **Step 6: Export a glTF 2.0 binary**

Use these Blender export settings:

```text
Format: glTF Binary (.glb)
Include: Selected Objects
Transform: +Y Up
Apply Modifiers: On
UVs: On
Normals: On
Tangents: On
Vertex Colors: On where used
Materials: Export
Images: Automatic / embedded
Animation: On
Group by NLA Track: On
Optimize Animation Size: On
Shape Keys: On
Skinning: On
Draco: Off
```

Export to `$AUTHORING_DIR/source/night-projectionist.glb`.

- [ ] **Step 7: Reopen and inspect the exported GLB in Blender**

Import the GLB into a new empty Blender scene. Verify:

- one coherent complete body;
- no missing external textures;
- node names preserved;
- all three clip names preserved;
- spectacles, hands, clothing and footwear remain attached;
- tattoos deform with elbows, neck and chest;
- no floor penetration;
- no bind-pose jump at clip start.

Render neutral front, three-quarter, profile, back, face, hands and tattoo deformation frames into `$AUTHORING_DIR/evidence/`.

**Checkpoint:** No repository commit. Present the untuned neutral renders. Reject the asset here if it reads generic.

### Task 5: Copy only the approved hypothesis and write exact provenance

**Files:**
- Create: `assets/models/projectionist/night-projectionist.glb`
- Create: `assets/models/projectionist/manifest.json`
- Create: `assets/models/projectionist/ATTRIBUTION.md`
- Create: `assets/models/projectionist/LICENSES.md`
- Create: `assets/models/projectionist/tattoo-fragments.json`

**Interfaces:**
- Consumes: approved external GLB and Task 3 source records.
- Produces: local proof asset plus machine-readable and human-readable provenance.

- [ ] **Step 1: Copy the approved GLB only after the Task 4 neutral-render checkpoint**

```bash
mkdir -p assets/models/projectionist
cp "$AUTHORING_DIR/source/night-projectionist.glb" assets/models/projectionist/night-projectionist.glb
```

Expected: no source `.blend`, preview or rejected candidate enters the repository.

- [ ] **Step 2: Calculate the exact file hash and bytes**

```bash
ASSET_SHA=$(sha256sum assets/models/projectionist/night-projectionist.glb | cut -d' ' -f1)
ASSET_BYTES=$(wc -c < assets/models/projectionist/night-projectionist.glb)
printf 'sha256=%s\nbytes=%s\n' "$ASSET_SHA" "$ASSET_BYTES"
test "$ASSET_BYTES" -le 33554432
```

Expected: valid 64-character SHA-256 and at most `33,554,432` bytes.

- [ ] **Step 3: Generate the exact manifest from recorded route values**

Export the approved candidate values from Task 3. For an original local asset, use `SOURCE_URL=urn:the-workshop:original-night-projectionist` and calculate the external `.blend` hash as `SOURCE_REVISION`:

```bash
if test "$SOURCE_URL" = "urn:the-workshop:original-night-projectionist"; then
  SOURCE_REVISION=$(sha256sum "$AUTHORING_DIR/source/night-projectionist.blend" | cut -d' ' -f1)
fi
```

```bash
export SOURCE_URL SOURCE_REVISION SOURCE_LICENCE SOURCE_COMPONENTS_JSON
test -n "$SOURCE_URL" && test -n "$SOURCE_REVISION" && test -n "$SOURCE_LICENCE" && test -n "$SOURCE_COMPONENTS_JSON"
ASSET_SHA=$(sha256sum assets/models/projectionist/night-projectionist.glb | cut -d' ' -f1)
ASSET_SHA="$ASSET_SHA" SOURCE_URL="$SOURCE_URL" SOURCE_REVISION="$SOURCE_REVISION" SOURCE_LICENCE="$SOURCE_LICENCE" SOURCE_COMPONENTS_JSON="$SOURCE_COMPONENTS_JSON" node --input-type=module <<'NODE'
import { writeFile } from 'node:fs/promises';

const required = ['ASSET_SHA', 'SOURCE_URL', 'SOURCE_REVISION', 'SOURCE_LICENCE', 'SOURCE_COMPONENTS_JSON'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}
if (!/^[a-f0-9]{64}$/.test(process.env.ASSET_SHA)) throw new Error('Invalid ASSET_SHA');
if (!/^(https:\/\/|urn:the-workshop:)/.test(process.env.SOURCE_URL)) throw new Error('Invalid SOURCE_URL');
const components = JSON.parse(process.env.SOURCE_COMPONENTS_JSON);
if (!Array.isArray(components) || !components.length) throw new Error('SOURCE_COMPONENTS_JSON must be a non-empty array');
for (const component of components) {
  for (const key of ['sourceUrl','sourceRevision','licence','noticeHeading']) {
    if (!component[key]) throw new Error(`Component missing ${key}`);
  }
  if (!/^(https:\/\/|urn:the-workshop:)/.test(component.sourceUrl)) throw new Error('Invalid component sourceUrl');
  if (component.redistributionVerified !== true) throw new Error('Component redistribution is not verified');
}

const manifest = {
  id: 'night-projectionist',
  character: {
    age: 52,
    identity: 'Scandinavian; country unspecified',
    direction: 'Magnetic Archivist A/C hybrid'
  },
  asset: {
    file: 'night-projectionist.glb',
    sha256: process.env.ASSET_SHA,
    sourceUrl: process.env.SOURCE_URL,
    sourceRevision: process.env.SOURCE_REVISION,
    licence: process.env.SOURCE_LICENCE,
    components,
    clips: ['working', 'magnetic', 'fracture'],
    evidenceFrames: {
      working:[{label:'start',at:.05},{label:'hand-contact',at:.45},{label:'listening-stillness',at:.72},{label:'end',at:.9}],
      magnetic:[{label:'start',at:.05},{label:'facial-warmth',at:.35},{label:'frame-gesture',at:.65},{label:'end',at:.9}],
      fracture:[{label:'start',at:.05},{label:'warmth-closes',at:.35},{label:'neck-contact',at:.65},{label:'end',at:.9}]
    },
    tattooZones: [
      'private-neck-mark', 'nested-frame-field', 'interrupted-heart',
      'left-arm-archive', 'right-arm-gestures', 'buried-text-strata'
    ]
  },
  budgets: {
    maxBytes: 33554432,
    maxTriangles: 150000,
    maxTextureEdge: 2048,
    maxTextures: 24,
    maxGeometries: 40
  }
};
await writeFile('assets/models/projectionist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
NODE
```

Copy the verbatim notices collected in Task 3 and the audited tattoo inventory from Task 4:

```bash
cp "$AUTHORING_DIR/evidence/LICENSES.md" assets/models/projectionist/LICENSES.md
cp "$AUTHORING_DIR/evidence/tattoo-fragments.json" assets/models/projectionist/tattoo-fragments.json
```

- [ ] **Step 4: Generate complete attribution from the same approved record**

Set `SOURCE_TITLE`, `LICENCE_URL` and `REDISTRIBUTION_NOTE` from the approved Task 3 matrix, then generate the file:

```bash
export SOURCE_TITLE LICENCE_URL REDISTRIBUTION_NOTE
test -n "$SOURCE_TITLE" && test -n "$LICENCE_URL" && test -n "$REDISTRIBUTION_NOTE"
SOURCE_TITLE="$SOURCE_TITLE" LICENCE_URL="$LICENCE_URL" REDISTRIBUTION_NOTE="$REDISTRIBUTION_NOTE" node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('assets/models/projectionist/manifest.json', 'utf8'));
for (const name of ['SOURCE_TITLE', 'LICENCE_URL', 'REDISTRIBUTION_NOTE']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}
const text = `# Night Projectionist asset provenance

- Character design: original THE WORKSHOP Night Projectionist specification.
- Base/source: ${process.env.SOURCE_TITLE} — ${manifest.asset.sourceUrl}
- Upstream revision/version: ${manifest.asset.sourceRevision}
- Licence: ${manifest.asset.licence} — ${process.env.LICENCE_URL}
- Redistribution: ${process.env.REDISTRIBUTION_NOTE}
- Local derivative: \`night-projectionist.glb\`.
- Authoring tool: Blender 4.5.12 LTS when used.
- Changes: face/age, hair, spectacles, clothing, tattoos, rig and three motion clips.
- SHA-256: ${manifest.asset.sha256}

No endorsement by the upstream creator is implied.
`;
await writeFile('assets/models/projectionist/ATTRIBUTION.md', text);
NODE
```

- [ ] **Step 5: Run the focused asset tests**

```bash
node --test tests/projectionist-character-proof.test.mjs
```

Expected: asset/manifest tests pass; page/module tests still fail because the proof shell is absent.

**Checkpoint:** No commit.

### Task 6: Build the standalone neutral proof shell

**Files:**
- Create: `projectionist-character-proof.html`
- Create: `assets/css/projectionist-character-proof.css`
- Create: `assets/js/projectionist-character-proof.js`

**Interfaces:**
- Consumes: `assets/models/projectionist/manifest.json` and local GLB.
- Produces: `window.__projectionistCharacterProof`, fixed view controls and exact motion controls.

- [ ] **Step 1: Create the standalone HTML shell**

Use this structure in `projectionist-character-proof.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Night Projectionist — Character-Only Proof</title>
  <link rel="stylesheet" href="./assets/css/projectionist-character-proof.css">
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <main class="proof" aria-labelledby="proofTitle">
    <header class="proof__header">
      <div><p>Stage A · Complete-human gate</p><h1 id="proofTitle">The Night Projectionist</h1></div>
      <output id="proofStatus" aria-live="polite">Loading character…</output>
    </header>
    <section class="proof__stage" aria-label="Neutral character review stage">
      <canvas id="projectionistProofCanvas"></canvas>
      <noscript>JavaScript is required to inspect this local three-dimensional proof.</noscript>
    </section>
    <nav class="proof__controls" aria-label="Character review controls">
      <fieldset><legend>View</legend>
        <button type="button" data-proof-view="front">Front</button>
        <button type="button" data-proof-view="three-quarter">Three-quarter</button>
        <button type="button" data-proof-view="profile">Profile</button>
        <button type="button" data-proof-view="back">Back</button>
        <button type="button" data-proof-view="face">Face</button>
        <button type="button" data-proof-view="glasses">Glasses</button>
        <button type="button" data-proof-view="hands">Hands at work</button>
        <button type="button" data-proof-view="tattoos">Tattoo distribution</button>
        <button type="button" data-proof-view="neck">Neck mark</button>
        <button type="button" data-proof-view="chest">Chest tattoos</button>
        <button type="button" data-proof-view="left-arm">Left arm</button>
        <button type="button" data-proof-view="right-arm">Right arm</button>
      </fieldset>
      <fieldset><legend>Motion</legend>
        <button type="button" data-proof-motion="working">Working</button>
        <button type="button" data-proof-motion="magnetic">Magnetic</button>
        <button type="button" data-proof-motion="fracture">Fracture</button>
        <button type="button" data-proof-motion="stop">Still</button>
      </fieldset>
    </nav>
    <details class="proof__diagnostics"><summary>Technical diagnostics</summary><pre id="proofDiagnostics"></pre></details>
  </main>
  <script type="module" src="./assets/js/projectionist-character-proof.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the restrained responsive stylesheet**

`assets/css/projectionist-character-proof.css` must implement:

```css
:root{color-scheme:dark;--bg:#171813;--panel:#22231d;--line:#555246;--paper:#e8e0d2;--muted:#aaa395;--accent:#b88a49}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--paper);font-family:Arial,sans-serif}
body{min-height:100svh}
.proof{min-height:100svh;display:grid;grid-template-rows:auto minmax(420px,1fr) auto auto}
.proof__header{display:flex;justify-content:space-between;gap:24px;align-items:end;padding:18px 24px;border-bottom:1px solid var(--line)}
.proof__header p,.proof__header h1{margin:0}.proof__header p{color:var(--accent);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.proof__header h1{font:500 28px Georgia,serif;margin-top:4px}.proof__header output{color:var(--muted);font:700 10px ui-monospace,monospace}
.proof__stage{position:relative;min-height:420px;background:#74716a;overflow:hidden}.proof__stage canvas{display:block;width:100%;height:100%}
.proof__controls{display:grid;grid-template-columns:2fr 1fr;gap:10px;padding:12px 18px;border-top:1px solid var(--line);background:var(--panel)}
.proof__controls fieldset{display:flex;flex-wrap:wrap;gap:7px;margin:0;padding:10px;border:1px solid var(--line)}.proof__controls legend{color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.proof__controls button{appearance:none;border:1px solid var(--line);background:#181914;color:var(--paper);padding:8px 10px;cursor:pointer}.proof__controls button:hover,.proof__controls button:focus-visible,.proof__controls button[aria-pressed="true"]{border-color:var(--accent);outline:none}
.proof__diagnostics{margin:0;padding:9px 18px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.proof__diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:700px){.proof{grid-template-rows:auto minmax(470px,1fr) auto auto}.proof__header{align-items:start;padding:13px 14px}.proof__header h1{font-size:22px}.proof__controls{grid-template-columns:1fr;padding:9px}.proof__controls button{flex:1 1 44%;min-height:42px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
```

- [ ] **Step 3: Implement the complete proof runtime**

`assets/js/projectionist-character-proof.js` must expose exactly:

```js
window.__projectionistCharacterProof = {
  status: 'loading', modelLoaded: false, manifestLoaded: false,
  activeView: 'front', activeMotion: 'stop', clipNames: [], bounds: null,
  orientation: null,
  clipDurations: {}, motionTime: 0, poseChecksum: 0, morphChecksum: 0,
  triangles: 0, textures: 0, geometries: 0, pixelRatio: 1,
  loadReadyMs: null, errors: [],
  setView, playMotion, seekMotion, snapshot
};
```

Implement these stable presets for a `1.78m` character facing `+Z`:

```js
const VIEW_PRESETS = Object.freeze({
  front:         { position:[0,1.12,3.25], target:[0,1.02,0] },
  'three-quarter':{ position:[2.35,1.22,2.55], target:[0,1.03,0] },
  profile:       { position:[3.2,1.12,0], target:[0,1.02,0] },
  back:          { position:[0,1.12,-3.25], target:[0,1.02,0] },
  face:          { position:[0,1.64,1.15], target:[0,1.59,0] },
  glasses:       { position:[0,1.66,.78], target:[0,1.63,0] },
  hands:         { position:[0,1.12,1.55], target:[0,.98,.18] },
  tattoos:       { position:[-1.45,1.30,1.55], target:[0,1.18,0] },
  neck:          { position:[-.62,1.58,.82], target:[-.08,1.49,0] },
  chest:         { position:[0,1.34,1.08], target:[0,1.27,0] },
  'left-arm':    { position:[1.22,1.28,1.34], target:[.34,1.18,0] },
  'right-arm':   { position:[-1.22,1.28,1.34], target:[-.34,1.18,0] }
});
```

Use this complete module:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const startedAt = performance.now();
const canvas = document.querySelector('#projectionistProofCanvas');
const stage = document.querySelector('.proof__stage');
const statusEl = document.querySelector('#proofStatus');
const diagnosticsEl = document.querySelector('#proofDiagnostics');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MODEL_URL = './assets/models/projectionist/night-projectionist.glb';
const MANIFEST_URL = './assets/models/projectionist/manifest.json';

const VIEW_PRESETS = Object.freeze({
  front: { position:[0,1.12,3.25], target:[0,1.02,0] },
  'three-quarter': { position:[2.35,1.22,2.55], target:[0,1.03,0] },
  profile: { position:[3.2,1.12,0], target:[0,1.02,0] },
  back: { position:[0,1.12,-3.25], target:[0,1.02,0] },
  face: { position:[0,1.64,1.15], target:[0,1.59,0] },
  glasses: { position:[0,1.66,.78], target:[0,1.63,0] },
  hands: { position:[0,1.12,1.55], target:[0,.98,.18] },
  tattoos: { position:[-1.45,1.30,1.55], target:[0,1.18,0] },
  neck: { position:[-.62,1.58,.82], target:[-.08,1.49,0] },
  chest: { position:[0,1.34,1.08], target:[0,1.27,0] },
  'left-arm': { position:[1.22,1.28,1.34], target:[.34,1.18,0] },
  'right-arm': { position:[-1.22,1.28,1.34], target:[-.34,1.18,0] }
});

const state = {
  status: 'loading', modelLoaded: false, manifestLoaded: false,
  activeView: 'front', activeMotion: 'stop', clipNames: [], bounds: null,
  orientation: null,
  clipDurations: {}, motionTime: 0, poseChecksum: 0, morphChecksum: 0,
  triangles: 0, textures: 0, geometries: 0, pixelRatio: 1,
  loadReadyMs: null, errors: []
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x74716a);
const camera = new THREE.PerspectiveCamera(34, 1, .03, 30);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;

scene.add(new THREE.HemisphereLight(0xf2eadc, 0x343732, 1.65));
const key = new THREE.DirectionalLight(0xffe6c7, 3.2);
key.position.set(3.4, 4.8, 4.1);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0xc9dcdf, 1.35);
rim.position.set(-3.4, 3.1, -2.5);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.5, 72),
  new THREE.MeshStandardMaterial({ color:0x66645e, roughness:.93, metalness:0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const workSurface = new THREE.Group();
const timber = new THREE.MeshStandardMaterial({ color:0x59483b, roughness:.86, metalness:0 });
const metal = new THREE.MeshStandardMaterial({ color:0x343736, roughness:.66, metalness:.35 });
const top = new THREE.Mesh(new THREE.BoxGeometry(1.35,.06,.46), timber);
top.position.set(0,.92,.34);
const legA = new THREE.Mesh(new THREE.BoxGeometry(.05,.9,.05), metal);
legA.position.set(-.57,.45,.34);
const legB = legA.clone();
legB.position.x = .57;
workSurface.add(top, legA, legB);
workSurface.visible = false;
scene.add(workSurface);

let manifest = null;
let modelRoot = null;
let mixer = null;
let clock = new THREE.Clock();
let frameId = 0;
let running = true;
let activeAction = null;
const actions = new Map();

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function updateMotionEvidence() {
  state.motionTime = activeAction?.time ?? 0;
  let pose = 0;
  let morph = 0;
  modelRoot?.traverse(object => {
    if (object.isBone) {
      const e = object.matrixWorld.elements;
      for (let i = 0; i < e.length; i += 1) pose += e[i] * (i + 1);
    }
    if (object.morphTargetInfluences) {
      object.morphTargetInfluences.forEach((value, index) => { morph += value * (index + 1); });
    }
  });
  state.poseChecksum = Number(pose.toFixed(6));
  state.morphChecksum = Number(morph.toFixed(6));
}

function updateOutput() {
  statusEl.textContent = state.status === 'ready'
    ? `Ready · ${state.triangles.toLocaleString()} triangles`
    : state.status === 'error' ? 'Proof failed' : 'Loading character…';
  diagnosticsEl.textContent = JSON.stringify(snapshot(), null, 2);
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  state.errors.push(message);
  state.status = 'error';
  updateOutput();
  console.error(error);
}

function setPressed(selector, value, attribute) {
  document.querySelectorAll(selector).forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset[attribute] === value));
  });
}

function setView(name) {
  const preset = VIEW_PRESETS[name];
  if (!preset) throw new Error(`Unknown proof view: ${name}`);
  camera.position.fromArray(preset.position);
  camera.lookAt(new THREE.Vector3().fromArray(preset.target));
  state.activeView = name;
  workSurface.visible = name === 'hands' || state.activeMotion === 'working';
  setPressed('[data-proof-view]', name, 'proofView');
  updateOutput();
  renderer.render(scene, camera);
}

function playMotion(name) {
  if (name !== 'stop' && !actions.has(name)) throw new Error(`Unknown proof motion: ${name}`);
  for (const action of actions.values()) action.stop();
  activeAction = null;
  state.activeMotion = name;
  if (name !== 'stop') {
    const action = actions.get(name);
    activeAction = action;
    action.reset();
    action.paused = false;
    action.enabled = true;
    if (name === 'working') action.setLoop(THREE.LoopRepeat, Infinity);
    else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
  }
  workSurface.visible = name === 'working' || state.activeView === 'hands';
  setPressed('[data-proof-motion]', name, 'proofMotion');
  updateOutput();
}

function seekMotion(name, normalizedTime) {
  if (!(normalizedTime >= 0 && normalizedTime <= 1)) throw new Error('Motion seek must be between 0 and 1');
  playMotion(name);
  const action = actions.get(name);
  action.paused = true;
  action.time = action.getClip().duration * normalizedTime;
  mixer.update(0);
  modelRoot.updateMatrixWorld(true);
  updateMotionEvidence();
  renderer.render(scene, camera);
  updateOutput();
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const cap = matchMedia('(max-width: 700px)').matches ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  state.pixelRatio = renderer.getPixelRatio();
}

function collectMetrics(root) {
  const geometries = new Set();
  const textures = new Set();
  let triangles = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    geometries.add(object.geometry);
    const index = object.geometry.index;
    const positions = object.geometry.attributes.position;
    triangles += index ? index.count / 3 : positions.count / 3;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  state.triangles = Math.round(triangles);
  state.geometries = geometries.size;
  state.textures = textures.size;
  for (const texture of textures) {
    const image = texture.image;
    if (image?.width > manifest.budgets.maxTextureEdge || image?.height > manifest.budgets.maxTextureEdge) {
      throw new Error(`Texture exceeds ${manifest.budgets.maxTextureEdge}px: ${image.width}×${image.height}`);
    }
  }
}

function enforceBudgets(byteLength) {
  const checks = [
    [byteLength <= manifest.budgets.maxBytes, `GLB exceeds ${manifest.budgets.maxBytes} bytes`],
    [state.triangles <= manifest.budgets.maxTriangles, `Triangles exceed ${manifest.budgets.maxTriangles}`],
    [state.textures <= manifest.budgets.maxTextures, `Textures exceed ${manifest.budgets.maxTextures}`],
    [state.geometries <= manifest.budgets.maxGeometries, `Geometries exceed ${manifest.budgets.maxGeometries}`]
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(failed[1]);
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function loadProof() {
  const manifestResponse = await fetch(MANIFEST_URL);
  if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
  manifest = await manifestResponse.json();
  state.manifestLoaded = true;

  const modelResponse = await fetch(MODEL_URL);
  if (!modelResponse.ok) throw new Error(`Model HTTP ${modelResponse.status}`);
  const buffer = await modelResponse.arrayBuffer();
  const digest = await sha256(buffer);
  if (digest !== manifest.asset.sha256) throw new Error('Model SHA-256 does not match manifest');

  const gltf = await new GLTFLoader().parseAsync(buffer, './assets/models/projectionist/');
  state.clipNames = gltf.animations.map(clip => clip.name);
  state.clipDurations = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip.duration]));
  if (JSON.stringify(state.clipNames) !== JSON.stringify(manifest.asset.clips)) {
    throw new Error(`Unexpected clips: ${state.clipNames.join(', ')}`);
  }
  const ranges = { working:[6,10], magnetic:[4,7], fracture:[3,5] };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const duration = state.clipDurations[name];
    if (!(duration >= min && duration <= max)) throw new Error(`${name} duration ${duration}s is outside ${min}–${max}s`);
  }

  modelRoot = gltf.scene;
  const firstBounds = new THREE.Box3().setFromObject(modelRoot);
  const firstSize = firstBounds.getSize(new THREE.Vector3());
  if (!(firstSize.y > 0)) throw new Error('Model has invalid height');
  modelRoot.scale.multiplyScalar(1.78 / firstSize.y);
  modelRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const centre = bounds.getCenter(new THREE.Vector3());
  modelRoot.position.x -= centre.x;
  modelRoot.position.z -= centre.z;
  modelRoot.position.y -= bounds.min.y;
  modelRoot.updateMatrixWorld(true);
  const finalBounds = new THREE.Box3().setFromObject(modelRoot);
  const finalSize = finalBounds.getSize(new THREE.Vector3());
  state.bounds = {
    min: finalBounds.min.toArray(), max: finalBounds.max.toArray(), size: finalSize.toArray()
  };
  const forwardMarker = modelRoot.getObjectByName('Forward_+Z');
  const backMarker = modelRoot.getObjectByName('Back_-Z');
  if (!forwardMarker || !backMarker) throw new Error('Orientation markers are missing');
  state.orientation = {
    forwardZ:forwardMarker.getWorldPosition(new THREE.Vector3()).z,
    backZ:backMarker.getWorldPosition(new THREE.Vector3()).z
  };
  if (!(state.orientation.forwardZ > state.orientation.backZ)) throw new Error('Character does not face canonical +Z');
  scene.add(modelRoot);

  collectMetrics(modelRoot);
  enforceBudgets(buffer.byteLength);
  mixer = new THREE.AnimationMixer(modelRoot);
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  state.modelLoaded = true;
  setView('front');
  playMotion('stop');
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  state.loadReadyMs = Math.round(performance.now() - startedAt);
  state.status = 'ready';
  updateOutput();
}

function animate() {
  if (!running) return;
  frameId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (mixer) mixer.update(dt);
  updateMotionEvidence();
  renderer.render(scene, camera);
}

window.__projectionistCharacterProof = {
  get status(){ return state.status; },
  get modelLoaded(){ return state.modelLoaded; },
  get manifestLoaded(){ return state.manifestLoaded; },
  get activeView(){ return state.activeView; },
  get activeMotion(){ return state.activeMotion; },
  get clipNames(){ return [...state.clipNames]; },
  get orientation(){ return state.orientation ? structuredClone(state.orientation) : null; },
  get clipDurations(){ return structuredClone(state.clipDurations); },
  get motionTime(){ return state.motionTime; },
  get poseChecksum(){ return state.poseChecksum; },
  get morphChecksum(){ return state.morphChecksum; },
  get bounds(){ return state.bounds ? structuredClone(state.bounds) : null; },
  get triangles(){ return state.triangles; },
  get textures(){ return state.textures; },
  get geometries(){ return state.geometries; },
  get pixelRatio(){ return state.pixelRatio; },
  get loadReadyMs(){ return state.loadReadyMs; },
  get errors(){ return [...state.errors]; },
  setView, playMotion, seekMotion, snapshot
};

document.querySelectorAll('[data-proof-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.proofView));
});
document.querySelectorAll('[data-proof-motion]').forEach(button => {
  button.addEventListener('click', () => playMotion(button.dataset.proofMotion));
});
addEventListener('resize', () => { resize(); renderer.render(scene, camera); });
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { clock = new THREE.Clock(); animate(); }
  else cancelAnimationFrame(frameId);
});

resize();
setView('front');
playMotion('stop');
animate();
loadProof().catch(fail);
```

- [ ] **Step 4: Run GREEN static tests and module syntax check**

```bash
node --test tests/projectionist-character-proof.test.mjs
node --check assets/js/projectionist-character-proof.js
git diff --check
```

Expected: all focused static tests pass; JavaScript syntax and whitespace checks pass.

**Checkpoint:** No commit.

### Task 7: Add real browser, mobile and performance evidence

**Files:**
- Create: `tests/browser-projectionist-character-proof.mjs`

**Interfaces:**
- Consumes: standalone proof page and `window.__projectionistCharacterProof`.
- Produces: repeatable runtime checks; optional evidence screenshots outside the repository.

- [ ] **Step 1: Create the self-contained Playwright runner**

Create `tests/browser-projectionist-character-proof.mjs` with this complete implementation:

```js
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.glb':'model/gltf-binary',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.woff2':'font/woff2'
};
const keep = process.env.KEEP_PROJECTIONIST_EVIDENCE === '1';
const evidenceDir = await mkdtemp(join(tmpdir(), 'hermes-projectionist-evidence-'));
const proofInputPaths = Object.freeze([
  'projectionist-character-proof.html',
  'assets/css/projectionist-character-proof.css',
  'assets/js/projectionist-character-proof.js',
  'assets/models/projectionist/night-projectionist.glb',
  'assets/models/projectionist/manifest.json',
  'tests/browser-projectionist-character-proof.mjs'
]);

function fail(message) { throw new Error(message); }

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = normalize(pathname === '/' ? 'projectionist-character-proof.html' : pathname.replace(/^\/+/, ''));
    const file = resolve(ROOT, relative);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolveReady => server.listen(4190, '127.0.0.1', resolveReady));

async function launchBrowser() {
  try {
    return await chromium.launch({ headless:true });
  } catch (bundledError) {
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    try { await access(chrome); }
    catch { throw bundledError; }
    return chromium.launch({ headless:true, executablePath:chrome });
  }
}

let browser = null;
const summaries = [];

async function installMetrics(page) {
  await page.addInitScript(() => {
    window.__projectionistPerf = { lcp:null, cls:0, longtasks:[], events:[] };
    const observe = (type, callback, options = { type, buffered:true }) => {
      try { new PerformanceObserver(list => list.getEntries().forEach(callback)).observe(options); }
      catch {}
    };
    observe('largest-contentful-paint', entry => { window.__projectionistPerf.lcp = entry.startTime; });
    observe('layout-shift', entry => { if (!entry.hadRecentInput) window.__projectionistPerf.cls += entry.value; });
    observe('longtask', entry => window.__projectionistPerf.longtasks.push(entry.duration));
    observe('event', entry => window.__projectionistPerf.events.push(entry.duration),
      { type:'event', buffered:true, durationThreshold:16 });
  });
}

async function runViewport(label, contextOptions, views) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const localFailures = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4190/') && response.status() !== 200) {
      localFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  await installMetrics(page);
  await page.goto('http://127.0.0.1:4190/projectionist-character-proof.html', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__projectionistCharacterProof?.status === 'ready', null, { timeout:20000 });

  const manifest = await page.evaluate(async () => (await fetch('./assets/models/projectionist/manifest.json')).json());
  const modelBytes = await page.evaluate(async () => (await (await fetch('./assets/models/projectionist/night-projectionist.glb')).arrayBuffer()).byteLength);
  const initial = await page.evaluate(() => window.__projectionistCharacterProof.snapshot());
  if (!initial.modelLoaded || !initial.manifestLoaded) fail(`${label}: proof did not load`);
  if (JSON.stringify(initial.clipNames) !== JSON.stringify(['working','magnetic','fracture'])) fail(`${label}: wrong clips`);
  if (initial.errors.length) fail(`${label}: runtime errors: ${initial.errors.join('; ')}`);
  if (initial.triangles > manifest.budgets.maxTriangles) fail(`${label}: triangle budget exceeded`);
  if (initial.textures > manifest.budgets.maxTextures) fail(`${label}: texture budget exceeded`);
  if (initial.geometries > manifest.budgets.maxGeometries) fail(`${label}: geometry budget exceeded`);
  if (modelBytes > manifest.budgets.maxBytes) fail(`${label}: byte budget exceeded`);
  if (Math.abs(initial.bounds.size[1] - 1.78) > .02) fail(`${label}: normalised height is ${initial.bounds.size[1]}`);
  if (Math.abs(initial.bounds.min[1]) > .002) fail(`${label}: feet are not on y=0`);
  const centreX = (initial.bounds.min[0] + initial.bounds.max[0]) / 2;
  const centreZ = (initial.bounds.min[2] + initial.bounds.max[2]) / 2;
  if (Math.abs(centreX) > .01 || Math.abs(centreZ) > .01) fail(`${label}: bounds are not centred`);
  if (!(initial.orientation.forwardZ > initial.orientation.backZ)) fail(`${label}: +Z orientation failed`);
  const pixelRatioCap = label === 'mobile' ? 1.5 : 2;
  if (initial.pixelRatio > pixelRatioCap) fail(`${label}: pixel ratio ${initial.pixelRatio}`);
  const readyLimit = label === 'mobile' ? 12000 : 8000;
  if (initial.loadReadyMs > readyLimit) fail(`${label}: ready time ${initial.loadReadyMs}ms`);

  const stage = page.locator('.proof__stage');
  for (const view of views) {
    await page.locator(`[data-proof-view="${view}"]`).click();
    const active = await page.evaluate(() => window.__projectionistCharacterProof.activeView);
    if (active !== view) fail(`${label}: view ${view} did not activate`);
    await page.waitForTimeout(120);
    const image = await stage.screenshot({ path:join(evidenceDir, `${label}-${view}.png`) });
    if (image.length < 10000) fail(`${label}-${view}: screenshot is implausibly small`);
  }

  if (label === 'desktop') {
    const motionViews = { working:'hands', magnetic:'face', fracture:'neck' };
    for (const motion of ['working','magnetic','fracture']) {
      await page.evaluate(view => window.__projectionistCharacterProof.setView(view), motionViews[motion]);
      await page.locator(`[data-proof-motion="${motion}"]`).click();
      await page.waitForTimeout(50);
      const liveStart = await page.evaluate(() => window.__projectionistCharacterProof.snapshot());
      await page.waitForTimeout(300);
      const liveEnd = await page.evaluate(() => window.__projectionistCharacterProof.snapshot());
      if (!(liveEnd.motionTime > liveStart.motionTime)) {
        fail(`desktop: ${motion} did not advance during live playback`);
      }
      const frames = manifest.asset.evidenceFrames[motion];
      const snapshots = {};
      const images = [];
      for (const frame of frames) {
        await page.evaluate(({ name, at }) => window.__projectionistCharacterProof.seekMotion(name, at), { name:motion, at:frame.at });
        snapshots[frame.label] = await page.evaluate(() => window.__projectionistCharacterProof.snapshot());
        images.push(await stage.screenshot({ path:join(evidenceDir, `desktop-${motion}-${frame.label}.png`) }));
      }
      if (snapshots.start.activeMotion !== motion) fail(`desktop: motion ${motion} did not activate`);
      const poseLabel = motion === 'working' ? 'hand-contact' : motion === 'magnetic' ? 'frame-gesture' : 'neck-contact';
      if (!(snapshots[poseLabel].motionTime > snapshots.start.motionTime) || snapshots[poseLabel].poseChecksum === snapshots.start.poseChecksum) {
        fail(`desktop: ${motion} did not produce its named skeletal evidence beat`);
      }
      if (motion === 'magnetic' && snapshots['facial-warmth'].morphChecksum === snapshots.start.morphChecksum) {
        fail('desktop: magnetic facial-warmth did not change facial morphs');
      }
      if (motion === 'fracture' && snapshots['warmth-closes'].morphChecksum === snapshots.start.morphChecksum) {
        fail('desktop: fracture warmth-closes did not change facial morphs');
      }
      if (!images.every(image => image.length >= 10000)) {
        fail(`desktop-${motion}: named temporal evidence is implausibly small`);
      }
    }
  }

  await page.waitForTimeout(1000);
  const perf = await page.evaluate(() => structuredClone(window.__projectionistPerf));
  const maxLongTask = Math.max(0, ...perf.longtasks);
  const maxEvent = Math.max(0, ...perf.events);
  if (perf.cls > .05) fail(`${label}: CLS ${perf.cls}`);
  if (perf.lcp === null) fail(`${label}: LCP was not observed`);
  if (perf.lcp > 4000) fail(`${label}: LCP ${perf.lcp}ms`);
  if (maxLongTask > 500) fail(`${label}: long task ${maxLongTask}ms`);
  if (maxEvent > 200) fail(`${label}: interaction event ${maxEvent}ms`);
  if (pageErrors.length || consoleErrors.length || failedRequests.length || localFailures.length) {
    fail(`${label}: browser failures ${JSON.stringify({ pageErrors, consoleErrors, failedRequests, localFailures })}`);
  }
  summaries.push({ label, viewport:contextOptions.viewport, initial, modelBytes, perf:{ ...perf, maxLongTask, maxEvent } });
  await context.close();
}

try {
  browser = await launchBrowser();
  await runViewport('desktop', { viewport:{ width:1440, height:1000 } }, [
    'front','three-quarter','profile','back','face','glasses','hands',
    'tattoos','neck','chest','left-arm','right-arm'
  ]);
  await runViewport('mobile', {
    viewport:{ width:390, height:844 }, screen:{ width:390, height:844 },
    isMobile:true, hasTouch:true, deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
  }, ['front','face','glasses','hands']);

  const reduced = await browser.newContext({ viewport:{ width:1440, height:1000 }, reducedMotion:'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto('http://127.0.0.1:4190/projectionist-character-proof.html', { waitUntil:'domcontentloaded' });
  await reducedPage.waitForFunction(() => window.__projectionistCharacterProof?.status === 'ready', null, { timeout:20000 });
  if (await reducedPage.evaluate(() => window.__projectionistCharacterProof.activeMotion) !== 'stop') {
    fail('Reduced motion autoplayed a character clip');
  }
  await reducedPage.locator('[data-proof-motion="working"]').click();
  if (await reducedPage.evaluate(() => window.__projectionistCharacterProof.activeMotion) !== 'working') {
    fail('Reduced motion blocked the manual working control');
  }
  await reduced.close();

  const noJs = await browser.newContext({ viewport:{ width:390, height:844 }, javaScriptEnabled:false });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto('http://127.0.0.1:4190/projectionist-character-proof.html', { waitUntil:'domcontentloaded' });
  if (!await noJsPage.locator('noscript').isVisible()) fail('No-JavaScript message is not visible');
  await noJs.close();

  if (keep) {
    const files = (await readdir(evidenceDir)).filter(name => name.endsWith('.png')).sort();
    const evidence = [];
    for (const name of files) {
      const bytes = await readFile(join(evidenceDir, name));
      evidence.push({ name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') });
    }
    const proofInputs = [];
    for (const path of proofInputPaths) {
      const bytes = await readFile(join(ROOT, path));
      proofInputs.push({ path, sha256:createHash('sha256').update(bytes).digest('hex') });
    }
    const proofInputSha256 = createHash('sha256').update(JSON.stringify(proofInputs)).digest('hex');
    await writeFile(join(evidenceDir, 'evidence-manifest.json'), `${JSON.stringify({ proofInputs, proofInputSha256, evidence }, null, 2)}\n`);
    const pointer = join(process.env.LOCALAPPDATA, 'Temp', 'hermes-projectionist-authoring', 'evidence', 'latest-evidence-dir.txt');
    await writeFile(pointer, `${evidenceDir}\n`);
  }

  console.log(JSON.stringify({ summaries, evidenceDir:keep ? evidenceDir : 'removed' }, null, 2));
  console.log('browser-projectionist-character-proof: OK');
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
  if (!keep) await rm(evidenceDir, { recursive:true, force:true });
}
```

- [ ] **Step 2: Run the focused browser test without retained screenshots**

```bash
node tests/browser-projectionist-character-proof.mjs
```

Expected: JSON summary for both viewports, `browser-projectionist-character-proof: OK`, no retained temp directory.

- [ ] **Step 3: Run reduced-motion coverage**

The runner must open one context with `reducedMotion:'reduce'` and assert:

```js
const state = await page.evaluate(() => window.__projectionistCharacterProof.snapshot());
if (state.activeMotion !== 'stop') throw new Error('Reduced motion autoplayed a character clip');
```

Then click `working` and assert the manual control still selects it.

- [ ] **Step 4: Add JavaScript-disabled evidence**

Open the proof with `javaScriptEnabled:false` and assert the `<noscript>` message is visible. The page must not present a blank dark canvas as if it were a valid render.

- [ ] **Step 5: Run the full focused command**

```bash
npm run test:projectionist
git diff --check
```

Expected: static contract and real browser path pass.

**Checkpoint:** No commit.

### Task 8: Produce and inspect the uncommitted complete-human review set

**Files:**
- Repository: no additional files
- External evidence: generated under `%LOCALAPPDATA%\Temp\hermes-projectionist-*`

**Interfaces:**
- Consumes: technically passing standalone proof.
- Produces: Pedro’s explicit approve/reject decision on the complete human.

- [ ] **Step 1: Start a fresh evidence directory without deleting earlier work**

The runner uses `mkdtemp`; do not delete candidate, contact-sheet or prior evidence paths automatically. Report stale paths for later human-approved cleanup. This prevents a cleanup glob from removing unrelated or still-needed work.

- [ ] **Step 2: Run the final retained capture**

```bash
KEEP_PROJECTIONIST_EVIDENCE=1 node tests/browser-projectionist-character-proof.mjs
```

Expected: the runner prints the exact evidence directory.

- [ ] **Step 3: Complete one physical-phone browser check**

Start a temporary LAN-bound server from the worktree and print its phone URL:

```bash
AUTHORING_DIR="$LOCALAPPDATA/Temp/hermes-projectionist-authoring"
IFS= read -r EVIDENCE_DIR < "$AUTHORING_DIR/evidence/latest-evidence-dir.txt"
test -d "$EVIDENCE_DIR"
LAN_IP=$(python - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('8.8.8.8', 80))
    print(s.getsockname()[0])
finally:
    s.close()
PY
)
printf 'http://%s:8834/projectionist-character-proof.html\n' "$LAN_IP"
python -m http.server 8834 --bind 0.0.0.0
```

Open the printed URL on a physical phone. Record device model, OS, browser/version, CSS viewport and device-pixel ratio in `$EVIDENCE_DIR/physical-mobile.json`; capture `$EVIDENCE_DIR/physical-mobile-front.png`, `physical-mobile-face.png` and `physical-mobile-glasses.png` while stopped. Then select the hands view, start `working`, wait until the authored `hand-contact` beat at normalized time `0.45`, and capture `physical-mobile-hands-working.png`. Stop the tracked `python -m http.server` process immediately after capture; do not leave port `8834` listening. Regenerate `evidence-manifest.json` to include all five files. If a physical phone is unavailable or the local firewall prevents the check, stop—the evidence may be reported as emulation but not approved as genuine mobile.

```bash
EVIDENCE_DIR="$EVIDENCE_DIR" node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = process.env.EVIDENCE_DIR;
if (!dir) throw new Error('Missing EVIDENCE_DIR');
const prior = JSON.parse(await readFile(join(dir, 'evidence-manifest.json'), 'utf8'));
const proofInputs = [];
for (const input of prior.proofInputs) {
  const bytes = await readFile(input.path);
  proofInputs.push({ path:input.path, sha256:createHash('sha256').update(bytes).digest('hex') });
}
const proofInputSha256 = createHash('sha256').update(JSON.stringify(proofInputs)).digest('hex');
if (proofInputSha256 !== prior.proofInputSha256) throw new Error('Proof inputs changed before physical capture');
const names = (await readdir(dir)).filter(name => name !== 'evidence-manifest.json').sort();
const evidence = [];
for (const name of names) {
  const bytes = await readFile(join(dir, name));
  evidence.push({ name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(dir, 'evidence-manifest.json'), `${JSON.stringify({ proofInputs, proofInputSha256, evidence }, null, 2)}\n`);
NODE
```

- [ ] **Step 4: Inspect the required complete-human views**

Judge, in this order:

1. front;
2. three-quarter;
3. profile;
4. back;
5. face close-up;
6. explicit glasses close-up;
7. hands at work;
8. tattoo distribution plus explicit neck, chest, left-arm and right-arm close views;
9. restrained `working` motion from the three-quarter camera;
10. `magnetic` explanatory gesture from the face camera;
11. `fracture` transition from the neck camera;
12. genuine `390×844` front, face, glasses and hands views.

Reject immediately if the figure reads as a simulation extra, utility worker, game NPC, mannequin, rock star, biker, theatrical eccentric, young model with age painted on, or generic stock person disguised by tattoos.

- [ ] **Step 5: Verify the asset rather than the stage is carrying the judgement**

Review once with work surface hidden and neutral front lighting. If the character loses specificity without props, stop and reject. Do not add darkness, extra equipment, dialogue, grading or camera drama.

- [ ] **Step 6: Present immutable evidence and obtain explicit aesthetic approval**

Report separately:

- asset loads;
- structural/browser tests pass;
- agent aesthetic verdict;
- Pedro’s verdict.

Stop after presentation. Do not commit, push, open a PR, modify the Warehouse or begin Stage B.

Create a durable approval request by recomputing both hashes from disk. This command survives worker/session boundaries because it persists the request and exact expected sentence outside the repository:

```bash
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = join(process.env.LOCALAPPDATA, 'Temp', 'hermes-projectionist-authoring', 'evidence');
const evidenceDir = (await readFile(join(root, 'latest-evidence-dir.txt'), 'utf8')).trim();
const assetBytes = await readFile('assets/models/projectionist/night-projectionist.glb');
const evidenceBytes = await readFile(join(evidenceDir, 'evidence-manifest.json'));
const evidenceManifest = JSON.parse(evidenceBytes.toString('utf8'));
const proofInputs = [];
for (const input of evidenceManifest.proofInputs) {
  const bytes = await readFile(input.path);
  proofInputs.push({ path:input.path, sha256:createHash('sha256').update(bytes).digest('hex') });
}
const proofInputSha256 = createHash('sha256').update(JSON.stringify(proofInputs)).digest('hex');
if (proofInputSha256 !== evidenceManifest.proofInputSha256) throw new Error('Proof inputs changed after evidence capture');
const request = {
  assetSha256:createHash('sha256').update(assetBytes).digest('hex'),
  evidenceManifestSha256:createHash('sha256').update(evidenceBytes).digest('hex'),
  proofInputs,
  proofInputSha256
};
const sentence = `I approve Night Projectionist asset ${request.assetSha256} evidence ${request.evidenceManifestSha256} proof ${request.proofInputSha256}`;
await writeFile(join(root, 'approval-request.json'), `${JSON.stringify(request, null, 2)}\n`);
await writeFile(join(root, 'approval-sentence.txt'), `${sentence}\n`);
console.log(sentence);
NODE
```

Approval is valid only if Pedro replies with exactly the printed sentence and nothing else. After the reply, save it verbatim with the file-writing tool—not shell interpolation—to `$AUTHORING_DIR/evidence/approval-response.txt`. Then generate the repository record from durable files while recomputing every hash:

```bash
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = join(process.env.LOCALAPPDATA, 'Temp', 'hermes-projectionist-authoring', 'evidence');
const request = JSON.parse(await readFile(join(root, 'approval-request.json'), 'utf8'));
const response = (await readFile(join(root, 'approval-response.txt'), 'utf8')).trimEnd();
const evidenceDir = (await readFile(join(root, 'latest-evidence-dir.txt'), 'utf8')).trim();
const assetBytes = await readFile('assets/models/projectionist/night-projectionist.glb');
const evidenceBytes = await readFile(join(evidenceDir, 'evidence-manifest.json'));
const actualAsset = createHash('sha256').update(assetBytes).digest('hex');
const actualEvidence = createHash('sha256').update(evidenceBytes).digest('hex');
const proofInputs = [];
for (const input of request.proofInputs) {
  const bytes = await readFile(input.path);
  proofInputs.push({ path:input.path, sha256:createHash('sha256').update(bytes).digest('hex') });
}
const actualProof = createHash('sha256').update(JSON.stringify(proofInputs)).digest('hex');
const expected = `I approve Night Projectionist asset ${request.assetSha256} evidence ${request.evidenceManifestSha256} proof ${request.proofInputSha256}`;
if (actualAsset !== request.assetSha256 || actualEvidence !== request.evidenceManifestSha256 || actualProof !== request.proofInputSha256) throw new Error('Approved proof or evidence bytes changed');
if (response !== expected) throw new Error('Pedro approval response is not the exact hash-bound sentence');
const approval = {
  character:'night-projectionist', decision:'approved', approvedBy:'Pedro Fernandes',
  assetSha256:actualAsset, evidenceManifestSha256:actualEvidence,
  proofInputs, proofInputSha256:actualProof,
  approvalQuote:response, recordedAt:new Date().toISOString()
};
await writeFile('assets/models/projectionist/APPROVAL.json', `${JSON.stringify(approval, null, 2)}\n`);
NODE
```

- [ ] **Step 7A: If rejected, remove the complete implementation seam**

Restore tracked changes and remove only the plan’s untracked implementation allowlist:

```bash
set -euo pipefail
sha256sum -c "$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/package.proof.sha256"
python - <<'PY'
from pathlib import Path
import shutil
source = Path.home() / 'AppData/Local/Temp/hermes-projectionist-authoring/evidence/package.before.json'
shutil.copyfile(source, Path('package.json'))
PY
rm -f projectionist-character-proof.html \
  assets/css/projectionist-character-proof.css \
  assets/js/projectionist-character-proof.js \
  tests/projectionist-character-proof.test.mjs \
  tests/browser-projectionist-character-proof.mjs \
  assets/models/projectionist/night-projectionist.glb \
  assets/models/projectionist/manifest.json \
  assets/models/projectionist/ATTRIBUTION.md \
  assets/models/projectionist/LICENSES.md \
  assets/models/projectionist/tattoo-fragments.json \
  assets/models/projectionist/APPROVAL.json
rmdir assets/models/projectionist 2>/dev/null || true
npm test
git diff --check
git status --short --untracked-files=all
```

Expected: canonical `49` tests pass; only approved documentation remains. Preserve external review evidence until Pedro no longer needs it.

- [ ] **Step 7B: If approved, proceed to Task 9 without changing the proof**

No “small improvement” is permitted between approval and commit. Any visible change invalidates the approval and requires a new Task 8 capture.

### Task 9: Commit only the aesthetically approved character proof

**Files:**
- Stage only the allowlist in this task.

**Interfaces:**
- Consumes: explicit rendered approval from Task 8.
- Produces: one documentation-independent character-proof implementation commit; no remote side effect.

- [ ] **Step 1: Rerun all checks against the approved bytes**

```bash
npm test
npm run test:projectionist
npm run test:browser
npm run test:instrument
git diff --check
```

Expected: canonical suite plus character proof, browser smoke and instrument smoke all pass.

- [ ] **Step 2: Verify the production Warehouse is untouched**

```bash
AUTHORING_DIR="$LOCALAPPDATA/Temp/hermes-projectionist-authoring"
IFS= read -r BASE_SHA < "$AUTHORING_DIR/evidence/base-sha.txt"
PRODUCTION_DIFF=$(git diff --name-only "$BASE_SHA" -- index.html assets/js/workshop-foundation.js assets/js/workshop-visit.js assets/js/workshop-record.js assets/js/workshop-garden-study.js)
test -z "$PRODUCTION_DIFF"
```

Expected: no output. Enforce it in execution by assigning the command output to `PRODUCTION_DIFF` and running `test -z "$PRODUCTION_DIFF"`.

- [ ] **Step 3: Verify the exact staging allowlist**

```bash
set -euo pipefail
git status --short --untracked-files=all
git add -- \
  package.json \
  projectionist-character-proof.html \
  assets/css/projectionist-character-proof.css \
  assets/js/projectionist-character-proof.js \
  assets/models/projectionist/night-projectionist.glb \
  assets/models/projectionist/manifest.json \
  assets/models/projectionist/ATTRIBUTION.md \
  assets/models/projectionist/LICENSES.md \
  assets/models/projectionist/tattoo-fragments.json \
  assets/models/projectionist/APPROVAL.json \
  tests/projectionist-character-proof.test.mjs \
  tests/browser-projectionist-character-proof.mjs
EXPECTED_PATHS="$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/expected-staged-paths.txt"
ACTUAL_PATHS="$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/actual-staged-paths.txt"
printf '%s\n' \
  package.json \
  projectionist-character-proof.html \
  assets/css/projectionist-character-proof.css \
  assets/js/projectionist-character-proof.js \
  assets/models/projectionist/night-projectionist.glb \
  assets/models/projectionist/manifest.json \
  assets/models/projectionist/ATTRIBUTION.md \
  assets/models/projectionist/LICENSES.md \
  assets/models/projectionist/tattoo-fragments.json \
  assets/models/projectionist/APPROVAL.json \
  tests/projectionist-character-proof.test.mjs \
  tests/browser-projectionist-character-proof.mjs | sort > "$EXPECTED_PATHS"
git diff --cached --name-only | sort > "$ACTUAL_PATHS"
diff -u "$EXPECTED_PATHS" "$ACTUAL_PATHS"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
```

Expected: exactly the twelve allowlisted paths, no unstaged changes and no untracked files.

- [ ] **Step 4: Run staged security/provenance checks**

```bash
set -euo pipefail
git diff --cached --check
git diff --cached --numstat
git diff --quiet
node --test tests/projectionist-character-proof.test.mjs
git show :assets/models/projectionist/manifest.json > "$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/staged-manifest.json"
git show :assets/models/projectionist/APPROVAL.json > "$LOCALAPPDATA/Temp/hermes-projectionist-authoring/evidence/staged-approval.json"
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const root = `${process.env.LOCALAPPDATA}/Temp/hermes-projectionist-authoring/evidence`;
const manifest = JSON.parse(await readFile(`${root}/staged-manifest.json`, 'utf8'));
const approval = JSON.parse(await readFile(`${root}/staged-approval.json`, 'utf8'));
if (approval.decision !== 'approved' || approval.assetSha256 !== manifest.asset.sha256) {
  throw new Error('Staged approval does not match staged GLB manifest');
}
if (!/^[a-f0-9]{64}$/.test(approval.evidenceManifestSha256)) {
  throw new Error('Staged approval has invalid evidence hash');
}
const evidenceDir = (await readFile(`${root}/latest-evidence-dir.txt`, 'utf8')).trim();
const evidenceBytes = await readFile(`${evidenceDir}/evidence-manifest.json`);
const evidenceHash = createHash('sha256').update(evidenceBytes).digest('hex');
if (evidenceHash !== approval.evidenceManifestSha256) {
  throw new Error('Retained evidence manifest does not match staged approval');
}
const requiredProofPaths = [
  'projectionist-character-proof.html',
  'assets/css/projectionist-character-proof.css',
  'assets/js/projectionist-character-proof.js',
  'assets/models/projectionist/night-projectionist.glb',
  'assets/models/projectionist/manifest.json',
  'tests/browser-projectionist-character-proof.mjs'
];
if (JSON.stringify(approval.proofInputs.map(input => input.path)) !== JSON.stringify(requiredProofPaths)) {
  throw new Error('Staged approval proof-input allowlist is incomplete');
}
const stagedProofInputs = requiredProofPaths.map(path => {
  const bytes = execFileSync('git', ['show', `:${path}`], { maxBuffer:40 * 1024 * 1024 });
  return { path, sha256:createHash('sha256').update(bytes).digest('hex') };
});
const stagedProofHash = createHash('sha256').update(JSON.stringify(stagedProofInputs)).digest('hex');
if (JSON.stringify(stagedProofInputs) !== JSON.stringify(approval.proofInputs) || stagedProofHash !== approval.proofInputSha256) {
  throw new Error('Staged visual-proof inputs differ from Pedro-approved capture inputs');
}
const expectedQuote = `I approve Night Projectionist asset ${approval.assetSha256} evidence ${approval.evidenceManifestSha256} proof ${approval.proofInputSha256}`;
if (approval.approvalQuote !== expectedQuote) {
  throw new Error('Staged approval quote does not reconstruct from staged hashes');
}
NODE
```

Because `git diff --quiet` and the untracked check passed, the tested worktree bytes equal the staged bytes. Inspect staged `manifest.json`, `ATTRIBUTION.md`, `LICENSES.md`, `tattoo-fragments.json` and `APPROVAL.json`. Reject accidental credentials, absolute local paths, bracketed instructions, missing licence data or hash mismatch.

- [ ] **Step 5: Commit after approval only**

```bash
git commit -m "feat: add approved Night Projectionist character proof"
```

- [ ] **Step 6: Post-commit read-only verification**

```bash
git diff HEAD^ HEAD --check
git status --short --branch --untracked-files=all
git show --stat --oneline HEAD
```

Expected: clean worktree; one implementation commit containing only the allowlist.

- [ ] **Step 7: Stop before any remote or spatial action**

Do not push, open a PR, merge, deploy, link the proof from `index.html`, design the projection room or begin Stage B. Those require a separate explicit request and, for a room, new reference-led compositional approval.

## Review Checkpoints

1. **Baseline checkpoint:** approved spec ancestor, clean branch, `49/49` canonical tests.
2. **RED contract checkpoint:** focused test fails because proof files do not exist.
3. **Candidate-route checkpoint:** one lawful route explicitly approved or execution stops.
4. **Neutral authoring checkpoint:** complete human judged before repository integration.
5. **Asset-contract checkpoint:** GLB, manifest and attribution pass static checks.
6. **Runtime checkpoint:** standalone desktop/mobile loader and performance checks pass.
7. **Agent aesthetic checkpoint:** the agent rejects generic art before presenting it.
8. **Pedro aesthetic checkpoint:** explicit rendered approval before any implementation commit.
9. **Approved-byte commit checkpoint:** exact allowlist committed; no push or room integration.

## Acceptance Matrix

| Requirement | Implemented/verified by |
|---|---|
| Exactly 52; unspecified Scandinavian identity | Manifest contract; Task 4 visual review |
| Complete face, hair, glasses, body, hands, clothing and footwear | Task 4; Task 8 views |
| A/C Magnetic Archivist direction | Task 4 authoring rubric; Task 8 judgement |
| Six tattoo zones and single oxide-red repair | Task 4; manifest; tattoo close views |
| Tattoo deformation | Task 4 re-import; Task 8 tattoo/motion capture |
| Working, magnetic and fracture registers | Exact clip durations; live controls; start/middle/end frames; pose/morph checks; complete live playback review |
| Neutral complete-human proof | Standalone page; no live Warehouse reference |
| Genuine mobile evidence | `390×844` touch/mobile emulation plus mandatory four-view physical-phone capture and device record |
| Reduced-motion behaviour | Browser test with `reducedMotion:'reduce'` |
| No-JavaScript truth | Visible `<noscript>` browser check |
| Provenance and redistribution | Actual GLB hash; component matrix; manifest; `ATTRIBUTION.md`; verbatim `LICENSES.md` |
| No room, dialogue, state or Reel 6 implementation | Static test and do-not-modify gate |
| Rendered approval before commit | Asset/evidence-hash-bound `APPROVAL.json`; exact staged allowlist; Task 9 approval-only commit |

## Plan Self-Review Checklist

- [x] Spec coverage maps every Stage A requirement to a task and test.
- [x] No Stage B architecture, behaviour, dialogue or deployment work appears.
- [x] `working`, `magnetic`, `fracture`, `window.__projectionistCharacterProof` and all path names are consistent.
- [x] Every code-producing task includes RED/GREEN or an exact visual gate.
- [x] No implementation commit appears before Pedro’s approval.
- [x] Candidate failure has an exact stop and cleanup path.
- [x] Browser evidence covers desktop, genuine mobile, reduced motion, no-JavaScript, errors, budgets and measured timings.
- [x] The staged-file allowlist excludes source `.blend`, screenshots, temporary candidates and live Warehouse files.
- [x] The final state explicitly stops before push, PR, merge, deployment and Stage B.
