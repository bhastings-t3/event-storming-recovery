// Regression tests for issue #27: the committed explorer.html / flows.dot source links must be
// portable. `repoRoot` has to be resolved to an ABSOLUTE path (so the documented `--repo-root .`
// stops emitting a dead `vscode://file/./...` link) and normalized to forward slashes (so the
// "absolute" case is well-formed on Windows too). The emitted HTML bakes that absolute value as a
// DEFAULT the reader can override at runtime; the DOT stays machine-local by nature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { generateViews } from '../dist/node/application/commands/generate-views.js';

// Since #41 the client is a BUILT bundle inlined behind a window.__ES__ preamble, so the per-model
// root is baked as `REPO_ROOT_DEFAULT: "<root>"` (was `const REPO_ROOT_DEFAULT = "<root>"`) and the
// bundled client code is esbuild-normalized (e.g. double quotes). These matchers track that form;
// the #27 behaviour they guard (absolute, forward-slashed, reader-overridable root) is unchanged.
const bakedRoot = (html) => (html.match(/REPO_ROOT_DEFAULT:\s*"([^"]*)"/) || [])[1];

function buildModel() {
  return {
    version: 1,
    meta: { title: 'Links Model' },
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
    ],
    flows: [
      {
        id: 'flow-checkout',
        name: 'Checkout',
        status: 'live',
        summary: 'Customer checks out.',
        trigger: 'Customer submits cart',
        steps: ['cmd-PlaceOrder', 'agg-Order'],
        edges: [{ from: 'cmd-PlaceOrder', to: 'agg-Order', verb: 'issues' }],
        hotspots: [],
      },
    ],
    hotspots: [],
    terms: [],
  };
}

const firstDotAnchor = (dot) => (dot.match(/vscode:\/\/file\/[^"]*/) || [])[0];
// vscode://file/ needs an absolute path: either a POSIX root (/...) or a Windows drive (X:/...).
const ABSOLUTE_URI = /^vscode:\/\/file\/([A-Za-z]:\/|\/)/;

test('generateViews: `--repo-root .` resolves to an absolute link, never the dead relative `./`', () => {
  const { dot } = generateViews(buildModel(), { repoRoot: '.' });
  const anchor = firstDotAnchor(dot);
  assert.ok(anchor, 'the DOT carries at least one source anchor');
  assert.ok(!anchor.startsWith('vscode://file/./'), `link must not be the dead relative form: ${anchor}`);
  assert.match(anchor, ABSOLUTE_URI, `link must be absolute: ${anchor}`);
  // it must resolve to the same place path.resolve('.') points at, in forward-slash form
  const expectedRoot = path.resolve('.').replace(/\\/g, '/');
  assert.ok(anchor.startsWith('vscode://file/' + expectedRoot + '/'), `link root should be the resolved cwd: ${anchor}`);
});

test('generateViews: emitted links carry no backslashes even though path.resolve yields them on Windows', () => {
  const { dot, html } = generateViews(buildModel(), { repoRoot: '.' });
  const anchor = firstDotAnchor(dot);
  assert.ok(!anchor.includes('\\'), `DOT link must be forward-slash only: ${anchor}`);
  const baked = bakedRoot(html);
  assert.ok(baked, 'the HTML bakes a REPO_ROOT_DEFAULT');
  assert.ok(!baked.includes('\\'), `baked HTML root must be forward-slash only: ${baked}`);
});

test('generateViews: the HTML bakes the resolved absolute root as the default (not `.`)', () => {
  const { html } = generateViews(buildModel(), { repoRoot: '.' });
  const baked = bakedRoot(html);
  assert.notEqual(baked, '.', 'the default must not be the unresolved `.`');
  assert.equal(baked, path.resolve('.').replace(/\\/g, '/'));
});

test('generateViews: the emitted HTML wires the reader-overridable source root', () => {
  const { html } = generateViews(buildModel(), { repoRoot: '.' });
  // the override reads/writes localStorage under a stable key, falling back to the baked default...
  assert.match(html, /localStorage\.getItem\(['"]esRepoRoot['"]\)/);
  assert.match(html, /function currentRepoRoot\(\)/);
  // ...and re-derives already-rendered links when the reader changes their root
  assert.match(html, /function refreshAnchors\(\)/);
  assert.match(html, /data-anchor/);
  // and there is a reader-facing affordance to set/clear it
  assert.match(html, /id="reporoot-btn"/);
});

test('generateViews: an absolute repoRoot is preserved (still machine-specific, but well-formed)', () => {
  const abs = path.resolve('/some/checkout');
  const { dot } = generateViews(buildModel(), { repoRoot: abs });
  const anchor = firstDotAnchor(dot);
  assert.match(anchor, ABSOLUTE_URI);
  assert.ok(anchor.startsWith('vscode://file/' + abs.replace(/\\/g, '/') + '/'), anchor);
});
