# es-method glossary — mining notes

Area: **es-method** — the Event Storming / DDD method vocabulary this tool implements and enforces.
18 terms: 17 resolved, 1 flagged (`term-es-bounded-context`).

## Sources leaned on
Almost all of this vocabulary is already spelled out in prose, so very little code reading was
needed (as the briefing predicted for a method area):
- `docs/flows-schema.md` — the Node section's rules ARE the definitions of aggregate/command/event/
  policy/invariant/read-model/external-system, plus `inferred`, `synchronous`, `ownedBy`.
- `docs/METHOD.md` — two-plane rule (123), altitude / don't-force-merge (142), strategic-vs-tactical
  framing (10), Phase 5 UL mining (148), hotspots-are-questions (208).
- `~/.claude/skills/event-storming-modeling/SKILL.md` — sticky colors, the flow grammar, Policy-vs-
  Invariant conflation, and the whole second-plane (CEP / measurement-vs-event / ACL) vocabulary.
- `src/lib/merge.mjs` — only real code anchors used: the grammar check (`:169`), NODE_TYPES/EDGE_VERBS
  (`:13-14`), and `inferred:false wins` (`:91`).

## Categorization judgment calls
- **`term-es-actor`** categorized `role` rather than `concept` — Actor is literally a role, and the
  enum has a `role` value, so it reads better there. Everything else that is a sticky TYPE is `concept`
  per the briefing; the two-plane / altitude / inferred / strategic-tactical jargon is `category: jargon`.
- **Policy** absorbed "synchronous policy" (the repo's `synchronous:true` field) as an `aka` + a
  sentence rather than minting a separate term — it is the same concept with a repo-specific flag.
- **Domain Event** absorbed the "Event / past-tense fact" naming convention and the
  event-vs-measurement discriminator; I did not mint a separate "measurement" term (no measurement
  plane exists in this self-model — merge/generate are single-plane ETL).
- **Strategic vs tactical** and **Altitude** are kept as TWO distinct terms on purpose. They are
  different axes: strategic/tactical = the what-vs-how registers (the `tactical` block), altitude =
  the generic-vs-specialized zoom of the *same* action across flows (don't-force-merge). The briefing
  listed both; conflating them would lose the distinction METHOD.md draws.

## relatedNodes decisions (mostly empty — and that's correct)
Per the briefing, most method concepts have no single sticky, so `relatedNodes` is empty for 15 of 18.
The three that map cleanly:
- `term-es-grammar-rule` -> `inv-es-grammar` (that node literally IS this rule, enforced).
- `term-es-ubiquitous-language` -> `inv-referential-integrity` (the id-uniqueness/closed-graph
  invariant is the thing that catches UL drift at merge time). This is the softest of the three; drop
  it if the orchestrator judges it a stretch.
- `term-es-inferred` intentionally has NO relatedNode — it is a field on every node, not a node.

I deliberately did NOT set `relatedNodes` on the generic sticky-type terms (Aggregate, Command, etc.)
even though instances exist (`agg-model`, `cmd-merge-traces`, ...). Pointing "Aggregate" at one
arbitrary aggregate node would misrepresent the term; pointing it at all of them is noise. Left empty.

## Cross-area terms to de-dupe (hand-off to other miners / orchestrator)
- **Sticky vs node.** I defined `term-es-sticky` (the method's wall card). The tool area almost
  certainly wants a **`node`** term (the flows.json data structure / global id). Keep BOTH: they are
  the method concept vs its data realization. I noted the overlap in the sticky `aka`.
- **Ubiquitous Language / glossary.** I own the method definition. If the tool area defines the
  **Glossary tab** (`rm-glossary`) or the `terms[]` contract, keep those as the *tool* surface and let
  my `term-es-ubiquitous-language` stay the *concept*. `inv-terms-contract` is the tool's enforcement
  of it — that belongs to the tool/invariant area if they mint a term for it.
- **Two-plane / ETL.** `term-es-two-plane` is the method stance. If the tool area describes the
  **merge** or **generate** ETL steps as jargon, they should reference this term, not redefine the
  plane split.
- **Hotspot.** I own the method concept. If another area wants "red sticky", defer to `term-es-hotspot`.
- **inferred / tactical / strategic.** Method-owned here; other areas should link, not redefine.

## Schema friction (PILOT — extra candid; this tunes the other 4 miners' briefing)

1. **`relatedNodes` can only point to `nodes[]`, never to hotspots or flows — and this bites method
   vocabulary hardest.** The most natural links for a method glossary are exactly the non-node arrays:
   "Hotspot" wants to point at the `hotspots[]` entries, "Flow" (tool area) wants `flows[]`, "Term"
   wants `terms[]`. The merge's terms-contract only resolves `relatedNodes` against node ids, so all of
   these must be left empty even though a clean correspondence exists. Recommend the briefing say
   explicitly: *relatedNodes resolves to NODE ids only; do not try to link a term to a hotspot/flow/term
   — leave it empty and mention the correspondence in notes.* I hit this on `term-es-hotspot`.

2. **No way to express "this term IS realized by this field/flag," only by a node.** `inferred`,
   `synchronous`, `ownedBy`, `tactical` are all node *fields*, central method vocabulary, but there is
   no field-level link target. `anchors` (path/line/symbol into source) is the only mechanism, and it
   works fine — but the briefing should tell miners to reach for `anchors` (not `relatedNodes`) for any
   term that is a field/flag rather than a sticky.

3. **The `category` enum has no bucket for a "modeling stance / rule / pattern."** Two-plane, altitude,
   strategic-vs-tactical, the grammar rule — these are method *ideas*, not any of concept|jargon|acronym|
   role|system|state|metric. I filed the stances under `jargon` and the rule under `concept`, which is
   defensible but lossy. Since nonstandard category is only a warning, a miner *could* invent
   `category: "method"` / `"pattern"` — but that would render inconsistently in the Glossary tab. I
   stayed inside the enum. Flag for the schema owner: consider a `method`/`principle` category, or state
   in the briefing that method stances go under `jargon` (my choice) so the 5 areas stay consistent.

4. **`aka` is doing triple duty** (code spellings, synonyms, AND id-prefix hints like `agg-*`, `cmd-*`).
   I used id-prefix globs in `aka` because a newcomer greps `agg-` and wants to know what it means, but
   that stretches "also known as." Works, but the briefing could say whether id-prefix conventions
   belong in `aka` or should be omitted. I included them; they are genuinely useful for orientation.

5. **`anchors` into a Markdown doc has no natural `symbol`.** The schema strongly encourages `symbol`
   (line numbers rot). For doc anchors I used the section heading as the symbol, which survives edits
   better than a line number. Recommend the briefing bless "section heading as symbol" for doc anchors,
   since a method glossary anchors mostly into `docs/*.md` and the skill, not into code.

6. **Minor: one anchor points outside the repo** (`~/.claude/skills/event-storming-modeling/SKILL.md`
   on `term-es-sticky`). The skill is the authoritative source for the color/vocabulary but is not part
   of the checkout, so that path won't resolve from `repoRoot`. The schema doesn't validate anchor paths
   (they're evidence, not references), so it's harmless, but flagging it: a global skill is a real source
   a method miner will want to cite yet cannot cite repo-relatively. Left it in as honest provenance.

None of the above blocked authoring — every term validates. Items 1 and 3 are the two worth folding
into the other miners' briefing.
