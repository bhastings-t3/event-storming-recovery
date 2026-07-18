# server-mcp-bridge glossary — mining notes

Area: the vocabulary of the es-view runtime — the local server, the JSON API, the React SPA,
and the MCP bridge. 18 terms (17 resolved, 1 flagged).

## Scope decisions
- **Curated, not one-per-sticky.** The model has many bundle commands/events (`cmd-add-to-bundle`,
  `evt-bundle-item-added`, etc.). Those live in the Gallery; I defined the two nouns a newcomer
  needs (`Selection`, `Context bundle`) plus the mechanism (`Selection bridge`), not a term per
  sticky.
- **MCP tool set as ONE concept.** Per the briefing, I did not mint a term per tool. `term-smb-mcp-tool-set`
  names the five read tools (get_current_selection / get_node / get_flow / list_model / list_data_model)
  as a set, with the individual tool names under `aka`.
- **Consolidated the network-exposure candidates.** The briefing listed "loopback / 127.0.0.1 trust
  boundary" and "--host exposure" separately; I merged them into one term
  (`term-smb-loopback-trust-boundary`) since they are the same boundary described from two sides.

## Method-owned terms — referenced, NOT redefined
Per the pilot tuning, I did not redefine terms the es-method glossary owns (Read Model, Aggregate,
Actor, Invariant, etc.). My definitions reference them (e.g. the Selection is a projection of a
node; the bundle holds nodes/flows/hotspots) without restating what those method terms mean.

## relatedNodes mapping (resolves against nodes[] only)
- `es-view` → agg-es-view-session; `Selection bridge` / `In-memory state` → agg-selection
- `Selection` → rm-current-selection + agg-selection; `Context bundle` / `MCP resource` → rm-context-bundle
- `Grounding` → rm-node-context; `MCP tool set` → rm-node-context, rm-model-index, rm-current-selection
- `Connect command` → rm-mcp-connect-command + cmd-register-mcp; `event-storming (MCP name)` → agg-mcp-registration
- `MCP` / `Streamable HTTP transport` → ext-claude-mcp-client; `Port fall-forward` / `Loopback boundary` → agg-es-view-session
- **Left `relatedNodes` empty (no clean node correspondence), noted in prose:** `Anchor` (cross-cuts
  every node's tactical layer, not one node) and `JSON API` (a surface, not a single model node).
  `SPA` maps only loosely to rm-model-index (the payload it consumes), which I recorded.

## Flagged term (status != resolved)
- `term-smb-event-storming-name` (**partial**): the registration alias `event-storming` (MCP_NAME,
  server.mjs:24) vs the McpServer self-identifier `event-storming-recovery` (mcp.mjs:20) is a genuine
  definitional ambiguity — a newcomer asking "what is this MCP server called?" gets two answers. The
  `openQuestion` asks which name is canonical. This is the DEFINITION being uncertain, not a restatement
  of hotspot `hot-mcp-name-mismatch` (which I cross-reference rather than duplicate).

## Cross-area terms to de-dupe (orchestrator: keep the best single definition)
- **Anchor** — I defined it as runtime jargon (grounding reads through anchors, SPA makes vscode:// links).
  The schema/method or a data-model area may also want it. If another area owns "tactical anchor" as a
  method concept, prefer that and drop mine, OR keep mine as the runtime usage. Flagging for a merge call.
- **Grounding / grounded context** — could plausibly be claimed by an authoring/trace area. I own it here
  as the runtime assembly of source-behind-anchor. If it appears elsewhere, keep this one (it is anchored
  to buildNodeContext/readSource, the actual mechanism).
- **MCP / Model Context Protocol** — if a "plugin" or "distribution" area also defines MCP, keep one.
  Mine is scoped to the es-view server's role (tools + resource over streamable HTTP).
- No overlap expected with the es-method glossary (that area is pure DDD/Event Storming method vocabulary;
  none of my 18 terms collide with its 18).

## Schema friction
None. The Term schema fit cleanly; the one flagged term uses `status: partial` + `openQuestion` exactly
as specified, and all relatedNodes resolve against the merged model's nodes[].
