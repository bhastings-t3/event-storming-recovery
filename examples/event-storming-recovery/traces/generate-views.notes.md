# generate-views — trace notes

## Flow at a glance
`es-generate` (bin) → `tools/generate-views.js`. `actor-operator` runs
`node tools/generate-views.js <flows.json> <outDir> --repo-root <abs> --title "..."`.
The command READS `agg-model` (parses flows.json, line 24) and projects it into two read
models — `rm-flows-dot` (Graphviz `flows.dot`, written line 91) and `rm-explorer`
(self-contained `explorer.html`, written line 1487) — then emits the single promoted fact
`evt-views-generated`. Both artifacts persist to `ext-source-fs` and embed `vscode://` deep
links back to `ext-editor`. Node count: 8. Reachability: confirmed live (see below).

## Two-plane rule applied (the important call)
generate-views is a pure ETL/transform. I kept the whole render pipeline inside
`cmd-generate-views.tactical.explanation` and promoted exactly ONE domain fact,
`evt-views-generated`. Specifically NOT modeled as aggregates/policies/events:
- DOT construction stages (subgraph-per-flow, palette coloring, physical-node exclusion,
  URL attachment, dead-flow styling) — lines 62-90.
- HTML templating (model inlining, REPO_ROOT/PALETTE inlining, the whole vanilla-JS SPA) —
  lines 93-1486.
The outputs are READ MODELS (`rm-flows-dot`, `rm-explorer`), not aggregates. `agg-model` is
read-only input here; the generator never mutates or re-validates it, so no invariants hang
off it in this flow (its invariants belong to the merge flow that builds it).

## Kind = read (my call)
I chose `kind: "read"` over `"write"`. Although the command does `writeFileSync` two files,
the domain-meaningful characterization is a projection/view-generation: it reads the model and
produces read models, mutating no domain aggregate. The file writes are captured as
`persists to ext-source-fs` satellite edges. If the fleet convention prefers "any fs write ⇒
write flow," this is the one edge to flip.

## Verified hints (all confirmed)
- `es-generate` → `tools/generate-views.js` bin mapping: confirmed in `package.json` (line 11).
- DOT write point: line 91 (`writeFileSync(outDir/flows.dot)`). Confirmed.
- HTML write point: line 1487 (`writeFileSync(outDir/explorer.html)`). Confirmed.
- Model inlined as `const MODEL = ...`: line 438. Confirmed (`REPO_ROOT` 439, `PALETTE` 440).
- `vscode://` deep-links → editor: `anchorUrl` defined twice, line 60 (DOT) and line 478 (SPA).
- Physical nodes excluded from board + DOT: `DATA_TYPES`/`isDataId` (36-37), applied at 73-74.
- Reachability: `es-generate` bin (package.json), invoked by `scripts/build-example.mjs:14`
  (`npm run demo`), and exercised by `tests/smoke.test.mjs:47`. Flow status: **live**.

## Store note (per pilot tuning)
Stores are files, not SQL. `agg-model` input is a JSON file; the outputs (`flows.dot`,
`explorer.html`) are files written to the output directory (`ext-source-fs`). I used `writes`
(cmd → read model) for the production edges and `persists to` (read model → `ext-source-fs`)
for the on-disk persistence, per the pilot's tolerated-verb guidance. No fabricated
server/database/table/column nodes — none exist in this transform.

## Hotspots (2)
- **hot-frozen-explorer-snapshot** — `explorer.html` inlines the entire model at line 438, so
  the artifact is a frozen COPY that drifts from `flows.json` after any re-merge/data pass,
  with no version stamp or staleness signal. Contrast the es-view server, which serves the live
  in-memory model. Question: version-stamp + staleness warning, or is the frozen offline
  snapshot the intended contract? (The smoke test asserting "no external <script src=>"
  suggests the offline/self-contained design is deliberate.)
- **hot-unresolved-repo-root-links** — `repoRoot` defaults to `meta.repoRoot` else `'.'`
  (line 27), and is interpolated raw into `vscode://file/${repoRoot}/...` (lines 60, 478).
  `vscode://file/` needs an ABSOLUTE path, so the default (and any wrong checkout path) yields
  links that silently open nothing, with no warning at generate time. Question: should
  es-generate validate/require an absolute existing repoRoot?

## Minor observations (not promoted to hotspots)
- DOT node URLs use only the FIRST tactical anchor per node (lines 78-79); secondary anchors
  are unreachable from the graph. Folded into the repo-root hotspot's tactical rather than
  raised separately. The SPA detail panel (998, 1410, 1459) links every anchor, so this is a
  DOT-only limitation.
- No generator-side validation/failure branch: an unparseable `flows.json` throws at line 24
  (readFileSync/JSON.parse); a successful run always emits `evt-views-generated`. Validation is
  the merge's job (already modeled in `merge-traces.json`), so I did not duplicate it here.
- `<` is escaped to `<` when inlining the model (line 94) to keep the inline `<script>`
  safe — a small but real correctness detail, noted in `rm-explorer` tactical.

## Shared-node reuse
Reused verbatim from the pilot / glossary: `actor-operator`, `agg-model`, `ext-source-fs`.
Reused shared glossary id `ext-editor` (vscode:// links). New ids minted with correct prefixes:
`cmd-generate-views`, `rm-flows-dot`, `rm-explorer`, `evt-views-generated`.

## Schema friction
None. The transform maps cleanly once the two-plane rule is applied. The only judgment calls
were (a) `kind: read` vs `write` for a projection that writes files, and (b) verb choice for
file-store edges (`writes` / `persists to`), both explicitly left open by the schema + pilot
tuning. The `links to` verb (read model → editor) is nonstandard and will produce at most a
merge warning, which is acceptable per the schema's "nonstandard edge verbs are warnings" rule.
