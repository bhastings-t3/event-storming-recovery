#!/usr/bin/env node
// Rebuild the bundled example (this tool's own recovered self-model) from its traces.
// Usage: node scripts/build-example.mjs   (or: npm run demo)
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ex = join(root, 'examples', 'event-storming-recovery');
const model = join(ex, 'model', 'flows.json');
const run = (args) => execFileSync('node', args, { stdio: 'inherit', cwd: root });

// The Node side is TypeScript now; compile the CLIs before invoking them.
run([join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.node.json']);
run([join(root, 'dist', 'node', 'adapters', 'cli', 'es-merge.js'), join(ex, 'traces'), model]);
run([join(root, 'dist', 'node', 'adapters', 'cli', 'es-generate.js'), model, join(ex, 'model'), '--repo-root', root, '--title', 'Event Storming Recovery — self-model']);
console.log('\nbuilt ' + join(ex, 'model', 'explorer.html'));
