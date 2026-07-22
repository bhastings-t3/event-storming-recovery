# mcp-get-current-selection — trace notes

## Reachability verdict: LIVE
- **Consumer end:** `ext-claude-mcp` reaches the tool via POST `/mcp` → `createMcpHandler` (`src/server/mcp.mjs:120`), which mounts the `get_current_selection` tool (`src/server/mcp.mjs:22`). The handler is wired into the boot path in `bin/es-view.mjs:95` (`createMcpHandler(services, state)` passed to `startServer`), so a real `claude mcp add` client can call it end to end.
- **Data end:** it reads the same in-memory `state` the browser writes via `POST /api/selection` (`src/server/server.mjs:132`, the `select-node` flow). Real writer, real reader, shared state → live.

## What the flow actually is
A **read** flow across the MCP boundary. `get_current_selection` has an empty input schema; it reads the process-global selection pointer and, when set, projects a grounded node (`rm-grounded-node`) out of `agg-model` + `agg-selection`, also reading `agg-comment-store` (human notes) and `ds-repo-src` (real source behind anchors). Rendered to markdown as the tool result.

## Three outcomes of the handler (mcp.mjs:29-34)
1. **Empty selection** — `state.getSelection()` is null → returns a plain-text nudge ("No node is currently selected… Ask the user to click a node, or use get_node / list_model"). Not an error, an intended alternate outcome; modeled in the command's `tactical.explanation`, not as a node.
2. **Hit** — `buildNodeContext` assembles the projection; `renderNodeContextMarkdown` formats it. The main path.
3. **Stale** — `buildNodeContext` returns null (selected id absent from model) → "…is no longer in the model." See defensive-branch note below.

## Surprises / observations
- **The reader drops the selection timestamp.** `state` stores `{ nodeId, at }`, but the handler renders only the node context and never surfaces `at`. Combined with a single process-global selection shared across every MCP session and the browser, a connected session cannot tell whose click it is or how old. This is the flow's one hotspot (`hot-selection-global-shared`).
- **The grounded node reads FOUR sources, not one.** Worth stating plainly: `rm-grounded-node` projects from `agg-model` (identity/invariants/flows/anchors) and `agg-selection` (which node), and additionally reads `agg-comment-store` (human notes, `context.mjs:85`) and `ds-repo-src` (real anchor source, `context.mjs:54-61` via `source.mjs`). The comment-store read is easy to miss but is a genuine cross-aggregate read, so it is modeled as a `reads` edge + a `comments` field.
- **Defensive STALE branch is effectively unreachable in normal operation.** The model is immutable for the server's lifetime, and the write side validates the id exists before setting the selection (`server.mjs:131`, `nodeById.has(nodeId)` → 404 otherwise). So `buildNodeContext` returning null for a *selected* id should not happen in a single run. It is sound defensive code; not promoted to a hotspot (no live path reaches it), just flagged here.
- **Statelessness vs. "shared state" nuance.** The transport comment calls `/mcp` "stateless," but that refers to JSON-response mode; sessions ARE tracked (`Mcp-Session-Id` → transport map) and every session's tools close over the ONE shared `services`+`state`. That sharing is the whole point of the flow, so the "stateless" wording in the header comment is slightly misleading but not a bug.

## Invariants
None on this read path. The only guard that can *reject* work is the repoRoot path-escape check in `readSource` (`source.mjs:18`), and it does not fail the action — it marks that one anchor's source as `exists:false` and the projection still returns. Per the pilot clarification (an `enforces` edge means "this check can fail the command"), that is not an invariant; it is captured in `ds-repo-src`'s description and the `sourceAnchors` field derivation. The action-rejecting validation for the selection lives on the WRITE flow (`select-node`, `server.mjs:131`), not here.

## Shared ids used (reused, not re-derived)
- `agg-selection` — defined lean; described as read-only here and pointed at `select-node` as the sole writer.
- `agg-model` — reused id/label "The Model"; concise description (merge keeps the longest, so the `merge-traces` version wins) with anchors at the exact read paths this flow uses (`nodeFlows`, `enforcesRelation`, `nodeById.get`).
- `agg-comment-store`, `ext-claude-mcp` — reused from the shared glossary.
- `ds-repo-src` — new physical node (the repoRoot checkout read for source grounding). Deliberately NOT folded into `ds-model-fs` from `merge-traces`: that node is the model-data filesystem (trace JSONs + flows.json); this is the target-code checkout. Different concern, kept separate to avoid conflating them.

## Open questions for a human (see hotspot)
- Is a single process-global selection intended when multiple Claude sessions or multiple people connect, or should it be scoped per MCP client?
- Should `get_current_selection` surface the selection's age (`at`) so a stale click is visible to the reader?

## Schema friction
None.
