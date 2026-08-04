# 6. The committed explorer bakes an absolute source root as a reader-overridable default

Date: 2026-08-04

## Status

Accepted

## Context

`explorer.html` and `flows.dot` build their `vscode://file/...` source links from `repoRoot`, which
was never `path.resolve`d and was baked into the emitted HTML as an immutable constant. The documented
`--repo-root .` therefore committed dead relative links (`vscode://file/./src/...`), and an absolute
root committed links that worked on exactly one machine. The `view` server is unaffected because it
resolves the root at serve time; only the static, shareable artifacts were broken.

## Decision

`generateViews` now resolves `repoRoot` to an absolute path and normalizes separators to forward
slashes (Windows `path.resolve` yields backslashes, which the `vscode://file/` scheme rejects), so
`--repo-root .` produces a working absolute link. `flows.dot` has no runtime, so it keeps that resolved
absolute path and stays machine-local by nature. `explorer.html` treats the baked absolute path as a
**default** that each reader can override once via a "Source root" affordance; the override is persisted
to `localStorage`, and the emitted page re-derives every rendered `vscode://` link from
`localStorage ?? bakedDefault` (normalizing the reader's path the same way), so one committed board
works for everyone without regenerating it.

## Consequences

- The override logic (read/write `localStorage`, the affordance, separator normalization, re-deriving
  links via a `data-anchor` attribute) lives inside the emitted page, not in the generator, which stays
  a pure string builder.
- The default is still the generating machine's path, so a reader who sets nothing keeps today's
  behavior; the reader override is the portability escape hatch, keyed per-browser.
- The live SPA (`src/web`) is untouched: it already resolves the root at serve time via `/api/model`.
