# browser-load-model — trace notes

## Flow status
`live`. Reachability confirmed end to end:
- Route exists: `src/server/server.mjs:114` handles `GET /api/model` and returns `{ model, meta }`.
- Client calls it: `src/web/api.js:4` `fetchModel` does `GET /api/model`.
- Boot fetch fires: `src/web/App.jsx:44` `useEffect` calls `fetchModel()` once on mount, feeds `ExplorerProvider` (`store.jsx:15`).
- Server is wired: `bin/es-view.mjs:82` `resolveModel` → `:90` `buildServices` → `startServer`.

## The key insight (as briefed, and confirmed)
The server is a **thin model transport**: `GET /api/model` does zero computation, just returns the
startup snapshot plus provenance meta. There is **one** payload endpoint and **no** per-view endpoints.
Every tab the viewer reads — Flows board, Gallery, Data model, Glossary, Overview — is a **read model
re-derived client-side** from that single response. Modeled the derived tabs as read models that
`project from` `agg-model` and are `read by` `actor-viewer`; `rm-model-index` is the raw transport
payload the command `returns` and the substrate the others derive from (noted in tactical, since ES
read-models grammatically project from the aggregate, not from another read model).

## Shared selectors are the single source of truth (verified)
`src/lib/selectors.mjs` is DOM-free and framework-agnostic; `src/web/model.js` re-exports it to the SPA
(lines 6-10) and `src/server/context.mjs` imports it server-side. So the browser tabs and the MCP /
markdown projections compute identically:
- `dataModelTree` / `tableConsumers` (selectors.mjs:64/83) → Data-model tab (`DataModel.jsx`).
- `nodeFlows` (selectors.mjs:16) → Glossary `sharedOnly`; `sidebarGroups`/`flowNodeIds` → Flows board.
- `galleryTypes` (model.js:13, palette-dependent so it stays local) → Gallery + Glossary chips.
Gallery and Glossary components explicitly say they are "Ported from buildGallery/renderGrid /
buildGlossary/renderGlossaryList in generate-views.js" — i.e. the SPA and the static `explorer.html`
render the same views from the same logic.

## Invariants
None on this flow. It is a pure read: no aggregate write, so no `enforces` edges and (correctly) no
event. The model's invariants are enforced upstream at merge/resolve time (see `merge-traces` trace);
`resolve-model.mjs` throws on validation errors, so the server never serves an invalid model — this read
flow can assume a valid graph.

## Hotspot
- `hot-model-loaded-once` — the explorer is a **one-shot frozen boot**. The SPA fetches once (`App.jsx`
  `useEffect` with `[]` deps, no polling/socket) and the server serves a startup snapshot with eagerly
  built indexes (`buildServices`/`resolveModel` run once in `bin/es-view.mjs main`). Seeing edited
  `flows.json` requires BOTH a server restart AND a page reload. This is the briefed "eager,
  never-invalidated indexes / frozen boot model" candidate, confirmed to be touched by this flow.

## Contradictions / surprises
- No contradictions with the briefing hints. Every hint checked out: `App.jsx:44` fetch, `api.js`
  `/api/model`, `server.mjs` route returning `{ model, meta:{source,sourcePath,repoRoot,warnings} }`,
  one React context (`store.jsx`), client-side re-derivation via shared `selectors.mjs`.
- Minor nuance worth recording: a **page reload alone is not enough** to see model edits (a reload
  re-fetches, but the server still returns the startup snapshot). Both a restart and a reload are
  required. Folded that precisely into the hotspot rather than overstating "reload picks it up."
- The Detail panel (clicking a node) is grounded node context (`rm-node-context`) and the selection
  mirror (`pushSelection` → `/api/selection`) belong to the click/selection flows, not boot. Left them
  out of this trace to keep the boot read path clean; `store.jsx:32` also loads the context bundle once
  at boot but that is the bundle flow's concern.

## Schema friction
None.
