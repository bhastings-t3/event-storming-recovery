// Smoke tests for the pipeline. No dependencies — uses the Node built-in test runner.
// Run: node --test   (or: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const merge = join(root, 'tools', 'merge-flows.js');
const generate = join(root, 'tools', 'generate-views.js');
const toyTraces = join(root, 'examples', 'toy-shop', 'traces');

test('merge validates the toy-shop traces and emits the expected model', () => {
  const out = mkdtempSync(join(tmpdir(), 'es-'));
  try {
    const model = join(out, 'flows.json');
    execFileSync('node', [merge, toyTraces, model], { stdio: 'pipe' });
    const m = JSON.parse(readFileSync(model, 'utf8'));

    assert.equal(m.flows.length, 2, 'two flows');
    assert.ok(m.nodes.length >= 10, 'nodes present');

    // a shared node id is reused across both flows (the connective tissue)
    const sharedIds = m.meta.sharedGlossary.map((g) => g.id);
    assert.ok(sharedIds.includes('agg-order'), 'agg-order is shared across flows');

    // the dead flow is present and its supersededBy resolves to a real flow
    const dead = m.flows.find((f) => f.status === 'dead');
    assert.ok(dead, 'a dead flow exists');
    assert.ok(m.flows.some((f) => f.id === dead.supersededBy), 'supersededBy resolves');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('generate-views emits a self-contained explorer and a valid DOT', () => {
  const out = mkdtempSync(join(tmpdir(), 'es-'));
  try {
    const model = join(out, 'flows.json');
    execFileSync('node', [merge, toyTraces, model], { stdio: 'pipe' });
    execFileSync('node', [generate, model, out, '--title', 'Smoke Title'], { stdio: 'pipe' });

    const html = readFileSync(join(out, 'explorer.html'), 'utf8');
    assert.match(html, /<title>Smoke Title<\/title>/, 'title is injected');
    assert.match(html, /const MODEL = /, 'model is embedded (self-contained)');
    assert.doesNotMatch(html, /<script src=/, 'no external script tags (offline-safe)');

    const dot = readFileSync(join(out, 'flows.dot'), 'utf8');
    assert.match(dot, /digraph event_storming/, 'dot header present');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('merge REJECTS an invalid model (aggregate issuing a command)', () => {
  const out = mkdtempSync(join(tmpdir(), 'es-'));
  const traces = join(out, 'traces');
  mkdirSync(traces);
  // an aggregate must never issue a command — the validator must catch this
  writeFileSync(join(traces, 'bad.json'), JSON.stringify({
    nodes: [
      { id: 'agg-x', type: 'aggregate', label: 'X' },
      { id: 'cmd-y', type: 'command', label: 'Y', tactical: { explanation: '.', anchors: [{ path: 'a', line: 1 }] } }
    ],
    flows: [{
      id: 'bad', name: 'bad', tier: 1, kind: 'write', status: 'live',
      steps: ['agg-x', 'cmd-y'],
      edges: [{ from: 'agg-x', to: 'cmd-y', verb: 'issues' }],
      hotspots: []
    }],
    hotspots: []
  }));
  try {
    assert.throws(
      () => execFileSync('node', [merge, traces, join(out, 'flows.json')], { stdio: 'pipe' }),
      'merge should exit non-zero on an aggregate that issues a command'
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('plugin + marketplace manifests are well-formed and agree', () => {
  const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.name, 'plugin.json has a name');

  const mkt = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.ok(mkt.name, 'marketplace has a name');
  assert.ok(mkt.owner?.name, 'marketplace has owner.name');
  assert.ok(Array.isArray(mkt.plugins) && mkt.plugins.length >= 1, 'marketplace lists plugins');
  for (const p of mkt.plugins) assert.ok(p.name && p.source, 'each plugin entry has name + source');
  assert.ok(mkt.plugins.some((p) => p.name === plugin.name), 'marketplace lists this plugin by name');
});
