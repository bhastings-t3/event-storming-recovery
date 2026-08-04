// Regression test for the fs generator-writer adapter (issue #50): `generate <flows> <outDir>` used
// to fail with ENOENT on flows.dot when <outDir> did not already exist, because the writer opened the
// output files without ensuring the directory was there. writeViews now mkdir -p's outDir first, so a
// fresh nested target succeeds and an existing one is unchanged (idempotent). These drive the real
// adapter against real temp directories; only the os.tmpdir() scratch is a test artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeViews } from '../dist/node/adapters/fs/generator-writer.js';

const VIEWS = { dot: 'digraph { a -> b }\n', html: '<!doctype html><title>x</title>\n' };

function scratchDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'es-generator-'));
}

test('writeViews: a nested outDir that does not exist yet is created; both files are written', () => {
  const outDir = path.join(scratchDir(), 'does', 'not', 'exist', 'yet');
  assert.ok(!fs.existsSync(outDir), 'precondition: the nested target does not exist');

  // Before the fix this threw ENOENT opening flows.dot; now it succeeds.
  assert.doesNotThrow(() => writeViews(outDir, VIEWS));

  assert.equal(fs.readFileSync(path.join(outDir, 'flows.dot'), 'utf8'), VIEWS.dot);
  assert.equal(fs.readFileSync(path.join(outDir, 'explorer.html'), 'utf8'), VIEWS.html);
});

test('writeViews: writing into an already-existing dir still works and is idempotent', () => {
  const outDir = scratchDir(); // mkdtemp already created it

  assert.doesNotThrow(() => writeViews(outDir, VIEWS)); // dir already present
  assert.doesNotThrow(() => writeViews(outDir, VIEWS)); // second write must not throw either

  assert.equal(fs.readFileSync(path.join(outDir, 'flows.dot'), 'utf8'), VIEWS.dot);
  assert.equal(fs.readFileSync(path.join(outDir, 'explorer.html'), 'utf8'), VIEWS.html);
});
