# flows.json schema — the canonical strategic model

Every per-flow trace conforms to this schema. The merge tool combines many traces into
one `flows.json`; the generator renders it to a DOT graph and an interactive explorer.

Top level:
```json
{
  "version": 1,
  "meta": { "title": "<Project> Event Storming", "repoRoot": "/abs/path/to/checkout" },
  "nodes": [ ... ],   // deduped stickies, shared across flows
  "flows": [ ... ],
  "hotspots": [ ... ] // red stickies, referenced from flows
}
```
`meta` is optional and mostly filled in by the merge tool (derived counts, glossary,
dead-flow index). `title`/`repoRoot` there act as fallbacks for the generator's
`--title` / `--repo-root` flags.

## Node
```json
{
  "id": "agg-order",               // prefix by type: actor- cmd- agg- evt- pol- rm- ext- inv-
  "type": "actor | command | aggregate | event | policy | readModel | externalSystem | invariant",
  "label": "Order",                // ubiquitous-language name; events PAST TENSE ("OrderPlaced"), commands IMPERATIVE ("PlaceOrder")
  "inferred": true,                // true when the concept is RECOVERED from code, not named in it (usually true)
  "ownedBy": "ext-erp",            // NEW, aggregates only, optional: this aggregate's state lives inside that external system
  "synchronous": true,             // NEW, policies only: true when the reaction is inline synchronous code, not a decoupled subscriber
  "description": "1-3 sentences: what this concept means in the domain.",
  "tactical": {
    "explanation": "How it is actually implemented: the call chain, key methods, data touched. Written for a developer stepping through the code.",
    "anchors": [
      { "path": "src/Services/OrderService.cs", "line": 84, "symbol": "PlaceAsync", "note": "orchestrator entry" }
    ]
    // "symbol" (method/handler/class) is strongly encouraged on every anchor — line numbers rot, symbols survive rebases.
  }
}
```
Rules:
- **Aggregates only RECEIVE commands and EMIT events; they never issue commands.** Commands
  come from actors, policies, or external systems.
- **Policy** = strictly reactive: "whenever `<event>` then `<command>`." A constraint checked
  *inside* an aggregate before an event is an **invariant** (type `invariant`), attached to
  the aggregate, NOT a policy.
- **Invariants** attach to their aggregate with an edge `{ from: <agg>, to: <inv>, verb: "enforces" }`.
  They carry `tactical.anchors` + `explanation`, and do NOT appear in flow `steps` (they hang off the aggregate).
- **Command lookups**: when a command must read other aggregates/read models before acting
  (gating data, join keys), use `{ from: <cmd>, to: <agg|rm>, verb: "reads" }`. Incidental
  lookups stay in `tactical.explanation` only.
- **UI-vs-service split rule**: if one user action produces writes in a *separate store* OR
  with a *separate failure window* (can succeed/fail independently of the first write), model
  the second write as its own command issued by a (usually synchronous) policy reacting to the
  first event. Same store + same transaction = one command, one event.
- **Events** are named business facts, past tense. "A row was inserted" is not an event;
  "OrderSubmitted" is.
- **Read models** are what an actor reads to decide (grids, views, projections, downloaded files).
- **External systems** are outside the deploy boundary (SaaS, other services, cloud APIs,
  legacy systems). In-process libraries are NOT external systems.
- `inferred`: almost always `true` in a services-and-repositories codebase. Set `false` only
  when the code literally names the concept.
- **Node ids are GLOBAL.** Reuse the same id whenever two flows touch the same concept (same
  aggregate, same external system, same actor). Shared nodes are how flows join into one map —
  open any flow and follow a shared aggregate into another. Before tracing a fleet of flows,
  agree a **shared-id glossary** for the recurring concepts of the target system (its core
  aggregates, external systems, and actor roles) and hand it to every trace agent, so
  independent agents converge on the same ids instead of inventing synonyms.

## Flow
```json
{
  "id": "place-order",
  "name": "Customer places an order",
  "tier": 1,             // 1 = individually traced domain flow; 2 = pattern exemplar traced once with listed instances
  "kind": "write | read | policy",
  "status": "live | dead | superseded",   // dead = unreachable code path; superseded = replaced but still reachable
  "supersededBy": "place-order-v2",        // optional: flow id that replaced this one (use with status dead/superseded)
  "summary": "2-4 sentences, plain language, what happens end to end and WHY (recovered intent).",
  "trigger": "Checkout button on the cart page",
  "steps": ["actor-customer", "cmd-place-order", ...],   // ordered left-to-right lane; ids must exist in nodes; NO invariants here
  "edges": [ { "from": "...", "to": "...", "verb": "..." } ],
    // verbs: issues | handled by | emits | triggers | updates | read by | reads | raises | enforces | calls | returns
  "hotspots": ["hot-double-charge"],   // hotspots attach at FLOW level only
  "instances": []   // tier-2 pattern flows only: [{ "label", "route", "file" }] per instance
}
```

## Hotspot
```json
{
  "id": "hot-double-charge",
  "label": "Retrying checkout can double-charge",
  "description": "What is uncertain/risky and WHAT QUESTION A HUMAN SHOULD ANSWER.",
  "tactical": { "explanation": "...", "anchors": [ ... ] }
}
```
Hotspots are the payoff of a code-derived model: they name the questions only a human who
knows the business can answer. Prefer a sharp question over a vague worry, and anchor it.

## Conventions
- Paths repo-relative with forward slashes, from repo root. Line = 1-based at trace time; include `symbol`.
- Every command, aggregate, event, policy, readModel, and invariant node MUST have
  `tactical.anchors` (>=1) and `tactical.explanation`. Actors and external systems: description
  required, tactical optional (encouraged for external systems).
- Branching is allowed: edges form a small DAG; `steps` is the suggested left-to-right ordering of the main path.
- Prefer few, meaningful events over one event per statement. A multi-table transactional write = one event from one aggregate.
- Dataflow/pipeline stages (AI transforms, file parsing, ETL steps) are NOT aggregates or
  policies; keep the pipeline in the command's tactical detail and promote only
  domain-significant facts to events (the two-plane model — see METHOD.md).
