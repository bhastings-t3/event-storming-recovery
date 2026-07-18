# es-view-boot — trace notes

Flow: **es-view-boot** — "Operator boots the es-view explorer server" (tier 1, kind `read`, status `live`).

## Reachability (confirmed live)
- `package.json` `bin` maps BOTH `event-storming-recovery` and `es-view` → `bin/es-view.mjs`. `es-merge`/`es-generate` map to the other tools. So `npx event-storming-recovery [view]` and `es-view` both hit this flow.
- `npm run preview` = `npm run build && node bin/es-view.mjs` — same entry, so the "build then serve" path is this flow too.
- `main()` is invoked at `bin/es-view.mjs:114` (`main().catch(...)`). No dead/superseded evidence; the flow is live.

## Modeling decisions (two-plane rule front and center)
- **Introduced one new aggregate, `agg-es-view-session`**, for the running node:http process/session (the thing whose lifecycle this flow IS). It handles `cmd-launch-es-view`, reads `agg-model`, initializes `agg-selection`, emits the two boot events, and opens the browser. I did NOT promote parseArgs / buildServices / buildIndexes / createMcpHandler / createState to their own nodes — they are boot mechanics kept in `cmd-launch-es-view.tactical` (and the session's tactical). Only two domain-significant facts were promoted: `evt-model-resolved` and `evt-server-started`.
- **`agg-selection` is CREATED here, not mutated.** createState returns empty in-memory state (no file, no rehydrate). Its real mutations (setSelection/addToBundle) belong to the UI/MCP flows. Edge modeled as `agg-es-view-session --initializes--> agg-selection`.
- **`evt-model-resolved`/`evt-server-started` are emitted by the session aggregate, not by `agg-model`.** `agg-model`'s own facts (ModelMerged/ModelValidated) live in the merge-traces flow; resolving/loading-into-memory and binding-a-port are session lifecycle facts. resolveModel actually runs *before* the session object exists in code, but on the ES wall it reads cleanest as the session's orchestration.
- **`inv-servable-model` is a boot gate distinct from `agg-model`'s merge invariants.** It captures: readModelFile's nodes/flows shape check, the `--traces` throw-on-validation-errors, and main()'s catch→exit(1). The deep merge invariants (`inv-referential-integrity` etc.) only fire inside the `--traces` branch and are already owned by `agg-model` in the merge flow — I did not duplicate them here.
- **Reused shared ids verbatim:** `actor-operator`, `agg-model`, `agg-selection`, `ext-source-fs`, `ext-browser`. Each carries a boot-specific `tactical` block (which the merge folds in as a per-flow `usages` entry) plus a description consistent with the shared glossary.

## Contradictions / surprises (the payoff)
1. **Port fall-forward vs. the pinned MCP URL (hot-port-fall-forward-stale-mcp).** This is a genuine, cross-file contradiction. `startServer` happily walks 5178→5179→… (up to 20 attempts) and prints the real port, but `.claude-plugin/plugin.json` and `.mcp.json.example` hardcode `:5178/mcp`, and `skills/event-storming-explorer/SKILL.md` explicitly says the app "must run on port 5178" and instructs the user to *free* 5178 if taken. Runtime is dynamic; the declared/pinned MCP endpoint is static. If 5178 is occupied, the app runs but the pinned MCP config points at the wrong process. The banner even prints a `claude mcp add ... {actualUrl}/mcp` line that disagrees with the pinned config.
2. **`--host` is a raw passthrough with zero auth anywhere (hot-host-exposure).** `--host 0.0.0.0` exposes the whole JSON API + MCP endpoint + `POST /api/mcp/register` (which shells `claude mcp add`) to the network. Mitigating factor I verified: `readSource` (src/server/source.mjs:18) DOES sandbox `/api/source` to `repoRoot` with a `../`-escape guard, so the exposure is the whole repo tree, not the arbitrary filesystem. Still unauthenticated.
3. **Eager, never-invalidated model+indexes (hot-eager-indexes-never-invalidated).** buildServices/buildIndexes runs once at boot; no watcher, no invalidation. For a tool explicitly built for live iteration with Claude, editing flows.json / re-running es-merge silently has no effect until restart. Flagged as a design question, not a bug.

## Invariants
- `inv-servable-model` (enforced by `agg-es-view-session`) — one contract-level invariant covering the three boot gates above. Cited line ranges in its tactical rather than one node per check.

## Unresolvable / open items
- Whether the port fall-forward or the pinned `:5178` is the intended source of truth is a human decision (captured as hotspot 1). The code and the plugin/skill config disagree; I could not resolve intent from the source alone.

## Schema friction
Two nonstandard edge verbs, both intentional and warning-tolerated by the merge (it emits a warning, not an error):
- `initializes` (`agg-es-view-session --initializes--> agg-selection`) — no enum verb captures "creates the empty state at boot"; `updates` would misdescribe (nothing exists yet to update), `creates` isn't in the enum. Kept `initializes` for honesty.
- `opens` (`agg-es-view-session --opens--> ext-browser`) — the enum's `calls` would fit, but `opens` reads truer to what openBrowser does (launch the default browser on the URL). Kept `opens`.
Verified in isolation via `mergeTraceDocs`: **0 errors**, only the two expected nonstandard-verb warnings. No other schema friction.
