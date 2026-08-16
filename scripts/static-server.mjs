// One static file server for the whole project.
//
// The two browser smoke tests each carried their own byte-identical copy of
// this, and `npm run serve` was a third, different implementation on a
// different port. That meant three ways to serve the same directory, and the
// manual one could disagree with what the tests actually exercised.
//
// Serves the repository root with no dependencies, so it works from a clean
// checkout before `npm install`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon',
};

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = join(root, path === '/' ? 'index.html' : path);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }        // no path escapes
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
}

// Resolves once the port is actually bound, so callers never race the listen.
export function startStaticServer(port = 0, root = ROOT) {
  const server = createStaticServer(root);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      resolve({ server, port: bound, origin: `http://127.0.0.1:${bound}` });
    });
  });
}
