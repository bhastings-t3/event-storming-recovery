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
const cli = join(root, 'dist', 'node', 'adapters', 'cli', 'cli.js');
run([cli, 'merge', join(ex, 'traces'), model]);
// generate now resolves --repo-root to an absolute path (issue #27), so passing '.' would bake
// THIS machine's absolute path and OS username into the committed, published example. Pass a
// stable, username-free placeholder instead: the committed board's baked root is only a DEFAULT
// the reader overrides (the "Source root" control) to point links at their own checkout.
run([cli, 'generate', model, join(ex, 'model'), '--repo-root', '/event-storming-recovery', '--title', 'Event Storming Recovery — self-model']);
console.log('\nbuilt ' + join(ex, 'model', 'explorer.html'));
