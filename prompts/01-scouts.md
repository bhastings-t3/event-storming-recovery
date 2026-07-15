# Scout templates (Phase 1)

Five read-only inventory agents, run concurrently. Each is told `{EXCLUDE}` and returns a
structured markdown report (data for the orchestrator, not prose for a human — completeness
over polish). Each ends with a **completeness statement**: the search patterns it ran and
whether it believes it found everything.

Adapt the stack-specific hints in braces to the target system (the examples below lean .NET /
Blazor / Dapper but the shape is universal). Give a scout the breadth cue: "medium" vs "very
thorough".

---

## Scout 1 — UI / user-facing entry points

> Inventory every user-facing entry point: each routable page/screen and every significant
> interactive component that initiates a read or a write. For EACH: an id (kebab slug), route,
> file, actor (who uses it — infer from auth attributes/layout), what it **reads** to display
> (services/repos/queries on load), what it **writes** (button/submit/save handlers → which
> methods/tables), any external system touched, and a classification: `generic-crud` (a plain
> maintain-a-table screen), `domain` (real business behavior), or `hybrid`. Group near-identical
> families (e.g. N admin CRUD screens) but still list every member. Report the total route count
> so completeness can be checked. Flag anything surprising: a screen writing straight to the DB,
> firing a background job, sending mail inline, or dual-writing to an external system.

## Scout 2 — Automations / background / scheduled

> Find every piece of code that runs WITHOUT a direct user action. Hunt for: scheduled/recurring
> jobs {Hangfire, Quartz, cron, cloud schedulers} and their schedules; background/hosted services
> and workers; startup-time behavior (seeding, migrations, cache warmup, anything that mutates
> state on boot); timers and reactive streams; message/queue consumers and event handlers wired at
> startup; and operational scripts (SQL agent jobs, migration scripts). For each: id, trigger (cron
> expr / app-start / enqueued-by-whom), file:line of registration AND implementation, reads/writes,
> external systems, idempotency concerns, and sync direction. Explicitly hunt for things that
> merely *look* like syncs but are user-driven, and vice versa. Report grep patterns run.

## Scout 3 — API / auth / protocol entry points

> Inventory non-UI entry points in three parts. **(A)** HTTP surface beyond the UI: controllers,
> minimal-API routes, webhook receivers, file up/download endpoints, plus cross-cutting middleware
> and filters (note any that read/write state, e.g. audit logging). For each: route+verb, file:line,
> caller (browser JS / external system / another service), reads/writes, auth requirement. **(B)**
> Authentication/authorization: how a user signs in end to end (providers, callbacks, what gets
> written — user provisioning? sessions? claims?), sign-out, and where roles/permissions are stored
> and checked. Treat sign-in as a candidate business flow. **(C)** Any separate protocol servers
> (gRPC, GraphQL, MCP, message brokers): what they expose, who the actor is, how they authenticate,
> and whether they share the database/code with the main app. Report grep patterns run.

## Scout 4 — External system integrations

> Map every boundary where the system talks to something outside itself — the "external system"
> stickies. For each integration: id, direction (outbound / inbound / both), the business purpose,
> the wrapper class(es) that encapsulate it (files), **every call site** it's invoked from (this is
> what attaches it to flows), the data that crosses each direction, how it's configured/authenticated
> (config KEY NAMES only, never secret values), and notes (sync vs fire-and-forget, retries, anything
> surprising). Verify actual usage — don't trust the dependency manifest; a referenced package may be
> unused, and a raw HTTP client may hit an API no package covers. Distinguish true network boundaries
> from in-process libraries (document generation, image processing) which are NOT external systems.

## Scout 5 — Data layer & implied aggregates

> Map the data layer to support recovering **implied DDD aggregates** from a
> services-and-repositories codebase. **(1)** Enumerate repositories/data-access classes → primary
> table(s) → write operations (grep INSERT/UPDATE/DELETE/MERGE and equivalents); a written table is
> a state-change site. **(2)** Cluster the entities/models into groups that change together — these
> are candidate aggregates. For each: proposed name, root entity, member tables, confidence
> (high/med/low), and any invariant-ish rules enforced in code (validation before writes, status
> transition checks, transactional boundaries). **(3)** From the schema: list tables, views, stored
> procedures, and **triggers** — procs and triggers are hidden state-change logic (invisible policies),
> flag every one. **(4)** A `service → repositories → tables` ownership map so flows can be stitched.
> **(5)** Any bypass of the data-access pattern (inline SQL, direct connections in the UI). **(6)**
> Read-model constructs: views, reporting queries, denormalized DTOs. Report a completeness statement.

---

**Orchestrator note:** the data-layer scout's aggregate clusters + the integrations scout's external
systems + the UI/API scouts' actors are the raw material for the **shared-id glossary** every trace
agent will use. Derive it before Phase 3.
