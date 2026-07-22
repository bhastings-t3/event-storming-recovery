// Black-box tests for the APPLICATION command/query handlers, using in-memory fakes for the ports.
// Derived from CONTRACT.md + the compiled .d.ts signatures only — the handler implementation
// source under src/ was never opened while authoring these.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildServices } from '../dist/node/application/services.js';
import { addComment } from '../dist/node/application/commands/add-comment.js';
import { selectNode } from '../dist/node/application/commands/select-node.js';
import { addContextItem } from '../dist/node/application/commands/add-context-item.js';
import { removeContextItem } from '../dist/node/application/commands/remove-context-item.js';
import { clearContextBundle } from '../dist/node/application/commands/clear-context-bundle.js';
import { registerMcp } from '../dist/node/application/commands/register-mcp.js';
import { viewSource } from '../dist/node/application/queries/view-source.js';

import { CommentStore } from '../dist/node/domain/comment-store/comment-store.js';
import { ContextBundle } from '../dist/node/domain/session/context-bundle.js';
import { Selection } from '../dist/node/domain/session/selection.js';
import { guardPath, lineWindow } from '../dist/node/domain/source/source-window.js';

// ---------------------------------------------------------------------------
// Fixtures: a tiny in-memory model (one aggregate + a command + an event that
// flow into it, a flow, and a hotspot) so "unknown id" vs "known id" paths are
// both exercisable.
// ---------------------------------------------------------------------------

function buildModel() {
  return {
    version: 1,
    meta: { title: 'Test Model' },
    nodes: [
      {
        id: 'cmd-PlaceOrder',
        type: 'command',
        label: 'Place Order',
        description: 'Customer places an order.',
        tactical: { anchors: [{ path: 'src/order/place-order.ts', line: 12 }] },
      },
      {
        id: 'agg-Order',
        type: 'aggregate',
        label: 'Order',
        description: 'The order aggregate.',
        tactical: { anchors: [{ path: 'src/order/order.ts', line: 5 }] },
      },
      {
        id: 'evt-OrderPlaced',
        type: 'event',
        label: 'Order Placed',
        description: 'Order was placed.',
        tactical: { anchors: [{ path: 'src/order/order.ts', line: 40 }] },
      },
    ],
    flows: [
      {
        id: 'flow-checkout',
        name: 'Checkout',
        status: 'active',
        summary: 'Customer checks out.',
        trigger: 'Customer submits cart',
        steps: ['cmd-PlaceOrder', 'agg-Order', 'evt-OrderPlaced'],
        edges: [
          { from: 'cmd-PlaceOrder', to: 'agg-Order', verb: 'issues' },
          { from: 'agg-Order', to: 'evt-OrderPlaced', verb: 'emits' },
        ],
        hotspots: ['hot-slow-checkout'],
      },
    ],
    hotspots: [
      {
        id: 'hot-slow-checkout',
        label: 'Slow checkout',
        description: 'Checkout sometimes hangs.',
        tactical: { anchors: [{ path: 'src/order/order.ts', line: 41 }] },
      },
    ],
    terms: [],
  };
}

function makeCommentRepository() {
  const persistCalls = [];
  return {
    persistCalls,
    load() {
      return undefined;
    },
    persist(entries) {
      persistCalls.push(entries);
    },
  };
}

function makeSourceGateway() {
  const calls = [];
  const TOTAL_LINES = 60;
  return {
    calls,
    read(repoRoot, relPath, line, ctx) {
      calls.push({ repoRoot, relPath, line, ctx });
      const guard = guardPath(repoRoot, relPath);
      if (!guard.ok) {
        return { path: relPath ?? '', exists: false, error: guard.error };
      }
      const { line: ln, startLine, endLine } = lineWindow(TOTAL_LINES, line, ctx);
      const lines = [];
      for (let i = startLine; i <= endLine; i++) lines.push(`L${i}: sample code`);
      return { path: relPath, exists: true, line: ln, startLine, endLine, code: lines.join('\n') };
    },
  };
}

function makeClaudeCliGateway(canned) {
  const calls = [];
  return {
    calls,
    async add(input) {
      calls.push(input);
      return (
        canned ?? {
          ok: true,
          command: `claude mcp add ${input.name} ${input.url}`,
          stdout: '',
          stderr: '',
          notFound: false,
        }
      );
    },
  };
}

