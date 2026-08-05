#!/usr/bin/env node
// Build the static explorer's browser client (src/web/static-explorer/explorer-client.ts) into a
// single self-contained IIFE bundle at dist/client/explorer-client.js (issue #41, ADR-0007).
//
// The generator (src/application/commands/generate-views/html.ts) reads this built bundle from dist
// at generate time and inlines it into explorer.html behind a small window.__ES__ preamble carrying
// the per-model MODEL / REPO_ROOT_DEFAULT / PALETTE. The client's only imports are type-only (domain
// types), which esbuild erases, so the bundle has zero runtime dependencies and runs offline.
//
// Output goes to dist/client (NOT dist/web, which `vite build` empties, and NOT dist/node, the tsc
// tree). package.json `files` ships all of dist, so the bundle is present in a published install and
// resolves from html.js at dist/node/application/commands/generate-views/ via a fixed relative path.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'web', 'static-explorer', 'explorer-client.ts');
const outfile = join(root, 'dist', 'client', 'explorer-client.js');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  // Unminified so the inlined script stays human-inspectable, as the hand-inlined string was.
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
});

console.log('built ' + outfile);
