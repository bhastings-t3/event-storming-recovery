# How to connect your Claude terminal to a running explorer

*How-to guide. Part of the [documentation set](../README.md).*

This connects a `claude` terminal session to a running `es-view` explorer, so the session can read
the node or flow you have selected in the browser and act on it. It assumes the explorer is either
already running or you're about to start it; for the tools this exposes, see the
[MCP reference](../reference/mcp.md).

**Prerequisite:** Claude Code (the `claude` CLI) installed and on your PATH, since the connection is
made with `claude mcp add`.

## 1. Make sure the app is running

Start it if it isn't:

```sh
npx event-storming-recovery view --model <path/to/flows.json> --repo-root .
```

Drop `--model` to let it auto-discover a `**/model/flows.json` under the current directory. On boot
it prints a banner with **the URL it actually bound to** (usually `http://127.0.0.1:5178`, but it
falls forward to the next free port if that one is taken) and the exact `claude mcp add` command for
that URL. Note the printed URL, since you'll point the MCP server at it in step 2.

To check whether an instance is already up before starting a second one, curl the info endpoint at
the port from the banner (5178 shown here):

```sh
curl -s http://127.0.0.1:5178/api/mcp/info
```

It answers with the server name, URL, and the `claude mcp add` command when the app is running.

> **Plugin users:** the plugin's declared MCP server URL is pinned to `http://127.0.0.1:5178/mcp`,
> so if you rely on the plugin to auto-connect (step 2), the app **must** be on port 5178, so free
> that port and retry rather than letting it fall forward. Adding the server by hand (below) has no
> such constraint: you just point it at whatever URL the banner printed.

## 2. Add the MCP server

If you installed the plugin, it already declares the `event-storming` MCP server; once the app is
up on port 5178, a Claude session in that repo connects to it on its own; if tools aren't showing
up, run `/mcp` or restart the session.

If you're not using the plugin (for example you started the app with `npx`), add it yourself, once
per project, using the URL from the banner:

```sh
claude mcp add --transport http event-storming http://127.0.0.1:5178/mcp
```

`es-view` prints this exact command (with the port it actually bound to) when it starts, so copy it
from the banner rather than retyping it and guessing the port. To commit the connection so every
collaborator in a repo checkout gets it automatically, add a project-scoped server instead
(`claude mcp add --scope project ...`), which writes it into a `.mcp.json` in the repo. (There is no
`.mcp.json.example` in the npm package to copy; the banner command is the source of truth.)

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
