// Copies the browser modules the site imports out of the locked node_modules,
// so the published site never depends on a CDN (the CSP forbids one anyway).
//
// Addons keep their examples/jsm layout under assets/vendor/three/addons/ so
// their own relative imports (../shaders/CopyShader.js, ./Pass.js) still
// resolve. Their bare `three` imports resolve through each page's importmap.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const three = resolve(root, 'node_modules', 'three');
const target = resolve(root, 'assets', 'vendor', 'three');

const ADDONS = [
  // classic.html
  'renderers/CSS3DRenderer.js',
  // index.html — the gallery
  'postprocessing/EffectComposer.js',
  'postprocessing/Pass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/MaskPass.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
  'postprocessing/GTAOPass.js',
  'postprocessing/BokehPass.js',
  'shaders/GTAOShader.js',
  'shaders/PoissonDenoiseShader.js',
  'shaders/BokehShader.js',
  'math/SimplexNoise.js',
  'objects/Reflector.js',
  'environments/RoomEnvironment.js',
  'loaders/RGBELoader.js',
  'utils/BufferGeometryUtils.js',
  'geometries/RoundedBoxGeometry.js',
  'objects/Sky.js',
];

// Each face ships as two woff2 subsets, `latin` (Basic Latin + Latin-1, so
// Portuguese ã õ ç é ê á à ó ú í) and `latin-ext`, which index.html declares
// with matching unicode-ranges so the second file only loads when needed.
const FONTS = [
  // Retired from the interface; still drawn on some in-world canvases.
  ['@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2', 'instrument-serif-400.woff2'],
  ['@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2', 'instrument-serif-400-italic.woff2'],
  ['@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2', 'instrument-sans-variable.woff2'],
  // The house faces: Bungee (display), Space Grotesk (text), Silkscreen (HUD).
  ['@fontsource/bungee/files/bungee-latin-400-normal.woff2', 'bungee-400.woff2'],
  ['@fontsource/bungee/files/bungee-latin-ext-400-normal.woff2', 'bungee-400-ext.woff2'],
  ['@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', 'space-grotesk-variable.woff2'],
  ['@fontsource-variable/space-grotesk/files/space-grotesk-latin-ext-wght-normal.woff2', 'space-grotesk-variable-ext.woff2'],
  ['@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2', 'silkscreen-400.woff2'],
  ['@fontsource/silkscreen/files/silkscreen-latin-ext-400-normal.woff2', 'silkscreen-400-ext.woff2'],
  ['@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2', 'silkscreen-700.woff2'],
  ['@fontsource/silkscreen/files/silkscreen-latin-ext-700-normal.woff2', 'silkscreen-700-ext.woff2'],
];
// The SIL Open Font License travels with every face it covers.
const FONT_LICENCES = [
  ['@fontsource/instrument-serif/LICENSE', 'OFL-instrument-serif.txt'],
  ['@fontsource-variable/instrument-sans/LICENSE', 'OFL-instrument-sans.txt'],
  ['@fontsource/bungee/LICENSE', 'OFL-bungee.txt'],
  ['@fontsource-variable/space-grotesk/LICENSE', 'OFL-space-grotesk.txt'],
  ['@fontsource/silkscreen/LICENSE', 'OFL-silkscreen.txt'],
];

await mkdir(target, { recursive: true });
const jobs = [
  copyFile(resolve(three, 'build', 'three.module.js'), resolve(target, 'three.module.js')),
  // classic.html imports this one from the vendor root; keep that path stable.
  copyFile(resolve(three, 'examples', 'jsm', 'renderers', 'CSS3DRenderer.js'), resolve(target, 'CSS3DRenderer.js')),
];
for (const rel of ADDONS) {
  const to = resolve(target, 'addons', rel);
  await mkdir(dirname(to), { recursive: true });
  jobs.push(copyFile(resolve(three, 'examples', 'jsm', rel), to));
}
const fonts = resolve(root, 'assets', 'fonts');
await mkdir(fonts, { recursive: true });
for (const [from, name] of [...FONTS, ...FONT_LICENCES]) {
  jobs.push(copyFile(resolve(root, 'node_modules', from), resolve(fonts, name)));
}
await Promise.all(jobs);

console.log('Prepared locked Three.js browser modules and fonts.');
