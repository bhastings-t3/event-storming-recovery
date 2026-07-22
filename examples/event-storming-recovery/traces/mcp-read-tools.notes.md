# mcp-read-tools — trace notes

Flow: the non-selection MCP read surface a connected Claude uses to pull grounded model
context — `get_node`, `get_flow`, `list_model`, `list_data_model`, and the
`event-storming://selected-nodes` resource. (`get_current_selection` is a sibling flow, owned by
the selection agent; not modeled here.)

## Reachability
- **LIVE.** All five surfaces are registered on the McpServer built by `buildMcpServer`
  (`src/server/mcp.mjs:18`) and connected to a real `StreamableHTTPServerTransport` on every
  `initialize` (`mcp.mjs:131-138`). The handler is mounted at `POST /mcp` on the running es-view
  server, reachable by any client registered via `claude mcp add` (MCP_NAME `event-storming`,
  `server.mjs:24`/`201`). Trigger end: an MCP tool/resource call arrives over /mcp. Sink end:
  each projection reads the boot-time `services` (`buildServices`, `server.mjs:85`) and, for the
  grounded reads, the repo filesystem via `readSource` (`source.mjs:13`). Both ends reached ⇒ live.

## Model shape decisions
- Modeled the five surfaces as five **read models** projecting from `agg-model` (and the resource
  additionally from `agg-context-bundle`), all issued by `ext-claude-mcp` in one branching read
  DAG, per the briefing. IDs: `rm-model-listing` (list_model), `rm-grounded-node` (get_node),
  `rm-grounded-flow` (get_flow), `rm-data-model` (list_data_model, **reused** shared id),
  `rm-selected-bundle` (resource).
- **Reused shared ids:** `agg-model`, `agg-context-bundle`, `ext-claude-mcp`, `rm-data-model`,
  `ds-model-fs`. Consumer named `ext-claude-mcp` per the shared glossary (the older example trace
  used `ext-claude-mcp-client`; converged to the glossary id).
- **Source grounding as a datastore:** the grounded reads pull real code excerpts from the repo
  source tree, so I modeled `ds-repo-source` (directory, `parent: ds-model-fs`) and gave the three
  grounded read models a `projects from ds-repo-source` edge. `list_model`/`list_data_model` have
  no such edge — they never touch the filesystem. Datastores are satellites (edges/parent only),
  not in the `steps` lane, per the data-model rules.
- **No invariants** on this flow: it is a pure read; nothing can reject it. Unknown ids return a
  friendly text result, not a rejection (documented intent, `mcp.md` Errors section).

## Aggregate-boundary note (for the orchestrator to reconcile)
- `selection` and `bundle` live in ONE `createState()` closure (`state.mjs:9`). The briefing
  pre-assigned two ids (`agg-selection`, `agg-context-bundle`); I used `agg-context-bundle` for the
  resource since it reads only the bundle half (`state.getBundle()`), and left `agg-selection` to
  the selection agent. If the orchestrator prefers one state aggregate, these two collapse — the
  code enforces no boundary between them.

## Surprises / contradictions (the findings)
1. **"stateless" vs stateful contradiction.** The `mcp.mjs` file header comment (line 4) calls the
   transport "stateless", but the `createMcpHandler` JSDoc (line 115) and `docs/reference/mcp.md`
   both say **stateful**, and the implementation keeps a per-session `transports` Map keyed by
   `Mcp-Session-Id`. The header comment is stale/wrong. Captured in `ext-claude-mcp` tactical.
2. **Tool descriptions drift from behavior + `mcp.md`** → hotspot `hot-mcp-read-desc-drift`.
   - `get_flow`'s registered `description` (`mcp.mjs:54`) never mentions the **Mermaid graph** it
     always returns (`renderFlowMarkdown` appends `fc.mermaid`, `context.mjs:297`). `mcp.md` does
     document the graph. A client choosing tools by description wouldn't know get_flow yields a graph.
   - `list_data_model`'s registered `description` (`mcp.mjs:81`) is relational-only
     ("servers ▸ databases ▸ tables ▸ columns"), but the implementation
     (`dataModelTree`/`renderDataModelMarkdown`) is storage-neutral (any `storeKind`), and `mcp.md`
     hedges with "(or the equivalent for non-relational storage)".
3. **Unbounded grounded output** → hotspot `hot-mcp-grounded-output-unbounded`. `get_flow` and the
   bundle resource ground EVERY node/item with a ±8-line source excerpt per anchor
   (`includeSource` defaults true and the tools never pass false), with no output-size cap — while
   the inbound body is capped at 4MB (`readJsonBody`, `mcp.mjs:106`). `buildNodeContext` already
   supports `includeSource:false`; the MCP tools just don't expose it.
4. **Name-mismatch is now DOCUMENTED (previously a hotspot).** The McpServer self-name is
   `event-storming-recovery` (`mcp.mjs:20`) while registration/alias is `event-storming`
   (`MCP_NAME`, `server.mjs:24`; resource URI scheme `event-storming://`). The older model raised
   this as `hot-mcp-name-mismatch`; `mcp.md` line 16-17 now explicitly states the two-name split
   ("declared as `event-storming` by the plugin's plugin.json / .mcp.json.example"). I did NOT
   re-raise it as a divergence hotspot — it's now a documented, intentional design choice. Noting
   it here so the merge doesn't resurrect a stale hotspot.
5. **Boot-time model snapshot.** `services` is built once by `buildServices` at boot, so the read
   tools always project the model as of server start; edits to `flows.json` on disk are not
   reflected until restart (human comments via `services.comments` are the only mutable part).
   This is really the server-session agent's territory (lifecycle of `buildServices`); flagged
   here as a cross-boundary observation, not modeled as my hotspot.

## Unresolved / for a human
- The two hotspots above (`hot-mcp-read-desc-drift`, `hot-mcp-grounded-output-unbounded`) are the
  open questions from this surface.
- `services.comments` may be `null` (buildServices default); when so, `get_node`/bundle silently
  return no human comments. Expected, not a bug — noted for completeness.

## Schema friction
None.
