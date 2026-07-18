# claude-mcp-read — trace notes

Flow: **claude-mcp-read** (kind `read`, tier 1, status `live`). A connected Claude session reads
the live model / selection / bundle over the MCP transport to ground a refactor.

## Reachability (confirmed)
- `/mcp` route is wired: `server.mjs:106` delegates `p === '/mcp'` to the injected `mcpHandler`.
- `mcpHandler` is created and passed in the entrypoint: `bin/es-view.mjs:91` `createMcpHandler(services, state)`
  then `startServer({ ..., mcpHandler })` at `:92`. `state` (`bin/es-view.mjs:89`) and `services` are the
  SAME objects the web API uses, so the SPA and MCP share one in-memory state. Confirmed live.
- All 5 tools + 1 resource are registered in `buildMcpServer` (`mcp.mjs:22-98`): `get_current_selection`,
  `get_node`, `get_flow`, `list_model`, `list_data_model`, and resource `event-storming://selected-nodes`.
  Verified each against code — all present and grounded.

## Modeling decisions
- **No command, no aggregate write.** Per the briefing this is a pure read: the projections (`rm-*`)
  `projects from` the two aggregates (`agg-model`, `agg-selection`) and from `ext-source-fs` (grounding).
  I did not invent a query command.
- **Actor vs external boundary.** `actor-claude` is the initiating role; `ext-claude-mcp-client` is the
  external system (the Claude process across the streamable-HTTP boundary). Modeled as
  `actor-claude —calls→ ext-claude-mcp-client —reads→ rm-*`: the session initiates, the client crosses
  the transport, the read models project from the aggregates. The `@modelcontextprotocol/sdk` is an
  in-process library and is deliberately NOT a node.
- **New read model `rm-flow-context`** for `get_flow` (no shared id was provided for it; the shared list
  covers the other four tools + the resource). It grounds the whole flow and carries the Mermaid graph.
- **Reused shared ids verbatim:** `actor-claude`, `ext-claude-mcp-client`, `ext-source-fs`, `agg-model`,
  `agg-selection`, `rm-current-selection`, `rm-node-context`, `rm-model-index`, `rm-data-model`,
  `rm-context-bundle`. `agg-model` identity (label/description) matches the merge-traces pilot; my
  `tactical` describes the READ side (merge appends it as a per-flow usage).
- **Grounding distinction captured:** only the `buildNodeContext`-based projections pull real source via
  `readSource` (`rm-current-selection`, `rm-node-context`, `rm-flow-context`, `rm-context-bundle`) →
  edges to `ext-source-fs`. `list_model` and `list_data_model` are pure in-memory projections over
  `agg-model` with NO filesystem access — so no `ext-source-fs` edge for `rm-model-index` / `rm-data-model`.
- **Two-plane rule:** the session lifecycle (initialize → randomUUID session id → fresh `McpServer` over
  shared services/state; `onsessioninitialized` registers, `onclose` deletes; 4MB body cap) is kept in
  `ext-claude-mcp-client.tactical` as transport plumbing. The transient `transports` Map is NOT promoted
  to an aggregate.

## Surprises / contradictions
- **"stateless" is wrong in the header comment.** `mcp.mjs:2-3` says the endpoint is "streamable HTTP
  (stateless)", but the implementation is clearly STATEFUL: a per-session `transports` Map keyed by
  `Mcp-Session-Id`, `sessionIdGenerator: () => randomUUID()`, and reuse/close of the transport per
  session (`mcp.mjs:120-146`). Documentation bug (not promoted to a hotspot — no business question).
- **Fresh `McpServer` per session, shared state.** Every `initialize` builds a NEW `McpServer` closing
  over the SAME `services` + `state` (`mcp.mjs:138`). So multiple connected Claude sessions all read the
  one live selection/bundle — there is no per-session isolation of "what am I looking at". Worth knowing
  if two Claude sessions ever connect at once (they'd fight over / share the single selection).
- **4MB vs 2MB body caps diverge.** `mcp.mjs` readJsonBody caps at 4_000_000; `server.mjs` readJsonBody
  caps at 2_000_000. Minor inconsistency, noted for completeness.

## Hotspots
- **hot-stale-selection** — server-side selection is set on `openDetail` (`store.jsx:43` → POST
  /api/selection) but NEVER cleared: `closeDetail`/`selectFlow` reset only client state, and `api.js`
  exposes no selection-clear call, so `get_current_selection` returns the last-clicked node indefinitely.
  This is the READ-side symptom; the explore-and-select flow owns the selection WRITE. **Coordination
  note:** if that flow also defines `hot-stale-selection`, the merge dedups by id (first-seen wins) — I
  defined it here so my `flow.hotspots` reference resolves regardless. Safe to keep in both.
- **hot-mcp-name-mismatch** — McpServer self-name `event-storming-recovery` (`mcp.mjs:20`) vs registration
  alias `event-storming` (`server.mjs:24`, `ConnectClaude.jsx:26`, and the `claude mcp add` command). The
  resource uri scheme `event-storming://…` follows the alias, not the self-name. Intentional short alias
  or a namespacing bug a human should confirm.

## Schema friction
None. The read flow fit the schema cleanly: `reads` / `calls` / `projects from` are all in the verb
vocabulary, invariants were correctly out of scope (no aggregate write), and physical/data-model nodes
were correctly left to the data-mapping phase (this flow only surfaces the data model as the
`rm-data-model` projection, it does not author `srv-/db-/tbl-/col-` nodes).
