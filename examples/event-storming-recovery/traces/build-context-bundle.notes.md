# build-context-bundle — trace notes

## Reachability
**LIVE.** End-to-end path is fully wired and served:
- Trigger: `src/web/components/ContextMenu.jsx:46` (add/remove toggle) and `src/web/components/ContextBundle.jsx:50/59` (row ✕ / Clear).
- Client: `src/web/store.jsx:51-53` -> `src/web/api.js:23-25` -> `POST`/`DELETE /api/context`.
- Server: `src/server/server.mjs:138-155` mutates the shared `state` bundle (`src/server/state.mjs:21-23`).
The SPA is built and statically served by the same process, and the store loads the bundle on mount (store.jsx:34), so both ends of the flow reach real code.

## Key findings / surprises
- **The add-time invariant is asymmetric.** `itemExists` (server.mjs:27) guards only the POST/add path (server.mjs:147). The DELETE/remove path (server.mjs:152) has NO existence check — it is a raw `Map.delete`. This is defensible: `Map.delete` on an absent key is an idempotent no-op, so the asymmetry cannot leave a stale/dangling ref in the bundle. Modeled `inv-bundle-item-exists` as an add-only ERROR guard and noted the asymmetry in its description rather than minting a phantom invariant on remove.
- **One DELETE verb, two commands.** `DELETE /api/context` branches on the presence of `body.id`: with an id it is `RemoveContextItem`, without one it is `ClearContextBundle` (server.mjs:150-154). Same route, distinct commands with distinct events — split per the "separate action / separate outcome" rule.
- **Dedup is a silent no-op, not a rejection.** `addToBundle` only sets when the `type:id` key is absent (state.mjs:21). Because a duplicate add returns success (unchanged bundle) rather than erroring, this is folded into the command/aggregate tactical, NOT modeled as a second invariant (per pilot clarification 1: invariants are error-level rejections).
- **The bundle stores an `at` timestamp per entry that the API never exposes.** `state.mjs` keeps `{ type, id, at }` but `getBundle()` projects to `{ type, id }` only. Captured in the `items` field derivation; no `fld-` node minted since it is never read out.
- **Shared-state crux confirmed.** The exact same `bundle` Map is mutated by the HTTP routes and read by the MCP `event-storming://selected-nodes` resource (mcp.mjs:96) over one shared `state` object — the "browser click is what Claude reads" property the briefing flagged. Referenced `ext-claude-mcp` as the downstream reader via a `read by` edge off `rm-context-bundle`; the MCP read is a separate flow.
- **Copy-for-Claude deliberately left shallow.** `renderBundleMarkdown` (context.mjs:171) is the read-side markdown projection reused by both the drawer's "Copy all for Claude" clipboard export and the MCP resource. Per instructions, only referenced (in `rm-context-bundle`), not modeled in depth here.

## Invariants
- `inv-bundle-item-exists` (ERROR): POST /api/context rejects (404) an add whose `{ type, id }` does not resolve to a real node/flow/hotspot. Enforced by the route, not inside `state.mjs`. This is the aggregate's only enforced consistency rule.

## Aggregate boundary decision
Modeled the bundle as its own aggregate `agg-context-bundle`, separate from `agg-selection`, even though both live in one `createState()` closure. Justification: they are distinct state (a single `selection` value vs a `bundle` Map), distinct method sets, and distinct commands/events. The briefing said not to force a boundary; the code's own method grouping supports two aggregates over one shared datastore (`ds-session-state`), which is exactly how it is modeled (both aggregates `persist to` the one in-memory store).

## Human questions raised
- `hot-bundle-single-global-state`: the bundle is process-global with no per-tab / per-MCP-session scoping. Fine for single-local-developer use; a real question the moment es-view is multi-tab or shared. Also flags the silent no-persistence-across-restart behavior.

## Shared-id reuse
- Reused `actor-operator` and referenced `ext-claude-mcp` per the glossary.
- Introduced `ds-session-state` (in-memory) as the store both the selection and bundle aggregates write to — recommend the selection-flow agent reuse this exact id so the two flows join on one datastore.

## Schema friction
None.
