# Recursive exploration (shared sub-agent protocol)

Every sub-agent spawned in this method (scout, trace agent, glossary miner, and any agent
*they* in turn spawn) operates under this protocol. It turns a flat fan-out into a dynamic,
adaptive traversal of the whole context space: when you hit a high-signal pathway, you spin up
your own sub-agents to chase it instead of skimming past it or spending your own context
reading it end to end.

**You are never a leaf by default.** If a pathway turns out richer than your task assumed,
recurse into it rather than flattening it.

## The harness supports this (and its one hard limit)

Nested sub-agents are real, not aspirational — this has been verified both empirically and against
the Claude Code docs (nested spawning is supported as of v2.1.172):

- **You spawn children with the `Agent` tool**, exactly as the orchestrator spawned you. A child
  runs as a genuinely separate agent (its own context and transcript) and returns only its final
  message to you. This is why deep trees never flood any one context.
- **You must be spawned as an agent type that *has* the `Agent` tool.** In this harness
  `general-purpose` and `claude` carry it; **`Explore` and `Plan` do not** ("all tools except
  Agent") and are therefore forced leaves that cannot recurse. If you were meant to recurse and you
  have no `Agent` tool, that is a dispatch bug — report it rather than silently flattening.
- **Hard depth cap = 5, fixed and non-configurable.** The main conversation is depth 0, the
  orchestrator's first wave (you, if spawned by it) is depth 1, and an agent at depth 5 does not
  receive the `Agent` tool and cannot spawn further. The recursion budget below stays inside this.

## When to recurse (the high-signal trigger)

Spawn a child sub-agent whenever a pathway looks genuinely load-bearing and would otherwise be
under-explored:

- **A contradiction** with the hint you were given, or between two parts of the code. The best
  findings are contradictions, so chase them, don't reconcile them away.
- **A hub**: a method, table, or service with high fan-in or fan-out that many flows route
  through. Understanding it once, deeply, pays off across the model.
- **An unfamiliar subsystem or aggregate boundary** you would have to read a lot of code to
  understand. Delegate the reading, keep the conclusion.
- **A branch that forks the model**: a policy, a background reaction, an external dual-write, a
  hidden trigger or stored proc that implies a whole other flow.
- **A surprising side effect**: a screen writing straight to the DB, a "sync" that is actually
  user-driven, an inline mailer, a state change where you expected a read.

Do **not** recurse on the trivial: a single caller lookup you can grep in one shot, a rename, a
config value. Recursion has to buy you either depth you could not reach alone or context you
should not be holding yourself.

## Budget (aggressive)

This method favors coverage, so recurse freely:

- **Depth**: descend 3 to 4 levels when a branch keeps paying off. Every level must justify
  itself by changing a conclusion. The harness caps total depth at 5 (see above), so a first-wave
  agent has room for ~4 further levels — but convergence (below) should brake you well before the
  cap; hitting depth 5 means you probably kept descending a branch that stopped paying off.
- **Fan-out**: spawn as many children as the pathway has distinct promising branches, and run
  them concurrently.
- **Stop rule (convergence)**: stop descending a branch when a child comes back *without*
  changing your model, meaning no new node, no new contradiction, no new hotspot. Diminishing
  returns is the brake, not a fixed counter. Spend where signal is high; cut branches that go
  quiet.

## The contract every child inherits

A child you spawn is bound by the same rules you are:

1. **Read-only unless it owns an artifact slice.** Only hand a child its own
   `.json` / `.glossary.json` to write when it owns a whole flow or area. Side-question children
   just return findings.
2. **Return conclusions, not dumps.** A child's reply is a short structured finding plus code
   anchors (`path:line`, `symbol`), never pasted file contents. This is what keeps a deep tree
   from flooding any one context.
3. **It may recurse too.** A child that hits its own high-signal pathway spawns its own children
   under this same budget. That recursion is the point. Spawn each child as a **spawn-capable type**
   (`general-purpose` or `claude`, which carry the `Agent` tool) — never `Explore`/`Plan` — so the
   subtree can keep recursing. Keep each child on the **same model tier** it does its work at: Opus
   for any child that reads code, greps, or otherwise calls tools; step down to Haiku only for a
   child whose whole job is to summarize or condense text with no real exploration.
4. **It carries your shared context down.** Pass the shared-id glossary and `{EXCLUDE}` to every
   child so the whole subtree converges on the same node ids and skips the same noise.

## Feed discoveries back into the artifact

Recursion is not research for its own sake; every branch that pays off has to land in the model:

- A new pathway a child uncovers becomes **nodes/edges** in your flow, or a **candidate flow**
  you surface to the orchestrator when it is outside your slice.
- An unrecoverable intent, or a branch that looks accidental or risky, becomes a **hotspot** with
  the specific question a human should answer.
- A newly pinned (or still fuzzy) domain term becomes a **term**, resolved or flagged with an
  `openQuestion`.

## Self-critique before you return

Before you write your artifact and report back, ask: *what would contradict this?* If the answer
is a specific, checkable pathway and it is high-value, spawn one more child to check it. If you
already know it is low-value, record it as a hotspot and move on. Converge first, then report:
your final message stays short (conclusions, anchors, counts), and the detail lives in the files
you and your subtree wrote.
