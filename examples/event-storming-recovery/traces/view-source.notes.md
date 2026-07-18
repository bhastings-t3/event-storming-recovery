# view-source — trace notes

Flow `view-source` (kind `read`, tier 2, status **live**). Clicking a source anchor in the explorer
fetches the REAL code behind it, sandboxed to the repo root — the grounding mechanism every sticky relies on.

## Reachability (all confirmed)
- **SPA click**: `Detail.jsx` `Anchor/toggle` (line 100-104) `view source` button → `fetchSource(a.path, a.line)`.
- **Client**: `src/web/api.js:35` `fetchSource` builds `GET /api/source?path&line&ctx` (line 37 fetch).
- **Route**: `server.mjs:165` `GET /api/source` registered inside `createServer`; 400s on missing path,
  else returns `readSource(resolved.repoRoot, relPath, line, ctx)` verbatim (line 170).
- **Reader**: `src/server/source.mjs:13` `readSource`; returns `{ path, exists, line, startLine, endLine, code }`,
  window is line ±8 (ctx default 8).
- **Sibling editor path**: `Detail.jsx:107` `<a href={anchorUrl(repoRoot, a)}>` → `model.js:43` `anchorUrl`
  builds `vscode://file/<repoRoot>/<path>:<line>` → OS/editor (`ext-editor`) opens the file. This path never
  touches the server or the sandbox guard.
- `repoRoot` frozen at boot by `resolve-model.mjs:99-102`: `--repo-root` > `model.meta.repoRoot` >
  model file's own tree > cwd.

## Contradictions with the briefing (minor, worth flagging)
- Briefing said the client symbol is **`api.js:37 getSource`**. There is no `getSource`; the exported
  function is **`fetchSource`** (defined at `api.js:35`, the fetch is on line 37). Anchored the real name.
- Everything else in the briefing (Detail.jsx:103 → fetchSource, Detail.jsx:107 anchorUrl, model.js:43,
  server.mjs:165, source.mjs:18 guard) matched the code exactly.

## Invariant / sandbox modeling decision
Followed the briefing's steer: **did NOT create an aggregate just to hang an invariant on.** There is no
aggregate in this read flow, and an `invariant` node requires one (attached via an `enforces` edge from an
aggregate). Instead the path-escape guard (`source.mjs:18`) is documented in `cmd-view-source.tactical` and
elevated to the **hotspot** below, which is where its real significance lives. Forcing a one-off aggregate
here would have read dishonestly.

## The sandbox guard — how strong is it, really
`readSource` computes `abs = path.resolve(root, relPath)` then rejects unless `abs === root` or
`abs.startsWith(root + path.sep)` (line 18).
- **Caught**: plain `../` traversal (path.resolve normalizes it) and absolute paths that land outside root
  (POSIX `/etc/passwd`, Windows `C:\Windows\...`).
- **Gap 1 — symlinks**: the check uses `path.resolve`, **not** `fs.realpath`. A symlink that lives *inside*
  repoRoot but points *outside* it passes the prefix check and its target is read. This is a genuine escape
  the guard does not close.
- **Gap 2 — repoRoot scope**: repoRoot defaults to `cwd`, i.e. often the user's entire working tree, so
  "sandboxed to repo root" can still mean "every file the user has here" (source, `.env`, committed secrets).
Both gaps only matter once the endpoint is reachable by someone other than the local user — see the hotspot.

## Hotspot
- **`hot-source-api-network-exposed`** — `GET /api/source` is unauthenticated (no `/api` route has any auth)
  and returns arbitrary repo-relative file contents. Default bind is `127.0.0.1`, but `--host` accepts
  `0.0.0.0` (`bin/es-view.mjs:38` → `server.listen(pnum, host)` `server.mjs:202`). Bound non-loopback, this
  is a network-reachable arbitrary-file-read over the whole repo tree, with the path-escape prefix guard as
  the sole protection (and the symlink gap above widens it). Human question captured in the hotspot: should
  es-view refuse a non-loopback bind without explicit opt-in / a token, and should `readSource` realpath-check
  to defeat symlink escapes — or is a non-loopback bind accepted user risk for a localhost dev tool?

## Nodes (5; 4 reused shared ids, 1 new)
- Reused verbatim ids: `actor-viewer`, `ext-source-fs`, `ext-editor`, `rm-source-excerpt`.
  - `ext-source-fs` is the pilot's shared filesystem node; I gave it a source-reading `tactical` (source.mjs:20),
    which the merge appends as a per-flow `usages` entry. Description broadened to name target-repo source files;
    merge keeps the longest description across sources, so this is safe.
- New: `cmd-view-source` (the read command). No new events (a read flow produces no domain fact worth promoting)
  and no aggregate (per the decision above).

## Edges
`actor-viewer --issues--> cmd-view-source`; `cmd-view-source --reads--> ext-source-fs`;
`rm-source-excerpt --projects from--> ext-source-fs`; `cmd-view-source --returns--> rm-source-excerpt`;
sibling editor path: `actor-viewer --calls--> ext-editor`, `ext-editor --reads--> ext-source-fs`.
All verbs are in `EDGE_VERBS` (merge.mjs:14), so no nonstandard-verb warnings.

## Schema friction
None.
