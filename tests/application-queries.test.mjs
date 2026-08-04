// Black-box tests for the APPLICATION read-model QUERIES that the MCP tools and the HTTP /api face
// expose but that, until now, only the E2E suite exercised (driving the whole app). Each query is
// driven through its real exported function against a small in-memory model, and asserts the
// observable contract — the exact MCP text / result shape a regression would change — so a failure
// localizes to the query rather than surfacing as an opaque E2E diff.
//
// Covered here (each currently has NO focused unit test):
//   listModel          — the `list_model` index text
//   getNode            — grounded node markdown + the unknown-id fallback string
//   getItem            — the {type,id,label,markdown} bundle-item projection (+ null on unknown)
//   getCurrentSelection— the GET /api/selection response, incl. the stale-selection null path
//   listContextBundle  — bundle items + rendered markdown (+ empty sentinel)
//   listComments       — per-item vs all, and the no-store path
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildServices } from '../dist/node/application/services.js';
import { listModel } from '../dist/node/application/queries/list-model.js';
import { getNode } from '../dist/node/application/queries/get-node.js';
import { getItem } from '../dist/node/application/queries/get-item.js';
import { getCurrentSelection } from '../dist/node/application/queries/get-current-selection.js';
import { listContextBundle } from '../dist/node/application/queries/list-context-bundle.js';
import { listComments } from '../dist/node/application/queries/list-comments.js';

import { CommentStore } from '../dist/node/domain/comment-store/comment-store.js';
import { ContextBundle } from '../dist/node/domain/session/context-bundle.js';
import { Selection } from '../dist/node/domain/session/selection.js';

// ---------------------------------------------------------------------------
// Fixture: a tiny conventional model with two flows (one `live`, one
// `superseded`) so the status-tag branch in listModel/node rendering has both
// sides, a hotspot, and enough grammar for grounded markdown. A stub source
// reader keeps every query a pure read-model test with no filesystem.
// ---------------------------------------------------------------------------

const REPO_ROOT = 'C:/repo';

function buildModel() {
  return {
    version: 1,
    meta: { title: 'Test Model' },
    nodes: [
      { id: 'cmd-PlaceOrder', type: 'command', label: 'Place Order', description: 'Customer places an order.', tactical: { anchors: [{ path: 'src/order/place-order.ts', line: 12 }] } },
      { id: 'agg-Order', type: 'aggregate', label: 'Order', description: 'The order aggregate.', tactical: { anchors: [{ path: 'src/order/order.ts', line: 5 }] } },
      { id: 'evt-OrderPlaced', type: 'event', label: 'Order Placed', description: 'Order was placed.', tactical: { anchors: [{ path: 'src/order/order.ts', line: 40 }] } },
    ],
    flows: [
      {
        id: 'flow-checkout', name: 'Checkout', status: 'live', summary: 'Customer checks out.', trigger: 'Customer submits cart',
        steps: ['cmd-PlaceOrder', 'agg-Order', 'evt-OrderPlaced'],
        edges: [
          { from: 'cmd-PlaceOrder', to: 'agg-Order', verb: 'issues' },
          { from: 'agg-Order', to: 'evt-OrderPlaced', verb: 'emits' },
        ],
        hotspots: ['hot-slow-checkout'],
      },
      { id: 'flow-legacy', name: 'Legacy checkout', status: 'superseded', summary: 'Old path.', trigger: 'n/a', steps: ['cmd-PlaceOrder'], edges: [] },
    ],
    hotspots: [
      { id: 'hot-slow-checkout', label: 'Slow checkout', description: 'Checkout sometimes hangs.', tactical: { anchors: [{ path: 'src/order/order.ts', line: 41 }] } },
    ],
    terms: [],
  };
}

