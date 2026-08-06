# Getting started

*Tutorial. Part of the [documentation set](../README.md).*

In this tutorial we will open the interactive explorer against this tool's own bundled example,
then click through one flow end to end: sticky lane, tactical explanation, real source, a hotspot,
the glossary, and the data model. By the end you will have seen every piece this tool produces,
without needing a target codebase of your own yet, and with nothing to install beyond Node.

## 1. Prerequisites

You need Node **>= 22.12** and a web browser. That's it: the tool is published to npm, so you run
it with `npx` and there is no clone, plugin, or account to set up for this tutorial.

## 2. Open the explorer

In a terminal, run:

```sh
npx event-storming-recovery view --no-open
```

The first run downloads the package, then boots the explorer and prints a banner like:

```
  Event Storming explorer
  http://127.0.0.1:5178

  model:     bundled example — this tool's own self-model (no model found here)
  contents:  15 flows, 87 nodes, 13 hotspots

  Ctrl+C to stop.
```

Open the URL from the banner in your browser. It is usually `http://127.0.0.1:5178`, but `view`
**falls forward** to the next free port if 5178 is taken, so trust the printed URL rather than
hardcoding the number. (`--no-open` keeps it from launching a browser tab for you; drop it and it
opens one automatically.)

With no `--model` or `--traces` argument, `view` auto-discovers a `**/model/flows.json` under the
current directory and, finding none here, falls back to the bundled self-model: the workflow run
against this very repository. So you are looking at a real recovered model with zero setup.

## 3. Click through a flow

In the flow list, click **`merge-traces`** ("Operator merges per-flow traces into the validated
model").

- Notice the sticky lane: an actor, the `MergeTraces` command, the `agg-model` aggregate, and the
  events it emits, left to right.
- Click the **`MergeTraces`** sticky. The detail panel opens with its tactical explanation (how
  the merge is actually implemented) and its source anchors. Click an anchor; it's a `vscode://`
  deep link straight to the real line in `src/domain/model/` (the merge and validation logic).
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

> **T3 Expo devs with repo access** can also install the plugin
> (`/plugin marketplace add bhastings-t3/event-storming-recovery`) and just say *"use the event
> storming explorer"*, or clone the repo and run `npm run demo` to rebuild the same example from its
> committed traces. A public launch is planned; until then those two paths need access to this
> private repo, while the `npx` path above works for everyone.
