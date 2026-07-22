// Black-box tests for the four pure domain aggregates (CommentStore, Selection, ContextBundle,
// SourceWindow). Derived from CONTRACT.md + the compiled .d.ts signatures only — no implementation
// source was read while authoring these.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CommentStore, EmptyCommentError } from '../dist/node/domain/comment-store/comment-store.js';
import { Selection } from '../dist/node/domain/session/selection.js';
import { ContextBundle } from '../dist/node/domain/session/context-bundle.js';
import { guardPath, lineWindow } from '../dist/node/domain/source/source-window.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ---------------------------------------------------------------------------
// CommentStore
// ---------------------------------------------------------------------------

test('CommentStore: blank/whitespace-only text is rejected', () => {
  const store = new CommentStore();
  assert.throws(() => store.add('flow', 'f1', ''), EmptyCommentError);
  assert.throws(() => store.add('flow', 'f1', '   '), EmptyCommentError);
  assert.throws(() => store.add('flow', 'f1', '\t\n '), EmptyCommentError);
  // rejected text must not have been stored
  assert.deepEqual(store.get('flow', 'f1'), []);
});

test('CommentStore: non-blank text is stored trimmed with an 8-char id + ISO `at`', () => {
  const store = new CommentStore();
  const c = store.add('flow', 'f1', '  hello world  ');
  assert.equal(c.text, 'hello world', 'text is trimmed');
  assert.equal(typeof c.id, 'string');
  assert.equal(c.id.length, 8, 'id is 8 characters');
  assert.match(c.at, ISO_RE, 'at is an ISO-8601 string');
  assert.ok(!Number.isNaN(Date.parse(c.at)), 'at parses as a valid date');
});

test('CommentStore: get() is empty when none stored for a key', () => {
  const store = new CommentStore();
  assert.deepEqual(store.get('flow', 'does-not-exist'), []);
});

test('CommentStore: all() returns only non-empty keys', () => {
  const store = new CommentStore();
  assert.deepEqual(store.all(), {}, 'starts empty');

  store.add('flow', 'f1', 'first');
  store.add('node', 'n1', 'second');

  const all = store.all();
  assert.equal(Object.keys(all).length, 2);
  assert.ok(Array.isArray(all['flow:f1']));
  assert.ok(Array.isArray(all['node:n1']));
  assert.equal(all['flow:f1'].length, 1);

  // removing the only comment in a key drops it from all()
  const remaining = store.remove('node', 'n1', all['node:n1'][0].id);
  assert.deepEqual(remaining, []);
  const afterRemove = store.all();
  assert.ok(!('node:n1' in afterRemove), 'emptied key disappears from all()');
  assert.ok('flow:f1' in afterRemove, 'untouched key remains');
});

test('CommentStore: add() appends within the same key, preserving order', () => {
  const store = new CommentStore();
  store.add('flow', 'f1', 'one');
  store.add('flow', 'f1', 'two');
  store.add('flow', 'f1', 'three');

  const items = store.get('flow', 'f1');
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.text), ['one', 'two', 'three']);
});

test('CommentStore: remove() deletes one comment and returns the remainder', () => {
  const store = new CommentStore();
  const a = store.add('flow', 'f1', 'keep-a');
  const b = store.add('flow', 'f1', 'remove-b');
  const c = store.add('flow', 'f1', 'keep-c');

  const remaining = store.remove('flow', 'f1', b.id);
  assert.equal(remaining.length, 2);
  assert.deepEqual(remaining.map((i) => i.id), [a.id, c.id]);
  // get() reflects the same state
  assert.deepEqual(store.get('flow', 'f1').map((i) => i.id), [a.id, c.id]);
});

test('CommentStore: load() from a prior {version,comments} doc reproduces the keyed map', () => {
  const store = new CommentStore();
  const doc = {
    version: 1,
    comments: {
      'flow:f1': [{ id: 'abcd1234', text: 'restored', at: '2020-01-01T00:00:00.000Z' }],
      'node:n2': [{ id: 'zzzz9999', text: 'also restored', at: '2020-06-15T12:00:00.000Z' }],
    },
  };
  store.load(doc);

  assert.deepEqual(store.get('flow', 'f1'), doc.comments['flow:f1']);
  assert.deepEqual(store.get('node', 'n2'), doc.comments['node:n2']);
  const all = store.all();
  assert.equal(Object.keys(all).length, 2);
});

