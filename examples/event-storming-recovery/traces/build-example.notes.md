# build-example — trace notes

## What this flow is
`scripts/build-example.mjs` (the `npm run demo` script) is an **automation that composes two
already-traced commands**. It is not a reactive subscriber and has no actor mid-stream, so I
modeled it as a single composition command `cmd-build-example` (BuildExample) that `calls`
`cmd-merge-traces` then `cmd-generate-views`. I deliberately did NOT re-derive the internals of
merge or generate — those are owned by the `merge-traces` and `generate-views` flows. The reused
command/datastore/read-model nodes carry short, composition-focused descriptions and anchors at the
invocation sites in `build-example.mjs`; the authoritative long descriptions come from the sibling
traces (merge dedup keeps the longest description and appends each file's tactical block as a
per-flow usage, so my stubs add signal without clobbering).

## Reachability — LIVE
- Trigger 1 (operator): `npm run demo` → `package.json:31` → `scripts/build-example.mjs`.
- Trigger 2 (CI): `.github/workflows/ci.yml:19-20` runs `npm run demo` as a smoke build on every
  push to main and every PR. Modeled as `ext-ci` also issuing `cmd-build-example`.
Both reach the whole pipeline end to end. No dead-code ambiguity.

## Surprises / findings
1. **The demo mutates tracked files in place.** `model = ex/model/flows.json` and generate's
   `outDir = ex/model` both point at the *committed* `examples/event-storming-recovery/model` dir.
   Running the demo overwrites committed artifacts. The CI smoke-build does this too and then
   discards the result — there is **no `git diff --exit-code`**, so the committed example can drift
   from its source traces while CI stays green. This is the flow's headline hotspot
   (`hot-demo-example-drift`).
2. **Sequencing is load-bearing and enforced by the file hand-off, not by control flow alone.**
   `es-generate` reads the exact `flows.json` that `es-merge` just wrote. I modeled the ordering via
   the `ds-flows-json` datastore (merge `writes`, generate `reads`) rather than only the two `calls`
   edges. On the DOT board (datastores are excluded from steps) the two `calls` edges look parallel;
   the ordering detail lives in `cmd-build-example`'s `tactical.explanation` and the data edges.
3. **`execFileSync` aborts the chain on a nonzero child exit.** `run` uses
   `execFileSync('node', args, { stdio:'inherit', cwd: root })`, which throws if a child exits
   nonzero. Combined with the merge writing `flows.json` *before* it flags validation errors and
   exits 1 (the `merge-traces` flow's `hot-invalid-model-written`), a broken trace set overwrites the
   committed `flows.json` with an invalid model and then aborts before `es-generate` runs. Captured
   inside `hot-demo-example-drift` as the compounding factor.

## Cross-flow / shared-id reconciliation
- Reused exactly: `actor-operator`, `cmd-merge-traces`, `cmd-generate-views`, `agg-model` (not
  referenced here — see below), `ds-model-fs`, `ds-traces-dir`, `ds-flows-json`, `ds-flows-dot`,
  `ds-explorer-html`, `rm-explorer-html`, `ext-browser`.
- New nodes: `cmd-build-example` (the composition command) and `ext-ci` (GitHub Actions smoke
  build). New hotspot: `hot-demo-example-drift`.
- **Left `agg-model` out on purpose.** The composition altitude cares about *which command runs when
  and what file they exchange*, not the model aggregate's invariants (owned by `merge-traces`). The
  concrete inter-process contract is the `flows.json` file, which the briefing named explicitly, so I
  modeled the hand-off as the datastore rather than dragging the aggregate + its enforces-edges into
  a lightweight flow.

## Invariants
None owned by this flow. `build-example.mjs` has no guards of its own — all validation lives in the
merge stage (`agg-model`'s invariants, owned by `merge-traces`). Its only control-flow rule is the
implicit "abort if a stage exits nonzero," which is `execFileSync` semantics, not a domain invariant.

## Schema friction
None.
