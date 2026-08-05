# 9. The data-model tree is built once, by the pure builder both explorers and MCP share

Date: 2026-08-05

## Status

Accepted

## Context

The datastore containment tree (grouping `datastore`/`field` nodes into a
`{ roots, looseFields }` forest) was built in three places: `dataModelTree` in
`src/application/read-models/indexes.ts` (feeding the MCP/markdown
`renderDataModelMarkdown`), a byte-identical copy inside the static explorer
client (`src/web/static-explorer/explorer-client.ts`), and an inline,
structurally-equivalent walk inside the SPA's imperative layout
(`src/web/lib/datamodel-layout.js`, which already imported `dataModelTree` for
`looseFields` but re-derived root selection and child-store recursion for its
DOM build). ADR-0008 shared the flow-board *geometry* the same way and explicitly
left this tree "for a separate pass" (issue #64).

The static copy was a verbatim duplicate; the SPA copy had not diverged in
*structure* (same root predicate, same child order) — it had only grown a
DOM-layout skin around the same traversal. So this is the de-duplication case,
not the parameterise-the-divergence case ADR-0008 needed for the geometry.

## Decision

Make all three surfaces consume the one pure builder,
`dataModelTree(model, nodeById)` in `src/application/read-models/indexes.ts`:

- The **static client** deletes its local `dataModelTree()` and imports the
  shared one (`import { dataModelTree } from '../../application/read-models/indexes.js'`).
  Like the `DATA_TYPE_SET` import ADR-0008 already relies on, the builder is pure
  (its only import is type-only), so esbuild tree-shakes it into the offline
  bundle with no Node dependency.
- The **SPA layout** drives its `build`/`countLeaves` recursion and its
  `defaultCollapsed` walk off `dataModelTree(...).roots` instead of re-deriving
  `childStores`/`isRoot`/`hasStoreChildren`. Its DOM/measurement/SVG rendering
  stays exactly as it was — only the tree *structure* now comes from the shared
  builder.
- The **MCP/markdown** renderer keeps calling `dataModelTree` as before; its
  output is byte-pinned by `e2e/features/mcp.feature` and unchanged.

Each surface keeps rendering the tree its own way (React DOM, static DOM,
Markdown); only the pure structure is shared. The nested/loose-field rendering
from #56 is a rendering concern in each client and is untouched.

## Consequences

- The datastore tree is derived once. A structural fix (root selection, cycle
  handling, loose-field classification) now lands in one place for all three
  surfaces instead of three.
- Zero behaviour change, proven by the MCP + SPA-tabs + static-explorer
  data-model E2E staying green with no assertion changes, and by driving both
  explorers' Data model tab over a model carrying nested and loose fields (the
  #56 case) and confirming the count and every field still render.
- As in ADR-0007/0008, the static client's esbuild bundle now inlines the shared
  builder, so `explorer.html`'s embedded bytes shift. Byte-identity is not the
  guarantee — the E2E is — so the `generate-views` golden fixture and the
  committed example `explorer.html` were re-baselined after the E2E confirmed
  behaviour. `flows.dot` is unchanged.
- Other data-model selectors still duplicated in the static client
  (`isRecordSet`, `datastoreConsumers`, `fieldConsumers`, `nodeStorageLinks`,
  `parentChain`, `DATA_TYPE_SET`) were left as-is: out of scope for the tree, and
  a separate small pass if ever worth it.