test('CommentStore: loading a corrupt doc into a fresh store yields an empty store', () => {
  for (const corrupt of [null, undefined, 42, 'garbage', [], { comments: 'not-an-object' }, {}]) {
    const store = new CommentStore();
    store.load(corrupt);
    assert.deepEqual(store.all(), {}, `load(${JSON.stringify(corrupt)}) => empty store`);
  }
});

// SUSPECTED BUG: the CONTRACT states unconditionally that "a corrupt doc yields an empty
// store" for CommentStore.load(). Observed behavior: if the store already holds comments
// (e.g. added before load() is called), loading a corrupt doc is a silent no-op that leaves
// the stale entries in place rather than emptying the store. Kept per instructions (not
// weakened) — this assertion documents the contract's literal claim and currently FAILS
// against the compiled implementation.
test('CommentStore: loading a corrupt doc empties a store that already had comments (per CONTRACT)', () => {
  for (const corrupt of [null, undefined, 42, 'garbage', [], { comments: 'not-an-object' }, {}]) {
    const store = new CommentStore();
    store.add('flow', 'pre-existing', 'should be cleared by load per contract');
    store.load(corrupt);
    assert.deepEqual(store.all(), {}, `load(${JSON.stringify(corrupt)}) => empty store, even with prior data`);
  }
});

test('CommentStore: entries() reflects the current keyed map as a Map', () => {
  const store = new CommentStore();
  store.add('flow', 'f1', 'hi');
  const entries = store.entries();
  assert.ok(entries instanceof Map);
  assert.ok(entries.has('flow:f1'));
  assert.equal(entries.get('flow:f1').length, 1);
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test('Selection: set()/get() round-trips a node ref with {nodeId, at} shape', () => {
  const sel = new Selection(() => 12345);
  const result = sel.set('node-1');
  assert.deepEqual(result, { nodeId: 'node-1', at: 12345 });
  assert.deepEqual(sel.get(), { nodeId: 'node-1', at: 12345 });
});

test('Selection: get() is null before any selection is made', () => {
  const sel = new Selection();
  assert.equal(sel.get(), null);
});

test('Selection: clear() empties the selection', () => {
  const sel = new Selection(() => 1);
  sel.set('node-1');
  sel.clear();
  assert.equal(sel.get(), null);
});

test('Selection: a falsy nodeId clears the selection', () => {
  for (const falsy of [null, undefined, '']) {
    const sel = new Selection(() => 1);
    sel.set('node-1');
    const result = sel.set(falsy);
    assert.equal(result, null, `set(${JSON.stringify(falsy)}) clears`);
    assert.equal(sel.get(), null);
  }
});

test('Selection: set() updates `at` on each call', () => {
  let t = 100;
  const sel = new Selection(() => t);
  sel.set('a');
  t = 200;
  const second = sel.set('b');
  assert.deepEqual(second, { nodeId: 'b', at: 200 });
});

// ---------------------------------------------------------------------------
// ContextBundle
// ---------------------------------------------------------------------------

test('ContextBundle: add() is idempotent per type:id', () => {
  const bundle = new ContextBundle();
  bundle.add('flow', 'f1');
  const after = bundle.add('flow', 'f1');
  assert.equal(after.length, 1, 'no duplicate for the same type:id');
  assert.deepEqual(after, [{ type: 'flow', id: 'f1' }]);
});

test('ContextBundle: insertion order is preserved', () => {
  const bundle = new ContextBundle();
  bundle.add('flow', 'f1');
  bundle.add('node', 'n1');
  bundle.add('term', 't1');
  assert.deepEqual(bundle.list(), [
    { type: 'flow', id: 'f1' },
    { type: 'node', id: 'n1' },
    { type: 'term', id: 't1' },
  ]);
});

test('ContextBundle: remove() deletes a single item', () => {
  const bundle = new ContextBundle();
  bundle.add('flow', 'f1');
  bundle.add('node', 'n1');
  const after = bundle.remove('flow', 'f1');
  assert.deepEqual(after, [{ type: 'node', id: 'n1' }]);
  assert.deepEqual(bundle.list(), [{ type: 'node', id: 'n1' }]);
});

test('ContextBundle: clear() empties the bundle', () => {
  const bundle = new ContextBundle();
  bundle.add('flow', 'f1');
  bundle.add('node', 'n1');
  bundle.clear();
  assert.deepEqual(bundle.list(), []);
});

test('ContextBundle: list() shape is [{type,id}]', () => {
  const bundle = new ContextBundle();
  assert.deepEqual(bundle.list(), []);
  bundle.add('flow', 'f1');
  const list = bundle.list();
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'type']);
});

