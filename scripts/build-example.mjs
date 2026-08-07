#!/usr/bin/env node
// Rebuild the bundled example (this tool's own recovered self-model) from its traces.
// Usage: node scripts/build-example.mjs   (or: npm run demo)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ex = join(root, 'examples', 'event-storming-recovery');
const model = join(ex, 'model', 'flows.json');
const run = (args) => execFileSync('node', args, { stdio: 'inherit', cwd: root });

// The Node side is TypeScript now; compile the CLIs before invoking them.
run([join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.node.json']);
// generate inlines the BUILT static-explorer client bundle (issue #41 / ADR-0007), so build it too,
// else `generate` below cannot read dist/client/explorer-client.js.
run([join(root, 'scripts', 'build-client.mjs')]);
const cli = join(root, 'dist', 'node', 'adapters', 'cli', 'cli.js');
run([cli, 'merge', join(ex, 'traces'), model]);
// generate now resolves --repo-root to an absolute path (issue #27), so passing '.' would bake
// THIS machine's absolute path and OS username into the committed, published example. Pass a
// stable, username-free placeholder instead: it feeds flows.dot's machine-local vscode:// links.
// --shareable (issue #74) makes explorer.html a PORTABLE committed artifact: it bakes NO source
// root (a neutral sentinel), so instead of shipping the dead placeholder path to every reader, the
// board self-heals on first open — a banner + auto-opening the "Source root" prompt on the first
// source-link click — to point links at the reader's own local checkout.
const CANONICAL_ROOT = '/event-storming-recovery';
run([cli, 'generate', model, join(ex, 'model'), '--repo-root', CANONICAL_ROOT, '--shareable', '--title', 'Event Storming Recovery — self-model']);

// generate bakes toUriRoot(path.resolve('/event-storming-recovery')) into flows.dot's every
// vscode://file/ link (explorer.html is --shareable, so it carries no baked root to normalize). That
// resolves to '/event-storming-recovery' on Linux but 'C:/event-storming-recovery' on Windows, so
// the committed example would carry a host-specific drive letter and never reproduce cross-OS.
// Strip it back to the canonical POSIX form (matching what Linux already emits) so the committed
// example is byte-identical on any host and `git diff -- examples/` stays clean. No-op on Linux.
const resolvedRoot = resolve(CANONICAL_ROOT).replace(/\\/g, '/'); // mirrors generate's toUriRoot
if (resolvedRoot !== CANONICAL_ROOT) {
  for (const file of [join(ex, 'model', 'explorer.html'), join(ex, 'model', 'flows.dot')]) {
    const before = readFileSync(file, 'utf8');
    writeFileSync(file, before.split(resolvedRoot).join(CANONICAL_ROOT));
  }
  console.log(`normalized baked root ${resolvedRoot} -> ${CANONICAL_ROOT}`);
}

console.log('\nbuilt ' + join(ex, 'model', 'explorer.html'));
