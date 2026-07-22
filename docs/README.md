# Documentation

This documentation set is organized around the four kinds of thing a reader needs from it,
following the [Diátaxis](https://diataxis.fr/) framework: a tutorial to learn from, how-to guides
for a task you're already competent to do, reference to look something up while working, and
explanation to understand why it's built this way. If you're new here, start with the tutorial;
if you already know the tool and have a specific job to do, jump straight to the matching how-to
guide.

## Tutorial: learn by doing

- [Getting started](tutorials/getting-started.md): install the plugin, build the bundled example,
  open the explorer, and click through a flow. One guaranteed-to-work path, no target codebase of
  your own required yet.

## How-to guides: get a specific job done

- [Run the recovery on your own codebase](how-to/run-recovery-on-your-codebase.md): drive the
  six-phase process against a real codebase to produce your own model.
- [Connect a Claude terminal](how-to/connect-a-claude-terminal.md): wire a `claude` session into a
  running explorer so it can read your live selection.
- [Extend an existing model](how-to/iterate-and-extend-a-model.md): add or update a flow, or
  evolve the schema/method itself.
- [Regenerate the explorer and DOT graph](how-to/regenerate-views.md): re-merge and re-render
  after the traces change.

## Reference: look something up

- [CLI](reference/cli.md): the unified `event-storming-recovery` CLI's `view`/`merge`/`generate`
  subcommands and the npm scripts, with every option.
- [MCP](reference/mcp.md): the `event-storming` MCP server's tools and resource, verified against
  `src/adapters/mcp/mcp-server.ts`.
- [flows.json schema](reference/flows-schema.md): the node/edge/flow/term contract every trace and
  every generated model conforms to.

## Explanation: understand why

- [The method](explanation/METHOD.md): the reasoning behind the six recovery phases, the
  recursion model, and the two-plane rule for dataflow/pipeline systems.
- [How the app fits together](explanation/architecture.md): why `flows.json` is canonical and the
  views are generated, how one process serves the SPA, the JSON API, and the MCP endpoint from
  shared state, and why source anchors are load-bearing.

## Other useful starting points

- The top-level [`README.md`](../README.md) is the fastest orientation to what this tool is and a
  30-second look at its output.
- [`prompts/`](../prompts/) holds the runnable method itself (the orchestrator playbook and the
  scout/trace/glossary/data-mapping briefings), which `explanation/METHOD.md` explains the
  reasoning behind.
- [`skills/event-storming-recovery/SKILL.md`](../skills/event-storming-recovery/SKILL.md) and
  [`skills/event-storming-explorer/SKILL.md`](../skills/event-storming-explorer/SKILL.md) are the
  two Claude Code skills this repo ships as a plugin.
