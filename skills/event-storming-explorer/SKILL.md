---
name: event-storming-explorer
description: >-
  Open and work with the interactive Event Storming explorer — the npx-run app whose MCP server
  lets Claude read what the user is looking at. Use when someone says "use the event storming
  explorer", "open the explorer", "explore the domain model / the flows", "let's look at the event
  storm", "I'm looking at an aggregate in the explorer", "the selected node/flow/aggregate", or
  wants to visualize the recovered model and drive refactors from it (e.g. "consolidate these
  aggregates", "add these invariants to the selected aggregate"). Launches the viewer, connects the
  MCP context bridge, and — if no model exists yet — offers to build one first via the
  event-storming-recovery workflow.
---

# Event Storming Explorer

The explorer is a local app (`npx event-storming-recovery view`) that renders the recovered model
as an interactive board (Flows, Gallery, Glossary, Overview, source-linked detail) **and** hosts an
MCP server. It is a **context authority, not a Claude owner**: the human clicks a node/flow in the
browser, and you read that live selection (and their curated bundle) through this plugin's
`event-storming` MCP server. You then do the real work — implement invariants, consolidate
aggregates — in *this* session, on the real files, to a PR.

Requires the `event-storming-recovery` npm package on `npx` (published to npm, or `npm link`-ed
during development). The MCP server is declared by this plugin at `http://127.0.0.1:5178/mcp` and
connects lazily once the app is running, so the app **must run on port 5178**.

## When the user wants to explore, do this in order

### 1. Make sure a model exists

The explorer needs a recovered model — a `flows.json` (usually under `<repo>/**/model/flows.json`
or `docs/event-storming/model/flows.json`). Search the current repo for one (Glob `**/flows.json`,
ignoring `node_modules`, `.git`, and this plugin's own `examples/`). A real model has top-level
`nodes` and `flows` arrays.

- **If a model exists** → go to step 2.
- **If none exists** → tell the user plainly: *"I don't see a recovered model in this repo yet.
  Building one runs the Event Storming recovery workflow — parallel scout + deep-trace sub-agents,
  with a triage checkpoint with you. Want me to run it now?"* **Wait for their go-ahead.** On yes,
  invoke the **`event-storming-recovery`** skill and drive that workflow to produce
  `<out>/model/flows.json`; then come back here. Do **not** silently kick off that large multi-agent
  process.

### 2. Make sure the app is running on port 5178

Check first, so you reuse a running instance instead of starting a second one:

```sh
curl -s http://127.0.0.1:5178/api/mcp/info
```

- Returns JSON with `"name":"event-storming"` → it's already running; reuse it.
- Connection refused → start it in the **background** (it's a long-running server; it opens the
  user's browser):
  ```sh
  npx event-storming-recovery view --model <path/to/flows.json> --repo-root . --port 5178
  ```
  (Drop `--model` to let it auto-discover.) Then poll `curl http://127.0.0.1:5178/api/mcp/info`
  until it answers.
- Answers but is **not** our app (no `event-storming` name) → port 5178 is taken by something else.
  Tell the user; ask them to free 5178 (the plugin's MCP URL is pinned to it), then retry.

Give the user the URL (`http://127.0.0.1:5178`) and tell them to click around.

### 3. Confirm the MCP bridge

This plugin already declares the `event-storming` MCP server, so once the app is up it connects on
its own. If tools aren't visible, tell the user to run `/mcp` (or restart the session). Sanity-check
with the `list_model` tool.

## Working with the explorer (standing behavior)

Once the app is running, treat the explorer as the source of truth for **what the human is looking
at**, and reach for the MCP tools instead of guessing:

- The user says **"the selected node / aggregate / flow / hotspot"**, **"this one"**, **"what I'm
  looking at"**, **"explain this"** → call **`get_current_selection`**. It returns the node grounded
  in its invariants, the flows it lives in, and the **real source** behind each anchor (`file:line`).
- They name a specific flow or node → **`get_flow`** / **`get_node`** (see **`list_model`** for ids).
  A flow result includes a **Mermaid graph** so you can see its shape (command → aggregate → event →
  policy …) plus every node's source anchors.
- They've gathered several items in the app's **context bundle** → the **`event-storming://selected-nodes`**
  resource is the whole set at once (each flow with its Mermaid graph). Use it for multi-item tasks
  like *"consolidate these fractured aggregates"*.

Then act on it: when the user asks for a change ("add these two invariants to the selected
aggregate", "merge these aggregates"), use the **source anchors from the tool result** to find the
real files, make the change in this session, run their tests, and take it to a PR following their
normal git workflow. Cite the `file:line` you're editing. Confirm significant model changes before
implementing.

## Lifecycle

The app is a local server the user launched; it must stay running while you collaborate. If you
started it in the background, remember its shell so you can stop it (or tell the user to Ctrl+C the
`es-view` process) when they're done. Selection/bundle state lives only for that run.

## Related

- **`event-storming-recovery`** — the workflow that *builds* the model (run it in step 1 when none
  exists). This explorer skill is the *use-it-afterwards* half.
