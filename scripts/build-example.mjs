#!/usr/bin/env node
// Rebuild the toy-shop example model + views from its traces.
// Usage: node scripts/build-example.mjs   (or: npm run demo)
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ex = join(root, 'examples', 'toy-shop');
const model = join(ex, 'model', 'flows.json');
const run = (args) => execFileSync('node', args, { stdio: 'inherit', cwd: root });

run([join(root, 'tools', 'merge-flows.js'), join(ex, 'traces'), model]);
run([join(root, 'tools', 'generate-views.js'), model, join(ex, 'model'), '--title', 'Toy Shop Event Storming']);
console.log('\nbuilt ' + join(ex, 'model', 'explorer.html'));
