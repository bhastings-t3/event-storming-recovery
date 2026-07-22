# open-data-model-tab — trace notes

## Reachability verdict
**LIVE.** Two live triggers reach one read model end to end:
- SPA: `src/web/components/Tabs.jsx:6` (the `['data','Data model']` tab) → onClick `setMode('data')` (Tabs.jsx:17) → `src/web/App.jsx:29` mounts `<DataModel/>` → `renderDataModelInto` (datamodel-layout.js:40).
- MCP: `src/server/mcp.mjs:77` registers `list_data_model`; handler (mcp.mjs:84) → `renderDataModelMarkdown` (context.mjs:257).
Both read the shared in-memory `services.model` / the SPA's boot-loaded copy. Nothing is written.

## Shape / altitude decisions
- Modeled as a **read** flow with ONE shared read model `rm-data-model` and two consumers (`ext-browser` driven by `actor-operator`; `ext-claude-mcp`), mirroring the `claude-mcp-read` example's actor→client→readModel→aggregate shape. The `rm-data-model` id is reused from the pilot glossary; its description/tactical now explicitly cover BOTH renderers (SPA graph + MCP markdown).
- **Layout/barycenter/grid math kept as tactical detail, not aggregates/policies** (per briefing + two-plane rule). `packGrid` (square packing), `defaultCollapsed` (>12 leaf descendants), `curveDown`/SVG arrows, and the dataflow-layout barycenter pass are presentation, folded into `rm-data-model.tactical` / the `collapsedByDefault` field prose.
- `projects from` edges to `agg-model` (the loaded model) and `ds-flows-json` (the file the whole model — including its physical sub-layer — is read from). Physical nodes are satellites, kept OUT of `steps`. Reused `ds-model-fs`/`ds-flows-json` ids from the pilot.
- No command/aggregate mutation exists on this path, so no invariant nodes (correct: nothing here can reject an action).

## Surprises / findings
- **Two independent renderers, one projection (divergence risk).** The SPA `renderDataModelInto` re-implements the datastore-forest walk locally (`isRoot`/`childStores`/`countLeaves`/`fieldsOf` in datamodel-layout.js) instead of reusing the shared `dataModelTree`/`isRecordSet`/`datastoreConsumers` from `selectors.mjs` that the MCP markdown uses. They agree today (both use `datastoreConsumers` + `isRecordSet`), but the tree-walk is duplicated, so future edits can drift the tab and the tool apart.
- **Best finding → hotspot `hot-data-model-drops-nested-loose-fields`.** `dataCount` (DataModel.jsx:16) counts every datastore+field node, but both surfaces render only DIRECT child fields of a record set (one level). Nested sub-fields (field→field) and loose/orphan fields are counted but never drawn — even though `selectors.mjs` already ships `fieldTree()` (nested) and `dataModelTree().looseFields` (orphans) that neither renderer wires up. So the header badge can overcount what is visible.
- **Collapse asymmetry (noted, not a hotspot).** The SPA collapses big containers by default (`defaultCollapsed`, COLLAPSE_OVER=12); the MCP markdown has no collapse and always emits the full tree. A connected Claude can therefore see more of the tree than the operator's default view. Expected given markdown has no interactivity; captured in the `collapsedByDefault` field.
- **No filesystem IO on this path.** Unlike the source-grounded MCP tools, `list_data_model` and the tab do not call `readSource`; the projection is pure in-memory over the boot-loaded model. Confirmed against `ext-source-fs`'s own note in the `claude-mcp-read` example.
- **Recursive self-model loop (observation).** In the self-model the datastore/field nodes being rendered ARE this recovery's own physical nodes (`ds-model-fs`, `ds-flows-json`, comment/in-memory stores). So `rm-data-model` projects the physical layer out of `ds-flows-json`, the file whose whole graph it is a view of. Recorded in `ds-flows-json.description`; harmless, just noted so a reader isn't confused by the loop.

## Scope boundary (avoided conflation)
- `dataflow-layout.js` (`renderDataFlowInto`) is the **per-flow Data toggle on the flow Board** (Board.jsx:31), a DIFFERENT surface from the top-level Data-model tab. It is NOT part of this flow and is deliberately excluded from steps/edges. It belongs to a separate "toggle a flow's data view" flow if one is traced. The briefing's "(+ dataflow-layout.js if the Flow/Data toggle is involved)" resolved to: not involved here.

## Human questions
- `hot-data-model-drops-nested-loose-fields`: is one-level-of-fields rendering intentional, or should the tab/tool render nested + loose fields so the count matches the drawing?

## Unresolved items
None blocking. The renderer duplication is a maintainability smell, not a defect today; left as a note rather than a second hotspot to avoid speculative red stickies.

## Schema friction
None. The read-flow + shared-read-model shape, `projects from` satellites, and `fields[]` with `ds-` sources all fit the schema cleanly. Field `sources[].ref` values (`ds-flows-json`) resolve; validated the JSON parses and every step/edge/source ref resolves within the file.
