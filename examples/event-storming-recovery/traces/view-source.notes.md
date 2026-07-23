# view-source — trace notes

## Reachability verdict: LIVE
Both ends reach end to end:
- **Trigger (actor):** operator clicks the "view source" button rendered under every anchor in the Detail panel → `Anchor.toggle()` (`src/web/components/Detail.jsx:142`) → `fetchSource` (`src/web/api.js:40`) → `GET /api/source`.
- **Endpoint (server):** booted by `bin/es-view.mjs` → `startServer` → `createServer`, which serves `/api/source` (`src/server/server.mjs:190-196`) → `readSource` (`src/server/source.mjs`).
- **VS Code deep link:** the `<a class="anchor" href={anchorUrl(...)}>` link is rendered for every anchor (`Detail.jsx:149`, url built in `src/web/model.js:43`), live in the same panel.
Not dead. It is exercised on every anchor a human inspects.

## The path-traversal guard — verified (scout flagged /api/source)
The guard (`source.mjs:15-18`) is a **lexical prefix guard** and is effective against the classic attacks:
- `root = path.resolve(repoRoot)`, `abs = path.resolve(root, relPath)`. `path.resolve` **normalizes `../`**, so `../../etc/passwd` resolves above root and is rejected.
- An **absolute `relPath`** (`/etc/passwd`, `C:\secrets`) makes `path.resolve(root, relPath)` ignore root; the result won't be prefixed by `root + sep` → rejected.
- **URL-encoded traversal** (`%2e%2e%2f`) is decoded by `URLSearchParams.get('path')` *before* `path.resolve` normalizes it → still rejected.
- The trailing `path.sep` in `abs.startsWith(root + path.sep)` blocks **sibling-prefix escapes** (`/repo` vs `/repo-secrets`). Good.

**Residual gaps (→ hot-source-read-scope):**
1. **No anchor allowlist.** The guard sandboxes to the repo *root*, not to the set of anchor paths in the model. Any file under the root is readable (`.env`, `.git/config`, committed secrets).
2. **No symlink resolution.** It is purely lexical — `fs.realpath` is never called — so a symlink *inside* the tree pointing outside would be followed by `fs.readFileSync`.
3. **Host exposure.** `startServer` defaults `host` to `127.0.0.1` (localhost, unauthenticated), but `bin/es-view.mjs --host` (line 39) overrides it with no auth gate; `--host 0.0.0.0` would publish this file-read on the LAN.

## Contradiction vs. the briefing/scout hint ("→ 403")
The briefing said the guard "can REJECT the request → 403." **It does not return 403.** `/api/source` always responds `sendJson(res, 200, readSource(...))` (`server.mjs:195`); a rejected traversal is a **200 body** `{ exists:false, error:'path escapes repo root' }`, and the SPA renders it as a "source not found at repo root" note (`Detail.jsx:157`). The only literal `403` in the server is the **separate** static-file guard in `serveStatic` (`server.mjs:70`), which protects `distDir`, not the anchor read. I modeled the invariant's rejection as "returns exists:false/error", not a 403, and called this out in the invariant description.

## Modeling decisions worth the orchestrator's eye
- **`agg-source-reader` is a stateless sandbox, MED confidence.** There is no persistent aggregate state here — `readSource` is a guarded read helper. I promoted it to an aggregate only because the briefing (and the schema) require an invariant to hang off an aggregate, and this is the boundary that owns the path-traversal check. An orchestrator may reasonably fold it into infra; flagged like the briefing's own `agg-server-session` MED note.
- **Read flow, no events.** Pure synchronous read; nothing changes state, so I promoted no events (consistent with the two-plane rule — the window/clamp/slice are pipeline detail kept inside the command/aggregate tactical).
- **Filesystem as datastores, reused pattern from merge-traces.** I created `ds-repo-fs` (filesystem = the sandbox root) ▸ `ds-repo-source-file` (file at anchor path) rather than reusing `ds-model-fs`. `ds-model-fs` in the merge trace is specifically the *model I/O* region (traces dir + flows.json); the **source tree** being read here is a different region of the same physical disk, and the sandbox root is conceptually the repo working tree, so a distinct `ds-repo-fs` reads truer. If the orchestrator prefers one filesystem node, `ds-repo-fs` could be merged under/aliased to `ds-model-fs` — same engine.
- **VS Code deep link modeled as an actor→external `calls` branch.** The `vscode://` link and the inline excerpt live in the *same* `Anchor` block but are independent affordances; the operator clicking the link hands off to `ext-vscode` out-of-band (OS URL-scheme handler), so I branched `actor-operator → ext-vscode (calls)` rather than routing it through the excerpt read model. `ext-vscode` is `inferred:false` — the `vscode://file/` scheme is literally in the code (`model.js:44`).
- **`rm-source-excerpt` fields.** Added conceptual fields `code` (derived-from `ds-repo-source-file`, transform `filter` = keep the line window) and `startLine/endLine` (computed clamp, empty sources). Provenance `inferred-from-dto` — same least-wrong fit the pilot used for computed-in-code values (there is still no `computed` provenance value; see merge-traces friction #5).

## Shared-id reuse
- Reused `actor-operator` and `ext-vscode` verbatim from the glossary.
- New well-named ids: `cmd-view-source`, `agg-source-reader`, `inv-repo-root-sandbox`, `rm-source-excerpt`, `ds-repo-fs`, `ds-repo-source-file`, `hot-source-read-scope`.

---

## Schema friction
1. **The invariant's rejection has no HTTP-status affordance, and the briefing assumed one.** The briefing/scout framed the guard as "→ 403," but this guard rejects via an in-band `{exists:false,error}` 200 body, not a status code. The `invariant` node can't express "how" it rejects (status vs body vs throw). Minor — I put it in prose — but if the fleet keeps assuming rejections map to HTTP codes, some will mis-anchor. A one-line note that "reject" may be an in-band error payload, not necessarily an HTTP error, would help.
2. **No verb for an out-of-band external deep-link handoff.** `actor → ext-vscode` is really "the panel offers a URL the OS resolves"; `calls` is the closest allowed verb but overstates that the app invokes VS Code (it only renders an `<a href>`). `triggers`/`raises` fit worse. `calls` is an acceptable stand-in; noting it like merge-traces friction #6.
3. **`fields[]` name with a slash.** I used `"startLine / endLine"` as one conceptual field covering the paired window bounds. The schema only requires non-empty `name`+`derivation`, so this validates, but if any consumer treats `name` as an identifier a slash could surprise it. Cosmetic.
