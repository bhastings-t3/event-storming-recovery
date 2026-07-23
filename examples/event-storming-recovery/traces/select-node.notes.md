# select-node — trace notes

## Reachability
**LIVE.** Both ends verified. Trigger: `src/web/store.jsx:46` (`openDetail` → `pushSelection`), reached
from a real operator click on a sticky in the live UI (Board.jsx:27 `onOpenDetail`, plus Overview /
Gallery / Glossary / DataModel / Detail nav rows / ContextBundle). Sink: the POST `/api/selection`
branch in `src/server/server.mjs:128-132`, wired in `createServer`, which calls `state.setSelection`.
One shared `state` object is handed to both the API routes and the MCP handler at bootstrap, so the
write is observable by `get_current_selection`.

## Confirmed hints
- **openHotspot does NOT mirror to the server — verified.** `openDetail` (store.jsx:43) calls
  `pushSelection(id)` at line 46; the sibling `openHotspot` (line 48) is just
  `setDetail({ kind:'hotspot', id })` — no `pushSelection`, and it doesn't even set `selectedNodeId`.
  `openHotspot` is live-wired (Main.jsx:137 hotspot cards, ContextBundle.jsx:19 bundle rows). Raised as
  `hot-hotspot-selection-not-mirrored`. It is plausibly intentional: the selection channel is
  deliberately node-only (state.mjs header comment "the selection is always a node"; POST validates
  against `nodeById` and would 404 a hotspot id). The sharp question is whether Claude being blind to
  the operator viewing a hotspot is acceptable, or whether hotspot views should be mirrored (typed
  selection / a `get_current_hotspot` tool). That is the payoff question — hotspots ARE the open
  questions a human should answer, and that is exactly when Claude's help is most valuable.

## Surprises / contradictions
- **The Detail panel does NOT consume the server response.** `pushSelection` discards the POST reply
  (`.then(r=>r.json()).catch(()=>null)`), and `Detail.jsx` renders the panel purely from the
  client-side loaded model (`nodeById.get(detail.id)`). So the server-side grounded projection the
  route computes (`selResponse` / `buildNodeContext`) is thrown away on this path — it exists only for
  the MCP read side and for GET `/api/selection` (which the SPA never calls; api.js has no GET wrapper).
  I modeled the panel as `rm-detail-panel` projecting from `agg-model` (client), NOT from the server
  selection, to reflect this accurately. This is a subtle divergence from the older reference model's
  `rm-current-selection`, which claimed to serve "the SPA detail panel" — for the POST path it does not.
- **UI-vs-service split applies cleanly here.** One click produces two writes with separate failure
  windows: the local React `detail`/`selection` state (opens the panel, always succeeds) and the server
  mirror (a fetch that can fail while the panel still opens). They are the same store family? No — one
  is browser React state, one is server heap. I kept the command single (`cmd-select-node`) because
  both writes originate in the same synchronous `openDetail` body and the domain-significant write is
  the server mirror; the panel is modeled as the read model the operator sees, not a second aggregate.

## Invariants
- `inv-selection-in-model` (ERROR-level): POST `/api/selection` rejects an unknown nodeId with 404
  (`server.mjs:131`) before `setSelection`, so a bogus/stale id can never enter shared state. A
  null/empty nodeId is allowed and clears the selection (the check is guarded by `if (nodeId && ...)`).
  This is the only runtime guard on the selection write. Attached to `agg-selection` via `enforces`;
  it reads `agg-model`'s `nodeById` to decide, so I also added `cmd-select-node --reads--> agg-model`.

## Aggregate boundary decision
Per the briefing's note, I modeled **selection and context-bundle as SEPARATE aggregates**. `state.mjs`
keeps `selection` (a single `{ nodeId, at }`) and `bundle` (a `Map` of typed refs) as two independent
slots with disjoint accessors and disjoint keyspaces; only the selection is validated node-only. My
flow touches only `agg-selection`. The context bundle (`agg-context-bundle`) is a different flow's
concern and I did not model it here (its accessors `addToBundle`/`getBundle` are untouched by this path).

## Downstream reference (not fully traced here)
`ext-claude-mcp` reads the selection via `get_current_selection` (mcp.mjs:30, `state.getSelection()`
on the shared instance). Per the briefing this MCP read is another agent's flow (`claude-mcp-read`),
so I only referenced `ext-claude-mcp` with a single `agg-selection --read by--> ext-claude-mcp` edge and
prose, and did NOT re-model the grounded read model (`rm-current-selection` / `buildNodeContext`). Shared
ids reused so the flows join at merge: `actor-operator`, `agg-selection`, `agg-model`, `ext-claude-mcp`.

## Unresolved / human questions
1. `hot-hotspot-selection-not-mirrored` — should hotspot views be mirrored so Claude sees them, or is
   node-only selection intended? (The required asymmetry finding.)
2. `hot-selection-never-cleared` — should `closeDetail` clear the server selection (DELETE
   `/api/selection` exists but is never called by the SPA), or is holding the last node intended? If
   intended, should `get_current_selection` expose the captured-but-unused `at` timestamp as an age hint?

## Schema friction
None.
