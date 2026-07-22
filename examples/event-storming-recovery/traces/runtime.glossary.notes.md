# Runtime/pipeline glossary — mining notes

Slice: the tool's own runtime (es-view app) and deterministic pipeline (merge/generate) vocabulary,
plus the recovery-workflow roles (scout/deep-trace/orchestrator/recursive-exploration) that produce
the model in the first place. 25 terms written, all `term-rt-` prefixed, all `relatedNodes`
validated against the merged model's node ids (script-checked, zero dangling refs).

## Resolved vs flagged
- 20 resolved, 5 flagged (`partial`, each with a specific `openQuestion`):
  - `term-rt-mcp-server` — src/server/mcp.mjs's own header comment calls the transport
    "stateless" while the JSDoc/mcp.md and the actual per-session `transports` Map say stateful.
    No existing hotspot names this exact self-contradiction (it's adjacent to but distinct from
    `hot-mcp-read-desc-drift`, which is about tool *descriptions* drifting from behavior, not this
    stateless/stateful doc contradiction).
  - `term-rt-model-resolution` — restates the real gap `inv-model-shape`/`hot-unvalidated-model-served`
    already hotspot: only the `--traces` tier runs full validation.
  - `term-rt-generate` — restates `hot-generator-trusts-unvalidated-model`.
  - `term-rt-npx-delivery` — README explicitly flags the npm package isn't published yet (tracked
    as a repo issue); flagged since I can't verify from the model/docs whether that has since shipped.
  - `term-rt-self-model-example` — restates `hot-demo-example-drift` (CI never diffs the
    regenerated example against the committed one).

None of these are *new* discoveries beyond what hotspots already surface — mining just gave them a
vocabulary-shaped home (the term a newcomer would look up) rather than duplicating the hotspot's
own question wording. Kept the phrasing distinct from the hotspot description in each case.

## Cross-area overlap (method-mining territory, not mine)
The following belong to whichever miner owns the **method/modeling** vocabulary (sticky colors,
command/aggregate/event/policy grammar, invariant vs policy, two-plane rule, tier-1/tier-2 flows,
`inferred`, hotspot, ubiquitous-language drift, altitude variations). I deliberately did NOT mint
terms for them even though they appear constantly in docs/METHOD.md and flows-schema.md, since my
brief is the runtime/app + pipeline, not the modeling grammar:
- Aggregate, Command, Event, Policy, Read model, Invariant, External system, Actor, Hotspot
- `inferred` flag, two-plane rule, altitude variation, ubiquitous-language drift
- Tier-1 / Tier-2 flow, dead / superseded / live status

Two terms sit right on the seam and could arguably go either way — flagging for awareness, not
duplicating:
- **Shared-id glossary** (the Phase-1 scout deliverable: recurring aggregate/external-system/actor
  ids handed to every trace agent) — I treated this as method vocabulary (it's about *modeling*
  convergence, not the runtime app) and left it to the other miner. If they also skip it, worth a
  follow-up term either miner can pick up.
- **Term / Glossary tab itself** — I did NOT mint a term for "Term" or "Glossary" as ubiquitous-
  language concepts (that would be mining-the-miner), but `rm-glossary` (the Explorer's Glossary
  tab, a runtime UI surface) is covered as `relatedNodes` on `term-rt-explorer`.

No near-duplicate collisions found against what I'd expect the method-side glossary to contain —
the split (runtime/app+pipeline vs. modeling grammar) is clean because the self-model's node set is
entirely runtime/pipeline nodes (this model traces es-view itself, not a business domain), so there
was no modeling-grammar vocabulary living in *this* model's descriptions to accidentally re-mine.

## Notable design distinctions surfaced while mining
- **MCP tool vs. MCP resource** is an explicit, documented design choice in `src/server/mcp.mjs`
  (line 5-6 comment): "current selection" is a tool because it must always be fresh with no
  subscription; the context bundle is a resource because the user wants to @-mention a curated,
  stable set. Worth keeping these as two distinct terms rather than folding "MCP tool/resource"
  into one, since the distinction is load-bearing to how a connected Claude session is expected to
  use each.
- Split "Plugin / Marketplace" (one bullet in the brief) into two terms — they're genuinely
  different manifests (`plugin.json` vs `marketplace.json`) with different jobs, and this repo
  happens to be both at once, which is itself worth spelling out.
- Split "Repo root / anchor" into two terms for the same reason — repoRoot is a resolved directory
  value; an anchor is a `{path,line,symbol}` pointer that gets resolved *against* repoRoot. Related
  but not the same noun.

## Schema friction
- None. The Term schema in `docs/flows-schema.md` covered everything I needed — including anchors
  with `symbol: null` for prompt/doc anchors that don't name a code symbol (e.g. pointing at a
  prompt file's section heading rather than a function). Schema doesn't explicitly forbid a null
  `symbol`, and it reads fine since `symbol` is only "strongly encouraged," not required.
- One soft ambiguity: the schema's `anchors[].path` convention is described as "repo-relative...
  from repo root," which I read as this tool's own repo root (event-storming-recovery itself) for
  runtime terms, since all my definitions describe the tool's OWN code (bin/, src/server/,
  prompts/, docs/, package.json, .claude-plugin/) rather than a target codebase under analysis.
  That's consistent with how the merged model's own nodes anchor themselves (e.g. `agg-selection`
  anchors to `src/server/state.mjs`), so no actual conflict — just noting the self-referential
  nature of this particular slice (mining the tool's model of itself) for whoever reviews.
