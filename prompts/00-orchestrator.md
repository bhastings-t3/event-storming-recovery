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

**Every sub-agent you dispatch inherits the recursion protocol in `prompts/recursive-exploration.md`.**
Scouts, trace agents, and glossary miners are not flat leaves: when one hits a high-signal
pathway (a hub, a contradiction, an unfamiliar subsystem, a model-forking branch) it spawns its
own sub-agents to chase it, and those may recurse further. Include the protocol (or a pointer to
it) in every briefing you write, alongside the shared-id glossary. The budget is aggressive on
depth and fan-out but strict on the return contract: every agent in the tree writes its artifacts
to files and reports conclusions plus anchors, never dumps, so your context stays clean no matter
how deep the tree goes.

## Agent types & model tiering (applies to every spawn)

Recursion is the spine of this method, not a fallback — so **every agent you spawn must be able to
spawn its own children.** That is a function of the agent type, not the prompt:

- **Spawn scouts, trace agents, and glossary miners as `general-purpose` (or `claude`).** These
  carry the `Agent` tool, so they can recurse per `prompts/recursive-exploration.md`.
- **Never spawn a recursion-capable role as `Explore` or `Plan`.** Those types are defined as "all
  tools except `Agent`", so they are forced leaves — they physically cannot spawn children, which
  silently collapses the method back to a flat fan-out. ("Read-only scout" describes the *behavior*
  you brief — inventory, don't mutate — not the `Explore` type.)
- The harness caps nesting at **depth 5** (main conversation = 0), which leaves your first-wave
  agents ~4 further levels; convergence, not the cap, should be the real brake.

**Model tiering — default to Opus.** Anything that calls tools (reads code, greps, traces, mines,
and the orchestrator itself) runs on **Opus**: a weaker model on a tool-heavy task flails, reads
more, and burns more tokens than it saves. Only step **down to Haiku** for a genuinely simple,
tool-light step whose whole job is to summarize or condense text. Do not put the tracing/scouting
fan-out on a small fast model — that is a false economy.

## Phase 1 — Inventory (parallel scouts)

Spawn the five scouts in `01-scouts.md` **concurrently** (as `general-purpose`/`claude` so they can
recurse — see agent types above), each briefed read-only, each told `{EXCLUDE}`.
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
`{EXCLUDE}`, the shared-id glossary, and the path to `docs/reference/flows-schema.md` + a conformant
example) to `{SCRATCH}/trace-briefing.md`.

1. **Run ONE pilot trace first.** Pick a meaty write flow. When it returns, read its
   "schema friction" section and fix the schema/briefing before spending on the rest. (This
   single step repeatedly pays for itself.)
2. **Then run the rest in waves** (~7 concurrent). Each agent is a **recursion root**, not a leaf
   (`prompts/recursive-exploration.md`): it reads the briefing, verifies **reachability at both ends**
   (outward to the actual actor-reachable trigger — NOT just "the handler exists and is DI-registered";
   a control gated by a flag that is never set, or a popup nothing opens, is dead — and through to the
   real state change; this is how dead/superseded flows get caught — chase `git log`/`git show` when a
   trigger is missing. But `dead` is a *positive* claim: a path is only dead on an exhaustive repo-wide
   search (incl. indirect DI/reflection/config invocation) or a verified removal commit; a trigger you
   simply couldn't find becomes a reachability *hotspot*, never a `dead` guess — a false-dead erases a
   real pathway), traces the main spine itself, **spawns its own sub-agents to chase high-signal side-branches**
   (hubs, contradictions, unfamiliar subsystems), and **writes two files itself** to the traces
   dir: `<flow-id>.json` and `<flow-id>.notes.md`. Its chat reply is a short summary only —
   never route large JSON (its own or its subtree's) back through your context.
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

## Phase 5 — Ubiquitous Language mining

With the merged model in hand, mine the **curated domain vocabulary** — the nouns and jargon a
newcomer needs defined (`REVBUILD`, Budget Stage, Turnkey, GPW, PIM, SKU, …), which the behavioral
stickies never capture on their own. Write the mining briefing (`04-glossary-mining.md`, filled with
`{REPO_ROOT}`, `{EXCLUDE}`, the merged `flows.json` path, the *Term* schema, and `{TRACES_DIR}`) and
dispatch a **wave of ~5-7 agents**, each owning a slice (a bounded area / aggregate cluster). Run
**one pilot mine first**, read its schema-friction, then the rest. Each agent seeds terms from the
model's node descriptions, reads code only to resolve/anchor the unclear jargon, **flags** whatever
stays uncertain with a specific `openQuestion` (the hotspot contract), and **writes its own
`<area>.glossary.json` + `.notes.md`** into `{TRACES_DIR}`. Then **re-run the merge** — it folds the
`terms` in, validates them (dangling `relatedNodes`, flagged-without-question), and counts them.

## Phase 5.5 — Data mapping (optional but recommended)

With the merged model in hand, recover the **data model**: what each read model / aggregate returns
and the physical storage (datastore/field — whatever the storage actually is) the code touches,
cross-linked to the behavioral nodes. This is the layer the behavioral stickies deliberately abstract
away, and it is what lets a developer answer "what does this read model return and where does it come
from." Write the mapping briefing (`05-data-mapping.md`, filled with `{REPO_ROOT}`, `{EXCLUDE}`, the
merged `flows.json` path, the **Data model** section of `docs/reference/flows-schema.md`, and `{TRACES_DIR}`) and
dispatch a **wave of ~5-7 agents**, each owning a slice. Run **one pilot first**, read its
schema-friction, then the rest. Each agent discovers storage from SQL literals + connection strings
(corroborated by migrations when present), adds `datastore` (+`storeKind`) and `field` (+`fieldKind`)
nodes and `fields[]` with lineage, cross-links them with `persists to`/`projects from`/`writes` edges,
**flags** dynamic SQL it can't pin down, and **writes its own `<area>.data.json` + `.notes.md`** into
`{TRACES_DIR}`. Then **re-run the merge** — it folds the physical nodes in, unions `fields` onto
existing nodes by name, and validates lineage refs + `parent` containment. Keep it demand-driven: only
the fields a conceptual field references, never a full-schema dump.

## Phase 6 — Generate & verify

`node tools/generate-views.js <out>/model/flows.json <out>/model --repo-root {REPO_ROOT} --title "<Project> Event Storming"`
emits `flows.dot` and the self-contained `explorer.html`. **Open the explorer in a browser and
verify** it renders (sidebar lists flows, a flow renders a sticky lane, clicking a sticky opens
the tactical panel, hotspot cards show, the **Glossary** tab lists the curated terms with flagged
ones marked, and — if you ran Phase 5.5 — the **Data model** tab shows the datastore tree
(server▸database▸table, or filesystem▸directory▸file, …) and read-model/aggregate detail panels list
their **Data returned / State & fields**).
Write the deliverable README. Leave committing to the user.

## Principles
- **Never read the whole codebase in your own context.** Delegate; keep conclusions, not file dumps.
- **Recursion is the spine, and the return contract is fixed.** Sub-agents recurse aggressively into
  high-signal pathways (`prompts/recursive-exploration.md`) — this is the default traversal, which is
  why every role is spawned as a spawn-capable type on Opus. The whole tree still writes artifacts to
  files and returns only conclusions + anchors, so depth never reaches your context.
- **Persist every sub-agent return immediately** — assume your context can be summarized at any point.
- **A code-derived model is a scaffold, not a workshop wall.** It is always-true and a great
  conversation starter, but it does not capture timeline order, bounded contexts, swimlanes, or
  the human hotspots a workshop surfaces. Say so in the deliverable.
