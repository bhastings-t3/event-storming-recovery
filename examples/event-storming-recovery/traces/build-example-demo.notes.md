# build-example-demo — deep-trace notes

## What this flow is
`npm run demo` -> `node scripts/build-example.mjs`. A thin orchestration wrapper that
regenerates the bundled toy-shop example end to end. It is NOT a domain transform of its
own; it composes two existing pipeline commands. Modeled per briefing option (a): an
orchestration command `cmd-build-example` that synchronously invokes `cmd-merge-traces`
then `cmd-generate-views`, referencing those shared nodes rather than duplicating them.

## Reachability — CONFIRMED (live)
- `package.json` scripts.demo = `node scripts/build-example.mjs` (package.json:31).
- `scripts/build-example.mjs:11` defines `run = (args) => execFileSync('node', args, { stdio:'inherit', cwd:root })`.
- Two blocking calls IN ORDER:
  - `:13` merge-flows.js `examples/toy-shop/traces` -> `examples/toy-shop/model/flows.json`
  - `:14` generate-views.js `<flows.json>` `examples/toy-shop/model` `--title "Toy Shop Event Storming"`
- `execFileSync` is synchronous and throws on nonzero exit, so step 2 only runs if the
  merge exits 0. merge-flows.js `process.exit(1)` on validation errors would abort the
  demo BEFORE generate-views runs (so flows.dot/explorer.html would be left stale, not
  regenerated). Confirmed against tools/merge-flows.js:37.

## Modeling decisions
- Kept it thin per the two-plane rule: I did NOT promote the merge or generate ETL stages
  to aggregates/policies/events. `cmd-build-example` has no state or events of its own — it
  delegates. No new events were added; the domain-significant facts (ModelMerged /
  ModelValidated / views-generated) belong to the merge and generate flows.
- Edge `cmd-build-example -> cmd-merge-traces`/`-> cmd-generate-views` uses verb `invokes`
  with `synchronous: true`. Command->command is not standard ES grammar, but the briefing
  explicitly blessed this orchestration shape for a straight-line `execFileSync` chain (it
  is a script, not an event-driven policy). The merge only WARNS on the nonstandard verb.
- `agg-model` is the pivot store between the two steps. Note there is NO shared in-memory
  state here (unlike the es-view `--traces` path): each CLI is a separate `node` child
  process, so the on-disk `flows.json` file IS the hand-off between step 1 and step 2.
- Reused shared ids verbatim/near-verbatim: `actor-operator`, `ext-source-fs`, `agg-model`,
  `rm-explorer`, `rm-flows-dot`. `cmd-merge-traces` and `cmd-generate-views` are included as
  thin reference stubs (id/type/label + a light per-flow tactical usage anchored at the
  demo's invocation sites).

## cmd-generate-views stub — merges with the generate-views tracer
The generate-views tracer HAS run (its trace is in TRACES_DIR), so `cmd-generate-views`
already exists with an authoritative definition. My stub node unions with it by id (merge
keeps first-seen type/label, longest description; my tactical becomes an additional per-flow
`usages` entry for the build-example flow, which is correct — the command genuinely
participates in two flows). Same treatment applies to `cmd-merge-traces`. Verified: merging
all 10 traces yields 0 errors. I aligned my command->read-model verb to `writes` to match
the generate-views tracer (it uses `writes` for cmd->rm and `persists to` for rm->fs).

## Invariants
None owned by this flow. The merge's validation invariants live on `agg-model` in the
merge-traces flow; I did not re-attach them here (they are not re-enforced by the wrapper).

## Hotspot
- `hot-example-overwrite-in-place` — the demo overwrites the SHIPPED fallback model
  (`examples/toy-shop/model/flows.json`, resolve-model.mjs:92 tier-4 bundled example, and
  bin/es-view.mjs:66 advertises it) in place, with no backup/diff/gate. Quality of es-view's
  default is only as good as the toy-shop traces at demo time. Compounds with
  `hot-invalid-model-written` (merge writes flows.json before checking errors): a failing
  toy-shop trace edit could leave a written-but-invalid flows.json that, if committed, ships
  a broken default — while the aborted chain leaves flows.dot/explorer.html stale relative to
  it. Human question captured in the hotspot: should the demo / prepack / CI validate and
  guard the regenerated model (fail on merge errors, or diff against a golden snapshot)
  before it becomes the shipped fallback?

## Contradictions / surprises
- The hint "demo overwrites the bundled example that es-view falls back to" is CONFIRMED
  (resolve-model.mjs:92, bin/es-view.mjs:66). No contradictions with the briefing hints.
- Minor: build-example.mjs's title arg `"Toy Shop Event Storming"` overrides any
  `model.meta.title`; the merged toy-shop model may carry its own meta.title, but the demo
  forces this one. Not risky, just noted.

## Schema friction
None. The trace merges with 0 errors; the only warnings are the expected nonstandard edge
verbs (`invokes` x2) inherent to modeling an orchestration wrapper as a command chain.
