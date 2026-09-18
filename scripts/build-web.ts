import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cockpitOut = resolve(root, 'public');
const extensionOut = resolve(root, 'dist/extension');

const shared = {
  bundle: true,
  format: 'esm' as const,
  target: 'es2022',
  platform: 'browser' as const,
  logLevel: 'info' as const,
  // `.ts` extensions in imports are a Node 24 convention; the bundler has to be
  // told they resolve to the same files.
  resolveExtensions: ['.ts', '.js'],
};

async function buildCockpit(): Promise<void> {
  await rm(cockpitOut, { recursive: true, force: true });
  await mkdir(cockpitOut, { recursive: true });

  await build({
    ...shared,
    entryPoints: [resolve(root, 'src/cockpit/app.ts')],
    outfile: resolve(cockpitOut, 'app.js'),
    minify: false,
    sourcemap: true,
  });

  await cp(resolve(root, 'src/cockpit/index.html'), resolve(cockpitOut, 'index.html'));
  await cp(resolve(root, 'src/cockpit/styles.css'), resolve(cockpitOut, 'styles.css'));
}

async function buildExtension(): Promise<void> {
  await rm(extensionOut, { recursive: true, force: true });
  await mkdir(extensionOut, { recursive: true });

  await build({
    ...shared,
    entryPoints: [
      resolve(root, 'src/extension/background.ts'),
      resolve(root, 'src/extension/guard.ts'),
      resolve(root, 'src/extension/ask.ts'),
      resolve(root, 'src/extension/bridge.ts'),
      resolve(root, 'src/extension/popup.ts'),
    ],
    outdir: extensionOut,
    splitting: false,
  });

  await cp(resolve(root, 'src/extension/manifest.json'), resolve(extensionOut, 'manifest.json'));
  await cp(resolve(root, 'src/extension/popup.html'), resolve(extensionOut, 'popup.html'));
}

await buildCockpit();
await buildExtension();
console.log(`cockpit  → ${cockpitOut}\nextension → ${extensionOut}`);
