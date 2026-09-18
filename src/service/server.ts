import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './http.ts';
import { routes } from './routes.ts';
import { GovernanceStore } from './store.ts';

const here = dirname(fileURLToPath(import.meta.url));

export function startServer(port: number, host = '127.0.0.1') {
  const store = new GovernanceStore();
  const server = createApp({
    routes,
    store,
    staticRoot: resolve(here, '../../public'),
  });
  server.listen(port, host);
  return { server, store };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const port = Number.parseInt(process.env['PORT'] ?? '8787', 10);
  // Loopback only. Identity here is a request header, which is acceptable for a
  // prototype precisely because nothing outside this machine can send one.
  const { server } = startServer(port);
  server.on('listening', () => {
    process.stdout.write(`AI Guard policy service on http://127.0.0.1:${port}\n`);
    process.stdout.write('Mocked identity: send x-aig-user: u-anna | u-luca | u-sara\n');
  });
}
