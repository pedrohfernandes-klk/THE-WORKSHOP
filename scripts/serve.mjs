// Manual dev server: `npm run serve`, or PORT=9000 npm run serve
//
// Same server the browser tests use, so what you look at by hand and what CI
// asserts against are the same code path. No dependencies, so this works from
// a clean checkout before `npm install`.
import { startStaticServer } from './static-server.mjs';

const port = Number(process.env.PORT || 8080);

const { server, origin } = await startStaticServer(port);
console.log(`THE WORKSHOP -> ${origin}`);
console.log('Ctrl+C to stop.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
