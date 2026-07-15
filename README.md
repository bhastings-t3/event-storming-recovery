# event-storming-recovery

**Recover a strategic [Event Storming](https://www.eventstorming.com/) model from an existing
codebase, and render it as a navigable, source-linked flow explorer.**

Point this at a system that only has its *tactical* implementation (services, repositories,
controllers — no domain model written down) and it recovers the *strategic* view: for every flow
through the system — a user action, a scheduled job, an inbound API call — the actors, commands,
aggregates, events, policies, read models, and external systems it moves through, from entry point
to data write. Each sticky links to the exact source that implements it, so you can step through
any flow left-to-right and click into the code behind it.

It's a repeatable, orchestrated process: parallel **scout** agents inventory every entry point,
one **deep-trace** agent per flow reads the code end-to-end, and the results merge into a validated
`flows.json` that renders to an interactive `explorer.html` and a Graphviz `flows.dot`.

## See the output in 30 seconds

```sh
node src/merge-flows.js examples/toy-shop/traces examples/toy-shop/model/flows.json
node src/generate-views.js examples/toy-shop/model/flows.json examples/toy-shop/model --title "Toy Shop Event Storming"
# then open examples/toy-shop/model/explorer.html in a browser
```

![toy-shop explorer](examples/toy-shop/preview.png)

Left: the flows, badged by kind (read/write/policy) and status (dead/superseded), with hotspot
counts. Center: the flow as an Event-Storming sticky lane, invariants hanging off aggregates, edge
verbs between stickies. Click any sticky for its tactical explanation and a `vscode://` deep link to
`file:line`. Red cards are **hotspots** — the questions a human needs to answer.

## Run it on your own codebase

This is an **agent-orchestrated** process (a coding agent — e.g. Claude Code — drives it; the
deterministic parts are the schema, the merge/validate, and the render). Two ways to start:

- **As a Claude Code plugin** (recommended) — install it, then invoke the `event-storming-recovery`
  skill and it drives all five phases:

  ```
  /plugin marketplace add bhastings-t3/event-storming-recovery
  /plugin install event-storming-recovery@event-storming-recovery
  ```
  (or from a shell: `claude plugin marketplace add bhastings-t3/event-storming-recovery` then
  `claude plugin install event-storming-recovery@event-storming-recovery`). The repo is both the
  marketplace and the plugin; the skill and its bundled prompts/tools install together.

- **By hand / any agent:** follow `prompts/00-orchestrator.md`. It tells the orchestrator how to
  spawn the scouts (`prompts/01-scouts.md`), triage with you (`prompts/02-triage.md`), brief the
  trace agents (`prompts/03-trace-briefing.md`), then merge and render.

Then the deterministic pipeline:

```sh
node src/merge-flows.js  <tracesDir> <out>/model/flows.json          # merge many trace slices + validate
node src/generate-views.js <out>/model/flows.json <out>/model \      # emit flows.dot + explorer.html
    --repo-root "/abs/path/to/your/checkout" --title "<Project> Event Storming"
```

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
    gen["⑤ generate-views.js"]
    explorer["🖥️ explorer.html<br/><i>interactive, source-linked</i>"]
    dot["🕸️ flows.dot<br/><i>Graphviz</i>"]

    scouts --> inv --> triage --> pilot --> fleet --> merge --> canon --> gen
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
    class inv,pilot,fleet,merge,gen step;
```

- **`flows.json`** is the single source of truth; the explorer and DOT are generated from it.
- **Shared node ids** unify recurring concepts across flows (one `agg-order` node, referenced by
  every flow that touches it), so the flows join into one navigable map instead of 30 islands.
- **Reachability checks** during tracing catch **dead and superseded** flows — often where the most
  interesting recovered intent lives (why was this replaced? what does the successor do differently?).

See [`METHOD.md`](docs/METHOD.md) for the full methodology and the reasoning behind each phase.

## Repo layout

| path | what |
|---|---|
| `src/` | the tooling: `merge-flows.js` (merge + validate) and `generate-views.js` (render DOT + explorer) |
| `prompts/` | the method, encoded: orchestrator playbook + scout / triage / trace-briefing templates |
| `docs/` | `METHOD.md` (the methodology and its reasoning) and `flows-schema.md` (the node/edge/flow contract) |
| `scripts/` | helper scripts (`build-example.mjs` rebuilds the demo) |
| `tests/` | smoke tests (`node --test`) covering merge, generate, and the validator |
| `examples/toy-shop/` | a tiny synthetic model so the pipeline runs out of the box |
| `skills/event-storming-recovery/` | the skill loaded when installed as a Claude Code plugin |
| `.claude-plugin/` | marketplace + plugin manifests that make this repo installable as a plugin |

## Limits (read before trusting it)

A code-derived model is an **always-true scaffold and a conversation starter — not a replacement
for a workshop wall.** It faithfully captures nodes, edges, invariants, and source anchors, but it
does *not* capture: true timeline order (horizontal position is reachability, not chronology),
pivotal events, bounded-context boundaries (those must be *declared* by the team, not inferred from
folders), swimlanes, or the human hotspots a live session surfaces. The tracing agents can be wrong;
every finding names its source so you can check it, and the hotspots are framed as questions, not
verdicts. Use it to get oriented fast and to drive the conversations that need a human.

## Iterating

Everything is regenerable from the per-flow `traces/*.json`. To extend a map, add a new trace
(follow `docs/flows-schema.md`, reuse the shared node ids so it joins the existing flows) and
re-run the two commands. To improve the *method*, edit the prompts in `prompts/` and the schema —
the pilot-trace-then-fix loop in phase 3 is designed to surface schema gaps cheaply.

## License

MIT — see [LICENSE](LICENSE).
