# explore-and-select — trace notes

## The spine (verified end to end)
Human click → `openDetail(id)` (`src/web/store.jsx:40`) sets React state AND calls
`pushSelection(id)` (`:43`) → `pushSelection` POSTs `/api/selection { nodeId }` and **ignores the
response** (`src/web/api.js:17-18`, `.catch(() => null)`) → route handler
(`src/server/server.mjs:128-133`) validates the id against `services.indexes.nodeById` (404 at
`:131` if unknown) → `state.setSelection(nodeId)` (`:132`) → `selection = { nodeId, at: Date.now() }`
in process heap (`src/server/state.mjs:17`). Read side: MCP `get_current_selection`
(`src/server/mcp.mjs:30`) reads `state.getSelection()` **live** and grounds it via
`buildNodeContext`/`renderNodeContextMarkdown` (`src/server/context.mjs:18,88`). Same in-memory
`state` object is closed over by both the API routes and `createMcpHandler`, so a browser click is
visible to Claude through shared process memory. Confirmed: this is **push-on-click + pull-on-call**,
not a poll or subscription.

## Surprises / findings
- **The write is fire-and-forget from the SPA.** `pushSelection` posts and discards the (fully
  grounded) response the server returns. So the SPA does its own local grounding for the detail
  panel; the POST exists purely to mirror the selection into shared state for the MCP side. The two
  grounding computations (browser detail vs `GET /api/selection`) are independent.
- **The invariant never actually bites in practice.** `inv-selection-in-model` (404 on unknown
  nodeId) only ever sees real node ids because `openDetail` is only ever called with ids that came
  from the model. It's a guard against non-SPA HTTP/MCP callers, not the UI. Modeled it anyway
  because it's the one real guard on `agg-selection`.
- **`at` timestamp is captured but never surfaced.** `setSelection` stamps `Date.now()`
  (`state.mjs:17`) but neither `get_current_selection` nor `GET /api/selection` exposes it. That is
  exactly the signal that would let Claude detect the stale-selection case below, and it's thrown away.

## Hotspot (verified)
- `hot-selection-never-cleared` — **selection is never cleared server-side.** `closeDetail`
  (`store.jsx:46`) clears only React state (`setSelectedNodeId(null); setDetail(null)`); it makes no
  server call. A clean clear path exists and is fully wired server-side — `DELETE /api/selection` →
  `state.clearSelection()` (`server.mjs:135`, `state.mjs:18`) — but **nothing in `src/web` ever calls
  it** (grep confirms the only `/api/selection` reference in `api.js` is `pushSelection`'s POST; there
  is no client wrapper for the DELETE at all). Result: after the human closes the panel, MCP
  `get_current_selection` still returns the last-viewed node indefinitely, so Claude reports a stale
  selection. Human question in the hotspot: clear on close, or is holding the last node intended
  continuity (and if so, should the tool signal staleness/age)?

## Invariants
- `inv-selection-in-model` (attached to `agg-selection` via `enforces`): the selected nodeId must
  exist in the merged model (`agg-model`), else 404 and selection unchanged (`server.mjs:131`). A
  null/empty body is allowed and clears the selection.

## Instances (one flow, many triggers)
All funnel through `openDetail` → `pushSelection`. Enumerated in `cmd-select-node.tactical` rather
than the `instances[]` array (that array is for tier-2 pattern flows; this is tier 1). Call sites:
Board.jsx (flows board), Overview.jsx (overview map), Gallery.jsx, Glossary.jsx, DataModel.jsx
(table/column/consumer/server/db rows), Detail.jsx (breadcrumb, related, field-column and storage nav
rows), ContextBundle.jsx (bundle rows).

## Modeling choices
- `agg-selection` state is **purely in-memory** (no file/db); said so in its tactical, per the pilot
  tuning note. Its read side (`rm-current-selection`) `projects from` three sources: `agg-selection`
  (the live id), `agg-model` (label/type/description/invariants/flows), and `ext-source-fs` (the real
  code behind each anchor via `readSource`). Kept `agg-model` and `ext-source-fs` out of the `steps`
  lane (they're projection satellites feeding the read model); they appear only in edges, so no
  orphan warning.
- Reused shared ids verbatim: `actor-viewer`, `actor-claude`, `agg-selection`, `rm-current-selection`,
  `agg-model`, `ext-source-fs`. `agg-model`/`ext-source-fs` descriptions match the merge-traces pilot;
  their tactical here is this flow's read-only usage (the union appends per-flow usages, so both the
  merge and this flow's tactical are preserved).
- No dataflow/ETL over-modeling applies here — this is a genuine command→aggregate→event→read-model
  bridge, not a transform pipeline.

## Schema friction
None.
