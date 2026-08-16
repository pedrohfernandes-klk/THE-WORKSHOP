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
  // The invariant this test names is that a focused control keeps its native
  // keyboard behaviour. That is now expressed as "the world responds only while
  // the world holds focus", which preserves the invariant and additionally
  // gives keyboard visitors a route back: matching the e.target selector alone
  // meant activating any button stopped walking permanently, because nothing
  // could return focus to the canvas.
  assert.match(input, /if\(\(typingTarget\s*\|\|\s*!worldHasFocus\(\)\).*return;/,
    'focused controls retain native keyboard behaviour');
  assert.doesNotMatch(input, /interactiveTarget/,
    'the selector-match form that trapped keyboard visitors has not returned');
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

test('every entered room receives compatibility fill and the Hall has no dead destination doors', () => {
  assert.match(html, /function applyRoomLighting\(\)\{[\s\S]*?applyMaterialVisibilityFloor\(scene\);[\s\S]*?applyLightBudget\(\);[\s\S]*?applyLightBoost\(\);/,
    'room entry applies the material floor, disables authored lights and refreshes the fixed rig');
  assert.match(html, /const COMPATIBILITY_LIGHT_PROFILES=Object\.freeze/,
    'rooms retain curated colour and contrast profiles');
  assert.match(html, /lab:\{ambient:1\.30[\s\S]*spark:\{ambient:1\.48/,
    'the formerly dark Lab and Spark receive explicit visibility profiles');
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
  assert.deepEqual([...set.matchAll(/catalogueId:'(HrM-CE-\d{3})'/g)].map(match=>match[1]),
    ['HrM-CE-001','HrM-CE-002','HrM-CE-003','HrM-CE-004'],
    'the recovered sequence has stable ordered catalogue identifiers');
  assert.equal((set.match(/summary:'[^']+'/g) || []).length,4,
    'every recovered work has visitor-facing interpretive text');
  assert.equal((set.match(/room:'Tower Hall'/g) || []).length,4,
    'all four works are catalogued at their actual location');
  assert.match(html,/const corridorArtworks=galleryCorridorArtworks\(\)/,
    'the full source-backed collection enters the main gallery layout');
  const liveTower=html.slice(html.lastIndexOf('function buildHood(){'),html.indexOf('function buildTunnel(){'));
  assert.doesNotMatch(liveTower,/CADAVRE_EXPAT_(?:II|III|IV)?_?SRC/,
    'the rebuilt Tower does not duplicate or own the recovered works');
  assert.match(html,/cadavreObjects\.length===4/,
    'runtime self-test requires exactly four live registered works');
  assert.match(html,/function fitArtworkWithinBounds\(width,height,maxWidth=4\.45,maxHeight=4\.85\)/,
    'corridor artwork fitting uses one bounded scaling helper');
  assert.match(html,/const scale=Math\.min\(1,maxWidth\/width,maxHeight\/height\)/,
    'width and height share one scale factor, preserving exact aspect ratio');
  assert.doesNotMatch(html,/artW = clamp\(artW, 1\.70, 4\.45\);[\s\S]{0,80}artH = clamp\(artH, 2\.05, 4\.85\);/,
    'independent aspect-distorting final clamps are gone');
});

test('active room builders do not recreate deleted Tunnel or Headquarters doors', () => {
  const slices=[
    html.slice(html.indexOf('function buildNightRoom(){'),html.indexOf('function buildGroveWarehouseAnnex(')),
    html.slice(html.indexOf('function buildOutdoorSpace(){'),html.indexOf('function liftFloorSet(')),
    html.slice(html.indexOf('function buildTheatre(){'),html.indexOf('function buildLaboratory(){')),
    html.slice(html.indexOf('function buildLaboratory(){'),html.indexOf('function buildMazeGarden(){')),
    html.slice(html.indexOf('function buildMazeGarden(){'),html.indexOf('function buildMapGallery(){')),
    html.slice(html.indexOf('function buildMapGallery(){'),html.indexOf('function buildSparkToolsLab(){')),
    html.slice(html.indexOf('function buildSparkToolsLab(){'),html.indexOf('function buildTunnelPassage(){')),
    html.slice(html.indexOf('function buildStudio(){'),html.indexOf('function buildThinkingRoom(){')),
    html.slice(html.indexOf('function buildThinkingRoom(){'),html.indexOf('function makeCompassRoseTexture(){')),
  ];
  slices.forEach(source=>{
    assert.doesNotMatch(source,/title:'The Tunnel'/);
    assert.doesNotMatch(source,/title:'HEADQUARTERS'/);
  });
  assert.match(html,/doorFootprints\.length===12, 'only functional doors registered'/,
    'runtime selftest requires the reduced functional-door set');
});

test('active navigation and archive language belongs to the Tower', () => {
  assert.match(html,/gallery:'Tower Hall \/ Gallery Corridor'/);
  assert.match(html,/title:'Gallery Corridor'/);
  assert.match(html,/label:'the Tower Amphitheatre'/);
  assert.doesNotMatch(html,/gallery:'Warehouse \/ Corridor'/);
  assert.doesNotMatch(html,/title:'Warehouse \/ Hall'/);
  assert.doesNotMatch(html,/title:'Corridor \/ Tunnel Gallery'/);
});

test('selftest requires readable Lab lighting instead of deliberate darkness', () => {
  assert.doesNotMatch(html,/room deliberately dark · lab/);
  assert.doesNotMatch(html,/const baseline=ensureRoomBaselineLight\(room\)/,
    'selftest does not create the condition it claims to inspect');
  assert.match(html,/room has authored readable light · \$\{room\}/,
    'selftest verifies authored readable lighting without mutating it');
  assert.match(html,/const activeRig=ensureCompatibilityRig\(\)/,
    'selftest verifies the fixed compatibility rig is active');
  assert.match(html,/Lab artwork circuit starts readable/,
    'Lab also verifies its artwork circuit begins switched on');
});

test('Laboratory is visibly lit on entry and never described as totally dark', () => {
  assert.match(html, /const architecturalFill=new THREE\.HemisphereLight/);
  assert.match(html, /const entryFill=new THREE\.PointLight/);
  assert.match(html, /illuminated projection gallery/);
  assert.doesNotMatch(html, /totally dark projection room|barely visible return trace/);
});

test('the notes list escapes every localStorage-derived field it interpolates', () => {
  // n.at is written straight into the noteItemMeta template when it will not
  // parse as a date, so it must be escaped like body/ctx/act/id beside it.
  assert.match(html, /const stamp = esc\(isNaN\(date\)/,
    'the note timestamp is escaped before interpolation');
  assert.doesNotMatch(html, /const stamp = isNaN\(date\) \? n\.at :/,
    'the unescaped timestamp form has not returned');
});

test('the YouTube relay only accepts playback verbs from its embedding page', async () => {
  const relay = await readFile(new URL('../yt.html', import.meta.url), 'utf8');
  assert.match(relay, /if\(ev\.source !== window\.parent\) return;/,
    'the relay rejects messages from anything but the framing page');
  assert.match(relay, /hasOwnProperty\.call\(ALLOWED_FUNCS, func\)/,
    'the relay checks the verb against an own-property allowlist');
  assert.doesNotMatch(relay, /typeof player\[func\] === 'function'\) return;\s*\n\s*try\{ player\[func\]\.apply\(player, Array\.isArray\(data\.args\)/,
    'the unguarded arbitrary-method form has not returned');
  const policy = relay.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || '';
  assert.match(policy, /default-src 'none'/, 'the relay carries its own policy');
  assert.match(policy, /frame-src https:\/\/www\.youtube\.com/);
});


test('fixed compatibility rig prevents pitch-black GPU shader failures', () => {
  assert.match(html, /const PUNCTUAL_LIGHT_BUDGET = 0/,
    'authored point and spot lights are disabled by default');
  assert.match(html, /new THREE\.AmbientLight/);
  assert.match(html, /new THREE\.HemisphereLight/);
  assert.equal((html.match(/new THREE\.DirectionalLight/g)||[]).length >= 2,true,
    'the fixed rig contains two directional lights');
  assert.match(html, /for\(const room in roomLights\)[\s\S]*light\.visible=false/,
    'every registered authored light remains hidden');
  assert.match(html, /compatibilityRig=\{ambient,hemi,key,fill\}/,
    'the same four-light signature is reused in every room');
  assert.match(html, /rig\.hemi\.color\.setHex\(profile\.sky\)/);
  assert.match(html, /rig\.hemi\.groundColor\.setHex\(profile\.ground\)/,
    'room palettes change colour temperature without changing light types');
  assert.match(html, /applyMaterialVisibilityFloor\(scene\)/,
    'standard and physical materials receive a subtle visibility floor');
});

test('walk and lighting controls are compact, explicit and persistent', () => {
  assert.match(html, /id="enterBtn"[^>]*title="Start walking[^"]*"[^>]*>Walk<\/button>/,
    'the pointer-lock action explains that it starts walking');
  assert.match(html, /id="actions"[\s\S]*id="lightingControl"[\s\S]*id="screenControlBtn"/,
    'the compact lighting control remains permanently visible');
  assert.equal((html.match(/id="lightingControl"/g)||[]).length,1);
  assert.match(html, /id="lightingControl"[^>]*aria-label="Room lighting: Brightest"[^>]*>☀ Brightest<\/button>/);
  assert.match(html, /\.srOnly\{position:absolute!important;width:1px!important/,
    'accessibility labels no longer consume toolbar space');
  assert.match(html, /const LIGHT_STORAGE_KEY='workshop:lighting-v1'/);
  assert.match(html, /let lightLevelIndex = readSavedLightLevel\(\)/);
  assert.match(html, /LIGHT_LEVELS\[lightLevelIndex\]\.exp/);
  assert.match(html, /addEventListener\('click',cycleLightBoost\)/,
    'the visible sun control shares the L-key cycle');
  assert.match(html, /material\.emissiveIntensity=Math\.max\(material\.emissiveIntensity\|\|0,\.55\)/,
    'architectural surfaces remain visible independently of direct-light shading');
  assert.doesNotMatch(html, /label:'(?:Dark|Lights off)'/);
});


test('walking remains available when pointer lock is rejected', () => {
  assert.match(html, /id="renderCanvas" tabindex="0"/,
    'the walk surface can retain keyboard focus without mouse capture');
  assert.match(html, /function requestWalkCapture\(\)/);
  assert.match(html, /const lock=canvas\.requestPointerLock\(\)/);
  assert.match(html, /lock\.catch\(\(\)=>msg\('Walk active · use WASD or arrow keys'\)\)/,
    'asynchronous pointer-lock rejection is handled');
  assert.match(html, /catch\(e\)\{ msg\('Walk active · use WASD or arrow keys'\); \}/,
    'synchronous pointer-lock rejection is handled');
  assert.match(html, /if\(requestLock && !document\.pointerLockElement\) requestWalkCapture\(\)/,
    'interaction returns to keyboard walking without requiring pointer lock');
});

test('the world is focusable and every dismissal hands focus back', () => {
  assert.match(html, /<canvas id="renderCanvas" tabindex="0" role="application"/,
    'the canvas is focusable and declared as an application');
  assert.match(html, /function worldHasFocus\(\)\{/);
  assert.match(html, /function focusWorld\(\)\{/);
  assert.match(html, /\}else focusWorld\(\);/,
    'closing the Rooms panel returns focus to the world');
  assert.match(html, /if\(screenControlMode\)\{ exitScreenControl\(\); focusWorld\(\); return; \}/,
    'Escape returns focus to the world');
  assert.match(html, /msg\(label \|\| 'Moved'\);[\s\S]{0,220}?focusWorld\(\);/,
    'arriving in a room returns focus to the world');
});

test('keyboard visitors can aim above and below eye level', () => {
  assert.match(html, /const tilt = \(keys\.has\('pageup'\) \? 1 : 0\) - \(keys\.has\('pagedown'\) \? 1 : 0\);/);
  assert.match(html, /pitch = clamp\(pitch \+ tilt \* 1\.15 \* dt, -1\.25, 1\.40\);/,
    'key-driven pitch uses the same clamp as the pointer paths');
  assert.match(html, /<code>Page Up<\/code> \/ <code>Page Down<\/code>/,
    'Help documents the pitch keys');
});

test('an OS-level reduced-motion preference applies without being toggled', () => {
  assert.match(html, /const reducedMotionQuery = window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(html, /function syncMotionUi\(\)\{/);
  assert.match(html, /reducedMotionQuery\.addEventListener\('change'/,
    'the preference is followed while the page is open');
  assert.doesNotMatch(html, /function toggleMotion\(\)\{\s*\n\s*reducedMotion = !reducedMotion;\s*\n\s*document\.body\.classList\.toggle\('reduced'/,
    'the manual toggle no longer owns the class exclusively');
});

test('panel disclosure state is exposed to assistive technology', () => {
  assert.match(html, /function syncPanelExpandedState\(\)\{/);
  assert.match(html, /btn\.setAttribute\('aria-expanded', String\(panel\.classList\.contains\('open'\)\)\)/);
});

test('the page presents a real sharing card', async () => {
  // Scrapers fetch og:image out of band and never run WebGL, so without a
  // still every share of a visual museum renders as a bare text link.
  const CARD = 'https://pedrohfernandes-klk.github.io/THE-WORKSHOP/assets/og-card.jpg';
  assert.match(html, /<meta property="og:image" content="https:\/\//,
    'og:image is absolute — relative paths are not resolved by most scrapers');
  assert.ok(html.includes(`<meta property="og:image" content="${CARD}">`));
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta property="og:image:alt" content="[^"]+">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.ok(html.includes(`<meta name="twitter:image" content="${CARD}">`));
  assert.match(html, /<meta property="og:url" content="https:\/\/pedrohfernandes-klk\.github\.io\/THE-WORKSHOP\/">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pedrohfernandes-klk\.github\.io\/THE-WORKSHOP\/">/);

  const card = await stat(new URL('../assets/og-card.jpg', import.meta.url));
  assert.ok(card.size > 5_000, 'the card image ships alongside the metadata');
});

test('the YouTube relay address points at a page that is actually published', () => {
  // The package step copies yt.html to this site's root. The previous
  // SayWhat/yt.html address was never uploaded and returns 404, which broke
  // the whole file:// embed fallback.
  assert.match(html, /const STUDIO_YT_RELAY = 'https:\/\/pedrohfernandes-klk\.github\.io\/THE-WORKSHOP\/yt\.html';/);
  // Matches the quoted URL rather than the bare path, so the comment above the
  // constant can still explain which address was wrong and why.
  assert.doesNotMatch(html, /'https:\/\/[^']*SayWhat\/yt\.html'/,
    'the 404 relay address has not returned');
});

test('every route into a room waits for its district to exist', () => {
  // fastTravel and travelTo checked the build gate themselves; the lift did
  // not, and the tower lift serves nine on-demand districts. Enforcing it
  // inside setPlayerLocation covers every caller at once.
  const fn = html.slice(html.indexOf('function setPlayerLocation('), html.indexOf('function fastTravel('));
  assert.match(fn, /if\(!roomBuildReady\(room\)\)\{/,
    'setPlayerLocation itself refuses to land in an unbuilt district');
  assert.match(fn, /ensureDistrictBuild\(id\)\s*\n?\s*\.then\(\(\) => setPlayerLocation\(room, pos, newYaw, label, newPitch\)\)/,
    'it retries the same arrival once the district is built');
  assert.match(html, /if\(!roomBuildReady\(room\)\) ensureDistrictBuild\(roomBuildId\(room\)\)\.catch\(\(\)=>\{\}\);/,
    'the lift starts the build as the journey begins, not after the doors open');
});

test('a failed district build can be retried', () => {
  assert.match(html, /promise\.catch\(\(\)=>districtBuildPromises\.delete\(id\)\);/,
    'a rejected build is evicted so the next attempt re-runs the builder');
});

test('pointer-mode detection matches the CSS gate exactly', () => {
  // 'ontouchstart' in window is true on touch-capable Windows laptops driven
  // by a mouse, which suppressed pointer lock while CSS kept the on-screen
  // controls hidden — leaving that whole class of machine with no controls.
  assert.match(html, /const isCoarsePointer = window\.matchMedia\('\(pointer: coarse\)'\)\.matches \|\| window\.innerWidth <= 760;/);
  // Matches the code form only; the comment above the constant still names the
  // old sniff to explain why it was wrong.
  assert.doesNotMatch(html, /\|\|\s*'ontouchstart' in window/,
    'the touch-capability sniff has not returned');
});

test('a lost GL context is handled rather than silently freezing', () => {
  assert.match(html, /addEventListener\('webglcontextlost'/);
  assert.match(html, /addEventListener\('webglcontextrestored'/);
  assert.match(html, /event\.preventDefault\(\);\s*\n\s*contextLost = true;/,
    'preventDefault is required or the restore event never fires');
  assert.match(html, /if\(contextLost\) return;/,
    'the frame body is skipped while the context is gone');
  assert.match(html, /function startRenderWatchdog\(\)\{/,
    'a stalled render loop is reported instead of looking like a still image');
  assert.match(html, /function webglAvailable\(\)\{/,
    'WebGL is probed before init so an unsupported browser gets a sentence');
  assert.doesNotMatch(html, /<h1>BUILD<br>ERROR<\/h1>/,
    'the raw stack-trace error card is gone');
});

test('the lift reads as a lift rather than a door', () => {
  assert.match(html, /function liftIndicatorTexture\(/,
    'landings carry a digital floor readout');
  assert.match(html, /const reveal=new THREE\.Mesh\(new THREE\.BoxGeometry\(\.055,4\.28,\.045\)/,
    'paired leaves are separated by a centre reveal');
  assert.doesNotMatch(html, /const button=new THREE\.Mesh\(new THREE\.SphereGeometry\(\.095,18,12\)/,
    'the protruding sphere button is replaced by a flush backlit plate');
});
