# load-model — trace notes

## Reachability
- **LIVE.** Trigger: operator loads the SPA in a browser (served static by `src/server/server.mjs` `serveStatic`), `src/web/main.jsx` mounts `<App/>`, and `src/web/App.jsx:46` fires `fetchModel()` on first render → `GET /api/model` handled at `src/server/server.mjs:114`. Both ends verified: a boot path (`bin/es-view` → `startServer`/`createServer`) serves the app, and a real actor (the operator's browser) reaches the endpoint end to end.

## What the flow actually does
- Pure READ. `GET /api/model` returns the **already-resolved in-memory** model (`resolved.model`) plus provenance meta `{ source, sourcePath, repoRoot, warnings }`. There is **no disk read at request time** — the model was resolved once at boot by `resolve-model.mjs` (`--model` file / `--traces` merge / auto-discovered `flows.json` / bundled example). So `load-model` does not touch `ds-flows-json`/`ds-model-fs`; those belong to the server-session/boot and merge-traces flows. I kept the on-disk origin as prose on `agg-model` rather than minting physical nodes (demand-driven: this path never reads them).
- `agg-model` is read, never mutated here; its invariants are enforced at merge time (merge-traces flow), not on this read path. Reused the shared id + `label: "The Model"`; description is compatible with the merge-traces trace so the merge dedupes cleanly (first-seen type/label wins, longest description wins, tactical `usages` appended per source).
- The store (`store.jsx` `ExplorerProvider`) is the in-memory holder: `buildIndexes` (nodeById/hotspotById) + `galleryTypes` via `useMemo`, plus seeded interactive state. Per the briefing I kept it (and the `lib/*` layout engines: `layout.js`, `dataflow-layout.js`) as **tactical detail inside the command / read models**, not as aggregates or separate nodes.

## Modeling choices
- Four read models per the briefing: `rm-flows-board` (Board.jsx behavioral lanes for the current flow), `rm-gallery`, `rm-overview`, `rm-glossary`. Each `projects from` `agg-model`, and is `read by` `actor-operator`. Added `fields[]` only where a **derived projection** is meaningful (gallery `flowCount`/`retired`, glossary `usedInFlows`, board `lanes`) — all `sources: []` (computed in code), `provenance: ["inferred-from-dto"]`, per pilot clarification #4.
- Did NOT deep-model the Data-model tab or the Detail panel (other agents own those). `DataModel.jsx` is referenced by App.jsx routing only.
- No invariants on this flow. The only failure path is `fetchModel` throwing on a non-ok response → App renders the error boot card. That is client-side error handling, not a domain rule that rejects a command, so per pilot clarification #1/#2 it stays in prose, not an `enforces` edge.

## Surprises / contradictions
- **Gallery + Glossary render the physical + invariant planes as domain vocabulary.** `galleryTypes()` (`model.js:13`) = every `PALETTE` key except `hotspot` present in the model, and `PALETTE` includes `datastore`, `field`, and `invariant`. Both tabs filter `model.nodes` only by active type + text, never by plane — so physical nodes (which already have the Data model tab) and invariants (which normally hang off an aggregate's detail) show up as "stickies" and as Ubiquitous-Language dictionary entries. Raised as `hot-glossary-shows-physical-and-invariant-nodes` (a design question, not a bug).
- **Deliberate search divergence (verified intentional, so NOT a hotspot):** Gallery's search haystack (`nodeSearchText`, `model.js:76`) includes the names of every flow a node appears in, so a flow-title word surfaces its stickies; Glossary's haystack (`Glossary.jsx:24`) is label+description **only**, excluding flow names, "because glossary search is about the term, not usage." Documented in code comments as intended.
- **Stale in-memory snapshot (noted, belongs to server-session, not raised here):** the SPA fetches the model exactly once (`App.jsx` mount) and never re-fetches within a run; the server serves a fixed in-memory `resolved.model`. If `flows.json` is re-merged on disk while es-view runs, the operator keeps seeing the old model until restart. Left to the server-session flow's owner.

## Schema friction
None.
