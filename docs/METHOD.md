# The method

This is the reasoning behind the six phases — why the process is shaped the way it is, so you can
adapt it rather than follow it blindly. The runnable version is `prompts/00-orchestrator.md`; this
document explains it.

## The problem

A long-lived codebase accumulates behavior faster than it documents intent. The *tactical*
implementation is all there — controllers, services, repositories, SQL — but the *strategic* view
(what the system does, why, and how its flows connect) lives only in people's heads, and leaves when
they do. Event Storming is the usual way to rebuild that view, but a from-scratch workshop is
expensive and still misses what the code actually does today.

This method recovers a **first-draft strategic model directly from the code**, cheaply and
repeatably, so a workshop (or an onboarding, or a refactor plan) starts from something concrete and
always-true instead of a blank wall.

## Why orchestration, not one big read

A single agent reading a large codebase drowns: its context fills with file dumps, it loses the
thread, and its conclusions get vaguer as it goes. So the orchestrator **never reads the codebase
itself**. It spawns focused sub-agents, each of which reads deeply in a narrow lane and returns a
small structured result. The orchestrator keeps the results, not the files. This is what lets the
process scale to a system with dozens of flows without the driver losing coherence.

Two rules make it robust:
- **Persist every sub-agent return immediately** to disk. Assume the orchestrator's context can be
  summarized at any moment; the durable artifacts (inventory reports, trace JSONs) must survive that.
- **Sub-agents write their own large outputs** (the trace JSON files) rather than returning them in
  chat. Routing a 30 KB JSON back through the orchestrator's context, times 26 flows, is how you run
  out of room. The orchestrator only ever sees each agent's short summary.

### Recursion is the spine, not a fallback

The scouts and trace agents are not flat leaves. A single scout covering "data layer" or a single
tracer covering "quoting" will itself hit pathways richer than its brief — a hub table touched by a
dozen flows, a contradiction between a hint and the code, an unfamiliar subsystem. The method's
answer is the same fractal move the orchestrator makes: **the agent spawns its own sub-agents to go
deep on that branch and keeps only their conclusions.** `prompts/recursive-exploration.md` is the
shared protocol every agent in the tree inherits; depth and fan-out are aggressive, the return
contract (files out, conclusions + anchors back) is fixed, and convergence — a child that comes back
without changing the model — is the brake. This is what lets the process go arbitrarily deep into a
large system without any one context filling up.

Two things make it real rather than aspirational, and both are easy to get wrong:

- **Agent type.** Nested spawning works (verified, and documented in Claude Code since v2.1.172,
  capped at depth 5), but only for agent types that carry the `Agent` tool. Spawn recursion-capable
  roles as `general-purpose`/`claude`; a `read-only` scout spawned as the `Explore` type *cannot*
  recurse (that type has no `Agent` tool), which silently flattens the whole method. "Read-only" is
  a brief, not a type.
- **Model tier.** Default every tool-calling agent to Opus. It is tempting to put a large fan-out of
  tracers on a small, cheap model, but a weaker model on a tool-heavy task reads more, flails more,
  and burns more tokens than it saves. Reserve the step down to Haiku for genuinely simple,
  tool-light steps (summarize/condense). The economy is in fewer, sharper reads, not a cheaper
  per-token rate.

And the tree is **dynamic, not flat**. A sub-agent is not a leaf that reads its lane once and
stops: when it hits a high-signal pathway (a hub many flows route through, a contradiction with
its hint, an unfamiliar subsystem, a branch that forks the model) it spawns its *own* sub-agents
to chase that pathway, and those may recurse again. Depth follows the signal: the method spends
where a branch keeps changing the model and cuts branches that go quiet. Crucially this costs the
orchestrator nothing, because every agent in the tree obeys the same return contract (write
artifacts to files, report conclusions plus code anchors), so a four-level-deep exploration still
lands in the orchestrator's context as a one-paragraph summary. The full protocol is
`prompts/recursive-exploration.md`, which every scout, trace agent, and glossary miner inherits.

## Phase 1 — Inventory: five scouts, five lanes

You can't trace flows you haven't found. Five scouts run in parallel, each covering one kind of
entry point, because these are genuinely different search problems:

1. **UI** — routable screens and interactive components (what users initiate).
2. **Automations** — schedulers, background workers, startup behavior, queue consumers (what runs
   with no user).
3. **API / auth / protocol** — controllers, webhooks, sign-in, and any separate protocol servers.
4. **Integrations** — every boundary to an external system, and every call site (this is what later
   attaches an external system to the flows that use it).
5. **Data layer** — repositories → tables → writes, and the **implied aggregates**: clusters of
   entities that change together. In a services-and-repositories codebase there are no explicit
   aggregates, so this scout recovers the candidate boundaries the whole model hangs on. It also
   flags hidden state-change logic (stored procedures, triggers) that no amount of application-code
   reading would reveal.

