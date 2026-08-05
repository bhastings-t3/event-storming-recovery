# 8. The flow-board geometry is one shared browser module, imported by both explorers

Date: 2026-08-05

## Status

Accepted

## Context

The Event-Storming flow board is rendered by two explorers: the live React SPA
(`src/web/lib/layout.js`, bundled by vite) and the static generated
`explorer.html` (`src/web/static-explorer/explorer-client.ts`, bundled by
esbuild — ADR-0007). Both carried their own copy of the same imperative layout
engine: `renderFlowInto`, `setupPanZoom`, `placeCard`, `borderPoint`,
`makePath`, `curveD`, `curveInto`, plus the constants they share. Four helpers
were byte-identical; three had **drifted** — the SPA had evolved a `ctx`
dependency-injection form (`{ nodeById, palette, selectedId, onOpenDetail,
onContextMenu }`), a right-click context menu, and extra pan-exclusion selectors
for its data-model board and Flow/Data toggle, while the static client stayed on
module globals with no menu. A layout fix had to be made in two places or the
boards would diverge (issue #42, Target 3 of the maintainability sweep).

Before ADR-0007 this was intractable: the static client was an inlined template
**string**, so it could not `import`. Now that it is a real module under
`src/web`, both consumers are ordinary modules that a bundler can wire to a
shared import — no codegen, no text-inlining.

## Decision

Extract the geometry into one shared browser module,
`src/web/lib/flow-geometry.js`, that **both** explorers import (vite bundles it
into the SPA; esbuild bundles it into the static client). The SPA's `ctx`-
injection form is the single shared implementation; the three drifted functions
are reconciled by **parameterisation, not by picking a winner**:

- Each consumer passes a `ctx` reproducing its own current behaviour. The SPA
  threads a real `onContextMenu` (keeping its context menu); the static client
  omits it (`onContextMenu` undefined → stays menu-less).
- `setupPanZoom` takes the pan-exclusion selector list as a `panIgnore`
  parameter defaulting to the behavioural base set. `layout.js` wraps it to
  inject the SPA's extended selectors (`.dm-node`, `.dm-badge-circle`,
  `.board-views`); the static client passes no override. So neither set is
  hardcoded in the shared module, and `layout.js`'s public surface
  (`renderFlowInto`, `setupPanZoom`) is unchanged for its React callers.

The module imports `el` from `src/web/lib/dom.js` and `DATA_TYPE_SET` from
`src/application/read-models/indexes` — the same inward import `layout.js`
already made (`src/web` may depend inward; the ports-and-adapters boundary only
forbids domain/application importing adapters/web, and this adds no such import).

## Consequences

- The layout engine lives once. The SPA keeps its context menu and DM pan
  exclusions; the static explorer keeps neither — **zero behaviour change on
  either side**, proven by the SPA + static-explorer E2E staying green with no
  assertion changes.
- The static client's esbuild bundle now inlines `dom.js` + `flow-geometry.js` +
  the tree-shaken `DATA_TYPE_SET`, so `explorer.html`'s embedded bytes shift.
  As in ADR-0007, byte-identity is not the guarantee — the E2E is — so the
  `generate-views` golden fixture and the committed example `explorer.html` were
  re-baselined after the E2E confirmed behaviour.
- Only the pure flow geometry is shared. The data-model tree
  (`dataModelTree`), still built in three forms, is left for a separate pass.