function buildTestServices({ withComments = false } = {}) {
  const model = buildModel();
  const resolved = { model, source: 'bundled', sourcePath: 'flows.json', repoRoot: REPO_ROOT, warnings: [] };
  // A source gateway that reports "no source" so anchors render without code blocks and no fs is touched.
  const sourceGateway = { read: () => ({ path: '', exists: false }) };
  const comments = withComments ? new CommentStore() : null;
  const services = buildServices(resolved, { comments, sourceGateway });
  return { services, model, comments };
}

// ---------------------------------------------------------------------------
// listModel — the `list_model` MCP tool text (a plugin-facing contract).
// ---------------------------------------------------------------------------

test('listModel: indexes every flow and node with counts, labels, and types', () => {
  const { services } = buildTestServices();
  const md = listModel(services);
  assert.match(md, /^# Model index/, 'starts with the index heading');
  // Counts must track the model, not be hard-coded.
  assert.match(md, /## Flows \(2\)/, 'flow count reflects model.flows.length');
  assert.match(md, /## Nodes \(3\)/, 'node count reflects model.nodes.length');
  // Every node line carries id, label, and a parenthesised type.
  assert.match(md, /- `agg-Order` — Order _\(aggregate\)_/, 'node line: id, label, type');
});

test('listModel: a non-live flow carries its [status] tag; a live flow does not', () => {
  const { services } = buildTestServices();
  const md = listModel(services);
  assert.match(md, /- `flow-legacy` — Legacy checkout \[superseded\]/, 'non-live flow shows its status');
  assert.match(md, /- `flow-checkout` — Checkout(?!\s*\[)/, 'a live flow is NOT tagged with [live]');
});

// ---------------------------------------------------------------------------
// getNode — grounded node markdown, or the exact unknown-id fallback.
// ---------------------------------------------------------------------------

test('getNode: a known node renders its grounded markdown heading', () => {
  const { services } = buildTestServices();
  const md = getNode(services, 'agg-Order');
  assert.match(md, /^## Order {2}_\(aggregate\)_/, 'renders the node heading via buildNodeContext');
  assert.match(md, /The order aggregate\./, 'includes the description');
});

test('getNode: an unknown id returns the exact MCP fallback string (a contract, not a throw)', () => {
  const { services } = buildTestServices();
  assert.equal(getNode(services, 'nope'), "Unknown node 'nope'. Use list_model to see available node ids.");
});

// ---------------------------------------------------------------------------
// getItem — the {type,id,label,markdown} projection for a bundle item.
// ---------------------------------------------------------------------------

test('getItem: a known node/flow/hotspot resolves the right label and grounded markdown', () => {
  const { services } = buildTestServices();

  const node = getItem(services, 'node', 'agg-Order');
  assert.deepEqual({ type: node.type, id: node.id, label: node.label }, { type: 'node', id: 'agg-Order', label: 'Order' });
  assert.match(node.markdown, /## Order/, 'node markdown is the node context');

  const flow = getItem(services, 'flow', 'flow-checkout');
  assert.equal(flow.label, 'Checkout', 'flow label is the flow name, not its id');
  assert.match(flow.markdown, /# Flow: Checkout/, 'flow markdown is the flow context');

  const hot = getItem(services, 'hotspot', 'hot-slow-checkout');
  assert.equal(hot.label, 'Slow checkout', 'hotspot label comes from the hotspot index');
  assert.match(hot.markdown, /## Hotspot: Slow checkout/, 'hotspot markdown is the hotspot context');
});

test('getItem: an unknown id, and a null/empty id, both return null (no throw, no partial object)', () => {
  const { services } = buildTestServices();
  assert.equal(getItem(services, 'node', 'ghost'), null, 'unknown id -> null');
  assert.equal(getItem(services, 'flow', 'ghost'), null, 'unknown flow -> null');
  assert.equal(getItem(services, 'node', null), null, 'null id -> null (guard runs before existence check)');
  assert.equal(getItem(services, 'node', ''), null, 'empty id -> null');
});

// ---------------------------------------------------------------------------
// getCurrentSelection — the GET /api/selection response.
// ---------------------------------------------------------------------------

test('getCurrentSelection: nothing selected yields a null selection and empty markdown', () => {
  const { services } = buildTestServices();
  const res = getCurrentSelection(services, new Selection());
  assert.deepEqual(res, { selection: null, markdown: '' });
});

test('getCurrentSelection: a live selection returns the grounded context for that node', () => {
  const { services } = buildTestServices();
  const selection = new Selection();
  selection.set('agg-Order');
  const res = getCurrentSelection(services, selection);
  assert.ok(res.selection, 'a context is returned');
  assert.equal(res.selection.id, 'agg-Order');
  assert.match(res.markdown, /## Order/, 'markdown grounds the selected node');
});

test('getCurrentSelection: a selection pointing at a since-removed node degrades to null, not a crash', () => {
  // The Selection is process-global and outlives a model rebuild; a stale nodeId must be tolerated.
  const { services } = buildTestServices();
  const selection = new Selection();
  selection.set('was-here-before-rebuild');
  const res = getCurrentSelection(services, selection);
  assert.deepEqual(res, { selection: null, markdown: '' }, 'buildNodeContext null-guards the stale ref');
});

// ---------------------------------------------------------------------------
// listContextBundle — the curated bundle items + one rendered markdown doc.
// ---------------------------------------------------------------------------

test('listContextBundle: an empty bundle returns no items and the empty-bundle sentinel', () => {
  const { services } = buildTestServices();
  const res = listContextBundle(services, new ContextBundle());
  assert.deepEqual(res.items, []);
  assert.equal(res.markdown, '_No items in the context bundle yet._');
});

test('listContextBundle: items mirror the bundle and the markdown concatenates each item', () => {
  const { services } = buildTestServices();
  const bundle = new ContextBundle();
  bundle.add('node', 'agg-Order');
  bundle.add('flow', 'flow-checkout');
  const res = listContextBundle(services, bundle);
  assert.deepEqual(res.items, [{ type: 'node', id: 'agg-Order' }, { type: 'flow', id: 'flow-checkout' }]);
  assert.match(res.markdown, /## Order/, 'includes the node render');
  assert.match(res.markdown, /# Flow: Checkout/, 'includes the flow render');
  assert.match(res.markdown, /\n---\n/, 'items are joined by a horizontal rule');
});

// ---------------------------------------------------------------------------
// listComments — per-item list vs the full keyed map, and the no-store path.
// ---------------------------------------------------------------------------

test('listComments: with no comment store, always returns an empty list', () => {
  const { services } = buildTestServices({ withComments: false });
  assert.deepEqual(listComments(services, 'node', 'agg-Order'), { comments: [] });
  assert.deepEqual(listComments(services), { comments: [] });
});

test('listComments: with a store, type+id returns that item\'s comments as an array', () => {
  const { services, comments } = buildTestServices({ withComments: true });
  comments.add('node', 'agg-Order', 'looks right');
  const res = listComments(services, 'node', 'agg-Order');
  assert.ok(Array.isArray(res.comments), 'a specific item returns an array');
  assert.deepEqual(res.comments.map((c) => c.text), ['looks right']);
  // An item with no comments is an empty array, not the keyed map.
  assert.deepEqual(listComments(services, 'node', 'cmd-PlaceOrder'), { comments: [] });
});

test('listComments: with a store and no type/id, returns the whole keyed map (only non-empty keys)', () => {
  const { services, comments } = buildTestServices({ withComments: true });
  comments.add('node', 'agg-Order', 'a note');
  comments.add('flow', 'flow-checkout', 'flow note');
  const res = listComments(services);
  assert.equal(Array.isArray(res.comments), false, 'the all() form is a keyed record, not an array');
  assert.deepEqual(Object.keys(res.comments).sort(), ['flow:flow-checkout', 'node:agg-Order']);
  assert.deepEqual(res.comments['node:agg-Order'].map((c) => c.text), ['a note']);
});
