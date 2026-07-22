# event-storming-recovery

**Recover a strategic [Event Storming](https://www.eventstorming.com/) model from an existing
codebase, and render it as a navigable, source-linked flow explorer.**

Point this at a system that only has its *tactical* implementation (services, repositories,
controllers: no domain model written down) and it recovers the *strategic* view: for every flow
through the system, a user action, a scheduled job, an inbound API call, the actors, commands,
aggregates, events, policies, read models, and external systems it moves through, from entry point
to data write. Each sticky links to the exact source that implements it, so you can step through
any flow left to right and click into the code behind it.

It's a repeatable, orchestrated process: parallel **scout** agents inventory every entry point,
one **deep-trace** agent per flow reads the code end-to-end, and the results merge into a validated
`flows.json` that renders to an interactive `explorer.html` and a Graphviz `flows.dot`.

New here? The [Getting Started tutorial](docs/tutorials/getting-started.md) walks the whole shape
of the tool in a few minutes, with no target codebase of your own required. Everything else in
this README is a fast orientation; the [documentation set](docs/README.md) is where each topic
gets its full treatment.

## Install & quick start

Install the plugin: it bundles both skills, the tools, and the explorer's MCP server declaration.

```
/plugin marketplace add bhastings-t3/event-storming-recovery
/plugin install event-storming-recovery@event-storming-recovery
```
(or from a shell: `claude plugin marketplace add bhastings-t3/event-storming-recovery` then
`claude plugin install event-storming-recovery@event-storming-recovery`.)

Then just tell Claude:

> **use the event storming explorer**

The `event-storming-explorer` skill takes it from there: if the repo has no recovered model yet, it
**offers to build one first** (the recovery workflow), then it launches the interactive app
(`npx event-storming-recovery view` on port 5178). Because the plugin declares the app's MCP
server, your Claude session can read what you click. Select a node and say *"explain the selected
aggregate"* or *"add these two invariants and open a PR"*, and Claude works on the real files, to a
PR.

> **Heads-up:** the viewer runs via `npx event-storming-recovery view`, which needs the
> `event-storming-recovery` npm package published (tracked in the repo issues). Until then it works
> for local development via `npm link`.

For the full walkthrough, see [Getting Started](docs/tutorials/getting-started.md). For running
the recovery on your own codebase or connecting your own Claude terminal, see the
[how-to guides](docs/README.md#how-to-guides-get-a-specific-job-done).

## See the output in 30 seconds

The bundled example is **this tool's own recovered self-model**: the workflow run against this
very repository (a code-derived Event Storming model of the CLI, the es-view server, and the MCP
bridge).

```sh
npm run demo   # rebuilds examples/event-storming-recovery/model from its traces
# then open examples/event-storming-recovery/model/explorer.html in a browser
```

![event-storming-recovery self-model explorer](examples/event-storming-recovery/preview.png)

Left: the flows, badged by kind (read/write/policy) and status (dead/superseded), with hotspot
counts. Center: the flow as an Event-Storming sticky lane, invariants hanging off aggregates, edge
verbs between stickies. Click any sticky for its tactical explanation and a `vscode://` deep link
to `file:line`. Red cards are **hotspots**: the questions a human needs to answer. The **Data
model** tab shows the storage the code touches (here, the filesystem model dir and `flows.json`'s
shape, since there's no database) cross-linked to the read models and aggregates that read and
write it.

## How it works

```mermaid
flowchart TB
    subgraph scouts["① Inventory · 5 parallel scouts"]
        direction LR
        S1[UI entry<br/>points]
        S2[Automations /<br/>background]
        S3[API / auth /<br/>protocol]
        S4[External<br/>integrations]
        S5[Data layer /<br/>aggregates]
        S1 ~~~ S2 ~~~ S3 ~~~ S4 ~~~ S5
    end

    inv["📋 Flow-candidate list<br/>+ shared-id glossary"]
    triage{{"② Triage · human checkpoint"}}
    pilot["③ Pilot trace → fix the schema"]
    fleet["Trace fleet, in waves<br/><i>each agent writes its own flow.json + notes</i>"]
    merge["④ merge-flows.js · merge + validate"]
    canon[("flows.json<br/><b>canonical model</b>")]
    glossary["⑤ glossary-mining wave<br/><i>curated terms + flags, re-merged</i>"]
    gen["⑥ generate-views.js"]
    explorer["🖥️ explorer.html<br/><i>interactive, source-linked</i>"]
    dot["🕸️ flows.dot<br/><i>Graphviz</i>"]

    scouts --> inv --> triage --> pilot --> fleet --> merge --> canon --> glossary --> gen
    gen --> explorer
    gen --> dot

    classDef scout fill:#eef2ff,stroke:#8894c8,color:#26305c;
    classDef human fill:#7EB6FF,stroke:#2262b8,color:#0b2e5c;
    classDef canon fill:#FFE94D,stroke:#b8a000,color:#4d4200;
    classDef output fill:#A8E6A3,stroke:#3d8c38,color:#1e4d1b;
    classDef step fill:#f6f5f2,stroke:#b9b6ad,color:#2b2a27;
    class S1,S2,S3,S4,S5 scout;
    class triage human;
    class canon canon;
    class explorer,dot output;
    class inv,pilot,fleet,merge,glossary,gen step;
```

`flows.json` is the single source of truth; the explorer and DOT are generated from it. Shared node
ids unify recurring concepts across flows (one `agg-order` node, referenced by every flow that
touches it), so the flows join into one navigable map instead of 30 islands. Reachability checks
during tracing catch dead and superseded flows, often where the most interesting recovered intent
lives. See [the method](docs/explanation/METHOD.md) for the reasoning behind each phase, and
[how the app fits together](docs/explanation/architecture.md) for why the running tool is built
this way.

## Working with it

- **Run the recovery on your own codebase**, either via the `event-storming-recovery` skill or by
  hand with `prompts/00-orchestrator.md`: see
  [how to run the recovery on your own codebase](docs/how-to/run-recovery-on-your-codebase.md).
- **Connect your own Claude terminal** to a running explorer so it can read your live selection and
  curated context bundle: see
  [how to connect a Claude terminal](docs/how-to/connect-a-claude-terminal.md), and the
  [MCP reference](docs/reference/mcp.md) for the exact tools (`get_current_selection`, `get_node`,
  `get_flow`, `list_model`, `list_data_model`) and the `event-storming://selected-nodes` resource.
- **Extend or regenerate an existing model** as the code moves on: see
  [how to extend an existing model](docs/how-to/iterate-and-extend-a-model.md) and
  [how to regenerate the explorer and DOT graph](docs/how-to/regenerate-views.md).
- **Look up a command or option**: see the [CLI reference](docs/reference/cli.md) for
  `event-storming-recovery`/`es-view`, `es-merge`, `es-generate`, and the npm scripts.

## Repo layout

| path | what |
|---|---|
| `bin/`, `src/` | the `es-view` app: the local server (`src/server/`, incl. the MCP endpoint), the React SPA explorer (`src/web/`), and shared libs (`src/lib/`). Launched by `npx event-storming-recovery view` |
| `tools/` | the tooling: `merge-flows.js` (merge + validate) and `generate-views.js` (render DOT + static explorer) |
| `prompts/` | the method, encoded: orchestrator playbook + scout / triage / trace-briefing / glossary-mining / data-mapping templates + the shared recursive-exploration protocol |
| `docs/` | the [documentation set](docs/README.md): tutorial, how-to guides, reference (`flows-schema.md`, CLI, MCP), and explanation (`METHOD.md`, architecture) |
| `scripts/` | helper scripts (`build-example.mjs` rebuilds the demo, `dev.mjs` runs the app in dev) |
| `tests/` | smoke tests (`node --test`) covering merge, generate, and the validator; `tests/fixtures/toy-shop/` is the synthetic model they run against |
| `examples/event-storming-recovery/` | the bundled example: this tool's own recovered self-model (produced by running the workflow on this repo) |
| `skills/event-storming-recovery/` | the **recovery** skill: orchestrates building the model |
| `skills/event-storming-explorer/` | the **explorer** skill: launches the app + MCP bridge and drives working with Claude on the model |
| `.claude-plugin/` | marketplace + plugin manifests (incl. the `event-storming` MCP server declaration) that make this repo installable as a plugin |
| `.github/workflows/ci.yml` | runs the tests + example build on every push |

## Limits (read before trusting it)

A code-derived model is an **always-true scaffold and a conversation starter, not a replacement
for a workshop wall.** It faithfully captures nodes, edges, invariants, and source anchors, but it
does *not* capture: true timeline order (horizontal position is reachability, not chronology),
pivotal events, bounded-context boundaries (those must be *declared* by the team, not inferred from
folders), swimlanes, or the human hotspots a live session surfaces. The tracing agents can be
wrong; every finding names its source so you can check it, and the hotspots are framed as
questions, not verdicts. Use it to get oriented fast and to drive the conversations that need a
human.

## License

MIT: see [LICENSE](LICENSE).
