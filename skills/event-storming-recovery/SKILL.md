---
name: event-storming-recovery
description: >-
  Recover a strategic Event Storming model from an existing codebase and render it as a
  navigable, source-linked flow explorer. Use when someone wants to understand how a system
  works end-to-end — "map the flows of this codebase", "reverse-engineer the domain", "event
  storm this app", "what are all the flows from entry point to database", "build a flow map",
  "recover the domain model / bounded contexts", "onboard me to this repo's behavior" — or
  wants to derive original intent from a services-and-repositories codebase that has only the
  tactical implementation. Orchestrates parallel scout + deep-trace sub-agents into a
  validated flows.json plus an interactive explorer.html and a Graphviz DOT.
---

# Event Storming Recovery

Turn a codebase into a **strategic Event Storming model**: for each flow through the system —
a user action, a scheduled job, an inbound API call — the actors, commands, aggregates, events,
policies, read models, and external systems it moves through, from entry point to data write,
each sticky linked to the source that implements it.

You are the **orchestrator**. You do not read the whole codebase yourself; you dispatch
sub-agents and keep the durable artifacts. This keeps your context clean — file-reading happens
inside sub-agents, and you keep only their structured returns.

This skill ships inside the `event-storming-recovery` repo (a Claude Code plugin), whose
`prompts/`, `tools/`, `docs/`, and `examples/` dirs are its resources. When installed as a plugin,
reference those bundled files as **`${CLAUDE_PLUGIN_ROOT}/<path>`** (e.g.
`${CLAUDE_PLUGIN_ROOT}/prompts/00-orchestrator.md`, `${CLAUDE_PLUGIN_ROOT}/tools/merge-flows.js`);
that variable resolves to the plugin's install directory. The paths below are written
repo-root-relative for readability — prefix them with `${CLAUDE_PLUGIN_ROOT}/` when reading the
files at runtime.

## The process (six phases)

Read `prompts/00-orchestrator.md` for the full playbook. In brief:

1. **Inventory** — spawn the five scouts in `prompts/01-scouts.md` concurrently, as
   `general-purpose`/`claude` and briefed read-only (UI, automations, API/auth, integrations,
   data-layer/aggregates). Persist each report. Merge into a flow-candidate list and derive a
   **shared-id glossary** of the system's core aggregates, external systems, and actor roles.
2. **Triage** (`prompts/02-triage.md`) — put the flow list to the human; agree which flows get
   individual traces vs. pattern exemplars; agree coverage depth and delivery.
3. **Deep-trace** — write the shared briefing (`prompts/03-trace-briefing.md`, filled with repo
   root, excludes, the glossary, and a link to `docs/flows-schema.md`). **Run one pilot trace,
   read its "schema friction", fix the schema/briefing**, then run the rest in waves (~7
   concurrent). Each trace agent verifies **reachability** (catches dead/superseded flows), traces
   end to end, and **writes its own `<flow-id>.json` + `.notes.md`** — never route large JSON back
   through your context.
4. **Merge & check** — `node tools/merge-flows.js <tracesDir> <out>/model/flows.json` merges shared
   nodes and validates. Do a consistency pass for ubiquitous-language drift; don't force-merge
   legitimate altitude variations.
5. **Ubiquitous Language mining** — write the mining briefing (`prompts/04-glossary-mining.md`) and
   dispatch a wave (~5-7), each owning a model slice. They **seed** domain terms from the node
   descriptions, read code only to resolve/anchor the unclear jargon (REVBUILD, Budget Stage, GPW,
   SKU…), **flag** what stays uncertain with an `openQuestion` (the hotspot contract), and **write
   their own `<area>.glossary.json` + `.notes.md`** into the traces dir. Re-run the merge to fold
   the `terms` in and validate them.
6. **Generate & verify** — `node tools/generate-views.js <out>/model/flows.json <out>/model
   --repo-root <abs> --title "<Project> Event Storming"` emits `flows.dot` + `explorer.html`.
   Open the explorer and verify it renders (incl. the **Glossary** tab of curated terms, flagged
   ones marked). Write the README. Leave committing to the user.

## Guardrails

- **Never read the whole codebase in your own context** — delegate; keep conclusions, not dumps.
- **Every sub-agent recurses — spawn them as spawn-capable types.** Scouts, trace agents, and
  glossary miners inherit the recursion protocol (`prompts/recursive-exploration.md`): when one hits
  a high-signal pathway (a hub, a contradiction, an unfamiliar subsystem, a model-forking branch) it
  spawns its own sub-agents to chase it, and those may recurse further (harness cap: depth 5). For
  this to work they **must** be spawned as `general-purpose`/`claude` (which carry the `Agent`
  tool) — **not `Explore`/`Plan`**, which lack it and collapse the tree to a flat fan-out. The
  exploration is dynamic and aggressive on depth/fan-out; the return contract stays fixed (write
  artifacts to files, return conclusions + anchors), so the orchestrator's context stays clean no
  matter how deep the tree goes.
- **Default every agent to Opus.** The orchestrator and every tool-calling agent (scouts, tracers,
  miners, and their recursive children) run on Opus — a weaker model on a tool-heavy task flails and
  burns more than it saves. Step down to Haiku only for a genuinely simple, tool-light step whose
  whole job is to summarize or condense text.
- **Persist every sub-agent return immediately** — assume your context can be summarized mid-run.
- **This is a code-derived scaffold, not a workshop wall.** It's always-true and a great
  conversation starter, but it doesn't capture timeline order, bounded contexts, swimlanes, or the
  human hotspots a live workshop surfaces. Say so in the deliverable, and treat the hotspots (the
  code-anchored questions) as the handoff to those conversations.
- If an `event-storming-modeling` reference/skill is available, load it first for the sticky
  vocabulary and grammar this method depends on.

## What's in this skill

- `prompts/` — the orchestrator playbook, the five scout templates, the triage step, the trace
  briefing, the glossary-mining briefing, and `recursive-exploration.md` (the shared recursion
  protocol every sub-agent inherits).
- `docs/flows-schema.md` — the node/edge/flow/term contract every trace and term conforms to.
- `tools/merge-flows.js`, `tools/generate-views.js` — merge+validate, and render DOT+explorer.
- `examples/event-storming-recovery/` — the bundled example (this tool's own recovered self-model);
  rebuild it in seconds to see the output shape: `npm run demo`. A small synthetic fixture also lives
  at `tests/fixtures/toy-shop/` if you want the minimal shape.
