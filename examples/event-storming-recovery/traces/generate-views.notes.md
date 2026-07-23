# generate-views — trace notes

## Reachability verdict: LIVE
Two live entry points reach `tools/generate-views.js` end to end:
- **Direct CLI**: `es-generate` bin (`package.json` bin, line 11) → `node tools/generate-views.js <flows.json> <outDir>`. Reachable by the operator.
- **Demo chain**: `scripts/build-example.mjs:14` runs it via `execFileSync('node', [tools/generate-views.js, model, ex/model, --repo-root, root, --title, ...])` as step 2, right after `merge-flows.js` (step 1). This is `npm run demo`.
Not dead.

## What this flow actually is: a pure projection, no write-aggregate, no event
Unlike the merge flow (where `agg-model` is the write aggregate that emits ModelMerged/ModelValidated), here `agg-model` is a **READ-ONLY input**. The generator `JSON.parse`s flows.json, indexes it, and renders two files, mutating nothing. So I modeled it as:
- `actor-operator` **issues** `cmd-generate-views`
- `cmd-generate-views` **reads** `agg-model` (behavioral) and **reads** `ds-flows-json` (physical input file), **connects via** `ds-model-fs`
- `cmd-generate-views` **writes** `ds-flows-dot` + `ds-explorer-html`
- `rm-flows-dot` / `rm-explorer-html` **project from** their backing files
- read models **read by** `ext-graphviz` (dot) and `ext-browser`; explorer **calls** `ext-vscode` (baked deep links)

**No event and no aggregate on the write side.** The two outputs are read models, not aggregate state, and the transform is a stateless projection (the two-plane rule: pipeline/transform stages are not aggregates/policies). Inventing an aggregate or a `ViewsGenerated` event would have nothing to emit it and no state boundary to guard. `kind: "write"` per the briefing framing (it persists openable artifacts).

## Invariants / guards it enforces on the model before rendering: NONE
The briefing asked me to note any invariants/guards the generator enforces before rendering. The honest finding: **it enforces none.** There is no `require` of `src/lib/merge.mjs`, no `validate`, no `.errors` check, no try/catch. The only guards are:
- an **argv guard** (line 22): missing `<flows.json>` or `<outDir>` → usage + `exit 2` (not a model invariant),
- an **HTML-injection guard** (line 92): `JSON.stringify(model).replace(/</g,'\\u003c')` neutralizes `</script>` when inlining the model (a rendering guard, not a model invariant).

So I attached **no `inv-` nodes** here and did **not** re-attach `agg-model`'s merge-time invariants (they belong to the merge flow; `agg-model` is reused read-only). The absence of validation is itself the finding, captured as the hotspot.

## Hotspot
- `hot-generator-trusts-unvalidated-model` — es-generate renders any flows.json blindly. Chains with the pilot's `hot-invalid-model-written` (es-merge writes flows.json even on validation failure): the CLI path can produce an invalid model file that es-generate will happily render into a broken/misleading explorer, or crash with an uncaught `TypeError` if `model.nodes`/`model.hotspots` are absent (30-31), while the server path (`resolve-model.mjs`) throws and refuses. The two consumers of flows.json disagree on whether to trust it. Human question: should es-generate re-validate before rendering?

## Smaller operational gaps (folded into the hotspot, not minted as separate hotspots)
- **No `mkdirSync`** of `outDir` — a non-existent output directory throws from `writeFileSync` rather than being created. (Noted in `ds-model-fs` + hotspot.)
- **Partial-output window**: `flows.dot` is written at line 89, `explorer.html` at line 1519, with ~1400 lines of HTML string-building between. If the HTML pass throws, a fresh/valid `flows.dot` is left beside a stale-or-missing `explorer.html`. Real but low-severity for a deterministic generator; not worth a separate hotspot.

## Rendering decisions worth the orchestrator's eye
- **`DATA_TYPES` exclusion** (lines 36-37, 71-72): datastore/field nodes and any edge touching them are stripped from BOTH the DOT and the interactive flow board by a type test, so those views stay purely behavioral. The physical layer survives in the model for the explorer's Data-model tab + detail panel. Noted in `rm-flows-dot` tactical.
- **`generate-views.js` is the standalone/original renderer**; `src/web/*` (dom.js, layout.js, model.js, palette.mjs) are React-SPA **ports** of the same projection logic, cross-referenced by comments ("Ported from generate-views.js"). My flow models the CLI generator, not the server SPA — those are separate flows (es-view-boot / browser-load-model in the older example model).
- **Reused shared ids**: `actor-operator`, `agg-model`, `ds-model-fs`, `ds-flows-json` (all from the merge-traces pilot). `ds-flows-json` is the exact hand-off store: es-merge's output = es-generate's input. New ids: `cmd-generate-views`, `rm-flows-dot`, `rm-explorer-html`, `ds-flows-dot`, `ds-explorer-html`, `ext-graphviz`; reused listed externals `ext-browser`, `ext-vscode`.

## Node count
12 nodes, 1 flow, 1 hotspot.

---

## Schema friction
1. **No clean shape for a "projection command with no aggregate/event."** ES grammar routes commands → aggregates → events, but a deterministic view-generator legitimately has no write-aggregate and no domain event; it just reads one aggregate and writes read-model files. The model is valid (a flow needs only resolvable steps/edges), but a reviewer expecting every command to be "handled by" an aggregate and to "emit" an event may flag this. A one-line note in the schema that *projection/generation commands may terminate in read models without an aggregate or event* would remove doubt for the offline-pipeline traces.
2. **No edge verb for "command → read model" production.** The command *produces* two read models, but the verb list has no command→readModel verb. I routed it physically instead (`cmd writes ds-*` + `rm projects from ds-*`), which is accurate and keeps the read models as satellites, but the direct "this command builds this read model" relationship is only implicit. Minor; the physical routing is a fine stand-in.
3. **`read by` toward an external tool reads slightly off for Graphviz.** `rm-flows-dot read by ext-graphviz` means "an external renderer consumes this file," which is correct, but `ext-graphviz` is a build-time tool rather than a live SaaS. It still fits "external system" (outside the deploy boundary, not an in-process lib). No blocker.
4. Otherwise the actor-as-CLI-invoker convention and the datastore/read-model modeling of file outputs worked cleanly for this offline pipeline, matching the pilot's positive note.
