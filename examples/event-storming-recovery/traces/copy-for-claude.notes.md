# copy-for-claude — trace notes

## What the flow is
The operator copies a grounded, source-anchored Markdown rendering of a node / flow / hotspot /
whole bundle to the OS clipboard, to paste into a Claude chat. It is the manual, copy-paste
alternative to the live MCP bridge (same projection, different transport).

Reachability: **LIVE.** Three real UI triggers reach it end to end:
- `src/web/components/Detail.jsx:167` — "⧉ Copy for Claude" on a node detail pane.
- `src/web/components/ContextMenu.jsx:35` — right-click "Copy this <item> for Claude" (node/flow/hotspot).
- `src/web/components/ContextBundle.jsx:24` — "Copy all for Claude" in the bundle drawer.
All resolve through `src/web/api.js` (`getItem` → `GET /api/item`, `getContext` → `GET /api/context`)
to server render functions in `src/server/context.mjs`.

## Server-side vs client-side (the key structural fact)
The markdown is built **100% server-side** in `src/server/context.mjs`
(`renderItemMarkdown` / `renderBundleMarkdown` → `renderNodeContextMarkdown` /
`renderFlowMarkdown` / `renderHotspotMarkdown`). The client React code does **only** two things:
fetch the `{ markdown }` string and `navigator.clipboard.writeText(...)`. No markdown assembly
happens in the browser. This is the same code path the MCP side reuses
(`src/server/mcp.mjs:96` serves `renderBundleMarkdown` as the `event-storming://selected-nodes`
resource; `get_node`/`get_flow` tools use the same renderers) — I referenced ext-claude-mcp /
context flows rather than re-deriving them, per the brief.

## Grounding
`rm-grounded-markdown` is genuinely "grounded": with `includeSource=true` (the default),
`buildNodeContext` calls `readSource(repoRoot, path, line)` for **every anchor** on **every copy**,
re-reading the real file from the repo filesystem (`ds-model-fs`) sandboxed to repoRoot. So the
export is not a cached snippet — it reflects current source. Modeled as
`rm-grounded-markdown --projects from--> ds-model-fs`.

## Hotspot (the payoff finding)
`hot-silent-empty-copy` — all three sites do `writeText(r.markdown || '')`. `getItem`/`getContext`
(`api.js`) resolve the fetch to JSON **without checking `res.ok`**, so a 404 (unknown/stale id,
body `{ error }`) or an empty bundle yields `r.markdown === undefined` → an **empty clipboard**,
while Detail.jsx and ContextBundle.jsx still flip the button to "Copied ✓". The `try/catch` only
catches a *rejected* clipboard write, not a resolved-but-empty fetch. The server correctly 404s via
`itemExists` (modeled as `inv-copy-target-exists`), but that signal is dropped client-side. A human
should decide whether copy must verify non-empty markdown before claiming success.

## Contradictions / hints verified
- The brief said model `rm-grounded-markdown` as projecting from `agg-model` + "the current
  selection / `agg-context-bundle`". Verified nuance: the **bundle** copy projects from
  `agg-context-bundle` (`state.getBundle()`), but the **single-item** copies (Detail, ContextMenu)
  pass an **explicit `{type,id}`** to `/api/item` and do **NOT** read `agg-selection`
  (`state.getSelection`). The selection aggregate is only on the MCP `get_current_selection` /
  `/api/selection` path, not the copy path. I therefore did not add an `agg-selection` edge here —
  it would misrepresent the code. Modeled `agg-model` + `agg-context-bundle` as the projection
  sources, which is what the copy path actually reads.
- Brief said "~3 call sites of `navigator.clipboard.writeText`". Confirmed exactly 3
  (Detail, ContextMenu, ContextBundle). No others in product code.

## Minor observations (not hotspots)
- Feedback is inconsistent: Detail and ContextBundle show "Copied ✓"; ContextMenu.copy shows no
  confirmation at all (just closes the menu).
- Copying a whole **flow** inlines source for every node in the flow (plus a Mermaid graph via
  `flowMermaid`), so a flow/bundle export can be large. Not a defect, just a size note.
- `ext-clipboard` write requires a secure context and can be blocked; the silent `catch` means a
  blocked clipboard also gives no user feedback.

## Reused shared ids
`actor-operator`, `agg-model`, `ds-model-fs` (reused from the merge-traces pilot),
`agg-context-bundle`, `agg-comment-store`, `ext-clipboard`, `ext-claude-mcp` (from the shared
glossary). Authored lightweight-but-valid entries for the reused aggregates/datastore; the merge
unions by global id (longest description wins).

## Edge-verb choices
- `cmd-copy-for-claude --writes--> ext-clipboard`: the clipboard is an external sink; "writes"
  reads most naturally for an export. (If the merge prefers `calls` for command→externalSystem,
  it is only a nonstandard-verb warning, not an error.)
- `ext-clipboard --read by--> ext-claude-mcp`: the pasted markdown is read by the Claude session.

## Schema friction
None.
