# 4. The comment sidecar is written atomically and its durability is reported to the client

Date: 2026-08-04

## Status

Accepted

## Context

The `comments.json` sidecar was written with a plain `writeFileSync` (which can truncate the prior
good file on an interrupted write) and, on failure, warned once and swallowed the error while
`POST /api/comments` still returned a bare 200, so the operator was told "saved" when the comment was
only in memory. The sidecar path is `dirname(sourcePath)/comments.json`, so on the bundled-example
fallback (a global install dir) or `--traces` (the read-only input dir) writes routinely fail.

## Decision

Write atomically and report durability honestly. `createCommentStore` serialises the store to a
**sibling temp file in the target's own directory** and `renameSync`s it over `comments.json`, so a
failed or interrupted write can never leave a truncated file and the rename never crosses a filesystem
(no `EXDEV`). The domain `CommentStore` stays pure (its `onChange` is still `void`); the fs adapter
records the last write's outcome and exposes it through a new `CommentPersistence` port, which the
`addComment`/`removeComment` commands read so the `/api/comments` POST and DELETE responses carry an
explicit `persisted` (and a `reason` when false). A memory-only write is treated as degraded-but-working
(still `200` with the comments, `persisted:false`), not a `500`, so the UI shows "kept for this session
only" rather than looking broken. A corrupt sidecar on load is surfaced with a one-time warning and the
file is left on disk untouched, rather than being silently discarded.

## Consequences

- Persistence health crosses the domain boundary without making the domain fs-aware: the seam is the
  `CommentPersistence` port on the `ServiceBundle`, populated only by the fs composition root.
- The `persisted` field is additive on the response; existing clients that read only `comments` are
  unaffected, and a store with no backing file reports `persisted:true` (nothing to persist).
- Recovery of a corrupt sidecar is manual (inspect/delete the file); the next successful write replaces
  it atomically. Auto-quarantine of the bad file was considered and deferred as out of scope.
