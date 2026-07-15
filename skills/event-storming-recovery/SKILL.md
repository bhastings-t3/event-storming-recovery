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

All paths below are **relative to the repo root** (this skill ships inside the
`event-storming-recovery` repo, whose `prompts/`, `schema/`, `tools/`, and `examples/` dirs are
the skill's resources). Install by cloning the repo and pointing your skills path at it, or copy
the repo alongside this `SKILL.md`.

## The process (five phases)

Read `prompts/00-orchestrator.md` for the full playbook. In brief:

1. **Inventory** — spawn the five read-only scouts in `prompts/01-scouts.md` concurrently (UI,
   automations, API/auth, integrations, data-layer/aggregates). Persist each report. Merge into a
   flow-candidate list and derive a **shared-id glossary** of the system's core aggregates,
   external systems, and actor roles.
2. **Triage** (`prompts/02-triage.md`) — put the flow list to the human; agree which flows get
   individual traces vs. pattern exemplars; agree coverage depth and delivery.
3. **Deep-trace** — write the shared briefing (`prompts/03-trace-briefing.md`, filled with repo
   root, excludes, the glossary, and a link to `schema/flows-schema.md`). **Run one pilot trace,
   read its "schema friction", fix the schema/briefing**, then run the rest in waves (~7
   concurrent). Each trace agent verifies **reachability** (catches dead/superseded flows), traces
   end to end, and **writes its own `<flow-id>.json` + `.notes.md`** — never route large JSON back
   through your context.
4. **Merge & check** — `node tools/merge-flows.js <tracesDir> <out>/model/flows.json` merges shared
   nodes and validates. Do a consistency pass for ubiquitous-language drift; don't force-merge
   legitimate altitude variations.
5. **Generate & verify** — `node tools/generate-views.js <out>/model/flows.json <out>/model
   --repo-root <abs> --title "<Project> Event Storming"` emits `flows.dot` + `explorer.html`.
   Open the explorer and verify it renders. Write the README. Leave committing to the user.

## Guardrails

- **Never read the whole codebase in your own context** — delegate; keep conclusions, not dumps.
- **Persist every sub-agent return immediately** — assume your context can be summarized mid-run.
- **This is a code-derived scaffold, not a workshop wall.** It's always-true and a great
  conversation starter, but it doesn't capture timeline order, bounded contexts, swimlanes, or the
  human hotspots a live workshop surfaces. Say so in the deliverable, and treat the hotspots (the
  code-anchored questions) as the handoff to those conversations.
- If an `event-storming-modeling` reference/skill is available, load it first for the sticky
  vocabulary and grammar this method depends on.

## What's in this skill

- `prompts/` — the orchestrator playbook, the five scout templates, the triage step, the trace briefing.
- `schema/flows-schema.md` — the node/edge/flow contract every trace conforms to.
- `tools/merge-flows.js`, `tools/generate-views.js` — merge+validate, and render DOT+explorer.
- `examples/toy-shop/` — a tiny synthetic model you can build in seconds to see the output shape:
  `node tools/merge-flows.js examples/toy-shop/traces examples/toy-shop/model/flows.json && node tools/generate-views.js examples/toy-shop/model/flows.json examples/toy-shop/model --title "Toy Shop Event Storming"`
