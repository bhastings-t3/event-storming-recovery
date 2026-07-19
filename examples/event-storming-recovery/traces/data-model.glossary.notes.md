# data-model glossary — mining notes

Area: **data-model** — the vocabulary of the Phase-5.5 data-mapping / physical layer. 13 terms, all
`resolved`. Seeded from `docs/flows-schema.md` (Data model section), `prompts/05-data-mapping.md`, and
`src/lib/merge.mjs` / `src/lib/selectors.mjs`.

## Self-model caveat captured in definitions
There are **no physical nodes and no `fields[]`** in the current merged model (they arrive in the
data-mapping phase that runs after glossary mining). So the vocabulary is defined from the schema and
prompt, and `relatedNodes` is mostly empty by design. Where I did link, it is to a node that genuinely
renders/embodies the concept:
- `Field`, `Physical node types`, `Data-model edge verbs` → `rm-data-model` (the Data-model tab node,
  whose description already narrates server ▸ database ▸ table ▸ column and who writes/reads/projects).
- `ownedBy` → `agg-mcp-registration` (the one real `ownedBy` in the self-model: `ownedBy: ext-claude-cli`
  — the MCP registration record lives in the Claude CLI's own config).

Also honored the pilot instruction to record, in `derivation`/`Field`/`provenance`, that the tool's OWN
stores are file-based/in-memory (no SQL): the `server/database/table/column` vocabulary is what the tool
RECOVERS FROM analyzed codebases, while the self-model's own data layer is file/memory. So the self-model's
eventual fields will lean `provenance: inferred-from-dto | assumed`, not `sql-literal`.

## Categorization choices (per pilot tuning)
- **jargon**: the enum/mechanism terms — `Source role`, `Transform`, `Provenance`, `parent containment`,
  `Data-model edge verbs`, `demand-driven`, `ownedBy`. These are the tool's modeling machinery/patterns.
- **concept**: the method-owned data ideas — `Field`, `Derivation`, `Source (field source)`,
  `conceptual vs confidence`, `Physical node types`, `Lineage`.
- No `role`/`system`/`state`/`acronym`/`metric` terms surfaced in this area (physical node TYPES are a
  modeling concept, not org roles; enum VALUES are folded into their parent enum term, not minted
  individually — kept curated, one entry per real term).

## Near-dupes merged / folded (not minted as separate terms)
- `conceptual` and `confidence` folded into ONE term (`term-dm-conceptual-vs-confidence`) because the
  point IS their separation as two independent signals.
- The enum VALUES (`derived-from`, `aggregation`, `sql-literal`, …) are folded into their enum term's
  definition + `aka`, not one term per value — matches the "don't mint a term per sticky" curation rule.
- `server / database / table / column` folded into one `Physical node types` entry rather than four.
- The principle "a field with sources:[] is correct, not incomplete" is folded into the `Field` and
  `Source` definitions rather than being its own term (it is a rule about Field, not a noun).

## Cross-area overlaps to de-dupe (orchestrator: keep the best definition)
The **es-method** area OWNS these and I only REFERENCE them (did not redefine, per instruction):
- **`inferred`** — es-method owns `term-es-inferred`. My `Physical node types` note that physical nodes
  default `inferred:false` is a reference, not a redefinition.
- **`ownedBy`** — es-method's `term-es-external-system` and `term-es-aggregate` MENTION `ownedBy`, but no
  standalone term exists there. I minted `term-dm-owned-by` as the data-layer owner of the concept. If
  es-method later mints one, keep mine (data-model owns the physical-provenance angle) or merge.
- **`Read Model` / `Aggregate`** — es-method owns (`term-es-read-model`, `term-es-aggregate`). My `Field`
  term references that these carry `fields[]`; es-method's `Read Model` def already says "carries a
  demand-driven fields[] list", so the fields concept is cleanly split: es-method = the sticky, data-model
  = the field vocabulary. No conflict.
- **`two-plane` / `demand-driven`** — es-method owns `term-es-two-plane` (the plumbing-vs-events stance).
  My `demand-driven` is the narrower data-layer stance (only referenced columns); they rhyme ("prefer few,
  meaningful events") but are distinct. Kept separate; flag only if the orchestrator wants them cross-linked.

## Schema friction
None. The Term schema (`docs/flows-schema.md` line 168+) and the merge validation (`src/lib/merge.mjs`
`terms` loop) accepted all 13 terms: every `resolved` term has a definition, every `relatedNodes` id
resolves, ids are unique and `term-dm-` prefixed, and all categories are in-enum. Verified by parsing the
JSON and cross-checking `relatedNodes` against the merged model's node ids (0 unresolved).
