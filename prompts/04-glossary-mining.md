# Ubiquitous language mining (Phase 5)

Run this **after the model is merged** (`{MODEL_PATH}` exists). The orchestrator fills the
placeholders below, appends the **term schema** (`docs/flows-schema.md` → *Term*), and dispatches
each agent with a short, area-scoped task that points here. Terms feed the explorer's **Glossary**
tab; the whole point is a curated **domain vocabulary**, not a list of stickies.

Placeholders:
- `{REPO_ROOT}` — absolute path to the target checkout.
- `{EXCLUDE}` — globs/paths to skip (build output, vendored deps, generated code).
- `{MODEL_PATH}` — the merged `flows.json` (nodes + descriptions already hold most candidate terms).
- `{SCHEMA_PATH}` — `docs/flows-schema.md` (the *Term* section is the output contract).
- `{TRACES_DIR}` — where you write your output (the same dir the flow traces live in; the merge
  tool folds every `*.json` in it into the model).
- `{AREA}` — the slice you own (a bounded area / aggregate cluster), so the wave parallelizes.

## Required reading
- `{SCHEMA_PATH}` → the **Term** schema. Follow it exactly.
- `{MODEL_PATH}` → read the nodes in your `{AREA}`: their `label` and `description` already name
  most of the vocabulary. Start there, do not re-derive the model.
- `prompts/recursive-exploration.md` → the recursion protocol you operate under. When a term
  turns out to be a whole tangled subsystem (a status machine, an acronym that hides a process),
  spawn a sub-agent to resolve it rather than guessing or dropping it.

## Method — model first, then targeted code

1. **Seed from the model.** Harvest candidate terms from the labels/descriptions of the nodes in
   your area: the domain **nouns** (aggregates, key read models, external systems, roles) and any
   **jargon / acronyms / status values** the descriptions mention (e.g. `REVBUILD`, Budget Stage,
   Turnkey, GPW, PIM, SKU, Design PO, Price List vs Custom Line).
2. **Resolve with code, only where needed.** For each term whose meaning is not already clear from
   the model, read the code (grep the identifier, open the enum/const/column, read the handler) to
   write a precise 1-3 sentence **definition** and attach 1-2 **anchors** (`path`, `line`, `symbol`).
   Record code spellings/synonyms in `aka` (e.g. `"Budget_Stage = REVBUILD"`).
3. **Flag what you cannot pin down — do not drop it.** If, after looking, the meaning or scope is
   still uncertain, set `status: "partial"` (you have some of it) or `"unresolved"` (you have very
   little), keep whatever you *did* learn in `definition`, and write the specific
   **`openQuestion`** a human should answer. This mirrors hotspots: a flagged term is a question,
   not a gap. **A flagged term with an honest openQuestion is a success, not a failure.**
4. **Link to the model.** Set `relatedNodes` to the node id(s) the term maps to when there is a
   clean correspondence (an aggregate, a read model, an external system). Leave it empty for pure
   jargon that has no single sticky.
5. **Stay curated.** One entry per real domain term. Do **not** mint a term for every command/event
   sticky — those live in the Gallery. Prefer the words a newcomer would need defined.

## Output contract
WRITE two files with your Write tool (do NOT put the JSON in your final chat message):
1. `{TRACES_DIR}/{AREA}.glossary.json` — `{ "terms": [ ... ] }` for your area only,
   schema-conformant, valid JSON (no comments, no trailing commas). Every term has a unique `id`
   (prefix `term-`), a `term`, a `category`, and either a `definition` (resolved) or a
   `status` + `openQuestion` (flagged). Include `symbol` on anchors.
2. `{TRACES_DIR}/{AREA}.glossary.notes.md` — terms you were unsure how to categorise, near-duplicates
   you merged, cross-area terms the orchestrator may need to de-dupe, and a `## Schema friction`
   section (write "None." if none) so the pilot term-mine can tune the schema before the full wave.

Your final chat message is SHORT: status, a 3-5 sentence summary, the count of terms (resolved vs
flagged), any cross-area terms worth de-duping, and confirmation both files are written.

## Rules agents most often get wrong
- **Terms are curated vocabulary, not stickies.** If it reads like a sentence ("A booth holds at
  most one turnkey package"), that is an invariant, not a term. The term is `Turnkey`.
- **A flagged term must carry its question.** `status: unresolved` with no `openQuestion` is invalid
  and the merge will reject it.
- **`relatedNodes` ids must exist** in the merged model, or the merge rejects the term. Omit rather
  than guess.
- **Do not duplicate an existing term id** across areas; if two areas name the same concept, the
  orchestrator keeps the first — note the overlap so the better definition wins.
