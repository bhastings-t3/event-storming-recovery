# Refactor targets for the maintainability & DDD-expression sweep (#21)

*Analysis deliverable for [#22](https://github.com/bhastings-t3/event-storming-recovery/issues/22). Read-only: this document changes no source code. It feeds [#21](https://github.com/bhastings-t3/event-storming-recovery/issues/21), which executes the targets below in small PRs behind the green E2E net from #19/#20.*

## Method: triangulating three views

Each target below is a disagreement between three views of the same system. A finding is only worth acting on when at least two of them line up.

1. **The recovered self-model** — the tool's own view of this codebase, committed at `examples/event-storming-recovery/model/flows.json` (87 nodes, 15 flows, 21 hotspots, 51 terms). Its flows *are* the app's own commands (`add-comment`, `generate-views`, `resolve-model`, `select-node`, …). We read it as a lens, not as ground truth — it is agent-recovered and, as it turns out, a **lagging snapshot** (see "The self-model is stale" below).
2. **The current code** — `src/domain`, `src/application`, `src/adapters`, `src/web`.
3. **The intended design** — the ports-and-adapters layering and its dependency rule (`AGENTS.md:41-52`: domain/application must never import adapters/web) and the event-storming grammar (aggregates own their invariants; one command/query per domain action; policies where behaviour reacts to events; adapters strictly at the edge; names match the ubiquitous language).

Two framing facts shape everything below:

- **#21 is a maintainability & DDD-expression sweep, not a bug/security sweep.** Most of the self-model's 21 `hotspots` are data-safety/security concerns (atomic writes, CSRF, sandboxing), and most of *those* are already fixed (below). They are not the material for #21. The real #21 targets come from triangulating the model's *structure* (aggregates, commands, duplication) against the code.
- **#21 is gated on the E2E net (#19/#20).** The biggest target (the generated explorer) has thin unit coverage (`tests/generate-views-links.test.mjs` asserts only link/repo-root behaviour; `tests/smoke.test.mjs:47` asserts the HTML is self-contained). Refactoring its ~1,100-line embedded UI script would not be caught by the current suite, so it must wait behind end-to-end scenarios that drive the rendered explorer. This is exactly the epic's sequencing.

---

## What is already clean (do NOT churn these)

Honest baseline: several areas the sweep might reflexively "tidy" are already correct. Leave them.

- **The ports-and-adapters boundary is honoured.** A grep for `adapters`/`web` imports across `src/domain` and `src/application` returns **nothing**. The dependency rule is convention-only (`AGENTS.md:48-52`) but is in fact respected everywhere today. The only inward node imports are `node:path` / `node:crypto` for pure computation (`generate-views.ts:6`, `resolve-model.ts:13`, `comment-store.ts:4`, `source-window.ts:4`) — pure string/uuid work, no I/O, acceptable. *The value here is not to change the code but to **lock the property in** — see Target 1.*
- **Application commands and queries are thin and single-purpose.** `add-comment.ts`, `register-mcp.ts`, `select-node.ts`, the `queries/*` files are each one use case delegating to the domain and ports. "One command/query per domain action" holds.
- **HTTP and MCP faces share one application layer.** `src/adapters/http/server.ts` and `src/adapters/mcp/mcp-server.ts` both call the same `buildNodeContext` / `renderBundleMarkdown` / query functions; no logic is duplicated per adapter. This is the design working as intended (`docs/explanation/architecture.md:63-88`).
- **The Model aggregate owns its invariants.** The one validator lives in the domain (`src/domain/model/invariants.ts` + `model.ts`, fed by `merge.ts`); adapters and the SPA render from it. Canonical-model invariant intact.
- **Code names match the recovered ubiquitous language.** The model's aggregates map almost one-to-one onto domain modules: `The Model`→`domain/model/`, `Comment Store`→`domain/comment-store/`, `Current Selection`→`domain/session/selection.ts`, `Context Bundle`→`domain/session/context-bundle.ts`, `Source Reader`→`domain/source/source-window.ts`. Naming drift is minimal.

---

## The self-model is stale (a #22 dogfooding finding, not a #21 target)

The committed self-model predates recent hardening work, so **~6 of its 21 hotspots are already fixed in `main`**. #21 must not chase them:

| Hotspot (recovered) | Status in current code | Evidence |
| --- | --- | --- |
| `hot-comment-nonatomic-persist` | **Fixed** — atomic temp-file + rename; corrupt sidecar surfaced, not swallowed | `adapters/fs/comment-repository.ts:37-46`, `52-61` |
| `hot-source-read-scope` (`/api/source` reads any in-root file) | **Fixed** — gateway is anchor-scoped; non-anchor in-root files (`.env`) refused | `adapters/fs/source-gateway.ts:23-62` |
| `hot-mcp-register-no-csrf` | **Fixed** — loopback/anti-DNS-rebinding guard on state-changers + source | `adapters/http/server.ts:61-110`, `161-164` |
| `hot-invalid-model-written` (es-merge writes invalid model) | **Fixed** — validates before writing | `adapters/cli/es-merge.ts:23-30` |
| `hot-unvalidated-model-served` | **Fixed** — `validateResolved` on `--model`/discovered/example tiers | `application/commands/resolve-model.ts:29-37`, `54`, `73`, `78` |
| `hot-generator-trusts-unvalidated-model` | **Fixed** — es-generate validates before render | `adapters/cli/es-generate.ts:39-45` |
| `hot-bundle-single-global-state`, `hot-selection-global-shared` | **Intentional**, tracked separately as #10 | `AGENTS.md:86-89` |

**Recommendation (belongs to #22, not this PR):** regenerate the self-model (`npm run demo`) so its hotspots reflect current code before anyone mines it again — but **not in this PR** (it is a committed fixture; regenerating it here would change the example and pollute a docs-only change). That the model lags the code is itself the dogfooding signal #22 asked for: the recovery is a point-in-time snapshot with no freshness check (`hot-demo-example-drift`).

---

## Prioritized targets (ordered by value-for-risk)

| # | Target | Size | Risk | Value |
| --- | --- | --- | --- | --- |
| 1 | Add a mechanical ports-and-adapters boundary check | S | low | high |
| 2 | Split the `generate-views.ts` god module | M | med | high |
| 3 | De-duplicate explorer client logic (layout + data-model tree) | L | med-high | high |
| 4 | Split `read-models/context.ts` into builders vs markdown renderers | M | low | med |
| 5 | Consolidate the duplicated empty-comment guard | S | low | low-med |
| 6 | Home the `mcp-url-ready` invariant with its concept | S | low | low |

### Target 1 — Add a mechanical ports-and-adapters boundary check
- **Location:** new test/script; asserts over `src/domain` + `src/application`. No source change.
- **Divergence:** intended design forbids domain/application importing adapters/web (`AGENTS.md:48-52`); the code honours it today, but *nothing enforces it* — it is a review responsibility (Lens 3). #21 explicitly calls this out: "add a mechanical boundary check … so the expression stays honest after we leave."
- **Why it matters:** the layering is the whole DDD story. A single accidental `import` from an adapter into a command would rot it silently. Cheaper to assert once than to review forever (`docs/process/review.md:118-126`).
- **Suggested change:** a `node --test` file that scans compiled `dist/node` (or `src` via a tiny import walk) and fails if any `domain/`/`application/` module imports from `adapters/`/`web/`. Byte-cheap, deterministic, no new dependency.
- **Do this first:** highest value-for-risk. It also makes Targets 2–4 safer by pinning the boundary while modules move.

### Target 2 — Split the `generate-views.ts` god module
- **Location:** `src/application/commands/generate-views.ts` (**1,533 lines**, the single largest file in `src/`).
- **Divergence:** one function, `renderHtml` (`:65-410` CSS + `:411-1525`), emits the entire standalone explorer as a **template-string blob of ~1,100 lines of untyped vanilla JS** (`renderSidebar`, `layoutFlow`, `buildGallery`, `buildGlossary`, `dataModelTree`, `openDetail`, `setupPanZoom`, …). None of it is type-checked, unit-tested, or navigable. This is the codebase's clearest "god module."
- **Why it matters:** any explorer fix means editing an unhighlighted, untypechecked string inside an application *command*. It also conflates the application concern (model → views transform) with a large presentation asset.
- **Suggested change (behind the E2E net):** mechanically extract into cohesive modules with **no output change** — e.g. `generate-views/dot.ts` (`renderDot`), `generate-views/html.ts` (the shell + `<style>`), and the client script as a real `.js` asset inlined at build. Keep `generateViews()` as the composition point. Assert byte-identical output against a golden file (the current suite does not, `hot-demo-example-drift`), so extraction is provably behaviour-preserving.
- **Risk note:** med — thin existing coverage means the golden-file assertion (or the #20 E2E scenarios) is a prerequisite, not optional.

### Target 3 — De-duplicate explorer client logic
- **Location:** `src/web/lib/layout.js` ↔ the embedded script in `generate-views.ts`; plus `read-models/indexes.ts`.
- **Divergence — verbatim duplication:** the flow-layout math exists **twice**, function-for-function:
  - `renderFlowInto` (`web/lib/layout.js:22` ↔ `generate-views.ts:555`), `setupPanZoom` (`:208` ↔ `:788`), `placeCard` (`:248` ↔ `:828`), `borderPoint` (`:268` ↔ `:846`), `makePath` (`:274` ↔ `:852`), `curveD` (`:284` ↔ `:862`), `curveInto` (`:290` ↔ `:868`).
  - The data-model tree is built in **three** places: `application/read-models/indexes.ts:98` (`dataModelTree`, for MCP/markdown), `web/lib/datamodel-layout.js:128` (`build`, React), and `generate-views.ts:1102` (`dataModelTree`, static export).
- **Why it matters:** the live React explorer and the generated static explorer are two implementations of the *same* visualisation. A layout fix must be made in two (or three) languages/forms or they drift — a textbook Lens-3 duplication finding.
- **Suggested change:** extract the **pure** geometry and tree functions (no DOM) into a shared ES module both the SPA and the generated client import; leave the DOM/render code separate (React vs static differ legitimately). Realistic scope is the math, not a full merge of the two UIs.
- **Risk note:** med-high, size L. **Depends on Target 2** (the embedded blob must first become a real module before it can `import` anything). Sequence C→D.

### Target 4 — Split `read-models/context.ts` into builders vs markdown renderers
- **Location:** `src/application/read-models/context.ts` (363 lines).
- **Divergence:** the file mixes two concerns — *projection builders* (`buildNodeContext:81`, `buildFlowContext:240`, `buildHotspotContext:289`) and *Markdown presentation* (`renderNodeContextMarkdown:161`, `renderItemMarkdown:227`, `renderBundleMarkdown:234`, `renderHotspotMarkdown:303`, `renderDataModelMarkdown:320`, `renderFlowMarkdown:344`, `flowMermaid:264`).
- **Why it matters:** the structured context is the projection; the Markdown is one rendering of it (the MCP/copy-for-claude output whose bytes are a contract). Separating them clarifies which half is the read-model and which is presentation, and isolates the byte-exact output.
- **Suggested change:** move the `render*Markdown` functions into `context-markdown.ts`; keep `context.ts` as the builders and **re-export** the renderers so no importer changes. Importers are `mcp-server.ts` and six `queries/*` files — all keep working through the barrel. Low risk, mechanical.

### Target 5 — Consolidate the duplicated empty-comment guard
- **Location:** `application/commands/add-comment.ts:22-24` and `domain/comment-store/comment-store.ts:64-66` (`EmptyCommentError`).
- **Divergence:** the empty/whitespace check runs in both the command (returns typed `invalid`) and the domain store (throws). Through the command path the store's throw is unreachable (Lens-2 "defensive code for conditions that cannot occur").
- **Why it matters:** minor. It is *defensible* defence-in-depth (the store has a second entry point — direct/test callers), so this is a judgement call, not a clear defect.
- **Suggested change:** keep the domain invariant (it is the aggregate's rule), and treat the command check as deliberate input-validation-with-ordering — add a one-line "why" comment, or centralise so the command maps `EmptyCommentError` rather than re-implementing the test. **Do not** simply delete the command guard: it preserves the `store→target→text` error order and the `400` mapping; removing it would let the store throw escape as a 500. Low priority; a candidate for "leave as-is with a comment."

### Target 6 — Home the `mcp-url-ready` invariant with its concept
- **Location:** invariant `inv-mcp-url-ready` ("registration is refused until the server's own MCP URL is known") is enforced in the HTTP adapter (`adapters/http/server.ts:267`, the `if (!u) return 503`), not in the `registerMcp` command (`application/commands/register-mcp.ts`).
- **Divergence:** the recovered model treats this as an invariant of the `MCP Registration` aggregate, but the check lives at the edge.
- **Why it matters:** small. URL-readiness is arguably a genuine server-runtime fact, so the adapter is a defensible home — but the concept and its guard sitting in different layers is the kind of thing the sweep should at least *decide* on.
- **Suggested change:** optional — either move the precondition into `registerMcp` (so the command owns its own guard) or leave it and note the rationale. Lowest priority; discuss rather than assume.

---

## Suggested slicing of #21 into non-colliding PRs

Ordered so that independent slices can be dispatched in parallel and the one dependency (C before D) is explicit. Files each slice touches are listed so the orchestrator can avoid collisions.

| Slice | Targets | Files touched | Depends on | Notes |
| --- | --- | --- | --- | --- |
| **21-A: boundary check** | 1 | *new* `tests/architecture-boundary.test.mjs` (+ possibly a small scan helper); no `src/` change | none | Dispatch first. Pins the layering before other slices move modules. |
| **21-B: context read-model split** | 4 | `src/application/read-models/context.ts` → *new* `src/application/read-models/context-markdown.ts` (re-exported) | none | Importers (`mcp-server.ts`, six `queries/*`) unchanged via barrel. Parallel-safe. |
| **21-C: generate-views module split** | 2 | `src/application/commands/generate-views.ts` → *new* `src/application/commands/generate-views/*`; import site `src/adapters/cli/es-generate.ts` | E2E net (#19/#20) | Add a golden-output assertion first. Isolated from A/B. |
| **21-D: de-dup client/layout math** | 3 | `src/web/lib/layout.js`, `src/web/lib/datamodel-layout.js`, `src/application/read-models/indexes.ts`, the extracted generate-views client (from 21-C) | **21-C** | Both C and D touch generate-views → run C first. Behind E2E net. |
| **21-E: minor DDD tidy (optional)** | 5, 6 | `src/application/commands/add-comment.ts`, `src/application/commands/register-mcp.ts`, `src/adapters/http/server.ts` | none | Small; may resolve to "leave with a comment." Parallel-safe. |

**Collision map:** only **C and D** overlap (both edit the generate-views area) — sequence C→D. A, B, E are mutually independent and independent of C/D, so they can run concurrently.

---

## Bottom line

- The layering and DDD expression are **already substantially clean** — thin handlers, honoured boundary, names matching the ubiquitous language, the Model aggregate owning its invariants. The sweep should be surgical, not sweeping.
- The one large, unambiguous structural problem is the **generated explorer** (`generate-views.ts`): a god module whose embedded UI script is duplicated against `src/web`. That is where most of #21's value sits, and it is correctly gated behind the E2E net.
- The self-model earned its keep here as a **map of concepts and duplication**, but its *hotspots* are a lagging bug list, mostly already fixed. Use it for structure, not for a to-do list.
</content>
</invoke>
