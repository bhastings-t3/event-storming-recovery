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
  "id": "agg-order",               // prefix by type: actor- cmd- agg- evt- pol- rm- ext- inv- srv- db- tbl- col-
  "type": "actor | command | aggregate | event | policy | readModel | externalSystem | invariant | server | database | table | column",
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

## Data model (the physical layer)
A **demand-driven, not exhaustive** layer: only the servers/databases/tables/columns the
behavioral model actually references. No full-ERD dump. It answers "what data does this read
model/aggregate return, and where does it come from?"

### `fields[]` on readModel & aggregate nodes
Any node MAY carry `fields[]`. A field is a **conceptual property** (what consumers see) with a
prose `derivation` and **0..N storage sources** — never assume 1:1 field↔column; zero sources
(computed/constant/unknown) is valid.
```json
"fields": [
  {
    "name": "totalWithTax",          // conceptual field name consumers see (REQUIRED)
    "conceptual": true,              // recovered concept; may not exist verbatim in code
    "dataType": "money",             // best-effort logical type; omit/"unknown" rather than guess
    "derivation": "Sum of order_items.amount plus computed regional tax.", // prose, REQUIRED
    "sources": [                     // 0..N; empty = computed/constant/unresolved (still valid)
      { "ref": "col-order-items-amount", "role": "derived-from", "transform": "aggregation", "note": "SUM over lines" }
    ],
    "expression": "SUM(li.amount) + tax(o.region)", // optional literal fragment when one exists
    "confidence": "medium",          // high | medium | low — confidence in the DERIVATION
    "provenance": ["sql-literal"],   // append-only: sql-literal | connection-string | orm-mapping | migration | inferred-from-dto | assumed
    "evidence": [ { "path": "src/services/OrderService.ts", "line": 84, "symbol": "summary" } ],
    "sensitive": false,              // optional PII/masking flag
    "notes": ""                      // optional ambiguity note
  }
]
```
- `name` + `derivation` are REQUIRED (non-empty). `confidence`, `conceptual`, and each source's
  `role`/`transform` are validated against their enums as **warnings** (nonstandard is tolerated,
  like nonstandard edge verbs), not errors.
- `role` enum: `derived-from | filtered-by | joined-on | grouped-by | constant`.
- `transform` enum: `identity | transformation | aggregation | join | filter | lookup | constant`.
- `sources[].ref` that looks like a local physical node id (matches `^(col|tbl|db|srv)-`) MUST
  resolve to a known node → else ERROR. A raw dotted address (e.g. `"mssql://host/db.dbo.orders.total"`)
  is accepted as-is.
- **`conceptual` and `confidence` are independent signals:** `conceptual` = are we sure consumers
  see this field; `confidence` = how sure are we of its derivation/sources.

### Physical node types: `server | database | table | column`
Regular entries in `nodes[]`. Prefixes `srv- db- tbl- col-`. Containment is a **`parent` pointer**
(column→table→database→server), NOT an edge; if `parent` is set it MUST resolve to a known node.
```json
{ "id": "srv-shop", "type": "server", "label": "app-sql-01", "inferred": false,
  "engine": "sqlserver", "host": "app-sql-01.internal,1433",
  "provenance": ["connection-string"], "description": "Primary OLTP SQL Server instance." }
{ "id": "db-shop",    "type": "database", "label": "shop",  "parent": "srv-shop", "inferred": false, "ownedBy": null }
{ "id": "tbl-orders", "type": "table",    "label": "orders", "parent": "db-shop", "schema": "dbo", "kind": "table", "inferred": false }
{ "id": "col-orders-total", "type": "column", "label": "total_cents", "parent": "tbl-orders", "dataType": "int", "nullable": false, "inferred": false }
```
- `kind` on table: `table | view`. `engine` on server: freeform (`sqlserver | postgres | mysql | ...`).
- **Physical nodes default `inferred: false`** — the code literally names the table/column, the
  inverse of the behavioral layer's usual `inferred: true`.
- Physical nodes are **anchor-NOT-required** (like actor/externalSystem): description required, a
  config/SQL/migration anchor encouraged but not mandatory.
- **Provenance appends, never overwrites.** A migration that confirms a SQL-literal finding raises
  confidence; the code evidence stays.
- **Reconcile with `ownedBy`, don't duplicate it.** A `database`/`server` whose state is external
  MAY carry `ownedBy` to that external system; physical nodes are additive.

### Behavioral → physical edges (demand-driven satellites)
Live inside the flows that touch them. New verbs:
- `persists to` (aggregate → table), `projects from` (readModel → table), `writes` (command → table),
  `connects via` (command/readModel/aggregate → server). Reuse existing `reads` for read access.
- These are satellites: attach via edges, **do NOT add physical nodes to a flow's `steps` lane**.
  A node referenced only by another node's `parent` or by a `fields[].sources[].ref` counts as
  referenced and will not orphan-warn, so cited columns need no edge.

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
    //        | persists to | projects from | writes | connects via   (data-model verbs — see Data model)
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

## Term (ubiquitous language)
Terms live in a **top-level `terms` array** (alongside `nodes`/`flows`/`hotspots`) and are authored
by the **glossary-mining phase** (Phase 5), not the trace agents. They are the curated domain
vocabulary a newcomer needs defined — nouns and jargon — NOT one entry per sticky.
```json
{
  "id": "term-revbuild",              // globally unique, prefix "term-"
  "term": "REVBUILD",                 // the word/phrase as the domain uses it
  "category": "state",                // concept | jargon | acronym | role | system | state | metric
  "aka": ["Budget_Stage = REVBUILD", "revenue build"],   // optional: code spellings / synonyms
  "definition": "1-3 sentences: what the term means in the domain.",
  "relatedNodes": ["agg-line-item"],  // optional: model node id(s) this term maps to (must exist)
  "anchors": [ { "path": "...", "line": 12, "symbol": "..." } ],   // optional source evidence
  "status": "resolved",               // resolved | partial | unresolved   (default: resolved)
  "openQuestion": "..."               // REQUIRED when status != resolved: what a human should answer
}
```
Rules:
- **A term is vocabulary, not a sentence.** "A booth holds at most one turnkey package" is an
  invariant; the term is `Turnkey`. Do not mint a term per command/event — those live in the model.
- **Flag, don't drop.** When mining can't fully pin a term down, keep what you learned in
  `definition`, set `status` to `partial`/`unresolved`, and write the specific `openQuestion` — the
  same "question a human should answer" contract as a hotspot. The explorer renders flagged terms
  with a hotspot-style treatment.
- **Validation** (merge): `status != resolved` requires a non-empty `openQuestion`; a `resolved`
  term requires a `definition`; every `relatedNodes` id must resolve to a known node; `category`
  should be one of the enum.

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
