# Getting started

*Tutorial. Part of the [documentation set](../README.md).*

In this tutorial we will install the event-storming-recovery plugin, build this tool's own
bundled example from its committed traces, then open the interactive explorer and click through
one flow end to end: sticky lane, tactical explanation, real source, a hotspot, the glossary, and
the data model. By the end you will have seen every piece this tool produces, without needing a
target codebase of your own yet.

## 1. Install the plugin

In a Claude Code session, run:

```
/plugin marketplace add bhastings-t3/event-storming-recovery
/plugin install event-storming-recovery@event-storming-recovery
```

You should see the plugin install and two new skills become available:
`event-storming-recovery` (builds a model) and `event-storming-explorer` (opens and works with
one). We'll come back to both of these in the how-to guides; for now, we're going to build and
open the example that ships in the repo itself.

## 2. Get a checkout of the repo

The bundled example lives in the repo's own `examples/` directory, so open a terminal in a clone
of it:

```sh
git clone https://github.com/bhastings-t3/event-storming-recovery.git
cd event-storming-recovery
```

## 3. Build the example model

The repo ships this tool's own recovered self-model as a set of already-written per-flow traces
under `examples/event-storming-recovery/traces/`. Rebuild the merged, validated model and the
explorer from them:

```sh
npm run demo
```

You'll see it merge the traces, print node/flow/hotspot counts, then write the explorer:

```
merged N trace files -> .../examples/event-storming-recovery/model/flows.json
...
validation: OK
built .../examples/event-storming-recovery/model/explorer.html
```

This ran the same two steps, merge then generate, that turn any set of traces into a model; you'll
use them again for your own codebase in
[how to run the recovery on your own codebase](../how-to/run-recovery-on-your-codebase.md).

## 4. Open the explorer

Open the file it just built in a browser:

```
examples/event-storming-recovery/model/explorer.html
```

It's self-contained: the whole model is embedded, so there's no server and no network involved in
viewing it.

## 5. Click through a flow

In the flow list, click **`merge-traces`** ("Operator merges per-flow traces into the validated
model"): the exact flow you just ran in step 3, recovered from its own code.

- Notice the sticky lane: an actor, the `MergeTraces` command, the `agg-model` aggregate, and the
  events it emits, left to right.
- Click the **`MergeTraces`** sticky. The detail panel opens with its tactical explanation (how
  the merge is actually implemented) and its source anchors. Click an anchor; it's a `vscode://`
  deep link straight to the real line in `src/lib/merge.mjs`.
- Click the **`agg-model`** aggregate sticky and notice the invariants hanging off it, for example
  referential integrity: every id the model references must resolve.
- Find the red hotspot card on this flow: *"es-merge writes an invalid flows.json even when
  validation fails."* This is the payoff of a code-derived model: a real, anchored question about
  the tool's own behavior that a human still needs to answer.
- Open the **Glossary** tab and notice the curated terms; open the **Data model** tab and notice
  the datastore this flow persists to.

You've now seen the full shape of what this tool produces: a validated model, a source-linked
explorer, hotspots, a glossary, and a data model, all generated from one canonical `flows.json`.

## Next

- To build a model like this one from your own codebase, see
  [how to run the recovery on your own codebase](../how-to/run-recovery-on-your-codebase.md).
- To let a Claude terminal read your live selection while you work in the explorer, see
  [how to connect a Claude terminal](../how-to/connect-a-claude-terminal.md).
- For the reasoning behind the six-phase process, see [the method](../explanation/METHOD.md).
