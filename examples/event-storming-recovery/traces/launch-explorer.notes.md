# launch-explorer — trace notes

## Reachability
- **LIVE.** Trigger: `bin/es-view.mjs` `main()` (line 76, invoked line 118). `package.json` `bin`
  maps BOTH `event-storming-recovery` and `es-view` to `bin/es-view.mjs`, so
  `npx event-storming-recovery view` and the `es-view` binary both reach this boot end to end
  (verified against package.json, name `event-storming-recovery`, version 0.5.0).
- End state reachable: `startServer` resolves once `server.listen` fires (`ServerStarted`), after
  which the SPA/API/MCP are all served over one shared state. No dead code on the spine.

## Altitude decisions (what I deliberately did NOT promote)
- **One command, one aggregate, one event.** The boot is a single synchronous orchestration in
  `main()`. I modeled it as `cmd-launch-explorer` → `agg-server-session` → `evt-server-started`.
  The pipeline stages (parseArgs, buildServices/buildIndexes, createMcpHandler wiring) stay inside
  the command's `tactical.explanation` per the two-plane rule — none is a domain event.
- **Composition, not re-derivation.** `resolveModel`, the comment store, and the in-memory
  selection/bundle state are owned by other flows. I reference `agg-model` and `agg-comment-store`
  with `reads` edges and concise (owner-wins) descriptions, and I name `agg-selection` /
  `agg-context-bundle` in prose only — I did NOT define them, to avoid pre-empting the state agent's
  one-vs-two-aggregate boundary call. `createState()` at boot just makes them EMPTY, so there is no
  data read to model.
- **Browser open kept tactical.** Per the briefing, `openBrowser` is a fire-and-forget best-effort
  side effect. I modeled it as a single `agg-server-session --calls--> ext-browser` edge plus
  tactical detail, NOT a promoted policy/command (even though it has a separate failure window; it
  cannot fail the session, so the split-rule's motivation — an independent failure that matters —
  does not apply).
- **ModelResolved not minted.** The briefing floated `ModelResolved` as a candidate event. I left it
  to the resolve-model / merge flows (which already carry `ModelMerged` / `ModelValidated` on
  `agg-model`) rather than duplicate a model-lifecycle event at the session level. The launch flow's
  one genuinely new domain fact is `ServerStarted`.

## Invariants
- I minted **no** `invariant` node on `agg-server-session`. The two real reject conditions at boot
  (a) invalid/missing model and (b) no free port are, respectively, resolve-model's concern and pure
  infrastructure. Per the pilot clarifications (don't model infra guards as business invariants) and
  the briefing's note that `agg-server-session` is MED-confidence / possibly infra, I flagged the
  port ceiling as a **hotspot** instead. The `--traces` validation reject is enforced by
  `agg-model`'s existing invariants (owned elsewhere).

## Surprises / contradictions
- **The comment sidecar can be written into a `--traces` INPUT directory.** `commentsPath =
  dirname(resolved.sourcePath)`, and on the `--traces` path `sourcePath` is the traces *dir* itself,
  so `comments.json` is dropped alongside the per-flow trace files being merged. Slightly surprising;
  captured in `hot-example-comments-unwritable`.
- **Bundled-example fallback is silent.** Running `es-view` in a directory with no model does not
  error — it serves the tool's OWN self-model (`examples/event-storming-recovery/model/flows.json`)
  and only distinguishes this in the banner text (`SOURCE_LABEL.example`). This is resolve-model's
  behavior (owned by another agent), so I did not raise it as a hotspot here, but the **resolve-model
  trace agent should consider flagging it** — an operator can easily mistake the shipped self-model
  for their own repo's model.
- **`http.Server` object is reused across port attempts.** `startServer` re-`listen()`s one server
  object rather than creating a fresh one per attempt; queued `listening` callbacks from failed
  attempts all fire on the eventual success (idempotent resolve, harmless today). Noted inside
  `hot-port-fallforward-exhaustion` rather than overstated.
- **Loopback by default.** `host` defaults to `127.0.0.1`; the MCP endpoint is only reachable
  locally. Good default, worth knowing for anyone who tries `--host 0.0.0.0`.

## Cross-agent notes (shared ids)
- Reused: `actor-operator`, `agg-model`, `agg-comment-store`, `ext-browser`. Named-in-prose only:
  `agg-selection`, `agg-context-bundle`.
- New ids I own: `cmd-launch-explorer`, `agg-server-session`, `evt-server-started`,
  `hot-port-fallforward-exhaustion`, `hot-example-comments-unwritable`.
- My `agg-model` / `agg-comment-store` node definitions are intentionally concise; the merge's
  longest-description-wins union will defer to the owning agents' fuller definitions.

## Unresolved / human questions (see hotspots)
1. `hot-port-fallforward-exhaustion` — is a 20-port ceiling right, and should exhaustion give a
   friendly message + `--port` hint instead of a raw stack trace?
2. `hot-example-comments-unwritable` — should the comment sidecar fall back to a writable
   user-scoped location when the model dir is read-only / is the bundled example, so comments are not
   silently lost?

## Schema friction
None.
