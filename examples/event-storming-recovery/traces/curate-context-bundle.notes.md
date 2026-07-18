# curate-context-bundle — trace notes

## Flow status
`live`. Fully reachable and wired end to end:
- SPA surfaces `addContext`/`removeContext`/`clearContext` (`src/web/api.js:23-25`) are called from `DetailActions` (`Detail.jsx:129`), `FlowActions` (`Main.jsx:16`), the right-click `ContextMenu` (`ContextMenu.jsx:43`), and the `ContextBundle` drawer (`ContextBundle.jsx:50,59`).
- Routes `POST`/`DELETE`/`GET /api/context` are registered in `server.mjs:138-156`.
- The MCP resource `event-storming://selected-nodes` is registered in `mcp.mjs:87` and the handler is mounted: `bin/es-view.mjs:91-92` builds one `state`, passes it to BOTH `startServer` (HTTP) and `createMcpHandler` (MCP), so the bundle the human curates is exactly what Claude reads. Confirmed.

## Node count
13 nodes (2 reused actors, 3 commands, `agg-selection`, 1 invariant, 3 events, `rm-context-bundle`, plus `agg-model` and `ext-source-fs` reused as read-side satellites), 1 flow, 1 hotspot.

## Reused shared ids (verbatim / faithful)
`agg-selection`, `actor-viewer`, `actor-claude`, `rm-context-bundle` (per the briefing), plus `agg-model` and `ext-source-fs` copied faithfully from the merge pilot for the projection's read edges. `agg-selection` is deliberately the SAME aggregate the selection flow mutates — my `tactical.explanation` is written bundle-facing so the merge appends it as a per-flow usage without clobbering the selection tracer's facet.

## Confirmations of the briefing's hints
- Bundle IS a `Map<"type:id",{type,id,at}>`, insertion-ordered, set-unique per `type:id`, type ∈ {node,flow,hotspot} (`state.mjs:11-24`). Confirmed.
- Existence validated at add-time via `itemExists` (`server.mjs:147`, helper `:27`). Confirmed. It guards `POST` only; `DELETE`/clear are unguarded (delete of an absent key is a harmless no-op).
- Hydrated once on SPA mount from `GET /api/context` (`store.jsx:32`) so it survives an in-run page reload. Confirmed.
- Two "give to Claude" channels confirmed: (a) MCP resource `selected-nodes` (the domain-significant one, `mcp.mjs:87-98`); (b) `GET /api/context` markdown → `ContextBundle` "Copy all" → clipboard (`ContextBundle.jsx:23-25,58`). Both render the SAME `renderBundleMarkdown` projection over the SAME shared bundle.

## Modeling decisions
- **Three commands, three events.** `add`/`remove`/`clear` are distinct HTTP verbs and distinct user intents, so I kept them separate rather than collapsing to a single `evt-bundle-updated`. Each event is a genuine past-tense fact (added/removed/cleared) and I judged that clearer than one blurred event; still "few and meaningful" (3 facts, not one-per-if). The `add` path is the spine in `steps`; remove/clear hang off `agg-selection` as branch edges.
- **Invariant is one contract, two facets.** `inv-bundle-item-exists` folds existence (server-side `itemExists`, ERROR→404) and uniqueness/insertion-order (`addToBundle` set-if-absent) into one contract node per the pilot's "one invariant per contract" guidance, with the two line ranges cited in tactical.
- **Projection is lazy, not event-materialized.** I did NOT draw an `event → readModel` "read by" edge. `renderBundleMarkdown` recomputes from `state.getBundle()` on every read, so `rm-context-bundle` `projects from` `agg-selection` (the refs) and `reads` `agg-model` (resolves refs to content) + `ext-source-fs` (embeds real code). Noted in the read model's tactical.
- **In-memory store, said so.** `agg-selection` is process memory only — no file, no db; a restart loses it. Per PILOT TUNING I did not fabricate any `server`/`table`/`column` node for it; the read edges to the filesystem use plain `reads` toward `ext-source-fs`.
- **Two readers on `rm-context-bundle`.** `actor-claude reads` (MCP resource) and `actor-viewer reads` (Copy-all clipboard) — the two parallel channels the briefing flagged.

## Invariants
- `inv-bundle-item-exists` — item must resolve for its type; each `type:id` unique. Enforced on `agg-selection`. (See above.)

## Hotspot (human question)
- `hot-bundle-single-global-state` — the bundle is one process-global `Map` with no session/tab/connection key; every browser tab and every MCP/Claude session shares and mutates it. Harmless at the default `127.0.0.1` bind, but combined with the `--host 0.0.0.0` option it becomes a shared, racy workspace. Should the bundle be per-session/per-connection before the server is exposed beyond localhost? This is the bundle-side sibling of the selection-tracer's likely "selection is global / never cleared server-side" concern; kept a distinct id.

## Unresolvable / left for other phases
- Field/storage lineage of `rm-context-bundle`, `agg-model` deliberately not built out here (data-mapping phase per the briefing).
- Whether the merge should reconcile my `agg-selection` tactical with the selection tracer's is a merge-time concern (union appends both as usages); no conflict expected since I reused the exact id, type `aggregate`, and a compatible label.

## Schema friction
None. Verbs used (`issues`, `handled by`, `emits`, `enforces`, `projects from`, `reads`) are all in the schema's verb list; `projects from` toward an in-memory aggregate matches the PILOT TUNING allowance. Invariant kept out of `steps` and attached via `enforces`. All command/aggregate/event/invariant/readModel nodes carry `tactical.anchors` (≥1, with `symbol`) + `explanation`; actors carry descriptions.
