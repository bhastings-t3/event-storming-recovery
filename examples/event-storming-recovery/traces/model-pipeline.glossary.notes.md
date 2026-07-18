# model-pipeline glossary — mining notes

Area: **model-pipeline** — the tool's own vocabulary for the MODEL and the RECOVERY PIPELINE.
22 terms, all `resolved` (0 flagged). Ids prefixed `term-mp-` to avoid cross-area collisions.

## What this slice covers
Model structure (Flow, Node, The Model/flows.json, meta, usages), the pipeline CLIs
(Merge/es-merge, Generate/es-generate, demo/BuildExample) and their outputs (explorer.html,
flows.dot), flow attributes (Tier-1/2, Instance, Flow status), the resolution provenance
(Model source), the join convention (shared-id glossary), the recovery phases, and the
pipeline roles (Orchestrator, Scout, Deep-trace agent) + the Recursion protocol.

## Deliberately NOT minted here (owned elsewhere)
- **Method-owned terms** — Event Storming, Aggregate, Command, (Domain) Event, Policy, Read
  Model, External System, Actor, Invariant, Hotspot, Sticky, Ubiquitous Language, ES grammar
  rule, two-plane, altitude, `inferred`, strategic/tactical, bounded context. Confirmed present
  in `es-method.glossary.json` (`term-es-*`). I reference these in prose but do not redefine.
- **Data-model layer** — Field, Derivation, Source/role/transform, conceptual-vs-confidence,
  Provenance (field-level), physical node types, parent containment, storage verbs,
  demand-driven, lineage, ownedBy. Present in `data-model.glossary.json` (`term-dm-*`).
- **es-view / MCP / grounding layer** — es-view server, Selection, Context bundle, MCP bridge,
  grounded projection, `event-storming://selected-nodes`, "Add to context", the connect
  command. These are the tool's *serving/MCP* vocabulary (nodes agg-es-view-session,
  agg-selection, rm-context-bundle, ext-claude-mcp-client, cmd-register-mcp, etc.). They are
  out of my seed list (model + pipeline) and I have left them for the serving/MCP area. **If no
  area owns them, they are a coverage gap** — flag for the orchestrator.

## Cross-area terms worth de-duping
- **Provenance (two senses).** `term-dm-provenance` (data-model) is the *field-level*
  provenance[] (sql-literal / migration / orm-mapping / inferred / ...). My `term-mp-model-source`
  is the *model-resolution* source (`model | traces | discovered | example`, from resolveModel,
  surfaced as `meta.source`). Different concepts, both legitimately called "provenance" in the
  code/UI. I named mine "Model source (resolution provenance)" and cross-referenced dm's term so
  the explorer doesn't read as a contradiction. Orchestrator: keep both, keep the disambiguation.
- **shared-id glossary vs meta.sharedGlossary.** One input convention (agree ids before tracing)
  vs one derived output field (nodes that ended up in >1 flow). I split them: `term-mp-shared-id-glossary`
  (concept) and the `sharedGlossary` field inside `term-mp-meta` (jargon), each pointing at the
  other in prose. Kept as two because they are genuinely different artifacts.
- **Orchestrator (role) vs Operator (actor node).** `agg`/actor `actor-operator`'s description
  says "developer/orchestrator who runs the recovery CLIs". My `term-mp-orchestrator` is the
  *agent* that dispatches sub-agents — NOT the human at the CLI. I left `relatedNodes` empty and
  called out the distinction to avoid a wrong-node link. If the es-view/serving area mints an
  "Operator" term, keep them separate.
- **Glossary (tab) vs glossary mining vs shared-id glossary.** Three uses of "glossary": the
  explorer's Glossary tab (rm-glossary, a read model — not a term here), Phase 5 glossary mining
  (folded into `term-mp-recovery-phases`), and the shared-id glossary convention. No single "Glossary"
  term minted, to avoid conflating them.

## relatedNodes mapping (all resolve in the merged model)
- The Model -> `agg-model`; Trace -> `rm-trace`; Merge -> `cmd-merge-traces`;
  Generate -> `cmd-generate-views`; explorer.html -> `rm-explorer`; flows.dot -> `rm-flows-dot`;
  demo -> `cmd-build-example`.
- Left empty where the term is a convention/attribute/role with no 1:1 node: Flow, Node,
  shared-id glossary, Tier, Instance, Flow status, Reachability, meta, usages, Model source,
  Recovery phases, Orchestrator, Scout, Deep-trace agent, Recursion protocol. (Per pilot tuning:
  `relatedNodes` resolves against `nodes[]` ONLY; flow/meta correspondences noted in prose.)

## Category choices (per pilot tuning)
- Process/pattern/artifact jargon -> `jargon` (Trace, Node, explorer.html, flows.dot, Tier,
  Instance, meta, usages, Model source, demo).
- Method rules/concepts -> `concept` (Flow, The Model, shared-id glossary, Merge, Generate,
  Reachability, Recovery phases, Recursion protocol).
- Status values -> `state` (Flow status: live/dead/superseded).
- Agent roles -> `role` (Orchestrator, Scout, Deep-trace agent).
- No `acronym`/`metric`/`system` terms arose cleanly in this area. (Graphviz is an external
  renderer but folded into `flows.dot` rather than minted as a `system` term.)

## Judgement calls
- **Merge and Generate as `concept` not `jargon`.** They are the named pipeline steps (phases),
  so I treated them as concepts and put the code spellings (es-merge / merge-flows.js /
  MergeTraces) in `aka`. Defensible either way; flag if the area prefers jargon for CLI commands.
- **No term per command/event sticky.** Per the schema rule, ModelMerged / ModelValidated /
  ViewsGenerated and the four merge invariants (referential integrity, ES grammar, terms
  contract, data lineage) are model nodes, not glossary terms; they are referenced inside the
  Merge/Generate/Flow-status definitions instead.

## Schema friction
None. The Term schema and merge validation (`status != resolved` needs `openQuestion`; `resolved`
needs `definition`; `relatedNodes` must resolve; nonstandard `category` is a warning) were
sufficient. `relatedNodes` resolving against `nodes[]` only (not flows/hotspots) was the one
constraint that shaped output — several pipeline terms correspond best to a *flow* or a *meta
field*, which I handled in prose with empty `relatedNodes`, exactly as the pilot tuning directs.
