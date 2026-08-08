import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { allowlistedProjectionUrl, PROJECTION_IFRAME_SANDBOX } from '../assets/js/workshop-projection-policy.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const loopSketchpad = await readFile(new URL('../assets/apps/loop-sketchpad.html', import.meta.url), 'utf8');

test('branch-served Pages contains its runtime modules', async () => {
  const three = await stat(new URL('../assets/vendor/three/three.module.js', import.meta.url));
  const css3d = await stat(new URL('../assets/vendor/three/CSS3DRenderer.js', import.meta.url));
  assert.ok(three.size > 1_000_000, 'the locked Three.js module is committed for branch-based Pages');
  assert.ok(css3d.size > 5_000, 'the CSS3D renderer is committed for branch-based Pages');
});

test('tower lift exposes every constructed tower floor', () => {
  assert.match(html, /function liftFloorSet\(mode\)\{ return mode==='tower'\?TOWER_FLOORS:HOOD_ALL_FLOORS; \}/);
  assert.doesNotMatch(html, /ROOM_BUILD_IDS[^}]*tunnel:'threshold'/s);
  assert.doesNotMatch(html, /PLACE_BUILD_IDS[^}]*'waiting-room'/s);
  assert.doesNotMatch(html, /screen\.action === 'cave'/);
  assert.doesNotMatch(html, /overlayMode === 'cave'/);
});

test('the document policy constrains resource origins and blocks raw HTML projection', () => {
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || '';
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(policy, /cdn\.jsdelivr\.net/);
  assert.match(policy, /connect-src 'self' https:\/\/en\.wikipedia\.org/);
  assert.match(policy, /frame-src 'self' https:\/\/www\.youtube\.com https:\/\/www\.youtube-nocookie\.com https:\/\/pedrohfernandes-klk\.github\.io/);
  assert.match(policy, /upgrade-insecure-requests/);
  assert.doesNotMatch(policy, /default-src \*/);
  assert.doesNotMatch(policy, /frame-src[^;]*data:/);
  assert.doesNotMatch(html, /data:text\/html/);
  assert.doesNotMatch(loopSketchpad, /to-wall|buildVisualizer|id="wallBtn"/);
});

