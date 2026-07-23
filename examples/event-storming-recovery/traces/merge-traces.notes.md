# merge-traces — trace notes

## Reachability verdict: LIVE
Two independent live entry points reach `mergeTraceDocs` end to end:
- **CLI**: `es-merge` bin → `tools/merge-flows.js` (`package.json` bin, line 10) → `mergeTracesDir` → `mergeTraceDocs`. Trigger: `node tools/merge-flows.js <tracesDir> <outFile>`.
- **Server**: `es-view --traces <dir>` → `bin/es-view.mjs:36` sets `opts.tracesDir` → `resolveModel` (`bin/es-view.mjs:83`) → `resolve-model.mjs:74-76` → `mergeTracesDir`.
Both are wired from `package.json` bin and reachable by the operator. Not dead.

## What the merge actually enforces (every rule, mapped to a node)
Error-level (fail the merge) grouped into 4 invariants:
- `inv-referential-integrity` — node id/type/label + known type (77-78), type conflict on re-seen id (89), duplicate flow id (116), flow step / edge.from / edge.to / flow hotspot all resolve (157-163).
- `inv-es-grammar` — aggregate + edge verb `issues` forbidden (168-173). This is the ONLY hard ES-grammar rule enforced.
- `inv-terms-contract` — term id/term (126), valid status (179), resolved⇒definition (181), non-resolved⇒openQuestion (182), relatedNodes resolve (183).
- `inv-data-lineage` — parent resolves (137) + acyclic chain (146); field name+derivation (45); local source ref `/^(ds|fld)-/` resolves (54).

Warning-level (do NOT fail): anchor-required nodes missing anchors (79-80, modeled as the 5th invariant `inv-anchor-coverage`), duplicate hotspot/term id (121, 127), nonstandard edge verb (161), missing flow kind/status (155-156), unknown supersededBy (164), wrong parent level (141), nonstandard field confidence/role/transform (49-53), orphan node (198), nonstandard term category (180). I folded these into the descriptions of the invariant they live beside rather than minting a node per warning.

## Contradictions found vs. the reference example
The prior `examples/.../traces/merge-traces.json` is schema-correct but **stale in three ways** — I corrected all three:
1. **Wrong regex.** Its `inv-data-lineage` says local field refs match `^(col|tbl|db|srv)-`. The current code (`merge.mjs:30`) is `LOCAL_REF = /^(ds|fld)-/`. The old prefixes predate the `datastore|field` refactor.
2. **Dangling edge.** Its flow has an edge `agg-model → ds-tbl-flows-json (persists to)` but **no `ds-tbl-flows-json` node is defined** — that edge would itself trip `inv-referential-integrity` (edge.to not in nodes). I replaced it with a real `ds-flows-json` datastore node.
3. **Line drift.** Every anchor line was off by ~1-5 lines from the current file. Re-anchored all to the current `merge.mjs` / `merge-flows.js` / `resolve-model.mjs`.

## Hotspot
- `hot-invalid-model-written` — CLI writes flows.json (`merge-flows.js:31`) BEFORE the error check (`:37` exits 1), so a failed validation still leaves an invalid artifact on disk that es-view auto-discovery could later serve. The server path (`resolve-model.mjs:77`) instead throws and serves nothing. The two callers disagree; a human should decide whether the CLI should withhold the file on error. (Verified still true in current code.)

## Modeling decisions worth the orchestrator's eye
- **Two events (`ModelMerged`, `ModelValidated`) from one synchronous function.** Justified under the "separate failure window ⇒ separate fact" rule: `mergeTraceDocs` ALWAYS returns a model (merged holds unconditionally), but validated only holds when `errors.length === 0`. Merged-but-invalid is a real, observable state, so they are genuinely separable outcomes, not one fact split in two.
- **Filesystem modeled as datastores, no external system.** Dropped the example's `ext-source-fs` externalSystem in favor of a `ds-model-fs` (filesystem) ▸ `ds-traces-dir` (directory) ▸ `ds-trace-json` (file) input chain and a `ds-flows-json` (file) output. Per the briefing's "model files as datastores." `rm-trace` `projects from` `ds-trace-json`; `agg-model` `persists to` `ds-flows-json`; `cmd-merge-traces` `connects via` `ds-model-fs`.
- **Dead-flow index modeled as a derived `fields[]` entry on `agg-model`** (`meta.deadFlows`), alongside `meta.sharedGlossary` and `meta.counts.byType`, all with empty `sources` (computed). This is where the briefing's "dead-flow indexing" landed — it is a projection, not an enforced invariant (see friction #3).

