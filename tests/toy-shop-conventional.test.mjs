// Conventional-model coverage (issue #33). The bundled self-model
// (examples/event-storming-recovery/) is pipeline/dataflow-shaped and, tellingly, has ZERO policies
// and no aggregate-enforces-invariant / event-triggers-policy grammar (see AGENTS.md and
// docs/refactor/refactor-targets.md). Every other unit + E2E assertion drives that one atypical
// model, so the net is fixture-biased. These tests drive the hand-written toy-shop fixture
// (tests/fixtures/toy-shop/traces/*) — a small, conventional command→aggregate→event→policy→readModel
// domain — through the same domain validator and application query, exercising the reactive grammar
// the self-model never has. Reuses the existing toy-shop traces rather than minting a second
// near-identical fixture (DRY: the smoke test already merges/generates from them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeTracesDir } from '../dist/node/adapters/fs/model-repository.js';
import { Model } from '../dist/node/domain/model/model.js';
import { buildIndexes } from '../dist/node/application/read-models/indexes.js';
import { getFlow } from '../dist/node/application/queries/get-flow.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const toyTraces = join(root, 'tests', 'fixtures', 'toy-shop', 'traces');

// Merge once; every test reads the same canonical model the CLI would write.
const { model, errors: mergeErrors, warnings: mergeWarnings } = mergeTracesDir(toyTraces);

const edgeExists = (from, verb, to) =>
  model.flows.some((f) => (f.edges || []).some((e) => e.from === from && e.verb === verb && e.to === to));

test('THE TRAP: the conventional fixture validates cleanly (zero validator errors)', () => {
  // The merge validator (referential integrity + es-grammar + terms + data-model lineage).
  assert.equal(mergeErrors.length, 0, `merge must report no errors, got: ${mergeErrors.join('; ')}`);
  // The Model aggregate's own validate() — the entry the issue calls out explicitly. Byte-identical
  // to the merge validator's report, run over the already-assembled model.
  const { errors, warnings } = Model.from(model).validate();
  assert.equal(errors.length, 0, `Model.validate() must report no errors, got: ${errors.join('; ')}`);
  // A fully-formed model leaves nothing dangling: no orphan/nonstandard-verb/term warnings either.
  assert.equal(warnings.length, 0, `Model.validate() should report no warnings, got: ${warnings.join('; ')}`);
  assert.equal(mergeWarnings.length, 0, `merge should report no warnings, got: ${mergeWarnings.join('; ')}`);
});

test('conventional shape: the model carries a policy — the self-model has none', () => {
  const byType = model.meta.counts.byType;
  // The distinguishing element: a Policy. The atypical self-model's byType has no `policy` key.
  assert.ok((byType.policy || 0) >= 1, 'a policy node is present');
  assert.ok((byType.aggregate || 0) >= 1, 'aggregates are present');
  assert.ok((byType.invariant || 0) >= 1, 'invariants are present');
  assert.ok((byType.readModel || 0) >= 1, 'a read model is present');
});

test('conventional grammar: the command→aggregate→event chain is wired', () => {
  // A textbook write flow: actor issues command, command handled by aggregate, aggregate emits event.
  assert.ok(edgeExists('actor-customer', 'issues', 'cmd-place-order'), 'actor issues the command');
  assert.ok(edgeExists('cmd-place-order', 'handled by', 'agg-order'), 'command handled by the aggregate');
  assert.ok(edgeExists('agg-order', 'emits', 'evt-order-placed'), 'aggregate emits the event');
});

test('conventional grammar: an aggregate enforces its invariants (not the pipeline shape)', () => {
  // Invariants attach to their aggregate via an `enforces` edge and never appear as flow steps — the
  // exact rule the schema states. The self-model expresses none of this.
  assert.ok(edgeExists('agg-order', 'enforces', 'inv-stock-available'), 'aggregate enforces its stock invariant');
  const inv = model.nodes.find((n) => n.id === 'inv-stock-available');
  assert.equal(inv?.type, 'invariant', 'the enforced target is an invariant node');
  const placeOrder = model.flows.find((f) => f.id === 'place-order');
  assert.ok(!(placeOrder.steps || []).includes('inv-stock-available'), 'invariants are not flow steps');
});

test('conventional grammar: a policy reacts to an event and issues a command', () => {
  // "Whenever <event> then <command>": the reactive spine of an event-storming model. The self-model,
  // being a dataflow pipeline, expresses this nowhere — this is the coverage the second fixture adds.
  const policy = model.nodes.find((n) => n.type === 'policy');
  assert.ok(policy, 'a policy node exists');
  assert.equal(policy.id, 'pol-reserve-stock');
  assert.ok(edgeExists('evt-order-placed', 'triggers', 'pol-reserve-stock'), 'the event triggers the policy');
  assert.ok(edgeExists('pol-reserve-stock', 'issues', 'cmd-reserve-stock'), 'the policy issues a command');
  // The policy's issued command lands on a DIFFERENT aggregate (Inventory) — a second write with its
  // own failure window, which is precisely why it is modeled as a policy and not folded in.
  assert.ok(edgeExists('cmd-reserve-stock', 'handled by', 'agg-inventory'), 'the issued command hits a second aggregate');
});

test('query layer: get_flow renders the conventional policy chain as grounded markdown', () => {
  // Drive the actual application query (the MCP get_flow surface) over the conventional model.
  // includeSource is on by default; a stub source reader keeps this a pure read-model test with no fs.
  const services = {
    model,
    indexes: buildIndexes(model),
    repoRoot: '/x',
    comments: null,
    commentPersistence: null,
    readSource: () => null,
  };
  const md = getFlow(services, 'place-order');
  assert.match(md, /# Flow: Customer places an order/, 'renders the flow heading');
  // The reactive edges appear verbatim in the rendered flow — the event→policy→command spine.
  assert.match(md, /OrderPlaced —triggers→ Whenever an order is placed, reserve its stock/, 'event triggers policy');
  assert.match(md, /Whenever an order is placed, reserve its stock —issues→ ReserveStock/, 'policy issues command');
  assert.match(md, /Order —enforces→ Every line must have stock available/, 'aggregate enforces its invariant');

  // An unknown flow returns the sane fallback, not a crash.
  assert.match(getFlow(services, 'nope'), /Unknown flow 'nope'/, 'unknown flow id falls back cleanly');
});
