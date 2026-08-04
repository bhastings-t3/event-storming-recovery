// Regression tests for ResolveModel robustness (issue #11, the port/discovery/repoRoot trio):
//   - discovery ambiguity: when more than one flows.json is found, the chosen file and the --model
//     override must be surfaced as a warning (not silently picking hits[0]).
//   - repo-root validation: a model whose effective repoRoot does not exist on disk must warn that
//     source links will not resolve — but still resolve a model, never hard-fail.
// Black-box over the real modelRepository fs adapter against temp dirs. Run: node --test (pretest builds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveModel } from '../dist/node/application/commands/resolve-model.js';
import { modelRepository } from '../dist/node/adapters/fs/model-repository.js';

/** A minimal model that passes the validator (no nodes/flows means no dangling references). */
function emptyModel(meta = {}) {
  return { version: 1, meta: { title: 'resolve-test', ...meta }, nodes: [], flows: [], hotspots: [], terms: [] };
}

function mkTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'es11-resolve-'));
}

// ---------------------------------------------------------------------------
// Discovery ambiguity: two flows.json under cwd -> a warning naming the choice + the override
// ---------------------------------------------------------------------------

test('discovery: two flows.json files produce an ambiguity warning naming the chosen file and --model override', () => {
  const cwd = mkTemp();
  try {
    for (const dir of ['a', 'b']) {
      fs.mkdirSync(path.join(cwd, dir));
      fs.writeFileSync(path.join(cwd, dir, 'flows.json'), JSON.stringify(emptyModel()));
    }
    const resolved = resolveModel({ cwd, packageRoot: cwd }, modelRepository);
    assert.equal(resolved.source, 'discovered');
    const ambiguity = resolved.warnings.find((w) => /found 2 flows\.json files/.test(w));
    assert.ok(ambiguity, `expected an ambiguity warning, got: ${JSON.stringify(resolved.warnings)}`);
    assert.match(ambiguity, /using /, 'the warning must name the chosen file');
    assert.match(ambiguity, /Pass --model/, 'the warning must say how to override the choice');
    // The chosen file is the one the warning names; it must be one of the two we planted.
    assert.match(resolved.sourcePath, /[\\/](a|b)[\\/]flows\.json$/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('discovery: a single flows.json is unambiguous (no ambiguity warning)', () => {
  const cwd = mkTemp();
  try {
    fs.mkdirSync(path.join(cwd, 'model'));
    fs.writeFileSync(path.join(cwd, 'model', 'flows.json'), JSON.stringify(emptyModel()));
    const resolved = resolveModel({ cwd, packageRoot: cwd }, modelRepository);
    assert.equal(resolved.source, 'discovered');
    assert.ok(!resolved.warnings.some((w) => /found \d+ flows\.json files/.test(w)), 'one match must not warn about ambiguity');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// repoRoot validation: a nonexistent effective repo root warns, but still resolves the model
// ---------------------------------------------------------------------------

test('repoRoot: a model whose meta.repoRoot does not exist warns about dead source links but still loads', () => {
  const cwd = mkTemp();
  try {
    const ghost = path.join(cwd, 'does', 'not', 'exist');
    fs.mkdirSync(path.join(cwd, 'model'));
    fs.writeFileSync(path.join(cwd, 'model', 'flows.json'), JSON.stringify(emptyModel({ repoRoot: ghost })));
    const resolved = resolveModel({ cwd, packageRoot: cwd }, modelRepository);
    assert.equal(resolved.repoRoot, ghost, 'the (nonexistent) repo root is still used — viewing is not blocked');
    const warn = resolved.warnings.find((w) => /does not exist; source links will not resolve/.test(w));
    assert.ok(warn, `expected a repo-root warning, got: ${JSON.stringify(resolved.warnings)}`);
    assert.match(warn, /Pass --repo-root/, 'the warning must say how to fix it');
    assert.ok(resolved.model, 'the model still resolves (no hard failure)');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('repoRoot: an existing repo root does not warn', () => {
  const cwd = mkTemp();
  try {
    fs.mkdirSync(path.join(cwd, 'model'));
    // meta.repoRoot points at cwd, which exists.
    fs.writeFileSync(path.join(cwd, 'model', 'flows.json'), JSON.stringify(emptyModel({ repoRoot: cwd })));
    const resolved = resolveModel({ cwd, packageRoot: cwd }, modelRepository);
    assert.equal(resolved.repoRoot, cwd);
    assert.ok(!resolved.warnings.some((w) => /does not exist; source links will not resolve/.test(w)), 'an existing repo root must not warn');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
