# add-comment — trace notes

## Reachability
LIVE. Full chain wired end to end under the `es-view` boot path:
`bin/es-view.mjs:93` creates the comment store, `:94` puts it in `services`, `:96` starts the
server. Trigger surface is `src/web/components/ContextMenu.jsx:50` ("💬 Add comment") →
`CommentDialog.jsx:29` submit → `store.jsx:61` addCommentTo → `api.js:32` POST /api/comments →
`server.mjs:171` → `comments.mjs:37` add → `:22` persist → `comments.json`. No dead code.

## Verified hints
- **Keyed by stable `type:id`** — confirmed: `comments.mjs:9` `key = ${type}:${id}`; header comment
  (`comments.mjs:1-5`) states the intent ("stable ids, so comments survive a model rebuild") and the
  sidecar sits OUTSIDE flows.json on purpose (`bin/es-view.mjs:91` comment, `:92` path).
  Modeled as a DESIGN property, NOT an `enforces` invariant: nothing checks id stability at
  runtime, so per PILOT CLARIFICATION #2 it is data-model/tactical detail (a conceptual `key` field
  on the aggregate with source `fld-comment-key`), not an invariant edge.
- **Non-atomic write / durability risk** — confirmed and raised as `hot-comment-nonatomic-persist`.
  `comments.mjs:27` is a single `fs.writeFileSync` with no temp-file+rename.
- **Warns once if read-only** — confirmed: `comments.mjs:28-30` catches, logs once via a `warned`
  flag, then swallows. Folded into the same hotspot (it is the same best-effort-persist question).
- **Carried into MCP context** — confirmed: `context.mjs:85/195/236` attach
  `services.comments.get(node|flow|hotspot, id)` and `renderComments` (`:90`) emits a
  "Comments (human notes)" markdown block. Modeled via `rm-item-comments` read by `ext-claude-mcp`.
- **Actor** = `actor-operator` (reused shared id). Aggregate `agg-comment-store` reused. Physical
  parent `ds-model-fs` reused from the pilot's `merge-traces` trace.

## Invariants (error-level rejects only, per PILOT CLARIFICATION #1)
- `inv-comment-target-exists` — `server.mjs:170` `!id || !itemExists` → 404. Enforced in the HTTP
  handler, not inside `comments.mjs`, but it is the comment-store boundary's guard, so attached to
  `agg-comment-store`.
- `inv-comment-text-nonempty` — `server.mjs:173` empty trimmed text → 400. (SPA disables the button
  and returns early; store trims again — defense in depth, but the 400 is the authoritative reject.)
No warning-level checks worth minting as invariants here.

## Surprises / contradictions
- **The API confirms success before durability is known.** `store.add` mutates the in-memory Map and
  the handler returns 200 with the fresh list *regardless of whether the disk write succeeded*
  (`comments.mjs:40-41`, `server.mjs:175`). So on a read-only or failing FS the operator sees the
  note "saved" while it is memory-only for the session. This is the crux of the hotspot.
- **Corrupt-sidecar = silent data loss.** On startup a corrupt `comments.json` is swallowed and the
  store starts empty (`comments.mjs:19`); the next persist then overwrites the (recoverable) file
  with the empty set. Called out as sub-question (3) in the hotspot.
- **Considered but rejected: splitting persist into its own command/event via a synchronous policy.**
  The in-memory add and the disk write share one synchronous `add()` call; although the disk write
  has a genuinely separate failure window (which normally argues for a second command per the
  UI-vs-service split rule), the failure is swallowed and no caller or policy branches on it — so a
  second event would be observed by no one. Kept as ONE event (`evt-comment-added`) plus a hotspot,
  rather than an `evt-comment-persisted`. (Contrast the pilot's `merge-traces`, where `ModelValidated`
  IS a separately-observed outcome the callers branch on, justifying two events there.)
- **Delete path exists** (`store.remove`, DELETE /api/comments, `removeCommentFrom`) but is out of
  scope for this add-comment write flow; not modeled.

## Unresolved / human questions
Captured in `hot-comment-nonatomic-persist`: atomic write? surface persist failures to the operator
instead of a silent 200? back up rather than overwrite a corrupt/unreadable sidecar?

## Schema friction
None.
