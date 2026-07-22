#!/usr/bin/env node
// Dev runner: starts the es-view API server (no browser) and the Vite dev server
// together, so one `npm run dev` gives you the SPA with a live /api. Ctrl+C stops both.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

// The Node side is TypeScript now; compile it before starting the API server.
execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.node.json'], { stdio: 'inherit', cwd: root });

const children = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  process.exit(code);
}
function run(label, args) {
  const c = spawn(process.execPath, args, { stdio: 'inherit', cwd: root });
  children.push(c);
  c.on('exit', (code) => { console.log(`\n[${label}] exited (${code ?? 0})`); shutdown(code ?? 0); });
}

run('api', [path.join(root, 'dist', 'node', 'adapters', 'cli', 'cli.js'), 'view', '--no-open']);
run('web', [viteBin]);
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log('dev: API on http://127.0.0.1:5178, Vite dev server on http://127.0.0.1:5179 (proxying /api). Ctrl+C to stop.');
