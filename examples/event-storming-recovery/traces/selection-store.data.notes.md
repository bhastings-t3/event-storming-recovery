# selection-store data-mapping notes

Area: **selection-store** — the IN-MEMORY session store for one `es-view` run.

## What was created

**No physical nodes.** This store is process memory only: `createState()` in `src/server/state.mjs`
closes over `let selection = null` ({ nodeId, at } | null) and `const bundle = new Map()`
(`"type:id"` -> { type, id, at }). There is NO file and NO database, so per the briefing every field
carries `sources: []`, `provenance: ["inferred-from-dto"]`, and a `note` naming the in-memory
structure. In-memory/computed is the truthful, correct outcome here — no `server`/`database`/`table`/
`column` was fabricated.

**No physical edges added.** Because there is no physical table for this area, no `persists to` /
`writes` / `projects from` edge was needed, so NO behavioral trace flow file was edited. `flows: []`.

Fields re-stated:

- `agg-selection` (3 fields):
  - `selectionNodeId` — the single selected node id, set via POST /api/selection -> state.setSelection.
  - `selectionAt` — epoch-ms stamp captured with the selection but NEVER surfaced; cites
    `hot-selection-never-cleared` (the invisible `at` is why a stale selection can't be detected).
  - `bundleItems` — insertion-ordered typed-ref set { type, id, at }, type in node|flow|hotspot,
    Map-backed (dedup + click order); cites `hot-bundle-single-global-state` (one bundle per process).
- `rm-context-bundle` (2 fields):
  - `items` — the resolved { type, id } refs (state.getBundle()) returned by GET /api/context.
  - `markdown` — the grounded bundle document via context.mjs `renderBundleMarkdown`, computed on read
    over agg-model + real source excerpts.

Both re-stated nodes carry a minimal `tactical` (explanation + 1 anchor) so the merge doesn't warn
"no tactical.anchors"; the merged node keeps the richer tactical block from the behavioral traces.

## Stores that could not be attributed / in-memory-only stores

- **The entire area is in-memory-only.** `agg-selection`'s `selection` + `bundle` and
  `rm-context-bundle`'s projection have no durable backing store. `rm-context-bundle` is a *read-time
  join* of `agg-selection.bundleItems` against `agg-model` (plus on-disk source excerpts read through
  `ext-source-fs` via `readSource`); it materializes nothing. Correctly modeled with `sources: []`.
- The bundle re-hydrates once on browser reload from GET /api/context (`store.jsx` useEffect), but that
  is a client cache of the same in-memory server bundle, not a separate store.

## Cross-area tables worth de-duping

- **None minted here.** This area adds zero physical nodes, so there is nothing to de-dup against the
  model-store pilot's `srv-local-fs` / `db-es-model-dir` / `tbl-flows-json` tier. Note that
  `rm-context-bundle`'s markdown resolves refs against `agg-model` (whose store IS `tbl-flows-json`)
  and reads source via `ext-source-fs` — both are other areas' nodes, referenced only through the
  existing behavioral edges, not re-modeled here.

## Schema friction

- **`provenance: ["inferred-from-dto"]` is the right fit for an in-memory store** (as the pilot's
  friction #2 predicted). No file/SQL/ORM/migration value applies; the DTO shape (`{ nodeId, at }`,
  `{ type, id, at }`) is exactly what `inferred-from-dto` describes. No friction beyond that.
- A field whose store is process memory validates cleanly with `sources: []` — the `fields[]` contract
  handles the in-memory case without complaint.