test('production JavaScript is served locally from locked dependencies', () => {
  assert.match(html, /"three": "\.\/assets\/vendor\/three\/three\.module\.js"/);
  assert.match(html, /from ['"]\.\/assets\/vendor\/three\/CSS3DRenderer\.js['"]/);
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
});

test('projection surfaces reject untrusted origins and remain sandboxed', () => {
  assert.equal(allowlistedProjectionUrl('https://www.youtube.com/embed/abc'), 'https://www.youtube.com/embed/abc');
  assert.equal(allowlistedProjectionUrl('https://pedrohfernandes-klk.github.io/SayWhat/'), 'https://pedrohfernandes-klk.github.io/SayWhat/');
  assert.equal(allowlistedProjectionUrl('http://pedrohfernandes-klk.github.io/SayWhat/'), null);
  assert.equal(allowlistedProjectionUrl('https://evil.example/'), null);
  assert.equal(allowlistedProjectionUrl('https://pedrohfernandes-klk.github.io.evil.example/'), null);
  assert.equal(allowlistedProjectionUrl('javascript:alert(1)'), null);
  assert.equal(PROJECTION_IFRAME_SANDBOX, 'allow-scripts allow-same-origin allow-presentation');
  assert.match(html, /from ['"]\.\/assets\/js\/workshop-projection-policy\.js['"]/);
  assert.match(html, /id="playFrame"[^>]+sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(html, /iframe\.sandbox\s*=\s*PROJECTION_IFRAME_SANDBOX/);
  assert.match(html, /const allowedUrl=allowlistedProjectionUrl\(raw\); if\(allowedUrl\) return allowedUrl;/);
  assert.doesNotMatch(html, /if\(\/\^https\?:\\\/\\\//);
});

test('workshop imports and runs the progressive foundation', () => {
  assert.match(html, /from ['"]\.\/assets\/js\/workshop-foundation\.js['"]/);
  assert.match(html, /runIdleBuildQueue\s*\(/);
  assert.match(html, /window\.__workshopMetrics/);
});

test('entry is enabled before the deferred room queue finishes', () => {
  const ready = html.indexOf('markEntryReady();');
  const queue = html.indexOf('runIdleBuildQueue(');
  assert.ok(ready > -1, 'entry-ready marker exists');
  assert.ok(queue > -1, 'deferred queue exists');
  assert.ok(ready < queue, 'entry is made available before deferred construction starts');
  assert.doesNotMatch(html.slice(ready, queue), /\banimate\(\)/,
    'the full animation loop does not compete with background construction behind the opaque poster');
  const opening = html.slice(html.indexOf('function beginPosterOpen(){'), html.indexOf('function makeGridTexture'));
  assert.match(opening, /ensureAnimationStarted\(\)/,
    'animation begins on demand when the visitor enters');
  assert.match(html, /if\(!placeBuildReady\(place\)\)/,
    'fast travel blocks distant destinations until their geometry exists');
  assert.match(html, /if\(!roomBuildReady\(portal\.room\)\)/,
    'physical portals block destinations until their geometry exists');
});

test('visitor passport consumes the same normalized evidence as the visit ledger', () => {
  assert.match(html, /id="passportProgress"/);
  assert.match(html, /id="passportResetBtn"/);
  assert.match(html, /from ['"]\.\/assets\/js\/workshop-record\.js['"]/);
  assert.match(html, /recordWorkshopEventState\s*\(/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'interaction'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'arrival'/);
  assert.doesNotMatch(html, /recordPassportEvidence\(\{kind:/,
    'raw events cannot bypass the normalized ledger');
});

test('Passport stamps expose truthful evidence without a permanent activity feed',()=>{
  assert.match(html,/id="passportEvidence"/);
  assert.match(html,/passportEvidenceLine\(passportState,passportEvidenceAct\)/);
  assert.match(html,/journeyBeat\[data-beat\]/);
  assert.match(html,/beat\.addEventListener\('click',selectEvidence\)/);
  assert.match(html,/beat\.addEventListener\('focus',selectEvidence\)/);
  assert.doesNotMatch(html,/class="activityFeed"/);
});

test('visitor orientation state is imported, persisted and fed by real visit events', () => {
  assert.match(html, /from ['"]\.\/assets\/js\/workshop-visit\.js['"]/);
  assert.match(html, /const VISIT_STORAGE_KEY = 'workshop:visit-v1'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'enter'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'move'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'target'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'interaction'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'arrival'/);
  assert.match(html, /recordWorkshopEvidence\(\{kind:'rooms-opened'/);
  assert.match(html, /localStorage\.setItem\(VISIT_STORAGE_KEY/);
  assert.match(html, /localStorage\.removeItem\(VISIT_STORAGE_KEY/);
});

test('successful interactions carry stable authored evidence and physical portals record arrival',()=>{
  assert.match(html,/action: cfg\.action \|\| 'used'/);
  assert.match(html,/capability: cfg\.capability \|\| null/);
  assert.match(html,/if\(outcome===false\) return false/,
    'failed uses cannot create evidence');
  assert.match(html,/id:screen\.id \|\| stableInteractionId/);
  assert.match(html,/id:hotspot\.id \|\| stableInteractionId/);
  assert.match(html,/id:entry\.data\?\.id \|\| stableInteractionId/);
  const travel=html.slice(html.indexOf('function travelTo(portal)'),html.indexOf('function goTo('));
  assert.match(travel,/recordWorkshopEvidence\(\{kind:'arrival'/,
    'walking through a physical portal records the destination');
});

test('first-use guidance is contextual, paint-safe, delayed and dismissible', () => {
  assert.match(html, /queueVisitGuidanceAfterPaint\('visit-move'/);
  assert.match(html, /dismissVisitGuidance\('visit-move'\)/,
    'movement immediately dismisses its first-use hint');
  assert.match(html, /requestAnimationFrame\(\(\)=>requestAnimationFrame/,
    'cold-load guidance waits for a real paint before starting its lifetime');
  assert.match(html, /visitGuidanceScheduler\.schedule\('visit-interaction'/);
  assert.match(html, /visitGuidanceScheduler\.schedule\('visit-rooms'/);
  assert.match(html, /visitGuidanceScheduler\.cancelAll\(\)/,
    'new visits cancel every callback from the previous visit');
  assert.match(html, /if\(item\)[\s\S]*?scheduleInteractionGuidance\(\)/,
    'restored first-look evidence still schedules interaction guidance');
  assert.match(html, /dismissVisitGuidance\('visit-interaction'\)/);
  assert.match(html, /item\.hintText && visitState\.firstInteractionAt!==null/,
    'object-specific teaching waits until basic interaction has been learned');
});

test('Rooms distinguishes current, stamped and next acts with situational guidance', () => {
  assert.match(html, /journeyGuidance/);
  assert.match(html, /id="journeyGuidance"/);
  assert.match(html, /classList\.toggle\('active'/);
  assert.match(html, /classList\.toggle\('next'/);
  assert.match(html, /classList\.toggle\('available'/);
  assert.match(html, /guidanceEl\.textContent=guidance\.text/);
  const map = html.indexOf('id="journeyMap"');
  const guidance = html.indexOf('id="journeyGuidance"');
  const passport = html.indexOf('class="passportSummary"');
  assert.ok(map < guidance && guidance < passport,
    'situational guidance sits directly beneath the narrative map');
});

test('visitor-facing narrative presents the Tower as the museum identity and throughline', () => {
  assert.match(html, /a museum gathered around the Tower/);
  assert.match(html, /Every route belongs to the Tower/);
  assert.match(html, /Inside the Tower<span>the collection by floor<\/span>/);
  assert.match(html, /the image and address of The Workshop/);
  assert.match(html, /one building · one collection · every floor/);
  assert.match(html, /Tower Hall · corridor galleries/);
  assert.doesNotMatch(html.slice(html.indexOf('const TOWER_FLOORS'), html.indexOf('const HOOD_ALL_FLOORS')), /The Grove|Roof garden/);
});

test('Research Desk link synchronisation is non-recursive and maintains the wider-web URL', () => {
  const start = html.indexOf('function syncResearchExternalLinks(){');
  const end = html.indexOf('function stripHtmlSnippet', start);
  const sync = html.slice(start, end);
  assert.ok(start > -1 && end > start, 'Research link synchronisation exists');
  assert.doesNotMatch(sync, /syncResearchExternalLinks\(\);/,
    'link synchronisation must not recursively invoke itself');
  assert.match(sync, /researchOpenLink\.href\s*=\s*researchOpenUrl\(q\)/,
    'the wider-web link follows the active query');
  assert.match(sync, /researchGoogleSearchLink\.href\s*=\s*researchGoogleUrl\(q\)/,
    'the Google-search link follows the active query');
});

test('world movement and shortcuts do not conflict with focused interface controls', () => {
  const start = html.indexOf("const moveKeySet = new Set(['w','a'");
  const end = html.indexOf("window.addEventListener('keyup'", start);
  const input = html.slice(start, end);
  assert.ok(start > -1 && end > start, 'global keyboard handler exists');
  assert.match(input, /interactiveTarget/,
    'interactive browser controls are recognised before world shortcuts run');
  assert.match(input, /if\(\(typingTarget\s*\|\|\s*interactiveTarget\).*return;/,
    'focused controls retain native keyboard behaviour');
  assert.doesNotMatch(input, /if\(k==='a'\) openArchive/,
    'A remains exclusively a left-strafe key');
  assert.match(input, /if\(k==='o'\) openArchive\('rooms'\)/,
    'Archive uses a non-conflicting O shortcut');
  assert.match(html, /<code>O<\/code>: Archive/,
    'Help documents the non-conflicting Archive shortcut');
});

test('blocking overlays share focus lifecycle and background isolation', () => {
  assert.match(html, /function openAccessibleDialog\(/);
  assert.match(html, /function closeAccessibleDialog\(/);
  assert.match(html, /app\.inert\s*=\s*true/,
    'opening a dialog makes the background inert');
  assert.match(html, /document\.addEventListener\('keydown',\s*handleAccessibleDialogKeydown/,
    'the helper traps Tab and handles Escape centrally');
  assert.match(html, /openAccessibleDialog\(panel/, 'Grove uses the shared dialog helper');
  assert.match(html, /openAccessibleDialog\(hoodLiftPanel|openAccessibleDialog\(panel/, 'lift uses the shared dialog helper');
  assert.match(html, /openAccessibleDialog\(panel,\{initialFocus:panel\.querySelector\('\[data-act="close"\]'\),onEscape:closeGardenMaker\}/,
    'Garden desk moves focus to its close control and supports Escape');
  assert.match(html, /openAccessibleDialog\(panel,\{initialFocus:frame,onEscape:closeStudioMaker\}\)/,
    'Studio desk moves focus into its desk and supports Escape');
  assert.match(html, /iframe:not\(\[tabindex="-1"\]\)/,
    'the projection iframe participates in the dialog focus sequence');
  assert.match(html, /openAccessibleDialog\(\$\('playOverlay'\)/,
    'projection player uses the shared dialog helper');
});

test('Hall recess doors use a visual-only presentation contract', () => {
  const start = html.indexOf('function addPremiumPortalDoor(');
  const end = html.indexOf('function fallbackTextureWide', start);
  const builder = html.slice(start, end);
  assert.match(builder, /hallRecess\s*=\s*null/);
  assert.match(builder, /const recessDepth\s*=\s*hallRecess\?\.depth/);
  assert.match(html, /function makeHologramMaterial\(speed=6\.0, opacity=1\)/);
  assert.match(builder, /return \{group, slab:hitbox, doorParts:leafGroups, openAxis, field\}/);
});

test('Hall entry remains a plain threshold without a chaperone apparatus', () => {
  const hallStart=html.indexOf('function buildHall(){');
  const hallEnd=html.indexOf('const NIGHT_ROOM_VIEW_SRC', hallStart);
  const hall=html.slice(hallStart,hallEnd);
  assert.doesNotMatch(html, /function buildWorkshopChaperone\(/);
  assert.doesNotMatch(html, /workshop-chaperone/);
  assert.doesNotMatch(html, /workshop:chaperone/);
  assert.doesNotMatch(html, /workshop-entry-threshold/);
  assert.doesNotMatch(html, /Entry rite and off-axis Workshop chaperone/);
  assert.doesNotMatch(html, /function openGroveGuide\(/,
    'the now-unreachable chaperone guide is removed');
  assert.doesNotMatch(html, /groveGuideChoices|groveOracleMurmurs|groveGeneralAdvice|grovePick/,
    'the now-unreachable guide dialogue state is removed');
  assert.match(hall, /const floor = new THREE\.Mesh\(/,
    'the ordinary Hall floor remains the arrival surface');
});

test('every entered room receives broad fill and the Hall has no dead destination doors', () => {
  assert.match(html, /new THREE\.AmbientLight\(0xfff1dc, 2\.35\)/,
    'a global visibility light bypasses room switching and the punctual-light budget');
  assert.match(html, /function applyRoomLighting\(\)\{[\s\S]*?ensureGuaranteedVisibilityLight\(currentRoom\);/,
    'the always-on visibility light is refreshed at every room entry');
  assert.match(html, /function ensureRoomBaselineLight\(room=currentRoom\)/,
    'room entry owns a guaranteed non-punctual fill light');
  assert.match(html, /function applyRoomLighting\(\)\{[\s\S]*?ensureRoomBaselineLight\(currentRoom\);[\s\S]*?applyLightBudget\(\);/,
    'broad fill is installed before the punctual accent-light budget runs');
  assert.doesNotMatch(html, /const outDoor\s*=\s*addPremiumPortalDoor/,
    'the unregistered Square & Amphitheatre Hall door is removed');
  assert.doesNotMatch(html, /const nightDoor\s*=\s*addPremiumPortalDoor/,
    'the unregistered Sunset Lounge Hall door is removed');
});

test('Garden Study capture is explicit, metadata-rich and safe around dialogs', () => {
  assert.match(html, /from ['"]\.\/assets\/js\/workshop-garden-study\.js['"]/,
    'Garden Studies use a focused local-only module');
  assert.match(html, /preserveDrawingBuffer:\s*true/,
    'the explicit capture source keeps the current WebGL frame readable');
  const start = html.indexOf('async function captureGardenStudyFromWorld()');
  const end = html.indexOf('function closeGardenMaker()', start);
  const capture = html.slice(start, end);
  assert.ok(start > -1 && end > start, 'world capture function exists before Garden desk lifecycle');
  assert.match(capture, /document\.querySelectorAll\('\[role="dialog"\]'\)/,
    'capture refuses to run while a visible blocking dialog owns interaction');
  assert.match(capture, /renderer\.domElement\.toDataURL\('image\/png'\)/,
    'capture takes the actual visible WebGL canvas');
  assert.match(capture, /room:\s*currentRoom/);
  assert.match(capture, /camera:\s*\{\s*position:/,
    'capture saves camera position and direction with the image');
  assert.match(capture, /gardenStudyStore\.put/,
    'new captures persist locally before the desk opens');
  assert.match(html, /gardenStudyStore\.list\(\)\.then\(studies=>/,
    'reopening the table restores the most-recent local study');
  assert.match(html, /data-act="capture-view"/,
    'an explicit visitor control starts capture');
});

test('known runtime regressions remain removed', () => {
  assert.doesNotMatch(html, /color:\['0xc94145','0xe9c856','0xe7d8ca'\]/);
  const animateBlock = html.slice(html.indexOf('function animate(){'), html.indexOf("document.addEventListener('visibilitychange'"));
  assert.equal((animateBlock.match(/updateHallWindow\(dt\)/g) || []).length, 0,
    'animate does not duplicate the hall-window update already performed by updateWorld');
});

test('complete Cadavre Expat sequence is recovered once in the main gallery', () => {
  const setStart=html.indexOf('const CADAVRE_EXPAT_WORKS = Object.freeze([');
  const setEnd=html.indexOf(']);',setStart);
  const set=html.slice(setStart,setEnd);
  assert.ok(setStart > -1 && setEnd > setStart, 'the recovered collection is declared');
  assert.equal((set.match(/title:'CADAVRE EXPAT [IV]+'/g) || []).length,4,
    'exactly four named works are declared');
  assert.equal((set.match(/src:CADAVRE_EXPAT(?:_II|_III|_IV)?_SRC/g) || []).length,4,
    'all four supplied sources are used');
  assert.match(html,/const corridorArtworks=galleryCorridorArtworks\(\)/,
    'the full source-backed collection enters the main gallery layout');
  const liveTower=html.slice(html.lastIndexOf('function buildHood(){'),html.indexOf('function buildTunnel(){'));
  assert.doesNotMatch(liveTower,/CADAVRE_EXPAT_(?:II|III|IV)?_?SRC/,
    'the rebuilt Tower does not duplicate or own the recovered works');
  assert.match(html,/cadavreObjects\.length===4/,
    'runtime self-test requires exactly four live registered works');
});

test('Laboratory is visibly lit on entry and never described as totally dark', () => {
  assert.match(html, /const architecturalFill=new THREE\.HemisphereLight/);
  assert.match(html, /const entryFill=new THREE\.PointLight/);
  assert.match(html, /illuminated projection gallery/);
  assert.doesNotMatch(html, /totally dark projection room|barely visible return trace/);
});
