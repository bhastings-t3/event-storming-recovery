# model-store data-mapping notes (PILOT)

Area: **model-store** — the central JSON-file store (`flows.json`) and everything that reads/derives from it.

## What was created

Physical tier (all `inferred: false`):

- `srv-local-fs` (server, `engine: "filesystem"`, host `localhost/fs`) — the local disk.
- `db-es-model-dir` (database, label `examples/event-storming-recovery/model`, parent `srv-local-fs`).
- `tbl-flows-json` (table, `kind: "table"`) — the persisted model store.
- `tbl-explorer-html`, `tbl-flows-dot` (tables, `kind: "view"`) — the derived view artifacts.
- Columns on `tbl-flows-json` (top-level JSON keys, demand-driven): `col-flows-nodes`, `col-flows-flows`,
  `col-flows-hotspots`, `col-flows-terms`, `col-flows-meta`.

Fields re-stated on: `agg-model` (7 fields: nodes, flows, hotspots, terms, meta.counts, meta.sharedGlossary,
meta.deadFlows), `rm-model-index` (model, meta), `rm-explorer` (embeddedModel + 5 tab fields),
`rm-flows-dot` (dotDigraph), `rm-trace` (nodes, flows, hotspots, terms — `sources: []`).

Edges were added by EDITING the source trace files (see friction #1), not by new flow objects:

- `merge-traces.json`: `agg-model --persists to--> tbl-flows-json`.
- `generate-views.json`: `rm-flows-dot --projects from--> tbl-flows-json`,
  `rm-explorer --projects from--> tbl-flows-json`, `cmd-generate-views --writes--> tbl-flows-dot`,
  `cmd-generate-views --writes--> tbl-explorer-html`.

Merge result: `node tools/merge-flows.js examples/event-storming-recovery/traces .../model/flows.json`
→ **0 errors, validation: OK**, 67 nodes / 11 flows. Only warnings (all benign, see friction #5).

## Stores that could not be cleanly attributed / were left un-modeled

- **`rm-trace`'s backing store (the traces directory).** `rm-trace` reads one `*.json` per flow from
  `examples/event-storming-recovery/traces` — a DIFFERENT directory than the model output dir
  (`db-es-model-dir`). I did NOT mint a `tbl-trace-json` / `db-es-traces-dir`, because (a) the traces dir
  is transient pipeline INPUT (authored, then consumed), which the method's two-plane rule says to keep
  out of the data model, and (b) `rm-trace --projects from--> ext-source-fs` already records that it comes
  from the filesystem. Its fields therefore carry `sources: []` with `provenance: ["migration"]` citing
  `docs/flows-schema.md` for structure. If a later pass wants the traces dir as a first-class store, add
  `db-es-traces-dir` (parent `srv-local-fs`) + `tbl-trace-json` (kind table) and re-point rm-trace's
  fields at its columns.

## Cross-area tables worth de-duping

- **`ext-source-fs` (externalSystem, "Local filesystem") vs the new `srv-local-fs` (server, "localhost/fs")
  are the SAME physical disk, modeled on two planes.** This is the biggest reconcile item and the other
  three data agents will hit it too. `ext-source-fs` is shared across nearly every flow (it is both the
  target repo's source read for anchor excerpts AND the model output written by the CLIs). The physical
  tier I added specifically models the OUTPUT store. There is a defensible two-plane split here (external
  system you read code from vs. your own on-disk output store), but the orchestrator should decide whether
  to keep both or fold one in. Note the resulting **edge overlap**: `merge-traces` now has BOTH
  `agg-model --persists to--> ext-source-fs` (pre-existing) and `agg-model --persists to--> tbl-flows-json`
  (new); `generate-views` similarly has `rm-* --persists to--> ext-source-fs` alongside the new physical
  edges. I left the pre-existing edges intact per the briefing; a cleanup pass could drop the ext-source-fs
  persist/project edges in favor of the physical-tier ones.
- **`tbl-flows-json` is THE shared store for the whole tool.** Other areas (server/MCP read side,
  selection, view-source) all ultimately read this one file or its in-memory resolution. Any table another
  agent invents for "the model" must dedupe onto `tbl-flows-json` (one node per resolved address), not a
  synonym. `srv-local-fs` / `db-es-model-dir` are likewise the shared server/database other agents should
  reuse, not re-mint.

## Schema friction (PILOT — read this before the other 3 data agents run)

1. **FLOWS DO NOT MERGE — the briefing's "re-state the flow to add edges" approach ERRORS.** `merge.mjs`
   unions *nodes* by id (fields by name, provenance appended, usages accumulated), but *flows* are
   first-wins and a **duplicate flow id is a hard ERROR** (`merge.mjs:114`). So neither "restate the full
   flow with the same steps + extra edges" NOR "a flow object with only the new edges" works — both collide
   with the flow already defined in its trace file. The honest, working mechanism is to **edit the existing
   trace file that defines the flow** and append the new physical edges there. That is what I did
   (`merge-traces.json`, `generate-views.json`). RECOMMENDATION for the other agents: locate the trace file
   that owns each flow you must cross-link and add the `persists to`/`projects from`/`writes` edge inline;
   do NOT emit a second flow object with an existing id. (If the orchestrator prefers agents not touch
   behavioral trace files, the alternative is to make flows union their edges by id in the merge — a code
   change — but today they don't.)

2. **The `provenance` enum has no value that fits a filesystem/JSON store.** The enum is
   `sql-literal | connection-string | orm-mapping | migration | inferred-from-dto | assumed`. A file store
   has no connection string, no migration, no ORM, no SQL literal. For the physical `server`/`database`
   nodes I used `["assumed"]` (the host string `localhost/fs` and the dir path are synthetic/parameterized,
   not recovered from a config literal) and leaned on the `description` + an anchor to the `writeFileSync`
   call to carry the real evidence. `orm-mapping` is a slight stretch I used for the file-as-table/columns
   (the merge code "maps" the in-memory object onto the JSON shape) alongside `migration` (citing
   `docs/flows-schema.md` as the authoritative structure — the closest thing to a migration file). A
   dedicated `provenance` value like `"file-literal"` / `"code-literal"` would represent
   "the code literally names this path/key via fs" far more honestly. **Recommendation:** other agents
   modeling `state.mjs` in-memory objects should use `provenance: ["inferred-from-dto"]` with a `note`
   (per briefing), which fits better than any file value.

3. **`server/database/table/column` for a JSON file is a workable but loose fit.** `engine: "filesystem"`
   (freeform) works cleanly and reads honestly. The `server` layer is the weakest: there is no host/instance
   to recover, so `host` is a placeholder — the abstraction wants a network endpoint that doesn't exist.
   `database` = "a directory" and `table` = "a file" read fine. `kind: "view"` for the generated
   `explorer.html`/`flows.dot` is a genuinely good fit (they ARE materialized views of `flows.json`).

4. **Top-level-JSON-key-as-column reads reasonably but is a mild stretch.** The five keys map to columns
   naturally as a demand-driven set, and `fields[].sources[].ref -> col-*` lineage is expressive and
   validates. The stretch: these "columns" are arrays-of-objects (`array<node>`, `array<flow>`), not scalar
   columns — closer to child tables / JSON document sub-documents than SQL columns. I used `dataType` like
   `array<node>` / `object` to be honest about that. It works and the Data model tab will render it, but a
   reader expecting scalar columns should understand these are document sections. `meta.*` field names use
   dotted paths (`meta.counts`) to address sub-parts of the `col-flows-meta` object — the schema tolerates
   any string field name, so this is fine.

5. **Re-stating an anchor-required node (aggregate/readModel) with only `id/type/label/fields` emits a
   "no tactical.anchors" WARNING** for that occurrence (`merge.mjs:77`). It is harmless — the merged node
   keeps the tactical block from the earlier behavioral trace (union keeps the richest explanation) — but
   every data agent will generate ~1 such warning per node it annotates. Expected noise, not an error; do
   not copy the tactical blocks just to silence it.

6. **`conceptual`/`confidence`/`role`/`transform` enums are validated only as warnings** (nonstandard
   tolerated), and 0-source fields validate cleanly — the `fields[]` contract is forgiving and matched the
   file store well. No friction there.
