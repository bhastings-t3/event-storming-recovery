# How to extend an existing model

*How-to guide. Part of the [documentation set](../README.md).*

This is for a model you've already built and committed, when the code has moved on or you want to
add coverage you skipped the first time. Everything here is regenerable from the per-flow traces,
so you never hand-edit `flows.json`, `flows.dot`, or `explorer.html` directly.

## Add a new flow

1. Write a new trace file (or ask an agent to, using `prompts/03-trace-briefing.md`) that conforms
   to [the flows.json reference](../reference/flows-schema.md), and drop it into the same
   traces directory the rest of the model's traces live in.
2. Reuse the existing shared-id glossary for anything the new flow touches that's already in the
   model (the same aggregate, external system, or actor role), so it joins the existing map instead
   of forking a synonym. Check `flows.json`'s node list, or ask a connected Claude session via
   `list_model`, if you don't remember the ids.
3. Re-run the merge and regenerate (see [how to regenerate views](regenerate-views.md)).
4. If the merge reports a new node under a different id than an existing, equivalent one, that's
   drift: fix the new trace to use the existing id, unless it's a legitimate altitude variation
   (see METHOD.md's note on this) rather than a duplicate.

## Update a flow whose code changed

Edit that flow's trace file directly (fix the anchors, the tactical explanation, the steps/edges
that no longer match the code), then re-run the merge and regenerate. If the flow's status changed
(it's now dead, or superseded by a new flow), set `status` and, if applicable, `supersededBy` on the
trace rather than deleting it: the delta between a dead flow and its replacement is often the most
useful recovered intent in the model.

## Extend the schema itself

If a domain concept genuinely doesn't fit the current schema (the pilot-trace step in a fresh
recovery run is where this usually surfaces), edit
[`docs/reference/flows-schema.md`](../reference/flows-schema.md) and the validation in
`src/domain/model/merge.ts` and `src/domain/model/invariants.ts` together, then re-run the merge
against existing traces to confirm nothing regresses. Don't work around a schema gap by
overloading an existing field; extend the schema instead so the next trace agent has an explicit
contract to follow.

## Improve the method itself

If the *process* needs adjusting rather than the schema (a scout brief missing a lane, a trace
briefing that keeps producing the same friction), edit the relevant file under `prompts/` directly.
The pilot-then-waves pattern in Phase 3 (and the equivalent pilot step in glossary mining and data
mapping) exists specifically to make this cheap: fix the prompt once against the pilot's feedback,
and every subsequent agent in that wave inherits the fix.
