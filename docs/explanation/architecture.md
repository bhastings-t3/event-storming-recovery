# How the app fits together

*Explanation. Part of the [documentation set](../README.md).*

This is about the running tool, the Node side of `event-storming-recovery` and the pipeline that
feeds it, not the recovery method itself (that's [`METHOD.md`](METHOD.md)). It's for understanding
why the pieces are shaped the way they are, not for driving them; for that, see the
[CLI](../reference/cli.md) and [MCP](../reference/mcp.md) reference and the
[how-to guides](../how-to/).

## The model is canonical, the views are generated

`flows.json` is the single source of truth. `explorer.html` and `flows.dot` are both rendered from
it by the `generate` command (`src/adapters/cli/es-generate.ts`, which calls
`src/application/commands/generate-views.ts`), and nothing hand-edits them: if a view is wrong, the
fix is a trace or the generator, then a re-render, never a hand patch to the HTML or the DOT. This
is what keeps the model diffable (it's JSON, reviewable in a pull request) while the views stay
disposable and always in sync with it.

Shared node ids are what let many independently-traced flows join into one map instead of staying
30 islands: one `agg-order`, referenced by every flow that touches ordering, so clicking that
aggregate from any flow lands on the same node. That only works because the recovery method
agrees a shared-id glossary up front (see METHOD.md's Phase 1); the schema itself just enforces
that ids resolve.

## Ports and adapters, in three layers

The Node side is TypeScript, laid out as ports-and-adapters (a.k.a. hexagonal architecture):

- **`src/domain/`** — pure aggregates that own their own invariants, with no I/O and no framework
  dependency. The `Model` aggregate (`model.ts`, `invariants.ts`, `merge.ts`, `types.ts`,
  `palette.ts`) is the typed schema plus the merge/validate rules; `comment-store/` is the
  in-memory comment aggregate; `session/` holds `Selection` and `ContextBundle` (the live
  human-attention state); `source/` shapes a windowed source-code view. Nothing here reads a file
  or opens a socket.
- **`src/application/`** — the application layer that orchestrates the domain: one handler per use
  case under `commands/` (`select-node`, `add-comment`, `merge-traces`, `generate-views`, …) and
  `queries/` (`get-node`, `get-flow`, `list-model`, …), plus `read-models/` (grounded projections
  like the node/flow context bundle rendered for both the UI and Claude) and `services.ts` (the
  shared bundle: resolved model, indexes, repo root, comment store, source reader). Handlers depend
  only on the **ports** declared in `ports.ts` (`ModelRepository`, `CommentRepository`,
  `SourceGateway`, `ClaudeCliGateway`, `BrowserGateway`, `Clock`) — interfaces, never concrete
  adapters.
- **`src/adapters/`** — everything that touches the outside world, implementing those ports:
  `fs/` (`model-repository.ts`, `comment-repository.ts`, `source-gateway.ts`,
  `generator-writer.ts` — reading/writing files), `process/` (`claude-cli.ts` shells out to
  `claude mcp add`; `browser.ts` opens the user's browser), `http/server.ts` (the JSON API),
  `mcp/mcp-server.ts` (the MCP endpoint), and `cli/` (the commander entry `cli.ts` plus the
  `runView`/`runMerge`/`runGenerate` action modules, one per subcommand).

The dependency arrow always points inward: adapters depend on application, application depends on
domain, and nothing in `domain/` or `application/` imports from `adapters/`. Each CLI entry
(`es-view.ts`, `es-merge.ts`, `es-generate.ts`) is a **composition root**: it's the one place that
constructs the concrete adapters (the real filesystem repository, the real source gateway, the
real Claude CLI gateway) and injects them into the application layer. That's also why the domain
and application code is straightforward to reason about and test in isolation: swap in a fake
`ModelRepository` and every command/query behaves identically, no server or filesystem required.

`src/web/` (the React SPA) sits outside this layering; it's a separate build (Vite) that talks to
the HTTP adapter over `/api/*`, the same way any external client would.

## One process, three faces, one application layer

`event-storming-recovery view` starts a single Node HTTP server
(`src/adapters/http/server.ts`) that answers three kinds of request, and — this is the point of the
layering above — **both non-SPA faces call the exact same application-layer commands and queries**:

- **The SPA** (`dist/web`, built by Vite): the Flows board, Gallery, Glossary, Overview, and
  source-linked detail panel a human clicks around in.
- **A JSON API** (`/api/*`): each route is a thin adapter that parses the HTTP request, calls an
  application command or query (`selectNode`, `listContextBundle`, `getItem`, `viewSource`, …), and
  serializes the result. The model, the current selection, the curated context bundle, source file
  contents for the "view source" panel, and comments (which persist to a `comments.json` sidecar
  next to the model, so they survive a model regeneration).
- **An MCP endpoint** (`POST /mcp`, `src/adapters/mcp/mcp-server.ts`): each tool handler
  (`get_current_selection`, `get_node`, `get_flow`, `list_model`, `list_data_model`) and the
  `event-storming://selected-nodes` resource call the identical application queries and
  read-models as the HTTP routes above — `buildNodeContext`, `getNode`, `getFlow`, `listModel`,
  `listDataModel`, `renderBundleMarkdown` all live in `src/application/`, not duplicated per
  adapter.

Both faces are constructed once, in `runView` (`src/adapters/cli/es-view.ts`), from one
`ServiceBundle` (`buildServices`) and one pair of session objects (`Selection`, `ContextBundle`),
which is why they share state: clicking a node in the browser and then asking a connected Claude
session to "explain the selected node" produce consistent answers. There is no sync step, no
polling, no separate database, and no risk of the HTTP and MCP faces drifting apart on what a given
node or flow actually means, because they're both calling into the same handful of application
functions rather than each re-deriving the answer.

The MCP design deliberately splits "current selection" and "curated bundle" into different MCP
primitives. Selection is a **tool** (`get_current_selection`): always fresh, no subscription to
manage, matching how a human's attention moves one click at a time. The bundle is a **resource**
(`event-storming://selected-nodes`): something a user deliberately curates over several clicks and
then hands over as a set, which fits the `@`-mention model better than a tool call.

## Source anchors are the bridge back to code

Every behavioral node (and most physical ones) carries `tactical.anchors`: real `path`/`line`
pointers, ideally with a `symbol` name too, since line numbers rot across rebases but symbols
survive them. The explorer turns these into `vscode://file/...` deep links. This is what makes the
model a genuine bridge between the strategic and tactical planes instead of a static diagram: a
strategic sticky with no way back to the code that implements it would be a dead end, so the
schema treats anchors as close to mandatory as it gets (see the anchor rules in
[`flows-schema.md`](../reference/flows-schema.md)).

## Two layers, kept demand-driven

The rendered model has a behavioral layer (actors, commands, aggregates, events, policies, read
models) and a physical data layer (datastores and fields, self-nesting through `parent`). Both are
demand-driven: the data layer only ever includes the datastores and fields the behavioral model
actually references, never a full schema dump. That keeps the model's size proportional to what's
actually understood, and keeps the explorer's Data model tab readable instead of turning into an
ERD export. The reasoning for keeping these two layers (and the further split between transactional
and dataflow/pipeline modeling) belongs to the method, not the app; see METHOD.md's two-plane rule
and Phase 5.5.

## The tool models itself

`examples/event-storming-recovery/` is this repo's own recovered self-model, produced by running
the workflow against this codebase. It exists as a working example you can open with no setup (see
the [Getting Started tutorial](../tutorials/getting-started.md)), and as a proof that the method
tolerates being pointed at itself, a pipeline-shaped system rather than a typical CRUD app, without
the two-plane rule breaking down.
