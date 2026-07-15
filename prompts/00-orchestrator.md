# Orchestrator playbook

You are the **orchestrator**. You do not read the whole codebase yourself — you dispatch
sub-agents, keep the durable artifacts, and make the judgment calls. Your context stays
clean because the file-reading happens inside sub-agents; you keep only their structured
returns.

Placeholders to fill in before you start:
- `{REPO_ROOT}` — absolute path to the target checkout.
- `{EXCLUDE}` — glob/paths to skip in every search (build output, vendored deps, worktrees,
  generated code). Sub-agents must be told these explicitly.
- `{SCRATCH}` — a scratch dir for intermediate files (inventory reports, trace briefing).
- `{OUT}` — the deliverable dir (e.g. `docs/event-storming/` in the target repo).

Load the `event-storming-modeling` skill (or the equivalent reference) first if available;
it defines the sticky vocabulary and the grammar the whole method depends on.

## Phase 1 — Inventory (parallel scouts)

Spawn the five scouts in `01-scouts.md` **concurrently**, each read-only, each told `{EXCLUDE}`.
They enumerate every entry point so nothing is missing from the map:
1. UI entry points  2. Automations/background  3. API/auth/protocol  4. External integrations
5. Data layer & implied aggregates.

As each returns, **persist its report** to `{SCRATCH}/inventory/NN-*.md` so nothing is lost if
your context is summarized. When all five are in, merge them into a single **flow-candidate
inventory** (`{SCRATCH}/inventory/flow-candidates.md`): a numbered list of Tier-1 flows to trace
individually, Tier-2 pattern families (trace one exemplar, list the rest), an excluded-with-reason
list, and a first pass at cross-cutting hotspots.

**Also derive the shared-id glossary** from the data-layer scout's implied aggregates plus the
external-systems scout: the handful of core aggregates, external systems, and actor roles that
recur. Every trace agent gets this glossary so they converge on the same node ids.

## Phase 2 — Triage (with the human)

Present the flow-candidate inventory to the user and agree coverage: which flows get individual
deep traces, which collapse into pattern exemplars, what's excluded. Coverage tiers:
- **Full inventory, tiered depth** (default): enumerate everything; deep-trace core domain flows,
  collapse repetitive CRUD into one traced exemplar + a listed instance set.
- **Core only**: skip generic admin/CRUD entirely.
- **Exhaustive**: every entry point individually (expensive).

## Phase 3 — Deep-trace (a pilot, then waves)

Write the shared **trace briefing** (`03-trace-briefing.md`, filled with `{REPO_ROOT}`,
`{EXCLUDE}`, the shared-id glossary, and the path to `schema/flows-schema.md` + a conformant
example) to `{SCRATCH}/trace-briefing.md`.

1. **Run ONE pilot trace first.** Pick a meaty write flow. When it returns, read its
   "schema friction" section and fix the schema/briefing before spending on the rest. (This
   single step repeatedly pays for itself.)
2. **Then run the rest in waves** (~7 concurrent). Each agent: reads the briefing, verifies
   **reachability** (this is how dead/superseded flows get caught — chase `git log`/`git show`
   when a caller is missing), traces end to end, and **writes two files itself** to the traces
   dir: `<flow-id>.json` and `<flow-id>.notes.md`. Its chat reply is a short summary only —
   never route large JSON back through your context.
3. As waves land, re-run the merge to keep validating incrementally.

Give each trace agent enough of a hint to start (entry point, suspected services/tables) but
tell it to **verify, not trust** — the best findings are the contradictions.

## Phase 4 — Merge & consistency

`node tools/merge-flows.js <tracesDir> <out>/model/flows.json` — merges shared nodes,
accumulates per-flow tactical `usages`, and validates (all ids resolve, aggregates never issue
commands, invariants attach to aggregates). Then run a **consistency pass**: look for the same
concept modeled under different ids (ubiquitous-language drift), unresolved `supersededBy`, and
label conflicts on shared ids. Do NOT force-merge legitimate altitude variations (a generic
pattern node vs a specialized inline node in another flow) — each flow must stay independently
walkable.

## Phase 5 — Generate & verify

`node tools/generate-views.js <out>/model/flows.json <out>/model --repo-root {REPO_ROOT} --title "<Project> Event Storming"`
emits `flows.dot` and the self-contained `explorer.html`. **Open the explorer in a browser and
verify** it renders (sidebar lists flows, a flow renders a sticky lane, clicking a sticky opens
the tactical panel, hotspot cards show). Write the deliverable README. Leave committing to the user.

## Principles
- **Never read the whole codebase in your own context.** Delegate; keep conclusions, not file dumps.
- **Persist every sub-agent return immediately** — assume your context can be summarized at any point.
- **A code-derived model is a scaffold, not a workshop wall.** It is always-true and a great
  conversation starter, but it does not capture timeline order, bounded contexts, swimlanes, or
  the human hotspots a workshop surfaces. Say so in the deliverable.