// ---------------------------------------------------------------------------
// SourceWindow (guardPath, lineWindow)
// ---------------------------------------------------------------------------

test('SourceWindow: guardPath rejects a relPath that escapes repoRoot', () => {
  const result = guardPath(process.cwd(), '../../etc/passwd');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'path escapes repo root');
});

test('SourceWindow: guardPath rejects a missing path', () => {
  for (const missing of [undefined, null, '']) {
    const result = guardPath(process.cwd(), missing);
    assert.equal(result.ok, false, `guardPath with ${JSON.stringify(missing)} rejects`);
    assert.equal(result.error, 'no path');
  }
});

test('SourceWindow: guardPath accepts a relPath contained within repoRoot', () => {
  // Use an OS-native absolute root (guardPath is pure path arithmetic; it may normalize
  // separators/drive letters per platform, so we don't assert an exact string for root/abs —
  // just that it resolves ok and stays under the given root).
  const repoRoot = process.cwd();
  const result = guardPath(repoRoot, 'src/index.js');
  assert.equal(result.ok, true);
  assert.equal(typeof result.root, 'string');
  assert.equal(typeof result.abs, 'string');
  assert.ok(result.abs.includes('index.js'), 'abs path resolves the file');
  assert.ok(result.abs.startsWith(result.root), 'abs stays under root');
});

test('SourceWindow: guardPath rejects an absolute path outside repoRoot posing as a sibling', () => {
  // a sibling directory that merely shares a string prefix with repoRoot must not be treated as contained
  const repoRoot = process.cwd();
  const result = guardPath(repoRoot, '../root-evil/secret.txt');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'path escapes repo root');
});

test('SourceWindow: lineWindow clamps line into [1, totalLines]', () => {
  assert.equal(lineWindow(10, 0).line, 1, 'line below 1 clamps to 1');
  assert.equal(lineWindow(10, -5).line, 1, 'negative line clamps to 1');
  assert.equal(lineWindow(10, 15).line, 10, 'line above N clamps to N');
  assert.equal(lineWindow(10, 5).line, 5, 'in-range line is unchanged');
});

test('SourceWindow: lineWindow computes [line-ctx, line+ctx] clamped to [1, N]', () => {
  const mid = lineWindow(100, 50, 5);
  assert.deepEqual(mid, { line: 50, startLine: 45, endLine: 55 });

  const nearStart = lineWindow(100, 2, 5);
  assert.equal(nearStart.startLine, 1, 'startLine clamps to 1');
  assert.equal(nearStart.endLine, 7);

  const nearEnd = lineWindow(10, 9, 5);
  assert.equal(nearEnd.endLine, 10, 'endLine clamps to totalLines');
  assert.equal(nearEnd.startLine, 4);

  const single = lineWindow(1, 1, 8);
  assert.deepEqual(single, { line: 1, startLine: 1, endLine: 1 }, 'a 1-line file clamps the whole window');
});

test('SourceWindow: lineWindow defaults ctx to 8', () => {
  const withDefault = lineWindow(100, 50);
  const withExplicit8 = lineWindow(100, 50, 8);
  assert.deepEqual(withDefault, withExplicit8, 'omitting ctx behaves like ctx=8');
  assert.deepEqual(withDefault, { line: 50, startLine: 42, endLine: 58 });
});
