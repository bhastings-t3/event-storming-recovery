# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: this is a
useful orientation too, but `docs/` is written for you.

**event-storming-recovery** recovers a strategic Event Storming model from an
existing codebase and renders it as a navigable, source-linked flow explorer.
TypeScript, ESM-only, Node **>= 20**.

Before working an issue, read `docs/process/working-an-issue.md`. It defines how
a change gets from an issue to `main`, and **you do not merge** — you push, open
a PR, and stop.

## How to run

```bash
npm run dev        # API on :5178, Vite explorer on :5179 (proxies /api/); Ctrl-C to stop
npm run typecheck  # tsc --noEmit over the Node build
npm test           # node --test; the pretest hook builds dist/node first
npm run build      # build:node (tsc -> dist/node) + build:web (vite -> dist/web)
npm run demo       # regenerate the example self-model (merge -> generate pipeline smoke)
```

Run the CLI / MCP server from the built output:

```bash
node dist/node/adapters/cli/cli.js view [model|--traces <dir>] [--port N] [--no-open]
```

The `view` process serves both the HTTP explorer API and the MCP server at
`POST /mcp` on the same port.

There is **no `lint` and no `format` script**, and no database (so no
migrations). CI (`.github/workflows/ci.yml`) runs one check, `test`, which is
`npm test` plus `npm run demo`.

## Architecture: ports and adapters

Full write-up in `docs/explanation/architecture.md`. The layering:

| Layer | Contains | May depend on |
| --- | --- | --- |
| `src/domain/` | Pure aggregates, the model, its validator. No I/O. | Nothing |
| `src/application/` | Commands, queries, read-models. | Port **interfaces** in `src/application/ports.ts` only |
| `src/adapters/` | fs, http, mcp, process, cli. Implements the ports. | domain + application |
| `src/web/` | React SPA. Talks to the HTTP `/api/*` face. | Outside the layering |

**The dependency rule:** `src/domain` and `src/application` must never import
from `src/adapters` or `src/web`. This is **convention only** — no lint rule or
boundary test enforces it yet, so it is a review responsibility (Lens 3 in
`docs/process/review.md`). The one mechanical seam is `tsconfig.node.json`, which
excludes `src/web` so the Node build never compiles the SPA.

## Invariants that must never break

- **The model is the single source of truth.** `flows.json` is canonical;
  `explorer.html` and `flows.dot` are generated from it. Never make a generated
  artifact a second source of truth.
- **The model validator is the one schema.** There is no zod schema for the
  model. Referential integrity and the flow grammar (ids resolve, aggregates
  never `issues`, invariants attach to aggregates, terms carry definitions and
  open questions) live in `src/domain/model/invariants.ts` +
  `src/domain/model/model.ts`, fed by `src/domain/model/merge.ts`. Its error and
  warning **strings and their order are byte-identical** to the pre-refactor
  validator and are asserted by tests — do not reword them casually.
  `docs/reference/flows-schema.md` is the prose mirror of this contract.
- **The comment sidecar is never written into the model.**
  `src/adapters/fs/comment-repository.ts` writes `comments.json` *next to*
  `flows.json`; folding it in would let a merge wipe it. Writes are best-effort
  and fall back to in-memory with a one-time warning on a read-only location.
- **The CLI bin path is `dist/node/adapters/cli/cli.js`** for both the
  `event-storming-recovery` and `es-view` bins (`package.json`). It is produced
  by `tsc -p tsconfig.node.json`.
- **MCP tool/resource names are a contract** with the plugin:
  `get_current_selection`, `get_node`, `get_flow`, `list_model`,
  `list_data_model`, and `event-storming://selected-nodes`
  (`src/adapters/mcp/mcp-server.ts`). Zod there validates MCP tool *inputs*, not
  the model.

## Gotchas

- **Tests and the CLI run against compiled `dist/node`, not `src`.** Forgetting
  to build means stale behavior; `pretest`, `dev`, and `demo` all recompile
  defensively, but a hand-run `node dist/...` does not.
- **Session state is process-global.** `src/domain/session/selection.ts` and the
  ContextBundle are in-memory singletons built once in `runView` and shared
  across the HTTP and MCP faces, so selection is not per-client. Fine for
  single-user local use; the subject of issue #10.
- **The Vite proxy must match `^/api/`** (not bare `/api`) or it swallows the
  SPA's own `/api.js` module (`vite.config.mjs`).
- **Windows paths:** `scripts/build-example.mjs` passes `--repo-root '.'` on
  purpose so committed deep links stay relative and never bake in an absolute
  path or username.
- The `examples/event-storming-recovery/` self-model is pipeline-shaped, an
  atypical but deliberate fixture that exercises the two-plane modeling rule.

## Merge discipline

You cannot land code on `main` yourself. See
`docs/process/working-an-issue.md`. The short version: push your branch, open a
PR against `main`, fill in the three lenses, and stop. The orchestrator merges
through `node scripts/merge-pr.mjs <n>`, which refuses unless the `test` check is
green. A PreToolUse hook (`scripts/guard-merge.mjs`) and a `provenance` workflow
back this up; the rationale is in
`docs/architecture/decisions/0001-pr-only-provenance.md`.
