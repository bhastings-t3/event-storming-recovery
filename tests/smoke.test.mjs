// Smoke tests for the pipeline. No dependencies — uses the Node built-in test runner.
// Run: node --test   (or: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeTraceDocs, mergeTracesDir } from '../src/lib/merge.mjs';

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

    // the ubiquitous-language terms are merged, counted, and a flagged term carries its open question
    assert.ok(Array.isArray(m.terms) && m.terms.length >= 1, 'terms array is populated');
    assert.equal(m.meta.counts.terms, m.terms.length, 'meta.counts.terms matches');
    const flagged = m.terms.find((t) => (t.status || 'resolved') !== 'resolved');
    assert.ok(flagged && flagged.openQuestion, 'a flagged term states what a human should answer');
    assert.equal(m.meta.counts.unresolvedTerms, m.terms.filter((t) => (t.status || 'resolved') !== 'resolved').length, 'unresolved count matches');
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

    // the curated glossary terms (incl. a flagged one + its open question) are embedded for the Glossary tab
    assert.match(html, /Backorder/, 'a glossary term is embedded');
    assert.match(html, /openQuestion/, 'a flagged term carries its open question into the explorer');
    assert.match(html, /tab-glossary/, 'the Glossary tab is present');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('merge REJECTS an invalid glossary term (dangling relatedNodes / unflagged gap)', () => {
  const out = mkdtempSync(join(tmpdir(), 'es-'));
  const traces = join(out, 'traces');
  mkdirSync(traces);
  // a term pointing at a non-existent node, and an unresolved term with no open question - both invalid
  writeFileSync(join(traces, 'terms.glossary.json'), JSON.stringify({
    terms: [
      { id: 'term-x', term: 'X', definition: 'd', relatedNodes: ['does-not-exist'] },
      { id: 'term-y', term: 'Y', status: 'unresolved' }
    ]
  }));
  try {
    assert.throws(
      () => execFileSync('node', [merge, traces, join(out, 'flows.json')], { stdio: 'pipe' }),
      'merge should exit non-zero on a dangling relatedNodes ref and an unresolved term missing its openQuestion'
    );
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

test('data-model layer: fields[], physical parents, and the new verbs validate correctly', () => {
  // Helpers to build a minimal one-doc model around a readModel that carries a fields[] source ref.
  const doc = (refId, extraNodes = [], edges = []) => [{
    name: 'dm.json',
    doc: {
      nodes: [
        {
          id: 'rm-x', type: 'readModel', label: 'X',
          tactical: { explanation: 'e', anchors: [{ path: 'a', line: 1, symbol: 's' }] },
          fields: [{ name: 'total', derivation: 'Sum of the lines.', conceptual: true, confidence: 'medium', sources: [{ ref: refId, role: 'derived-from', transform: 'aggregation' }] }]
        },
        { id: 'col-y', type: 'column', label: 'y', parent: 'tbl-z' },
        { id: 'tbl-z', type: 'table', label: 'z' },
        ...extraNodes
      ],
      flows: [{ id: 'f', name: 'F', tier: 1, kind: 'read', status: 'live', steps: ['rm-x'], edges, hotspots: [] }],
      hotspots: []
    }
  }];

  // (a) a well-formed fields[] whose ref resolves merges with no errors...
  const ok = mergeTraceDocs(doc('col-y', [], [{ from: 'rm-x', to: 'tbl-z', verb: 'persists to' }]));
  assert.equal(ok.errors.length, 0, 'well-formed fields[] + resolvable ref => no errors');
  // (d) ...and the new verb does not draw a nonstandard-verb warning
  assert.ok(!ok.warnings.some((w) => /nonstandard edge verb/.test(w)), "'persists to' is a standard verb");

  // (b) a dangling column ref in a field source is an error
  const bad = mergeTraceDocs(doc('col-does-not-exist'));
  assert.ok(bad.errors.some((e) => /field 'total' source ref 'col-does-not-exist' not in nodes/.test(e)), 'dangling field source ref errors');

  // (c) an unknown parent is an error
  const orphanParent = mergeTraceDocs(doc('col-y', [{ id: 'tbl-bad', type: 'table', label: 'bad', parent: 'db-missing' }]));
  assert.ok(orphanParent.errors.some((e) => /node tbl-bad: parent 'db-missing' not in nodes/.test(e)), 'unknown parent errors');

  // (e) the real toy-shop model still merges with zero errors after the data-model additions
  const toy = mergeTracesDir(toyTraces);
  assert.equal(toy.errors.length, 0, `toy-shop merges clean, got: ${toy.errors.join('; ')}`);
  assert.ok((toy.model.meta.counts.byType.table || 0) >= 3, 'physical table nodes are counted in byType');
});

test('data-model integrity: parent cycles error, wrong-level parents warn, fields union across files', () => {
  // A parent cycle (a -> b -> a) is rejected, not left to produce a garbage breadcrumb.
  const cyc = mergeTraceDocs([{ name: 'c.json', doc: { nodes: [
    { id: 'tbl-a', type: 'table', label: 'a', parent: 'tbl-b' },
    { id: 'tbl-b', type: 'table', label: 'b', parent: 'tbl-a' },
  ], flows: [] } }]);
  assert.ok(cyc.errors.some((e) => /parent chain has a cycle/.test(e)), 'a parent cycle is an error');

  // A wrong-level parent (column under a database) warns but does not error (forgiving, but flagged
  // because it would drop the node from the containment tree).
  const wl = mergeTraceDocs([{ name: 'w.json', doc: { nodes: [
    { id: 'db-x', type: 'database', label: 'x' },
    { id: 'col-a', type: 'column', label: 'a', parent: 'db-x' },
  ], flows: [] } }]);
  assert.ok(wl.warnings.some((w) => /should be a table, not a database/.test(w)), 'wrong-level parent warns');
  assert.ok(!wl.errors.some((e) => /parent/.test(e)), 'wrong-level parent is not an error');

  // fields[] added in a LATER file (the data-mapping phase) union onto a node the trace phase made.
  const merged = mergeTraceDocs([
    { name: '01-trace.json', doc: { nodes: [
      { id: 'agg-o', type: 'aggregate', label: 'Order', tactical: { explanation: 'e', anchors: [{ path: 'a', line: 1, symbol: 's' }] } },
    ], flows: [{ id: 'f', name: 'F', tier: 1, kind: 'write', status: 'live', steps: ['agg-o'], edges: [], hotspots: [] }] } },
    { name: '02-data.json', doc: { nodes: [
      { id: 'agg-o', type: 'aggregate', label: 'Order', fields: [{ name: 'status', derivation: 'Order lifecycle state.' }] },
    ], flows: [] } },
  ]);
  const aggO = merged.model.nodes.find((n) => n.id === 'agg-o');
  assert.equal(merged.errors.length, 0, `union merge is clean, got: ${merged.errors.join('; ')}`);
  assert.ok((aggO.fields || []).some((f) => f.name === 'status'), 'fields from a later file union onto the existing node');
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
