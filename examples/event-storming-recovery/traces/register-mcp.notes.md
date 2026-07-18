# register-mcp — trace notes

Flow: `register-mcp` (tier 1, kind `write`, status `live`). One-click "Connect your Claude
terminal": a browser click makes the local server shell out `claude mcp add` on the host.

## Reachability (confirmed live end-to-end)
- UI: `ContextBundle.jsx:37` renders `<ConnectClaude/>`; `ConnectClaude.add()` (`ConnectClaude.jsx:20`)
  calls `registerMcp(scope)`.
- Client: `registerMcp` (`src/web/api.js:32`) → `POST /api/mcp/register` with `{ scope }`.
- Route: `server.mjs:178` resolves `mcpUrl()`, whitelists scope, calls `claudeMcpAdd`.
- Shell-out: `claudeMcpAdd` (`src/server/mcp-register.mjs:13`) builds the command and runs `exec`.
- Sibling read confirmed: `GET /api/mcp/info` (`server.mjs:174`) returns the equivalent command
  WITHOUT running it; the same line is printed by the CLI banner (`bin/es-view.mjs:107`).

## Hint verification
- Hint "`registerMcp` at `src/web/api.js:32`" — correct.
- Hint "`POST /api/mcp/register` at `server.mjs:178`" — correct; sibling `GET /api/mcp/info` at 174 — correct.
- Hint "`claudeMcpAdd` at `src/server/mcp-register.mjs:13`" — correct; command built at :15, `exec` at :17.
- Hint "scope whitelist at `mcp-register.mjs:11`" — correct (`SCOPES` Set). Note there is a SECOND
  whitelist at the route (`server.mjs:182`) before the call; both must pass. Modeled as one
  contract-level invariant `inv-mcp-input-safe` (per the one-invariant-per-contract guidance).
- Hint "windowsHide, 20s timeout, ENOENT/stderr → notFound" — all correct (`mcp-register.mjs:17,20`).

## Modeling decisions
- Followed the briefing's aggregate framing: `cmd-register-mcp` `handled by` `agg-mcp-registration`
  and `calls` `ext-claude-cli`; `agg-mcp-registration.ownedBy = ext-claude-cli` (its state lives in
  the user's Claude config, nothing in the es-view process). The aggregate reads cleanly here because
  the config really is a mutable thing with an invariant guarding its inputs, so I kept it rather than
  collapsing to command→external-system.
- `evt-mcp-registered` is the single promoted domain fact (registration succeeded). I did NOT promote
  the request/response plumbing or the exec mechanics to events — those stay in `cmd-register-mcp`
  tactical, consistent with the two-plane discipline.
- Added `rm-mcp-connect-command` as a read model: the exact `claude mcp add` string shown but NOT run.
  It is genuinely "what the actor reads to decide" (copy-and-run instead of one-click) and is surfaced
  three ways (info endpoint, SPA line, CLI banner). Projected from in-memory `runtime.baseUrl`, not a file.
- `ext-claude-cli.inferred = false` (the code literally names the `claude` binary / `claude mcp add`).
  Behavioral recovered nodes are `inferred: true`.

## Surprises / contradictions (→ hotspots)
1. `hot-ui-shells-claude-cli` — a browser click spawns a host process running the user's CLI. The
   route has NO auth/CSRF token; the only guard is the scope whitelist + fixed command. Default bind
   is loopback but `--host` is user-overridable (`bin/es-view.mjs:27`), which would expose this write.
   The code comment argues "no new privilege" (server runs as the user); the consent surface is the
   open question.
2. `hot-mcp-name-mismatch` — the registered alias is `event-storming` (`MCP_NAME`, `server.mjs:24`)
   but the running MCP server self-identifies as `event-storming-recovery` (`mcp.mjs:20`), version
   `0.1.0`. Config alias and server identity disagree.
3. `hot-stale-static-mcp-url` — register + `/api/mcp/info` use `runtime.baseUrl` = the ACTUAL bound
   port after fall-forward (`server.mjs:204`; `startServer` retries up to 20 ports on EADDRINUSE). But
   `.claude-plugin/plugin.json:13` and `.mcp.json.example:5` hardcode `:5178`. If 5178 was taken, the
   static declarations are stale while the one-click register is correct.

## Minor drift noted (not a hotspot)
- `/api/mcp/info` builds `claude mcp add --transport http event-storming <url>` — it OMITS `--scope`
  and does NOT quote the URL, whereas the actual register write quotes the URL and appends
  `--scope <scope>`. Cosmetic; both target the same dynamic URL. Captured in `rm-mcp-connect-command`
  tactical.
- The MCP server version string is `0.1.0` (`mcp.mjs:20`) while `plugin.json` is `0.2.0` — noted only.

## Schema friction
None.
