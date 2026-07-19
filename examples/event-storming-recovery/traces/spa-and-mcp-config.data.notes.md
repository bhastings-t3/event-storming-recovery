# spa-and-mcp-config — data-mapping notes

Area: the client-derived SPA tab read models (`rm-flow-board`, `rm-gallery`, `rm-glossary`) and
the MCP registration store (`agg-mcp-registration`, `rm-mcp-connect-command`).

## Physical tier reused (not re-minted)
All three SPA read models project from the pilot's filesystem tier:
`srv-local-fs` -> `db-es-model-dir` -> `tbl-flows-json` (+ columns `col-flows-nodes / -flows /
-hotspots / -terms / -meta`), defined in `model-store.data.json`. I referenced those column ids in
`fields[].sources[].ref` and appended three `rm-* --projects from--> tbl-flows-json` edges to the
`browser-load-model` flow (inline in `browser-load-model.json`, keeping steps/hotspots intact). No
new physical nodes were created for this area.

## In-memory / external-only stores (no physical nodes, by design)
- **`agg-mcp-registration`** — `ownedBy: ext-claude-cli`. Its state lives entirely in the user's
  Claude config, written by shelling `claude mcp add` (`mcp-register.mjs` / `server.mjs`), never in a
  store es-view reads. Its fields (`name`, `url`, `scope`) therefore carry `sources: []` with
  `provenance: ["assumed"]` and notes naming the external config. No physical node is modeled for the
  external Claude config (correct: es-view neither owns nor reads it).
- **`rm-mcp-connect-command`** — the copy-able `claude mcp add ...` string. Computed in-memory from
  `runtime.baseUrl` (set only after the socket binds) and surfaced by `GET /api/mcp/info` + the CLI
  banner. Fields (`command`, `url`, `name`) are computed: `sources: []`, `provenance:
  ["inferred-from-dto"]`. No file/table backs it.

## Cross-area tables worth de-duping
- **`tbl-flows-json` + its columns** are shared with the pilot (`model-store.data.json`) and every
  other SPA/generator read model (`rm-model-index`, `rm-explorer`, `rm-flows-dot`, `rm-data-model`).
  The merge dedupes by id, so no duplication — but this single JSON "table" is the one physical store
  the whole tool projects from. Keep it single-sourced in `model-store.data.json`; downstream areas
  should only reference `col-flows-*`, never re-declare them.

## Schema friction
- **`rm-glossary` source: the SPA Glossary reads `nodes`, not `terms`.** The tuning brief asked to
  wire `rm-glossary -> col-flows-terms`. The actual SPA component `src/web/components/Glossary.jsx`
  provably filters and sorts `model.nodes` (line 22: `let nodes = model.nodes.filter(...)`; line 45
  heading: `{nodes.length} of {model.nodes.length} terms`) and never touches `model.terms`. It is a
  nodes-as-dictionary view, not the curated ubiquitous-language list. So I wired
  `rm-glossary -> col-flows-nodes` to match the code and flagged it in the field's `derivation` +
  `notes`. The `col-flows-terms` glossary the brief was thinking of is the **static explorer.html**
  glossary (`tools/generate-views.js` `renderGlossaryList`, which reads `MODEL.terms`), already
  captured by the pilot's `rm-explorer.glossary` field. Net: the SPA and the static HTML have
  *different* glossaries (sticky-node dictionary vs curated terms). If the orchestrator prefers the
  conceptual "glossary == terms" wiring over code fidelity, flip this one field's source to
  `col-flows-terms`; I chose code truth per the data-pass "don't fabricate a derivation" rule.
- **`rm-flow-board` sources broader than the brief.** The brief named only `col-flows-flows`. The
  board also joins `col-flows-nodes` (nodeById) to resolve step/edge ids to stickies and to pivot the
  sidebar by actor/aggregate, so I added `col-flows-nodes` as a `joined-on` source. This enriches, it
  does not contradict, the brief.
- **`/api/mcp/info` command drifts from the register write.** The info/banner command omits `--scope`
  and does not quote the URL, whereas the register write (`mcp-register.mjs`) quotes the URL and
  appends `--scope`. Noted in the `rm-mcp-connect-command.command` derivation. Cosmetic only; not a
  data-lineage issue (already an existing hotspot around the static-vs-dynamic MCP URL).
