# Deep-trace agent briefing (Phase 3)

This is the shared briefing every trace agent reads. The orchestrator fills the placeholders,
appends the **shared-id glossary** and a **conformant example**, and writes it to the scratch
dir. Each trace agent is then dispatched with a short, flow-specific task that points here.

---

You are recovering a STRATEGIC event-storming flow from tactical code in the repo at
`{REPO_ROOT}`. This is a services-and-repositories codebase with no tactical DDD — aggregates
and events are RECOVERED, so mark `inferred: true`.

EXCLUDE from all searches: `{EXCLUDE}`.

## Required reading
1. `docs/flows-schema.md` — the output schema. Follow it exactly.
2. `{EXAMPLE_PATH}` — a conformant reference trace from the pilot. Match its shape and depth.
3. `prompts/recursive-exploration.md` — the recursion protocol you operate under (appended below
   if not readable). You are not a leaf: chase high-signal pathways by spawning your own agents.

## Method
- Trace END TO END: trigger → validation/guards → orchestration → every state change (which
  tables, which database/store) → external calls → what the actor sees afterward. Read the actual
  code, method by method, for the core chain. **Do not trust the hints you were given — verify them
  and report contradictions.** The best findings are the contradictions.
- **CHECK REACHABILITY.** Confirm the entry point is actually wired (a caller exists, the route is
  registered, the button renders, DI is registered). If callers are missing, use `git log`/`git show`
  to find when and why it was removed, and set the flow's `status` accordingly (`live | dead |
  superseded`, with `supersededBy` when you can identify the replacement).
- Note every INVARIANT (a check that can reject the action) as an `invariant` node attached to its
  aggregate via an `enforces` edge.
- **Recurse into high-signal pathways** per `prompts/recursive-exploration.md`: when the trace
  hits a hub, a contradiction, an unfamiliar subsystem, or a branch that forks the model, spawn
  your own sub-agents to chase it (they may recurse further). Do the main trace spine reading
  yourself; delegate the deep side-branches and keep their conclusions, not their file dumps.
- Where intent is unrecoverable from code, or behavior looks accidental/risky, create a **hotspot**
  with the specific QUESTION A HUMAN SHOULD ANSWER.

## Shared node ids
Reuse these exact ids when the concept appears; invent well-named ids (correct type prefix) for
everything else. Touching a shared node? Give it tactical anchors for YOUR flow's usage — the merge
accumulates per-flow usages and keeps the richest description.

> {SHARED_ID_GLOSSARY}   ← orchestrator injects the project's core aggregates, external systems,
> and actor roles here (e.g. `actor-staff`, `agg-order`, `ext-erp`, ...).

## Output contract
WRITE two files with your Write tool (do NOT put the JSON in your final chat message):
1. `{TRACES_DIR}/<your-flow-id>.json` — `{ "nodes": [...], "flows": [...], "hotspots": [...] }`
   for YOUR flow only, schema-conformant, valid JSON (no comments, no trailing commas). Include
   `symbol` on anchors.
2. `{TRACES_DIR}/<your-flow-id>.notes.md` — surprises, contradictions with the hints, invariants
   found, unresolvable items, human questions; plus a `## Schema friction` section (write "None."
   if none). **The pilot's schema-friction section is what tunes the schema before the full run —
   be candid and specific.**

Your final chat message must be SHORT (files carry the detail): flow status (live/dead/superseded),
a 3-5 sentence summary, the hotspot ids you created with one line each, node count, and confirmation
both files were written.

## Modeling rules agents most often get wrong
- Aggregates never issue commands. Policies are strictly "whenever `<event>` then `<command>`";
  inline synchronous reactions get `"synchronous": true`.
- **Separate store OR separate failure window ⇒ separate command via a policy.** Same store + same
  transaction = one command, one event.
- Events = past-tense business facts, few and meaningful. Commands = imperative.
- AI / file-parsing / ETL pipeline stages are NOT aggregates or policies — keep them in the command's
  tactical detail; promote only domain-significant facts to events (the two-plane model).
- Read models are what actors read to decide (grids, projections, downloaded files).
