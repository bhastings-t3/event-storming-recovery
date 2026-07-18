# grounded-projections.data — notes

Area: **grounded-projections** — the grounded read-model projections the es-view server/MCP return.
Source of truth: `src/server/context.mjs` (buildNodeContext, buildFlowContext, flowMermaid,
renderItemMarkdown, renderDataModelMarkdown) + `src/lib/selectors.mjs` + `src/server/source.mjs`.

## What I re-stated (fields[] added; nodes unioned by the merge)
- `rm-node-context` (get_node / SPA detail) — 11 fields: label, type, description, the node's own
  `fields`, breadcrumb, columns, usedBy, storage, flows, `related` (enforces relation), anchors.
- `rm-flow-context` (get_flow) — 5 fields: meta, edges, hotspots, nodes, `mermaid` (computed string).
- `rm-data-model` (list_data_model / Data-model tab) — 2 fields: containmentTree, tableConsumers.
- `rm-item-markdown` (GET /api/item copy) — 2 fields: markdown (computed), label.
- `rm-source-excerpt` (GET /api/source) — 4 fields: path, startLine, endLine, code (all live-read).
- `rm-current-selection` (get_current_selection) — 2 fields: selection (in-memory), groundedNode.

## Physical satellite edges I appended (inline edits to the owned behavioral traces)
- `claude-mcp-read.json`: `rm-current-selection`, `rm-node-context`, `rm-flow-context`,
  `rm-data-model` each `--projects from--> tbl-flows-json`. (They already `projects from agg-model`
  in-memory; these add the physical-store satellite so the Data-model tab shows them as consumers.)
- `grounded-copy.json`: `rm-item-markdown --projects from--> tbl-flows-json`.
- `view-source.json`: SKIPPED — `rm-source-excerpt --projects from--> ext-source-fs` was already
  present, and rm-source-excerpt reads LIVE from the analyzed repo, so it has no persisted table.

## Reused physical ids (did NOT re-mint)
All from the pilot's `model-store.data.json`: `srv-local-fs` > `db-es-model-dir` > `tbl-flows-json`
(+ columns `col-flows-nodes`, `col-flows-flows`, `col-flows-hotspots`, `col-flows-terms`,
`col-flows-meta`). My field lineage refs point at `col-flows-nodes` / `col-flows-flows` /
`col-flows-hotspots`; my flow edges point at `tbl-flows-json`.

## In-memory-only / live-read stores (no physical table minted — correct, not a gap)
- **`rm-current-selection.selection`** — the `{ nodeId, at }` pointer lives in process memory
  (`state.mjs` `selection`), no file/db. `sources: []`, provenance `inferred-from-dto`. Reflects the
  LIVE selection and can be stale (cited hotspot `hot-selection-never-cleared`).
- **`rm-source-excerpt` (all 4 fields)** — read LIVE from the analyzed repo under repoRoot via
  `readSource`/node:fs. `sources: []`, provenance `assumed`. The target codebase is external
  (`ext-source-fs`); no table is minted for it, per the briefing.
- **`rm-flow-context.mermaid`** and **`rm-item-markdown.markdown`** — computed derived strings, never
  persisted. `sources: []` with a note naming the model columns + `ext-source-fs` they derive from.

## Cross-area tables worth de-duping
- **`tbl-flows-json` + its columns** are the shared physical store, minted by the pilot in
  `model-store.data.json`. Every grounded projection here (and the model-store area's `rm-model-index`,
  `rm-explorer`, `rm-flows-dot`) projects from it. Keep exactly one definition (the pilot's); this
  area only REFERENCES it via `fields[].sources[].ref` and `projects from` edges — no duplicate node.
- **`ext-source-fs`** (externalSystem, not a table) is referenced by several areas as the live-source
  grounding origin. It is used as a non-local `sources[].ref` here (accepted as-is, not a physical id).

## Schema friction
None.