const REPO_ROOT = 'C:/repo';

function buildTestServices({ withComments = true } = {}) {
  const model = buildModel();
  const resolved = {
    model,
    source: 'bundled',
    sourcePath: 'flows.json',
    repoRoot: REPO_ROOT,
    warnings: [],
  };
  const commentRepository = makeCommentRepository();
  const sourceGateway = makeSourceGateway();
  let commentStore = null;
  if (withComments) {
    commentStore = new CommentStore({
      onChange: () => commentRepository.persist(commentStore.entries()),
    });
  }
  const services = buildServices(resolved, { comments: commentStore, sourceGateway });
  return { services, model, commentRepository, sourceGateway, commentStore };
}

// ---------------------------------------------------------------------------
// AddComment
// ---------------------------------------------------------------------------

test('AddComment: unknown target returns not-found', () => {
  const { services } = buildTestServices();
  const result = addComment(services, 'node', 'does-not-exist', 'hello');
  assert.equal(result.status, 'not-found');
  assert.equal(typeof result.error, 'string');
});

test('AddComment: blank text returns invalid', () => {
  const { services } = buildTestServices();
  const result = addComment(services, 'node', 'agg-Order', '   ');
  assert.equal(result.status, 'invalid');
  assert.equal(typeof result.error, 'string');
});

test('AddComment: valid text persists via the store+repository and returns the item comments', () => {
  const { services, commentRepository } = buildTestServices();
  const result = addComment(services, 'node', 'agg-Order', '  Looks correct  ');
  assert.equal(result.status, 'ok');
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].text, 'Looks correct');
  // the fake CommentRepository must have seen the write
  assert.ok(commentRepository.persistCalls.length >= 1, 'repository.persist was called');
  const lastEntries = commentRepository.persistCalls.at(-1);
  assert.deepEqual(lastEntries.get('node:agg-Order').map((c) => c.text), ['Looks correct']);
});

test('AddComment: appends within the same key', () => {
  const { services } = buildTestServices();
  addComment(services, 'flow', 'flow-checkout', 'first note');
  const result = addComment(services, 'flow', 'flow-checkout', 'second note');
  assert.equal(result.status, 'ok');
  assert.deepEqual(
    result.comments.map((c) => c.text),
    ['first note', 'second note'],
  );
});

test('AddComment: no comment store configured yields no-store', () => {
  const { services } = buildTestServices({ withComments: false });
  const result = addComment(services, 'node', 'agg-Order', 'hello');
  assert.equal(result.status, 'no-store');
});

// ---------------------------------------------------------------------------
// SelectNode
// ---------------------------------------------------------------------------

test('SelectNode: unknown node returns not-found-shaped rejection', () => {
  const { services } = buildTestServices();
  const selection = new Selection();
  const result = selectNode(services, selection, 'does-not-exist');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  // selection must not have been set on rejection
  assert.equal(selection.get(), null);
});

test('SelectNode: known node sets selection and returns grounded context + markdown', () => {
  const { services } = buildTestServices();
  const selection = new Selection();
  const result = selectNode(services, selection, 'agg-Order');
  assert.equal(result.ok, true);
  assert.ok(result.selection, 'a grounded selection is returned');
  assert.equal(result.selection.id, 'agg-Order');
  assert.equal(typeof result.markdown, 'string');
  assert.ok(result.markdown.length > 0);
  // the Selection domain object itself is mutated
  const ref = selection.get();
  assert.ok(ref);
  assert.equal(ref.nodeId, 'agg-Order');
});

// ---------------------------------------------------------------------------
// AddContextItem / RemoveContextItem / ClearContextBundle
// ---------------------------------------------------------------------------

test('AddContextItem: unknown type:id is rejected across node/flow/hotspot buckets', () => {
  const { services } = buildTestServices();
  for (const type of ['node', 'flow', 'hotspot']) {
    const bundle = new ContextBundle();
    const result = addContextItem(services, bundle, type, 'nope-not-real');
    assert.equal(result.ok, false, `unknown ${type}:id should be rejected`);
    assert.equal(typeof result.error, 'string');
  }
});

