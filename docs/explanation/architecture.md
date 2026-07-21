# How the app fits together

*Explanation. Part of the [documentation set](../README.md).*

This is about the running tool, the `es-view` app and the pipeline that feeds it, not the
recovery method itself (that's [`METHOD.md`](METHOD.md)). It's for understanding why the pieces
are shaped the way they are, not for driving them; for that, see the
[CLI](../reference/cli.md) and [MCP](../reference/mcp.md) reference and the
[how-to guides](../how-to/).

## The model is canonical, the views are generated

`flows.json` is the single source of truth. `explorer.html` and `flows.dot` are both rendered from
it by `tools/generate-views.js`, and nothing hand-edits them: if a view is wrong, the fix is a
trace or the generator, then a re-render, never a hand patch to the HTML or the DOT. This is what
keeps the model diffable (it's JSON, reviewable in a pull request) while the views stay disposable
and always in sync with it.

Shared node ids are what let many independently-traced flows join into one map instead of staying
30 islands: one `agg-order`, referenced by every flow that touches ordering, so clicking that
aggregate from any flow lands on the same node. That only works because the recovery method
agrees a shared-id glossary up front (see METHOD.md's Phase 1); the schema itself just enforces
that ids resolve.

## One process, three faces

`es-view` starts a single Node HTTP server (`src/server/server.mjs`) that answers three kinds of
request from one shared in-memory state (`src/server/state.mjs`):

- **The SPA** (`dist/web`, built by Vite): the Flows board, Gallery, Glossary, Overview, and
  source-linked detail panel a human clicks around in.
- **A JSON API** (`/api/*`): the model, the current selection, the curated context bundle, source
  file contents for the "view source" panel, and comments (which persist to a sidecar file next to
  the model, so they survive a model regeneration).
- **An MCP endpoint** (`POST /mcp`, `src/server/mcp.mjs`): the same in-memory selection and bundle,
  exposed as MCP tools and a resource (see the [MCP reference](../reference/mcp.md)).

Because all three faces read the same `state` object in the same process, clicking a node in the
browser and then asking a connected Claude session to "explain the selected node" produce
consistent answers: there is no sync step, no polling, no separate database. The tool call and the
browser click are two views onto one piece of server memory.

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
