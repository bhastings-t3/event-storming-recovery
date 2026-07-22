# resolve-model — trace notes

## Flow
`resolve-model` — the boot-time choke point (`src/server/resolve-model.mjs`, `resolveModel`) that decides which Event Storming model an `es-view` session serves. Reachability: **LIVE** — invoked unconditionally by `bin/es-view.mjs` `main()` at line 83 on every `npx event-storming-recovery view` boot.

## Key recovered intent — the 4-tier precedence (highest first)
1. `--model <flows.json>` — explicit, already-merged canonical model (`readModelFile`, source `model`).
2. `--traces <dir>` — merge the per-flow trace JSONs on the fly via `mergeTracesDir` (source `traces`). **Throws on any merge validation error**, so the server never serves an invalid merged model.
3. Auto-discover — `findFlowsFiles` does a bounded recursive walk of cwd (maxDepth 6, skips `node_modules/.git/.claude/dist/.next/out/coverage` + any dotdir), sorts candidates and reads `hits[0]` (source `discovered`).
4. Bundled fallback — `examples/event-storming-recovery/model/flows.json`, the tool's own self-model shipped in the package (source `example`).

The precedence itself is the load-bearing recovered decision. Secondary derived output: `repoRoot` for source anchors = `--repo-root` flag > (example → `packageRoot`) > `model.meta.repoRoot` > `cwd`.

## Surprises / contradictions (best findings)
- **Only tier 2 (`--traces`) runs the full merge validation.** The other three tiers load through `readModelFile`, whose sole guard is `Array.isArray(nodes) && Array.isArray(flows)`. A structurally-shaped but semantically-broken `flows.json` is served unchecked → `hot-unvalidated-model-served`. This is the read-side twin of the pilot's `hot-invalid-model-written`: `es-merge` can write an invalid `flows.json`, and the discovered tier would then serve it after only the shape check. The two entry paths disagree on rigor.
- **`meta.repoRoot` is never set by the merge.** Confirmed by reading `mergeTraceDocs` (`src/lib/merge.mjs` ~219): `meta = { generatedFrom, counts, deadFlows, sharedGlossary }`, no `repoRoot`. So the `model.meta.repoRoot` fallback in the derivation chain only ever fires for a pre-existing/hand-authored `flows.json` (e.g. one carrying an absolute path baked in elsewhere) — merged models always land on `cwd`. No existence check is done on the derived repoRoot → `hot-repo-root-stale` (anchors can deep-link to a directory that doesn't exist on this machine).
- **Multi-candidate discovery is silent + non-blocking.** With >1 `flows.json` under cwd, `hits[0]` wins by heuristic sort (model/ dir > shallower > alphabetical) and only a warning line is emitted → `hot-discovery-ambiguity`. A stale/example file in a subdir can quietly outrank the intended model.
- A bare positional arg to `es-view` is treated as `--model` (convenience, `bin/es-view.mjs` line 46) — worth knowing when reasoning about which tier fires.

## Invariants
- `inv-model-shape` (ERROR-level, NEW): loaded model must JSON.parse and expose `nodes[]`/`flows[]` arrays, else `readModelFile` throws and `es-view` catches → `process.exit(1)`. Attached to `agg-server-session` (it is the session's boot-load guard), deliberately distinct from `agg-model`'s merge-time invariants — which the load tiers bypass entirely.
- The `--traces` tier's validation errors are enforced by the merge's own invariants (already modeled on `agg-model` in the `merge-traces` trace); this flow references them via the `cmd-resolve-model → cmd-merge-traces (calls)` edge rather than re-minting them.

## Node reuse
Reused per glossary: `actor-operator`, `agg-model` (the thing resolved), `cmd-merge-traces` (invoked in tier 2), `ds-model-fs`, `ds-flows-json`. Introduced: `cmd-resolve-model`, `agg-server-session` (shared id; this flow is where it is most defined), `evt-model-resolved`, `rm-model-provenance`, `inv-model-shape`, `ds-example-model` (bundled self-model file). Deliberately did NOT pull `ds-traces-dir` in — the `calls` edge to `cmd-merge-traces` lets the `merge-traces` flow own that datastore read (demand-driven).

## `agg-server-session` boundary note
Modeled as the aggregate that handles `ResolveModel` and emits `ModelResolved`: resolution is what constitutes the session (fixes its model + repoRoot). MED confidence / partly infra, but its identity is domain-significant because a connected Claude/MCP session reads whatever this session resolved. Left `synchronous`/`ownedBy` unset.

## Unresolved / human questions
Captured as the three hotspots above. Sharpest for a human: should the load tiers run merge validation before serving (`hot-unvalidated-model-served`), and should a derived repoRoot be existence-checked (`hot-repo-root-stale`).

## Schema friction
None.
