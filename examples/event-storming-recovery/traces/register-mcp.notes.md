# register-mcp — trace notes

## Reachability verdict
**LIVE.** End-to-end path is real and unbroken:
`ConnectClaude.add()` (src/web/components/ConnectClaude.jsx:20) -> `registerMcp(scope)` (src/web/api.js:37) -> `POST /api/mcp/register` (src/server/server.mjs:203) -> `claudeMcpAdd` (src/server/mcp-register.mjs:13) -> `exec(...)` (mcp-register.mjs:17). The ConnectClaude component is a real SPA panel; the route is mounted unconditionally in `createServer`. No dead code.

## The security question asked by the briefing — answered precisely
**How are args passed to exec?** A SINGLE SHELL STRING, not an argument array.
- `mcp-register.mjs:15`: `const command = \`claude mcp add --transport http ${name} "${url}"${scopeArg}\`;` — built by template-literal concatenation.
- `mcp-register.mjs:17`: `exec(command, { timeout: 20000, windowsHide: true }, cb)` — `child_process.exec` runs the string through the OS shell (cmd.exe on Windows, /bin/sh on POSIX). NOT `execFile`, NOT an arg array.

**Is it injection-safe today?** Yes, by construction of the fixed template, NOT by escaping:
- `name` = compile-time constant `MCP_NAME = 'event-storming'` (server.mjs:24). Not caller-supplied.
- `url` = the server's own `runtime.baseUrl + '/mcp'` (server.mjs:99), double-quoted in the string. Set only from the actual bound socket (server.mjs:229), not from any request.
- `scope` = double-whitelisted: route-level `['local','project','user'].includes(...)` (server.mjs:207) AND a `SCOPES` Set re-check in the lib (mcp-register.mjs:11,14). A non-member is dropped, not passed.
So no request-controlled substring reaches the command. The file comment (mcp-register.mjs:1-8) documents that `exec` was chosen over `execFile(args,{shell:true})` deliberately (to resolve a Windows `claude.cmd` shim, and because Node 24 DEP0190 deprecates the unescaped-array form) — and asserts "every part is controlled."

**The residual risk (the two hotspots):**
1. `hot-ui-shells-claude-cli` — the safety is a property of the *current fixed template*, not of any escaping. A browser click still spawns a host process. Any future change routing a caller value into the string reopens shell injection. Recommend hardening to `execFile` with an arg array regardless, and/or a confirmation/token gate.
2. `hot-mcp-register-no-csrf` — the sharper finding: `POST /api/mcp/register` has NO auth, CSRF token, or Origin/Host check. A repo-wide grep of `src/server` for `origin|cors|csrf|token|auth` returns **zero** matches. The SPA's own call uses `content-type: application/json` (forces a CORS preflight a cross-origin page can't pass), but `readJsonBody` (server.mjs:58) JSON.parses ANY body and only uses `body.scope`, so a simple form-encoded/text-plain POST (no preflight) with an empty body still registers. That is a viable CSRF / DNS-rebinding vector while es-view is running. Impact is bounded (the command is fixed to `claude mcp add` at this app's own URL — not RCE) but it is an unconsented host state change. Loopback is not a trust boundary against a browser the user is driving; `--host` (bin/es-view.mjs:39) can widen it further.

## Contradictions / surprises
- **info-vs-register command drift (cosmetic).** `GET /api/mcp/info` returns `command: \`claude mcp add --transport http event-storming ${url}\`` (server.mjs:201) — URL **unquoted**, **no `--scope`**. The command actually executed by the register write quotes the URL and appends `--scope` (mcp-register.mjs:15). The displayed/copyable command is therefore not byte-identical to the executed one. Folded into `rm-mcp-connect-command` prose, not raised as a hotspot (it is cosmetic and both forms are valid CLI input).
- **The bundled example trace for this same flow is stale and would fail the merge.** `examples/event-storming-recovery/traces/register-mcp.json` lists three hotspots in `flow.hotspots` (`hot-ui-shells-claude-cli`, `hot-mcp-name-mismatch`, `hot-port-fall-forward-stale-mcp`) but defines only ONE in its `hotspots[]` array — two dangling refs that `inv-referential-integrity` would flag as ERRORs. Its line numbers are also stale (server.mjs:174/178/182 vs current 199/203/207; api.js:32 vs current 37). I did NOT copy those; my trace is referentially closed (verified: 7 nodes, 1 flow, 2 hotspots, 0 unresolved refs) and re-anchored to the current checkout.

## Invariant-granularity decision (per PILOT CLARIFICATIONS 1 & 2)
- I modeled ONE invariant, `inv-mcp-url-ready` — the only guard in this flow that can actually REJECT the command (503 "server URL not ready yet", server.mjs:205; no shell-out occurs). It attaches to `agg-mcp-registration` via `enforces`.
- I deliberately did NOT model the scope whitelist as an invariant (the example did, as `inv-mcp-input-safe`). A non-whitelisted scope does not fail the command — it is silently dropped and registration proceeds without `--scope`. Per clarification #2 ("an enforces edge means this check can fail the command"), a graceful-degrade guard is not a rejecting invariant. The input-safety/whitelist reasoning is folded into `cmd-register-mcp.tactical` and `hot-ui-shells-claude-cli` instead.

## Aggregate boundary
`agg-mcp-registration` is `ownedBy: ext-claude-cli` — it has zero in-process state; the write lands entirely in the external Claude CLI config (project list / `.mcp.json` / user settings, per scope). No `ds-`/`fld-` nodes minted: es-view never reads or writes the config file itself, so there is no demand-driven datastore to model on the es-view side.

## Shared-id reconciliation
- Reused `ext-claude-cli` (exact, from the glossary) and `actor-operator` (exact). The older example used `actor-viewer`; the briefing's shared glossary names only `actor-operator` (local developer), and in this self-model the person clicking in the browser IS the local developer running the tool, so I converged on `actor-operator`. If a sibling SPA-flow agent mints `actor-viewer`, the orchestrator should reconcile them to one id at merge.
- Minted well-named ids for the rest: `rm-mcp-connect-command`, `cmd-register-mcp`, `agg-mcp-registration`, `inv-mcp-url-ready`, `evt-mcp-registered`, `hot-ui-shells-claude-cli`, `hot-mcp-register-no-csrf`.

## Human questions (carried in the hotspots)
1. Should a browser click be allowed to spawn host processes at all, or gated behind an explicit terminal confirmation / per-boot token? (`hot-ui-shells-claude-cli`)
2. Should `/api/mcp/register` require a same-origin/Origin check (or reject non-JSON content types) before shelling out, given loopback is not a CSRF/DNS-rebinding boundary? (`hot-mcp-register-no-csrf`)
3. Should the executed command be hardened to `execFile` + arg array so the string can never be reopened to injection by a future edit? (`hot-ui-shells-claude-cli`)

## Schema friction
None.