test('AddContextItem: known node/flow/hotspot ids are accepted and returned in the bundle list', () => {
  const { services } = buildTestServices();
  const bundle = new ContextBundle();

  const r1 = addContextItem(services, bundle, 'node', 'agg-Order');
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.items, [{ type: 'node', id: 'agg-Order' }]);

  const r2 = addContextItem(services, bundle, 'flow', 'flow-checkout');
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.items, [
    { type: 'node', id: 'agg-Order' },
    { type: 'flow', id: 'flow-checkout' },
  ]);

  const r3 = addContextItem(services, bundle, 'hotspot', 'hot-slow-checkout');
  assert.equal(r3.ok, true);
  assert.equal(r3.items.length, 3);
});

test('AddContextItem: adding the same type:id twice is idempotent', () => {
  const { services } = buildTestServices();
  const bundle = new ContextBundle();
  addContextItem(services, bundle, 'node', 'agg-Order');
  const result = addContextItem(services, bundle, 'node', 'agg-Order');
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [{ type: 'node', id: 'agg-Order' }]);
});

test('RemoveContextItem: removes the item and returns the remaining bundle list', () => {
  const bundle = new ContextBundle();
  bundle.add('node', 'agg-Order');
  bundle.add('flow', 'flow-checkout');
  const remaining = removeContextItem(bundle, 'node', 'agg-Order');
  assert.deepEqual(remaining, [{ type: 'flow', id: 'flow-checkout' }]);
  assert.deepEqual(bundle.list(), [{ type: 'flow', id: 'flow-checkout' }]);
});

test('ClearContextBundle: empties the bundle', () => {
  const bundle = new ContextBundle();
  bundle.add('node', 'agg-Order');
  bundle.add('hotspot', 'hot-slow-checkout');
  clearContextBundle(bundle);
  assert.deepEqual(bundle.list(), []);
});

// ---------------------------------------------------------------------------
// RegisterMcp
// ---------------------------------------------------------------------------

test('RegisterMcp: whitelisted scopes (local|project|user) are passed through to the gateway', async () => {
  for (const scope of ['local', 'project', 'user']) {
    const canned = { ok: true, command: 'claude mcp add …', stdout: 'added', stderr: '', notFound: false };
    const gateway = makeClaudeCliGateway(canned);
    const result = await registerMcp(
      { name: 'event-storming-recovery', url: 'http://localhost:4949/mcp', scope },
      gateway,
    );
    assert.equal(gateway.calls.length, 1);
    assert.equal(gateway.calls[0].scope, scope, `scope ${scope} should reach the gateway unchanged`);
    assert.deepEqual(result, canned, 'returns the gateway result verbatim');
  }
});

test('RegisterMcp: a non-whitelisted scope is dropped before reaching the gateway', async () => {
  const gateway = makeClaudeCliGateway();
  await registerMcp({ name: 'event-storming-recovery', url: 'http://localhost:4949/mcp', scope: 'global' }, gateway);
  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.calls[0].scope, undefined, 'non-whitelisted scope must not reach the gateway as-is');
});

test('RegisterMcp: an omitted scope reaches the gateway as undefined', async () => {
  const gateway = makeClaudeCliGateway();
  await registerMcp({ name: 'event-storming-recovery', url: 'http://localhost:4949/mcp' }, gateway);
  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.calls[0].scope, undefined);
});

// ---------------------------------------------------------------------------
// ViewSource
// ---------------------------------------------------------------------------

test('ViewSource: delegates to the SourceGateway fake and returns the {path,exists,...} shape', () => {
  const gateway = makeSourceGateway();
  const result = viewSource(gateway, REPO_ROOT, 'src/order/order.ts', 5, 2);
  assert.equal(gateway.calls.length, 1, 'the gateway fake was invoked');
  assert.equal(result.path, 'src/order/order.ts');
  assert.equal(result.exists, true);
  assert.equal(result.line, 5);
  assert.equal(result.startLine, 3);
  assert.equal(result.endLine, 7);
  assert.equal(typeof result.code, 'string');
});

test('ViewSource: a repo-root escape yields the error outcome', () => {
  const gateway = makeSourceGateway();
  const result = viewSource(gateway, REPO_ROOT, '../../etc/passwd');
  assert.equal(result.exists, false);
  assert.equal(result.error, 'path escapes repo root');
});