---

## Schema friction
Candid friction from the pilot, roughly highest-value first.

1. **"Model EACH validation rule as an invariant" collides with the error/warning split.** `merge.mjs` mixes hard errors (fail the merge) and soft warnings (advisory) in the *same* loops. A literal reading of the briefing ("trace EVERY validation rule … model EACH as an invariant") would mint ~15 invariant nodes, most of them warnings, which is noise. I chose 4 error-invariants + 1 representative warning-invariant (`inv-anchor-coverage`) and folded the rest into descriptions. **Recommendation for the other 14 traces:** state explicitly that error-level rules get their own invariant node and warning-level rules may be summarized inside a related invariant's explanation. Otherwise agents will diverge wildly on granularity.

2. **`invariant` type has no way to express "this is a warning, not a gate."** All invariants look equally hard. The one genuinely soft invariant I modeled (`inv-anchor-coverage`) is indistinguishable in the schema from `inv-referential-integrity` which aborts the merge. Consider an optional `severity: "error" | "warning"` on invariant nodes, or the convention of only modeling error-level checks as invariants.

3. **The briefing's invariant list contains two items the merge does NOT enforce.** "invariants attach to aggregates" and "dead-flow indexing" are in the briefing's enumerated invariants, but (a) nothing in `merge.mjs` validates that an invariant node hangs off an aggregate — that is schema doctrine, not a runtime check; and (b) dead-flow indexing is a *derived projection* (`meta.deadFlows`), not a rejection rule. Modeling either as an `enforces`-edged invariant would be fiction. I modeled dead-flow indexing as a derived field and dropped "invariants-attach-to-aggregates" entirely. **Fix the briefing's list** so agents don't invent invariant nodes for non-invariants.

4. **Datastore/field layer for a JSON-document "store" is awkward.** The output `flows.json` is one semi-structured document, not a table of rows. Modeling it as a `file` datastore is fine, but its interesting structure (nodes[], flows[], meta.*) is nested JSON, not flat columns/fields. I represented the derived meta as conceptual `fields[]` on `agg-model` rather than `fld-` physical nodes, because `fld-` nodes imply flat stored attributes. Guidance is thin on "document store whose fields are the JSON keys of a computed output" — worth a sentence in the schema on when to use `fields[]` (conceptual, on the aggregate) vs `fld-` nodes (physical, on the datastore) for document/JSON stores.

5. **`provenance` enum has no value for "computed in code."** The derived-meta fields (glossary, deadFlows, counts) are literally computed by the merge, but the provenance vocabulary (`sql-literal | connection-string | orm-mapping | migration | inferred-from-dto | assumed`) has no "code-derived/computed" option. I used `inferred-from-dto` as the least-wrong fit. Provenance isn't validated by the merge, so this is cosmetic, but a `computed` value would fit dataflow/pipeline systems better.

6. **No edge verb for "reads a directory listing" / enumerating a store.** `cmd-merge-traces` first `readdirSync`s the directory (enumerate) and then reads each file. I used `connects via ds-model-fs` + `rm-trace projects from ds-trace-json`, but there's no clean verb for "lists the contents of a directory/bucket/topic." `reads` overloads to cover it. Minor; `connects via` is an acceptable stand-in.

7. **A deterministic pipeline with no mid-stream actor models cleanly** — the actor-as-CLI-invoker convention (`actor-operator issues cmd`) worked without friction. No issue here; noting it as a positive for the other offline-pipeline traces (generate-views, build-example).

8. **`meta` on trace files is ambiguous.** The schema says `meta` is "optional and mostly filled by the merge." Trace files omit it and the merge synthesizes it. I omitted it. Fine, but a one-line "trace agents should NOT author `meta`" would remove doubt.
