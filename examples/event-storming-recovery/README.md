# Event Storming Recovery — self-model

A strategic Event Storming model of **the `event-storming-recovery` tool itself**, recovered from its
own code with the tool's own workflow. Its "domain" is recovering event-storming models from code: a
CLI/merge/generate pipeline, an es-view server (HTTP + JSON API serving a React SPA), and an MCP server
that grounds the live selection for a connected Claude session.

## Open it
- **`model/explorer.html`** — open in a browser (self-contained, no server). Sidebar lists the 11 flows;
  click a sticky for the tactical panel + real source; the **Data model** tab shows the
  server ▸ database ▸ table ▸ column tree and each read model's returned fields; the **Glossary** tab
  lists the 86 curated terms (flagged ones marked hotspot-style).
- **`model/flows.dot`** — `dot -Tsvg model/flows.dot -o flows.svg` (Graphviz) for a static graph.
- **`model/flows.json`** — the merged, validated model (source of both views).
- **`traces/`** — the per-flow `<flow>.json`, the `<area>.glossary.json`, and the `<area>.data.json`
  slices agents authored, each with a `.notes.md` of surprises, contradictions, and schema friction.

## What's inside
- **11 flows** — merge-traces, generate-views, build-example-demo, es-view-boot, browser-load-model,
  explore-and-select, curate-context-bundle, view-source, claude-mcp-read, register-mcp, grounded-copy (tier-2).
- **67 nodes** — 3 actors, 12 commands, 4 aggregates, 10 events, 15 read models, 5 external systems,
  8 invariants; **data-model layer**: 1 server, 1 database, 3 tables, 5 columns (18 nodes carry 62 `fields`).
- **13 hotspots** — the code-anchored questions for a human (see below).
- **86 terms** — the ubiquitous language (2 flagged with honest open questions).

## The two-plane call (why the pipeline isn't over-modeled)
This system has two planes. The **command/aggregate plane** is real write behavior: `agg-model` (the
JSON model file), `agg-selection` (the in-memory selection/bundle bridge), and MCP registration. The
**dataflow/ETL plane** is the **merge** and **generate** pipelines — transforms, not aggregates. Their
internal stages (parse → seed → union → validate → write; build-DOT → template-HTML) stay in the
command's tactical detail; only domain-significant facts are promoted to events (ModelMerged,
ModelValidated, ViewsGenerated). The merge's validation rules are modeled as **invariants on `agg-model`**,
not policies. Forcing the command/aggregate grammar onto those transforms would have been over-modeling.

## The data model is honestly file-based / in-memory (no SQL)
This tool has no database. Its stores are: a **JSON file** (`flows.json`, backing `agg-model`, modeled
as `srv-local-fs` ▸ `db-es-model-dir` ▸ `tbl-flows-json` with the top-level keys as columns);
**process memory** (`state.mjs`, backing `agg-selection` — modeled with `fields` and `sources: []`, no
fabricated physical nodes); the **user's Claude config** (external, `ownedBy: ext-claude-cli`); and the
**target repo's source** (read-only, `ext-source-fs`). A file/in-memory data model is the truthful outcome.

## This is a scaffold, not a workshop wall
This model is code-derived: always-true and a great conversation starter, but it does **not** capture
timeline order, bounded contexts, swimlanes, or the human hotspots a live workshop surfaces. Treat the
**hotspots** as the handoff to those conversations. The sharpest ones:
- `hot-selection-never-cleared` — the SPA never clears the server selection, so a connected Claude sees a stale node.
- `hot-host-exposure` / `hot-source-api-network-exposed` — `--host 0.0.0.0` exposes the unauthenticated API + MCP;
  `GET /api/source` is an arbitrary-file-read primitive (its `path.resolve` guard doesn't stop an in-root symlink).
- `hot-ui-shells-claude-cli` — a browser click makes the server shell `claude mcp add` on the host.
- `hot-port-fall-forward-stale-mcp` — port fall-forward vs the hardcoded `:5178` in `plugin.json`/`.mcp.json.example`.
- `hot-invalid-model-written` / `hot-example-overwrite-in-place` — `es-merge` writes `flows.json` before checking
  validation, and `npm run demo` overwrites the shipped fallback in place.
- `hot-frozen-explorer-snapshot` / `hot-model-loaded-once` — the explorer embeds a frozen model; edits need regenerate/restart.

## How it was built
Orchestrator + sub-agent waves (all Opus): 5 inventory scouts → exhaustive triage → 1 pilot + 10 deep
traces → merge & consistency pass → 1 pilot + 4 glossary miners → 1 pilot + 3 data-mapping agents →
generate + verify. Rebuild from `traces/` with:
```
node tools/merge-flows.js examples/event-storming-recovery/traces examples/event-storming-recovery/model/flows.json
node tools/generate-views.js examples/event-storming-recovery/model/flows.json examples/event-storming-recovery/model \
  --repo-root <this-checkout> --title "Event Storming Recovery — self-model"
```
