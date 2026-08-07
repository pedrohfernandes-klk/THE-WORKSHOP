import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules', 'three');
const target = resolve(root, 'assets', 'vendor', 'three');

await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(resolve(source, 'build', 'three.module.js'), resolve(target, 'three.module.js')),
  copyFile(resolve(source, 'examples', 'jsm', 'renderers', 'CSS3DRenderer.js'), resolve(target, 'CSS3DRenderer.js'))
]);

console.log('Prepared locked Three.js browser modules.');
