# CLI reference

*Reference. Part of the [documentation set](../README.md).*

The package's `bin` entry (see `package.json`) and the `npm` scripts used to build and run it.
This describes the commands; for the recovery workflow they fit into, see the
[how-to guides](../how-to/) or [the method](../explanation/METHOD.md).

## `event-storming-recovery`

One unified [commander](https://github.com/tj/commander.js) bin (`src/adapters/cli/cli.ts`, built
to `dist/node/adapters/cli/cli.js`) with three subcommands: `view`, `merge`, `generate`. `es-view`
is a bin alias for the same entry point, kept for the old muscle memory.

```
npx event-storming-recovery <command> [options]
npx event-storming-recovery [options]          # bare invocation = `view` (the default command)
es-view [options]                              # alias for `event-storming-recovery view`
```

The package is published to npm, so `npx event-storming-recovery <command>` works with no clone or
prior install (needs Node **>= 22.12**). If you're developing against a local checkout instead, run
`npm run build` and invoke the built bin directly: `node dist/node/adapters/cli/cli.js <command>
[options]`.

### `view`

Boots the interactive Event Storming explorer: one local server that serves the SPA, its JSON API,
and the MCP endpoint (see the [MCP reference](mcp.md)), then opens a browser. This is the default
command — a bare `npx event-storming-recovery` (no subcommand) runs it.

```
npx event-storming-recovery view [model] [options]
npx event-storming-recovery [model] [options]
```

| option | description |
|---|---|
| `[model]` (positional) | a bare path is treated as `--model` (already-merged `flows.json`) |
| `--model <flows.json>` | serve this already-merged model |
| `--traces <dir>` | merge the per-flow trace JSONs in `<dir>` on the fly |
| `--repo-root <path>` | repo root for resolving source anchors (default: current directory) |
| `--port <n>` | preferred port (default `5178`; falls forward if taken) |
| `--host <addr>` | bind address (default `127.0.0.1`) |
| `--no-open` | don't launch the browser |
| `-h`, `--help` | show help |

With no `--model` / `--traces` and no positional path, `view` auto-discovers a `**/model/flows.json`
under the current directory, and falls back to the bundled example (this tool's own recovered
self-model) if none is found.

On boot it prints the URL, which model it's serving and from where, the node/flow/hotspot counts,
and the exact `claude mcp add` command to connect a Claude terminal (see
[how to connect a Claude terminal](../how-to/connect-a-claude-terminal.md)).

### `merge`

Merges per-flow trace JSONs into one canonical, validated `flows.json`.

```
npx event-storming-recovery merge <tracesDir> <outFile>
```

- `<tracesDir>`: directory of per-flow trace JSON files (and, optionally, `*.glossary.json` /
  `*.data.json` slices).
- `<outFile>`: path to write the merged, validated `flows.json` to.

Merges shared nodes (same `id` across flows), accumulating each source's tactical detail as a
per-flow `usages` entry; folds in any `terms` (glossary) and physical `datastore`/`field` nodes
(data model) present in the traces dir; then validates the result (every referenced id resolves,
aggregates never issue commands, invariants attach to aggregates, flagged terms carry an
`openQuestion`). Prints node/flow/hotspot/term counts and a warnings/errors report, and exits
non-zero on validation errors. Note it writes the merged `flows.json` to disk *before* checking for
errors, so a failed validation still leaves an (invalid) file behind: check the exit code rather
than assuming that output means success.

### `generate`

Renders a merged `flows.json` to the two generated views.

```
npx event-storming-recovery generate <flowsJson> <outDir> [--repo-root <path>] [--title <text>]
```

- `<flowsJson>`: the merged, validated model.
- `<outDir>`: directory to write `flows.dot` and `explorer.html` into.
- `--repo-root <path>`: absolute path to the analyzed checkout, so the explorer's `vscode://`
  deep links open the right local files. Defaults to the model's `meta.repoRoot` if present, else
  `.` (links resolve relative to wherever the viewer opens them).
- `--title <text>`: heading shown in the explorer and its `<title>`. Defaults to the model's
  `meta.title` if present, else `Event Storming Explorer`.

Produces:
- `flows.dot`: a Graphviz digraph, one cluster per flow, Event Storming fill colors, node URLs
  into source.
- `explorer.html`: a self-contained interactive explorer (the model is embedded, so no server or
  network is required to view it).

## npm scripts

Run from a checkout of this repo (`event-storming-recovery` itself, not a target codebase).

| script | what it does |
|---|---|
| `npm run dev` | runs `scripts/dev.mjs`: compiles the Node side (`tsc -p tsconfig.node.json`), then starts the built API server (no browser, on `5178`) and the Vite dev server (`5179`, proxying `/api`) together, so you get the SPA with a live `/api`. Stop both with Ctrl+C. |
| `npm run build` | `npm run build:node && npm run build:web`: compiles `src/` (excluding `src/web`) with `tsc -p tsconfig.node.json` into `dist/node`, then builds the SPA with `vite build` into `dist/web`. |
| `npm run build:node` | `tsc -p tsconfig.node.json` only. |
| `npm run build:web` | `vite build` only. |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.node.json`: type-checks the Node side without emitting. |
| `npm run demo` | runs `scripts/build-example.mjs`: rebuilds the bundled example (`examples/event-storming-recovery/model/`) from its committed traces, via the built CLI's `merge` then `generate` subcommands. |
| `npm test` | `node --test`: runs the smoke tests (`tests/`) covering merge, generate, and the validator against `tests/fixtures/toy-shop/` (a `pretest` script builds the Node side first). |
| `npm run preview` | builds, then boots the CLI's `view` command against the build output. |
| `npm run prepack` / `npm run prepare` | run `npm run build`; not commands you run directly (npm invokes them around pack/publish and install). |