The scouts' combined output is a **flow-candidate inventory** and — critically — a **shared-id
glossary**: the handful of core aggregates, external systems, and actor roles that recur across the
system. Handing every trace agent the same glossary is what makes independent agents converge on
`agg-order` instead of inventing `order`, `customer-order`, and `orders-aggregate` separately. The
glossary is why the finished flows join into one map.

## Phase 2 — Triage: the one cheap human checkpoint

Before spending on a fleet of traces, put the candidate list to a human. Their system knowledge is
never cheaper to apply than here: they can tell you which "flows" are really one flow, which admin
screens are 30 copies of the same pattern (trace one, list the rest), and which apparent flow is dead.
Agree coverage depth (everything-tiered vs. core-only vs. exhaustive) and where the artifact lives.

## Phase 3 — Deep-trace: pilot first, then waves

**Run one pilot trace before the rest.** The first trace always surfaces gaps in the schema and the
briefing — a case the grammar didn't cover, an ambiguity in how to model a UI-vs-service split. Each
trace agent reports a "schema friction" section for exactly this. Fix the schema and briefing once,
against the pilot, and every subsequent trace inherits the fix. Skipping the pilot means discovering
the same gap 26 times.

Each trace agent:
- **verifies reachability first — at both ends.** Is the entry point actually reachable by a real
  actor? Verify *outward to the trigger* and *through to the final effect*, not just the middle. The
  trap that bites most: "the handler exists and is DI-registered" is **not** reachability — a Save
  button gated by a flag that is never set true, a popup nothing opens, a grid whose delete affordance
  never renders, are all **dead-but-armed** (the service compiles and is wired, but no actor can start
  it). Trace outward until you reach a *rendered* control, a *registered* route, or a scheduled/DI
  entry — or a dead end. Before calling a write path `live`, name the concrete `file:line` an actor
  uses to start it. But reachability is **asymmetric**, and false-*dead* is as costly as false-live
  (it erases a real pathway from the map): `dead` is a *positive* claim that needs positive evidence —
  a verified removal commit, or an exhaustive repo-wide search that also rules out indirect invocation
  (DI, reflection, interface dispatch, event wiring a parent supplies, config/DB-driven dispatch). A
  trigger you searched for but couldn't confirm is a **reachability hotspot** (state what you searched
  and the open question), *not* a `dead` verdict on a hunch. When the trigger is missing, chasing `git log`/`git show`
  recovers *why* it was removed, which is often the most valuable finding in the whole model. Dead and
  superseded flows get a `status` and a `supersededBy` link, and are traced anyway — the delta
  between the dead flow and its replacement is recovered intent you can't get any other way.
- **traces end to end and distrusts its hints.** The orchestrator gives each agent a starting point,
  but tells it to verify, not trust. The contradictions between the hint and the code are signal.
- **records invariants and hotspots.** An invariant is a check that can reject the action (it hangs
  off the aggregate). A hotspot is a place where intent is unrecoverable from code or behavior looks
  risky — framed as *the question a human should answer*, anchored to the source. The hotspots are
  the handoff from "here's what the code does" to "here's what the team needs to decide."

Run the rest in waves of a handful concurrent, re-merging as they land so validation stays green
incrementally.

## The two-plane rule (don't force the grammar)

Event Storming's command/aggregate/event/policy grammar is built for **transactional** domains: an
actor issues intent, an aggregate guards invariants, a decision can be rejected. A **dataflow /
pipeline** stretch (AI transforms, file parsing, ETL, sensor/inference chains) is a different plane:
it continuously transforms immutable records and *can't reject* anything. Forcing stickies onto it
produces noise. Model two planes joined at a named seam (an anti-corruption layer / translation
step): everything on the dataflow side is plumbing that lives in a command's tactical detail, and
only the domain-significant facts crossing the seam get promoted to events. When a trace hits a
pipeline, keep the transforms as tactical notes and promote just the meaningful outcome.

## Phase 4 — Merge & consistency

`merge-flows.js` combines the per-flow slices, unifies shared nodes (accumulating a per-flow
`usages` entry on each so the explorer can show flow-specific tactical detail), and enforces the
structural rules: every referenced id resolves, aggregates never issue commands, invariants attach
to aggregates. Then a human-judgment consistency pass looks for **ubiquitous-language drift** — the
same concept under two ids — and unresolved supersession links.

One thing *not* to do: don't force-merge legitimate **altitude variations**. A generic
`cmd-attach-file` in a "file attachment pattern" flow and a specialized `cmd-attach-files-to-line`
inline in an ordering flow are the same action at two altitudes; collapsing them breaks the ability
to walk each flow as a self-contained story. Keep them distinct; the shared *aggregates* and
*external systems* are what carry the connective tissue.

## Phase 5 — Ubiquitous Language mining

