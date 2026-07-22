# es-method glossary — mining notes

26 terms written: 25 resolved, 1 flagged (partial). Area: Event Storming METHOD & MODELING
vocabulary, seeded from `docs/METHOD.md`, `docs/flows-schema.md`, `src/lib/merge.mjs`, and
`src/server/context.mjs`, checked against `model-wip/flows.json` (15 flows / 87 nodes / 21
hotspots / 0 terms).

## Near-dupes / things to watch at merge time

- **term-es-flow** vs **term-es-trace**: "Flow" is the modeled artifact (the entry in
  `flows[]`); "Trace (per-flow)" is the Phase-3 activity/JSON-file that produces it. Kept
  distinct on purpose (schema vs. process), but they read close together in the glossary UI —
  worth a "see also" link if the explorer ever supports that.
- **term-es-dead-flow** vs **term-es-superseded-flow**: same `status` enum, same
  "traced anyway" rationale, split only by reachability (unreachable vs. still-reachable-but-
  replaced). This model's current trace has `meta.deadFlows: []` (no instances of either), so
  both terms are documentation-only for this particular flows.json — flag if a future reviewer
  expects every glossary term to resolve to a live example.
- **term-es-datastore** / **term-es-field**: two very literal words. Watch for the OTHER
  glossary-mining slice (runtime/product vocabulary) accidentally re-minting these if it
  touches the Data model tab — they belong here (modeling vocabulary), not there.

## Cross-area overlap — belongs to the OTHER miner, not here

The other miner's slice is described as "runtime terms." Things I deliberately left OUT of
this file because they are product/runtime vocabulary rather than Event Storming method
vocabulary, even though they appear constantly in this same flows.json:
- **es-view**, **es-merge**, **es-generate** (the CLI bin names / npx surface)
- **MCP** (Model Context Protocol) as a runtime integration, **MCP read tools**,
  `event-storming://selected-nodes` resource URI
- **Operator** as a specific role-label (kept "Actor" here as the ES concept; the specific
  "Operator" persona/workflow probably belongs to the other slice)
- **Context bundle**, **Selection** (session state concepts specific to this tool's UI, not ES
  method vocabulary per se)
- **npx**, **SPA**, **explorer.html**, **flows.dot** as artifacts/build outputs

If the other miner also produced a `term-es-*`-prefixed... no — their prefix should differ from
mine (`term-es-` is reserved to this file per the task briefing), so id collision shouldn't
occur; the overlap risk is purely conceptual duplication of *content* (e.g. both files defining
"MCP" or "Grounded"). I defined **Grounded (node/flow)** here since it was explicitly listed in
my AREA scope, anchored to `src/server/context.mjs`, but it is arguably closer to a runtime/tool
feature than pure ES method vocabulary — worth a dedupe check against the other file.

## Extras included beyond the literal AREA list

The AREA list given didn't explicitly name these, but they are squarely Event Storming method
vocabulary (not runtime), came up repeatedly in `docs/METHOD.md`/`flows-schema.md`, and an
earlier bundled-example glossary (`examples/event-storming-recovery/traces/es-method.glossary.json`,
apparently from a prior run of this same mining phase against this same tool's self-model)
already treated them as first-class terms, so I kept them for continuity:
- **ES grammar rule** (aggregates never issue commands) — folded into `term-es-invariant`'s
  relatedNodes (`inv-es-grammar`) rather than a standalone term this time, to stay closer to the
  literal AREA list. Flagging in case a standalone "ES grammar rule" term is still wanted.
- Two-plane model, Altitude, `inferred` flag — NOT included this round (present in the older
  bundled-example glossary). Dropped to stay tight to the literal AREA list given in this task;
  reintroduce if the merge step wants full parity with the bundled example.

## Schema friction

- `relatedNodes` validates strictly against the top-level `nodes[]` array (see
  `src/lib/merge.mjs:183`, `for (const nid of t.relatedNodes || []) if (!nodes.has(nid))`).
  Hotspots live in a *separate* top-level `hotspots` array, so a term about Hotspots cannot
  `relatedNodes`-link to an actual `hot-*` example even though that's the most natural link — I
  worked around it by naming an example hotspot id in prose inside the definition instead. The
  schema doc's own Term example (`"relatedNodes": ["agg-line-item"]`) doesn't mention this
  nodes-only restriction explicitly; worth a one-line clarification in `flows-schema.md`
  ("relatedNodes resolves against `nodes[]` only, not `hotspots[]`").
- No structural way to cross-link two *terms* to each other (e.g. Flow <-> Trace, Dead flow <->
  Superseded flow). A `related` (term-to-term) field, distinct from `relatedNodes`
  (term-to-node), would let the explorer render "see also" without abusing prose.
- `category` enum (`concept | jargon | acronym | role | system | state | metric`) doesn't have
  a great fit for something like "Tier" (used `metric` loosely) or "Dead flow"/"Superseded flow"
  (used `state`, since they're best read as a flow's status value rather than a role/system).
  Worked fine as warnings-only per the schema, just noting the fit was loose.

## Files written

- `es-method.glossary.json` — `{ "terms": [...26 terms...] }`, validated against
  `model-wip/flows.json`'s `nodes[]` for every `relatedNodes` reference (0 unresolved), and
  every non-resolved term (1: Bounded context) carries an `openQuestion`.
- This notes file.
