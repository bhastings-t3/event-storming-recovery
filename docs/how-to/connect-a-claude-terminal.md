# How to connect your Claude terminal to a running explorer

*How-to guide. Part of the [documentation set](../README.md).*

This connects a `claude` terminal session to a running `es-view` explorer, so the session can read
the node or flow you have selected in the browser and act on it. It assumes the explorer is either
already running or you're about to start it; for the tools this exposes, see the
[MCP reference](../reference/mcp.md).

## 1. Make sure the app is running

Check first, so you don't start a second instance:

```sh
curl -s http://127.0.0.1:5178/api/mcp/info
```

- If it answers with `"name":"event-storming"`, it's already running; skip to step 2.
- If the connection is refused, start it:
  ```sh
  npx event-storming-recovery view --model <path/to/flows.json> --repo-root . --port 5178
  ```
  Drop `--model` to let it auto-discover a `**/model/flows.json` under the current directory.
- If it answers but the name isn't `event-storming`, something else owns port 5178. The plugin's
  MCP server URL is pinned to that port, so free it and retry rather than picking a different port.

## 2. Add the MCP server

If you installed the plugin, it already declares the `event-storming` MCP server; once the app is
up, a Claude session in that repo connects to it on its own; if tools aren't showing up, run `/mcp`
or restart the session.

If you're not using the plugin, add it yourself, once per project:

```sh
claude mcp add --transport http event-storming http://127.0.0.1:5178/mcp
```

`es-view` prints this exact command (with the port it actually bound to) when it starts, so you
can copy it from there instead of retyping it. If you'd rather commit the connection to the repo so
every collaborator gets it automatically, copy `.mcp.json.example` to `.mcp.json` and commit it.

You can also connect from inside the app itself: the explorer's connect affordance runs this same
`claude mcp add` command on your behalf, so you don't need a separate terminal for it.

## 3. Verify the connection

In the connected Claude session, ask it to call `list_model` (or just say "what's in this
model?"). You should get back the flow and node index. If it fails, confirm you're in the same
project the MCP server was added to (`claude mcp add` without `--scope user` scopes to the current
project) and that the app is still running.

## 4. Use it

Click a node or flow in the browser, then in the connected session:

- *"explain the selected node"* → `get_current_selection`
- *"consolidate these two aggregates"* (after gathering them into the context bundle in the app) →
  `@event-storming:event-storming://selected-nodes`

See the [MCP reference](../reference/mcp.md) for the full tool list, and the
[`event-storming-explorer` skill](../../skills/event-storming-explorer/SKILL.md) for how a plugin
install drives this automatically.
