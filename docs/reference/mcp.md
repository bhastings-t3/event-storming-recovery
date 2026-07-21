# MCP reference

*Reference. Part of the [documentation set](../README.md).*

The MCP face of the running `es-view` server (`src/server/mcp.mjs`), verified against the source.
It runs in the same process as the web UI and shares its in-memory state, so a selection made in
the browser is what a connected Claude session reads. For the procedure to connect a terminal to
it, see [how to connect a Claude terminal](../how-to/connect-a-claude-terminal.md).

## Endpoint

- **Transport:** streamable HTTP, mounted at `POST /mcp` on the running `es-view` server (default
  `http://127.0.0.1:5178/mcp`).
- **Session:** stateful. An `initialize` request starts a session (`Mcp-Session-Id` header);
  subsequent requests reuse it.
- **Server name:** `event-storming-recovery` (declared as `event-storming` by the plugin's
  `.claude-plugin/plugin.json` and `.mcp.json.example`).

## Tools

### `get_current_selection`

Returns the domain node the human is currently looking at in the explorer UI: label, type,
description, the invariants it enforces, the flows it appears in, and the real source behind each
anchor. Takes no arguments. If nothing is selected, returns a message saying so instead of an
error.

### `get_node`

Returns the grounded context for a specific node id: its type, description, enforced/enforcing
invariants, flows, and source anchors with real code.

| parameter | type | description |
|---|---|---|
| `nodeId` | string | the node id, e.g. `"agg-order"` (see `list_model` for ids) |

### `get_flow`

Returns a whole flow grounded in code: its trigger/summary, the command to aggregate to event
chain, hotspots (open questions), and every node in it with its source anchors. Includes a Mermaid
graph of the flow's shape.

| parameter | type | description |
|---|---|---|
| `flowId` | string | the flow id, e.g. `"place-order"` (see `list_model` for ids) |

### `list_model`

A compact index of the whole model: every flow id and name, and every node id, label, and type.
Takes no arguments. Use it to discover ids for `get_node` / `get_flow`.

### `list_data_model`

The physical storage the code actually touches: servers, databases, tables, columns (or the
equivalent for non-relational storage), and for each, which behavioral nodes write, read, or
project it. Use this for "what tables does this touch" or "where does this data live"; for a
single node's fields and lineage, use `get_node` instead. Takes no arguments.

## Resource

### `event-storming://selected-nodes`

The curated context bundle: the items the human has gathered in the explorer (right-click, "Add to
context bundle"): nodes, whole flows (each with a Mermaid graph), and hotspots, every one grounded
with its invariants, flows, and source anchors. `mimeType: text/markdown`. `@`-mention it to hand
Claude the entire curated set at once.

## Errors

Unknown node/flow ids return a text result naming the problem (e.g. `` Unknown node 'agg-foo'. Use
list_model to see available node ids. ``) rather than an MCP protocol error, so a model reading the
tool result can recover without a retry loop.
