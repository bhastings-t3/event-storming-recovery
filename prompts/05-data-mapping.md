# Data-model mapping (Phase 5.5)

Run this **after the model is merged** (`{MODEL_PATH}` exists), like glossary mining. It recovers
the **data model**: what each read model / aggregate actually returns, and the physical storage the
code touches (servers, databases, tables, columns), cross-linked to the behavioral nodes. It feeds
the explorer's **Data model** tab and the `fields` sections of the detail panel.

The orchestrator fills the placeholders, appends the **Data model** section of `docs/flows-schema.md`,
and dispatches each agent with a short, area-scoped task that points here.

Placeholders:
- `{REPO_ROOT}` — absolute path to the target checkout.
- `{EXCLUDE}` — globs/paths to skip (build output, vendored deps, generated code).
- `{MODEL_PATH}` — the merged `flows.json` (the read models / aggregates you annotate already exist).
- `{SCHEMA_PATH}` — `docs/flows-schema.md` (the **Data model** section is the output contract).
- `{TRACES_DIR}` — where you write output (the merge tool folds every `*.json` in it into the model).
- `{AREA}` — the slice you own (a bounded area / aggregate cluster), so the wave parallelizes.

## The one idea to hold onto

**A field is a conceptual property, not a column alias.** A read model's `total` or an aggregate's
`status` is what the *domain* sees; it may be assembled through joins, sums, and app-code
transformations, or computed and never stored at all. So:

- Every field carries a prose **`derivation`** (how it is produced) and **0..N `sources`** (the
  columns it draws from). **Zero sources is valid and common** — a computed/derived/constant field.
- Aggregate and read-model fields **sit on top of** what the code reveals. Do **not** force a
  one-to-one field↔column mapping, and do **not** invent a column just to give a field a parent.
- Keep **two signals separate**: `conceptual: true` (we are sure consumers see this field) vs
  `confidence: high|medium|low` (how sure we are of its *derivation/sources*). A field can be
  conceptual and certain to exist yet have `low` source confidence.

## Required reading
- `{SCHEMA_PATH}` → the **Data model** section: the `fields[]` shape, the physical node types
  (`server/database/table/column`) with `parent` containment, the new edge verbs
  (`persists to`, `projects from`, `writes`), and the enums. Follow it exactly.
- `{MODEL_PATH}` → read the read models and aggregates in your `{AREA}`. Their `tactical.explanation`
  already names tables and transactions ("inserts an orders row and order_items rows"). Start there.
- `prompts/recursive-exploration.md` → the recursion protocol. When a read model turns out to be a
  tangle of joins across a subsystem, spawn a sub-agent to resolve its lineage rather than guessing.

## Method — model first, then the code that stores/reads

1. **Discover storage from the code (ground truth).** In your area, find where data is read/written:
   - **SQL string literals** and query builders → the tables and columns touched. This is the
     baseline; many codebases have nothing more.
   - **ORM models / repository methods** → entity-to-table mappings, column names.
   - **Connection strings in config/settings** → the `server` (host/instance) and `database` a
     store lives in. This is how you recover the physical tier when there is no infra-as-code.
   - **Migrations / schema files** (EF, Prisma, Flyway, Liquibase, DDL), *when present* → authoritative
     structure. Use them to **corroborate and enrich** what the code implies — append to
     `provenance`, raise `confidence`; never discard the code evidence.
2. **Create physical nodes, demand-driven.** Add `server` → `database` → `table` → `column` nodes
   (ids `srv- db- tbl- col-`), linked by `parent`. Physical nodes are `inferred: false` (the code
   names them). **Only add the columns a field actually references** — never dump every column of a
   table. Give each a `provenance` (e.g. `["sql-literal"]`, `["connection-string"]`) and an anchor.
3. **Populate `fields[]` on read models and aggregates.** For each, list the conceptual properties it
   returns/holds. Give each a `name`, a prose `derivation`, `confidence`, and `sources[]` wiring
   `ref` to the `col-` nodes you created (`role`: `derived-from` when it populates the field,
   `filtered-by`/`joined-on`/`grouped-by` when it only influences it; `transform`: `identity`,
   `aggregation`, `lookup`, …). Mark computed/unknown-source fields `conceptual: true` with
   `sources: []`. Capture a literal `expression` string only when one actually exists in the code.
4. **Cross-link behavior to storage.** Add edges in the flows that touch them:
   `aggregate --persists to--> table`, `readModel --projects from--> table`,
   `command --writes--> table`. Do **NOT** add physical nodes to a flow's `steps` — they attach via
   edges only (the satellite rule, like invariants). Columns are reached via `fields[].sources` and
   `parent`, so they never orphan-warn.
5. **Reconcile with `ownedBy`.** If a database lives inside an external system you don't deploy, set
   the aggregate's existing `ownedBy` (don't invent a parallel representation). One physical `table`
   node per resolved `server.database.schema.table` address, even if two services reach it — dedupe
   by the resolved address, not the bare name.
6. **Flag what you can't pin down — don't fabricate.** Dynamic/concatenated SQL that hides the real
   table gives a `low`-confidence, `provenance: ["assumed"]` field with the raw fragment in a `note`
   — never a precise `schema.table.column` you didn't actually see. A genuine storage risk (a write
   with no transaction, a column two flows fight over) is a **hotspot** with the human question.

## Output contract
WRITE two files with your Write tool (do NOT put the JSON in your final chat message):
1. `{TRACES_DIR}/{AREA}.data.json` — `{ "nodes": [ ... ], "flows": [ ... ] }` for your area:
   the physical `server/database/table/column` nodes you discovered, PLUS the read-model/aggregate
   nodes **re-stated with their `fields[]`** (id + type + label + the `fields` array — the merge
   unions fields onto the existing node by name) and any flow objects that carry your new
   `persists to`/`projects from`/`writes` edges. Valid JSON, schema-conformant, no comments.
2. `{TRACES_DIR}/{AREA}.data.notes.md` — tables you found but couldn't attribute to a server,
   dynamic-SQL you could only partially resolve, cross-area tables the orchestrator may need to
   de-dupe, and a `## Schema friction` section (write "None." if none) for the pilot to tune first.

Your final chat message is SHORT: status, a 3-5 sentence summary, counts (tables, columns, fields;
resolved vs low-confidence), cross-area tables worth de-duping, and confirmation both files are written.

## Rules agents most often get wrong
- **Don't dump schemas.** Only the columns a field references. If it isn't referenced by behavior,
  leave it out — this layer stays strategic, like "prefer few, meaningful events."
- **Don't force field↔column 1:1.** A field with a good `derivation` and `sources: []` is correct,
  not incomplete.
- **A local `sources[].ref` (`col-…`/`tbl-…`) must resolve** in the merged model or the merge
  rejects it. A non-local raw address string is accepted as-is — use it only when you truly can't
  model the node.
- **Physical nodes are `inferred: false`.** They are named in the code, the inverse of the
  behavioral layer's default.
- **Pipeline/ETL plumbing is not a data model.** Intermediate scratch tables of a dataflow stage
  stay in the command's tactical detail (the two-plane rule); promote only storage that backs a
  real read model or aggregate.