The behavioral model captures what the system *does*, but not the **vocabulary** it does it in. A
newcomer opening this codebase drowns in jargon — `REVBUILD`/`ORDERBUILD`, Budget Stage, Turnkey,
GPW, PIM, SKU, Design PO — none of which is a sticky; it lives *inside* the descriptions and the
code. The consistency pass in Phase 4 already brushes against this (it hunts ubiquitous-language
drift). Phase 5 promotes that into a first-class artifact: a curated **glossary** of the domain
terms and their definitions, distinct from the 400-odd behavioral stickies.

It is a wave, like the traces: a handful of agents each own a slice of the model, **seed** candidate
terms from the node labels/descriptions (which already name most of the vocabulary), then read code
only where a term's meaning isn't already clear — to write a precise definition and anchor it. The
key move is the **hotspot borrowing**: a term the mining can't fully resolve is not dropped, it is
*flagged* — it keeps what was learned and states the specific question a human should answer. A
glossary that honestly marks its own gaps is worth more than one that hides them. The terms merge
into the model like nodes, are validated (a flagged term must carry its question; links must
resolve), and render in the explorer's **Glossary** tab with the flagged ones marked.

Why a separate phase and not part of tracing: terms are a *cross-cutting* view. The same concept
shows up in many flows, and its best definition often needs the whole model in view — so it is
cheaper and more consistent to mine once, after the merge, than to have every trace agent
re-describe the shared vocabulary. (Trace agents may jot candidate jargon into their notes to seed
this phase; the mining consolidates it.)

## Phase 5.5 — Data mapping (optional)

The behavioral model deliberately abstracts storage away: a read model is "what an actor reads to
decide," an aggregate is "state that changes together" — neither says *what data it returns* or
*where that data lives*. That join (behavior ↔ storage) is the one thing a services-and-repositories
codebase keeps in plain sight (the tables are right there in the SQL) yet never records as a whole.
Phase 5.5 recovers it: a wave of agents sweeps SQL literals, ORM/repository calls, and connection
strings (corroborated by migrations when they exist), and adds two things to the model — a `fields[]`
array on read models and aggregates, and a physical layer of just **two** technology-neutral node
types joined by `parent` containment and demand-driven `persists to`/`projects from`/`writes` edges. A
**`datastore`** is any container of data — a database, a file, a queue, a cache, an in-memory store —
that self-nests through `parent` to whatever depth the real storage has, with a `storeKind` label for
the concrete flavor (`server`/`database`/`table`, `filesystem`/`directory`/`file`, `broker`/`queue`,
…). A **`field`** is a stored attribute hanging off a datastore, with a `fieldKind` label
(`column`/`key`/`property`/`message-field`/…). The point is to describe storage as it actually is
rather than forcing relational words onto files, queues, and caches.

The load-bearing idea is that **a field on a read model or aggregate is a conceptual property, not a
column alias.** A read model's `total` may be a sum across joined rows; an aggregate's `status` may be
assembled in app code; some fields are computed and never stored. So every field carries a prose
*derivation* over **0..N** sources (zero is valid), and keeps two signals apart: `conceptual`
(consumers see it) versus `confidence` (we trust its derivation). Physical nodes are `inferred: false`
— the inverse of the behavioral layer — because the code literally names them. Like every other layer
it stays **demand-driven**: only the fields a conceptual field references appear, never a full-schema
dump. It renders in the explorer's **Data model** tab and the detail panel's *Data returned / State &
fields* sections, and is exposed over MCP so a connected Claude terminal can answer "what does this
return, and where does it come from."

## Phase 6 — Generate & verify

`generate-views.js` renders the canonical model to a Graphviz DOT (one cluster per flow, Event
Storming fill colors, node URLs into source) and a **self-contained** `explorer.html` (the model is
embedded; no server, no network). Actually open the explorer and confirm it renders — a model that
validates structurally can still surface a layout bug. Then write the deliverable README, and leave
committing to the human.

## Why the artifact is shaped this way

- **`flows.json` is canonical; views are generated.** You never hand-edit the DOT or the HTML; you
  edit traces and regenerate. This keeps the model diffable and the views disposable.
- **Every sticky carries source anchors.** The whole point is to move between the strategic and
  tactical planes freely. A strategic node with no way back to the code is a dead end.
- **Hotspots are questions, not verdicts.** A recovered model is a hypothesis about intent. The
  honest output of reading code you didn't write is "here is what it does, and here is what I can't
  tell — someone who knows the business needs to answer these."

## Adapting it

The prompts are stack-flavored (the scout examples lean toward a .NET/SQL shape) but the structure is
universal — swap the stack-specific hints for your ecosystem's equivalents. The schema is deliberately
small; extend it when a domain needs a concept it lacks (the pilot loop is where you'll notice), and
regenerate. The method improves the same way the models do: iterate on the prompts and the schema,
re-run, compare.
