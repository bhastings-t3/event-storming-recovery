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
- **CHECK REACHABILITY AT BOTH ENDS.** A flow is `live` only if a real actor can reach it end to end.
  Verify reachability *outward to the trigger* AND *through to the final effect* — do not stop in the
  middle of the chain.
  - **Outward — this is the trap that bites most: a handler that exists and is DI-registered is NOT
    proof of reachability.** Trace from your entry method OUTWARD until you reach a concrete affordance
    an actor can actually use — a *rendered* UI control, a *registered* route, or a scheduled/DI-wired
    entry point — or you hit a dead end. Concretely: grep the method's callers (`grep "MethodName("`);
    if a popup/dialog/modal runs the action, find who sets its `Visible`/open flag `true` and confirm
    THAT setter has a live caller; if the control is gated (`@if (flag)`, `*ngIf`, `v-if`, a permission
    check), find where the gate is actually satisfied — a Save button behind `@if (hasChanges)` where
    `hasChanges` is only ever set `false` is DEAD; for a grid/table row action, confirm the delete/edit
    affordance actually renders (a command column, `AllowDelete`, an action button/menu item), not just
    that a `DataItemDeleting`-style event handler is wired. The classic **dead-code trap** is verifying
    the TAIL of a chain (button-inside-popup → confirm → service, DI ok) while the HEAD is unwired
    (nothing opens the popup) — and then "correcting" an earlier scout by declaring it live.
  - **Through — downstream: trace to the actual persisted state change / external call**, not just the
    first service hop. A method that returns early, no-ops behind a disabled flag, or writes nowhere is
    not the state change the flow claims.
  - When the trigger is missing, chase `git log`/`git show` for when/why it was removed. **Dead-but-
    armed code** (service still present and DI-registered, but no live trigger) is a `dead`/`superseded`
    flow AND a hotspot — never a `live` flow. Set `status` (`live | dead | superseded`, with
    `supersededBy` when you can identify the replacement); a hotspot hung off an unreachable path must
    say the risk is latent (real only if the path is re-wired).

- **`dead` is a POSITIVE claim — a failed search is not proof of death (guard against false-dead).**
  Reachability is asymmetric: proving `live` needs ONE trigger; proving `dead` needs to show NO trigger
  exists *anywhere*, which a shallow or narrow search cannot. Before you downgrade a path to `dead` you
  MUST have done, and RECORDED in your notes, an exhaustive negative search:
  - grep the symbol **repo-wide, not just its file** (`grep -rn "SymbolName"`), for every caller,
    binding, and registration — and confirm each hit is itself absent or unreachable.
  - rule out the **indirect-invocation avenues a plain call-grep misses**: DI / auto-registration,
    reflection, interface or base-class dispatch (is it called through an interface?), event wiring by
    convention (a framework `EventCallback`/`@onclick`/handler a *parent* supplies, a `RenderFragment`
    a caller passes in), attribute/route tables, message/command dispatch, and **config- or DB-driven
    invocation** (a menu / route / permission / feature-flag row that names it). Widen the search until
    these are actually excluded — a private symbol with zero in-file references is genuinely dead, but a
    public/virtual/interface member needs the wider sweep.
  - prefer **positive evidence of death**: `git log -S`/`git show` proving the trigger was *removed*
    (and read the diff to confirm it — do NOT assert "removed in commit X" you have not actually shown;
    a fabricated provenance is worse than none). "It was deleted in <verified commit>" beats "I grepped
    and found nothing"; "I grepped exhaustively and found nothing" beats a hunch; a hunch is not enough.
- **When you searched and still cannot confirm either way, the honest answer is a HOTSPOT, not `dead`.**
  "I could not find a live trigger after <the searches you ran>" is not the same as "there is no
  trigger." Keep the flow, and raise a reachability hotspot that STATES WHAT YOU SEARCHED and the
  specific open question (is this reached via <the dynamic/config mechanism you suspect>, or is it
  dead?). Absence of evidence is a question for a human, never a `dead` verdict on a hunch — the cost of
  a false-dead (erasing a real, live pathway from the map) is as bad as a false-live.
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

## Before you return — reachability self-check
For EVERY write/command path in your flow, resolve it to exactly ONE of three outcomes, and record
which (with evidence) in your notes:
1. **LIVE** — you found the concrete `file:line` of the affordance an actor uses to START it: the
   *rendered* button (not just its handler), the mapped route, the cron/DI registration. Name it.
2. **DEAD / SUPERSEDED** — you have POSITIVE evidence no live trigger exists: a verified `git` commit
   that removed it (diff read), or a recorded repo-wide search of the symbol *and its indirect-
   invocation avenues* showing every path is absent/unreachable. Record the searches you ran.
3. **UNCERTAIN → HOTSPOT** — you searched and cannot confirm either way (it might be reached by
   reflection / DI / config you can't see). Do NOT guess `dead`. Keep the flow and raise a reachability
   hotspot stating what you searched and the open question.

"The service exists and is DI-wired" answers none of these. Failing to find a trigger is outcome **3**,
not outcome 2 — never mark a path `dead` just because your search came up empty, and never assert a
removal commit you have not actually shown. A false-dead erases a real pathway; treat it as seriously
as a false-live.

## Output contract
WRITE two files with your Write tool (do NOT put the JSON in your final chat message):
1. `{TRACES_DIR}/<your-flow-id>.json` — `{ "nodes": [...], "flows": [...], "hotspots": [...] }`
   for YOUR flow only, schema-conformant, valid JSON (no comments, no trailing commas). Include
   `symbol` on anchors.
2. `{TRACES_DIR}/<your-flow-id>.notes.md` — surprises, contradictions with the hints, invariants
   found, unresolvable items, human questions; plus a `## Schema friction` section (write "None."
   if none). **The pilot's schema-friction section is what tunes the schema before the full run —
   be candid and specific.**

Your final chat message must be SHORT (files carry the detail): flow status (live/dead/superseded) and
**the reachability verdict backing it — LIVE: the trigger `file:line`; DEAD: the positive evidence
(verified removal commit, or the exhaustive negative search you ran); UNCERTAIN: the reachability
hotspot you raised instead of guessing dead** — a 3-5 sentence summary, the hotspot ids you created
with one line each, node count, and confirmation both files were written.

## Modeling rules agents most often get wrong
- Aggregates never issue commands. Policies are strictly "whenever `<event>` then `<command>`";
  inline synchronous reactions get `"synchronous": true`.
- **Separate store OR separate failure window ⇒ separate command via a policy.** Same store + same
  transaction = one command, one event.
- Events = past-tense business facts, few and meaningful. Commands = imperative.
- AI / file-parsing / ETL pipeline stages are NOT aggregates or policies — keep them in the command's
  tactical detail; promote only domain-significant facts to events (the two-plane model).
- Read models are what actors read to decide (grids, projections, downloaded files).
