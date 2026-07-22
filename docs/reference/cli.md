# CLI reference

*Reference. Part of the [documentation set](../README.md).*

The package's `bin` entries (see `package.json`) and the `npm` scripts used to build and run it.
This describes the commands; for the recovery workflow they fit into, see the
[how-to guides](../how-to/) or [the method](../explanation/METHOD.md).

## `event-storming-recovery` / `es-view`

Both names run the same script, `bin/es-view.mjs`. It boots the interactive Event Storming
explorer: one local server that serves the SPA, its JSON API, and the MCP endpoint (see the
[MCP reference](mcp.md)), then opens a browser.

```
npx event-storming-recovery view [options]
es-view [options]
```

A leading `view` is optional and accepted for readability; the script does nothing else.

| option | description |
|---|---|
| `--model <flows.json>` | serve this already-merged model |
| `--traces <dir>` | merge the per-flow trace JSONs in `<dir>` on the fly |
| `--repo-root <path>` | repo root for resolving source anchors (default: current directory) |
| `--port <n>` | preferred port (default `5178`; falls forward if taken) |
| `--host <addr>` | bind address (default `127.0.0.1`) |
| `--no-open` | don't launch the browser |
| `--open` | launch the browser (default) |
| `-h`, `--help` | show help |

A bare positional argument (no leading `-`) is treated as `--model` for convenience:
`es-view path/to/flows.json` is short for `es-view --model path/to/flows.json`.

With no `--model` / `--traces`, `es-view` auto-discovers a `**/model/flows.json` under the current
directory, and falls back to the bundled example (this tool's own recovered self-model) if none is
found.

On boot it prints the URL, which model it's serving and from where, the node/flow/hotspot counts,
and the exact `claude mcp add` command to connect a Claude terminal (see
[how to connect a Claude terminal](../how-to/connect-a-claude-terminal.md)).

## `es-merge`

Runs `tools/merge-flows.js`: combines per-flow trace JSONs into one validated `flows.json`.

```
es-merge <tracesDir> <outFile>
node tools/merge-flows.js <tracesDir> <outFile>
```

- `<tracesDir>`: directory of per-flow trace JSON files (and, optionally, `*.glossary.json` /
  `*.data.json` slices).
- `<outFile>`: path to write the merged, validated `flows.json` to.

Merges shared nodes (same `id` across flows), accumulating each source's tactical detail as a
per-flow `usages` entry; folds in any `terms` (glossary) and physical `datastore`/`field` nodes
(data model) present in the traces dir; then validates the result (every referenced id resolves,
aggregates never issue commands, invariants attach to aggregates, flagged terms carry an
`openQuestion`). Prints node/flow/hotspot/term counts and a warnings/errors report. Exits non-zero
on validation errors, leaving no output file in that case.

## `es-generate`

Runs `tools/generate-views.js`: renders a merged `flows.json` to the two generated views.

```
es-generate <flows.json> <outDir> [--repo-root <path>] [--title <text>]
node tools/generate-views.js <flows.json> <outDir> [--repo-root <path>] [--title <text>]
```

- `<flows.json>`: the merged, validated model.
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
| `npm run dev` | runs `scripts/dev.mjs`: starts the `es-view` API server (no browser) and the Vite dev server together, so you get the SPA with a live `/api` (`node bin/es-view.mjs --no-open` on `5178`, Vite on `5179`, proxying `/api`). Stop both with Ctrl+C. |
| `npm run build` | `vite build`: builds the production SPA bundle into `dist/web`, which `es-view` serves. |
| `npm run demo` | runs `scripts/build-example.mjs`: rebuilds the bundled example (`examples/event-storming-recovery/model/`) from its committed traces, via `es-merge` then `es-generate`. Pure Node, no other dependencies. |
| `npm test` | `node --test`: runs the smoke tests (`tests/`) covering merge, generate, and the validator against `tests/fixtures/toy-shop/`. |
| `npm run preview` | builds, then boots `es-view` against the build output. |
| `npm run prepack` | runs `npm run build` before packing/publishing; not a command you run directly. |
