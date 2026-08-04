# Event Storming Recovery — self-model

The bundled example is **`event-storming-recovery`'s own recovered self-model**: the tool run
against this very repository. Its "domain" is recovering Event Storming models from code, so what you
see mapped here is the tool itself — the CLI merge/generate pipeline, the `es-view` server (HTTP + JSON
API serving a React SPA), and the MCP server that grounds the live selection for a connected Claude
session.

`model/flows.json` is the canonical model and the single source of truth; the explorer and DOT graph
are generated from it. Its `meta.counts` block carries the authoritative flow/node/hotspot/term totals
and the per-type breakdown — read it there rather than trusting a number copied into prose. At the time
of writing that is roughly **15 flows across ~87 nodes**.

## Open it

```sh
npx event-storming-recovery view examples/event-storming-recovery/model/flows.json
```

That boots the interactive explorer (the `es-view` server) and opens it in a browser. Or just open the
pre-generated **`model/explorer.html`** directly — it is self-contained and needs no server. The
sidebar lists the flows; click a sticky for its tactical panel and the real source behind it. The
**Data model** tab shows the storage the code touches, and the **Glossary** tab lists the curated
ubiquitous-language terms (open questions flagged).

Other artifacts in this directory:

- **`model/flows.dot`** — `dot -Tsvg model/flows.dot -o flows.svg` (Graphviz) for a static graph.
- **`traces/`** — the per-flow, per-glossary, and per-data-slice source documents the agents authored,
  each paired with a `.notes.md` of surprises, contradictions, and schema friction. These are the input
  the model is merged from; `model/flows.json` is the merged, validated output.

## Why the pipeline isn't over-modeled (the two-plane call)

This system has two planes. The **command/aggregate plane** is real write behavior: the canonical model
file, the in-memory selection/bundle bridge, and MCP registration. The **dataflow/ETL plane** is the
**merge** and **generate** pipelines — transforms, not aggregates. Their internal stages (parse → seed →
union → validate → write; build-DOT → template-HTML) stay in the command's tactical detail; only
domain-significant facts are promoted to events. The merge's validation rules are modeled as
**invariants on the model aggregate**, not policies. Forcing the command/aggregate grammar onto those
transforms would have been over-modeling. This is why the self-model is a deliberate, atypical fixture:
it exercises that two-plane rule.

## The data model is honestly file-based / in-memory (no SQL)

This tool has no database. Its stores are a **JSON file** (`flows.json`, the canonical model),
**process memory** (the live selection and context bundle, shared by the HTTP and MCP faces), the
**user's Claude config** (external), and the **target repo's source** (read-only). The recovered data
model reflects exactly that — a file/in-memory shape, not a fabricated set of tables. See it in the
explorer's **Data model** tab.

## This is a scaffold, not a workshop wall

This model is code-derived: always-true and a great conversation starter, but it does **not** capture
timeline order, bounded contexts, swimlanes, or the human questions a live workshop surfaces. The model
records those open questions as **hotspots** — the handoff to those conversations. Browse the
explorer's hotspots view (red cards on the board) rather than a list frozen into this file, since which
questions are open changes as the code does.

## Rebuilding it

This example is regenerated from `traces/` by the demo pipeline. From the repo root:

```sh
npm run demo
```

That runs `scripts/build-example.mjs`, which merges the traces into `model/flows.json` and regenerates
`model/explorer.html` and `model/flows.dot`. (Under the hood it is the same `merge` then `generate`
subcommands the unified `event-storming-recovery` CLI exposes.)
