# grounded-copy — trace notes

## Flow at a glance
`actor-viewer` → `cmd-copy-grounded-markdown` → reads `agg-model` (in-memory model) + grounds via
`ext-source-fs` (real source excerpts) → returns `rm-item-markdown` (grounded markdown) → read by
`actor-viewer`, who pastes it into Claude. Pure read flow. No writes, no events, no invariants.

## Reachability (confirmed live)
- Client entry `getItem(type,id)` → `GET /api/item?type=<node|flow|hotspot>&id=...` — `src/web/api.js:28`.
- Route registered and wired — `src/server/server.mjs:158-163` (`itemExists` 404 guard, then
  `renderItemMarkdown(services,{type,id})`, returns `{ type, id, label, markdown }`).
- All four copy call sites present and reachable:
  - Detail panel "⧉ Copy for Claude" — `Detail.jsx:124-125` (`getItem('node', node.id)`).
  - Flow header "⧉ Copy flow for Claude" — `Main.jsx:11-12,19` (`getItem('flow', flow.id)`; the flow
    markdown embeds a Mermaid graph via `flowMermaid`).
  - Right-click ContextMenu "⧉ Copy this <item> for Claude" — `ContextMenu.jsx:32-33` (`getItem(type,id)`
    for node/flow/hotspot).
  - Bundle "Copy all for Claude" — `ContextBundle.jsx:23-24` (uses `getContext()` → `GET /api/context`
    → `renderBundleMarkdown`, NOT `/api/item`).
- Verdict: `status: live`.

## The two parallel "give it to Claude" channels (the requested contrast)
This flow is the **clipboard channel**; the MCP bundle (`curate-context-bundle` flow) is the
**server-persisted channel**. They share the SAME markdown renderers in `context.mjs`, but differ in
transport and persistence:
- **grounded-copy (this flow):** stateless read. `GET /api/item` (or `/api/context`) → markdown →
  `navigator.clipboard.writeText` → human pastes into Claude manually. Nothing is stored server-side;
  the copy does not touch `agg-selection` / the in-memory bundle at all (the single-item copies), and
  even the "Copy all" variant only *reads* `state.getBundle()`.
- **MCP bundle:** the human curates `state`'s bundle (POST/DELETE `/api/context`), and a connected
  Claude session pulls the `event-storming://selected-nodes` resource across the `/mcp` boundary — no
  clipboard, no manual paste. Same grounded markdown, different delivery.
Net: two independent paths to the same grounded payload. The clipboard path works even when no MCP
server is registered; the MCP path works without a manual copy/paste.

## Two-plane rule applied
The markdown assembly (`renderNodeContextMarkdown` / `renderFlowMarkdown` / `renderHotspotMarkdown` /
`renderBundleMarkdown`, and `flowMermaid`'s string-building) is a **projection**, not domain behavior.
Kept entirely in `cmd-copy-grounded-markdown` and `rm-item-markdown` tactical; no render stage promoted
to an aggregate/policy/event. This is a read flow, so it emits no events at all.

## Clipboard modeled as a browser capability (not an external system)
Per the briefing, `navigator.clipboard.writeText` is noted in tactical (on the command and the read
model) and is NOT a modeled `externalSystem` sticky. The only external system this flow touches is
`ext-source-fs` (the target-repo source files that ground the anchors).

## Grounding detail
Grounding is real: `buildNodeContext` (context.mjs:58) calls `readSource(repoRoot, a.path, a.line)` per
anchor; `readSource` (source.mjs:13) is repo-root-sandboxed (rejects `../` escapes) and slices ±8 lines
around the anchor into a fenced code block. A missing/escaping anchor path yields `{ exists:false }` and
is silently omitted from the markdown — no error surfaced to the viewer.

## Surprises / observations (not hotspot-worthy)
- **Silent failure swallowing.** Every copy handler wraps the clipboard write in `try { … } catch { /* blocked */ }`
  (Detail.jsx:125, Main.jsx:12, ContextMenu.jsx:33, ContextBundle.jsx:24). If `navigator.clipboard` is
  unavailable (non-secure context / permission denied) or the fetch fails, the button simply never flips
  to "Copied ✓" and the viewer gets no error. Minor UX papercut, not a domain question, so no hotspot.
- **Two endpoints, one pattern.** Single-item copies use `/api/item`; "Copy all" uses `/api/context`.
  Both funnel through `renderItemMarkdown`, so the grounded content is identical per item — the bundle
  variant just joins items with `---`. Captured as distinct `instances[]` entries with their routes.
- **404 guard, not an invariant.** `/api/item` rejects unknown `type`/`id` with 404 via `itemExists`.
  That is route-level input validation (reachability), not a domain invariant on `agg-model`, so it
  lives in the command's tactical rather than an `inv-` node — consistent with the read-flow, no-write
  nature of this channel.

## Shared ids reused (verbatim ids)
`actor-viewer`, `agg-model`, `ext-source-fs`, `rm-item-markdown`. For `agg-model` and `ext-source-fs`
the top-level type/label match the pilot; the tactical here is copy-path-specific (read-only access /
source grounding), which the merge folds in as this flow's per-node `usages` entry.

## Human questions
None specific to this flow.

## Schema friction
None.
