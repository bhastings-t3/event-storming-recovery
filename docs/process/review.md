# Definition of Done and the review process

An issue is done when it passes **three lenses**. Mechanical checks are not one
of the lenses: they are the price of admission, they run in CI, and no human or
agent should spend judgment on them.

## Gate 0: mechanical (automated, no judgment)

CI runs these (`.github/workflows/ci.yml`). If they are red, the work is not
ready for review.

- `npm run typecheck` — `tsc --noEmit` over the Node build
- `npm test` — `node --test` (the `pretest` hook builds `dist/node` first, so
  tests run against compiled output, not `src`)
- `npm run build` — Node (`tsc`) and web (`vite`) builds both succeed
- `npm run demo` — the example self-model regenerates and serialises (a smoke
  test of the whole merge → generate pipeline)

There is currently **no lint or format script**, and no database, so there are
no migrations to apply. If a mechanical check is missing, adding it is cheaper
than reviewing for it forever.

Never ask a reviewer to run these by hand.

## Lens 1: functionality, proven by interaction

**The reviewer drives the running app.** Not the tests, the app.

```bash
npm run dev          # API on :5178, Vite explorer on :5179 (proxies /api/)
npm test             # what the suite covers, you do not have to re-check
```

Run the test suite first: what it covers, you do not have to re-check.

Then exercise **the change itself** as the actual user would, since no suite
covers what landed today. For an explorer change, open the board and click it.
For a CLI or MCP change, run `node dist/node/adapters/cli/cli.js view ...` and
drive the real subcommand. Confirm:

- the happy path works end to end
- one realistic failure path behaves sanely (missing model, read-only install
  dir, malformed traces, a client asking for a node that does not exist)
- no console errors, no unhandled promise rejections
- no new error-level logs

"Tests pass" is not evidence of functionality. A green suite over an app that
does not load is a common and embarrassing outcome. Say what you actually did
and what you actually saw.

## Lens 2: code quality, proven by comprehension

**The reviewer must be able to explain what the code does without asking the
author.** If they cannot, that is the finding. Unclear code is a defect even
when it is correct.

Specifically reject:

- code whose shape mimics a pattern elsewhere without the reason that motivated it
- abstractions with exactly one caller and no second caller in sight
- names that restate the type (`dataObject`, `handleThing`, `utils`)
- comments explaining *what* a line does rather than *why* it is that way
- swallowed errors, `any`, and suppression directives without an adjacent reason
- defensive code for conditions that cannot occur

Prefer deleting code to adding a flag. The best review outcome is a smaller diff.

## Lens 3: architecture, proven by entropy accounting

Every change either uses an existing pattern or introduces a new one.
**Introducing a new pattern is a decision that must be named and justified**,
not something that happens quietly in a feature PR.

Ask on every change:

1. Does this duplicate something we already have? Search before adding.
2. Does it add a dependency? What did we get, and what does it cost to remove later?
3. Does it put logic in a new layer or a new place? Why is the existing place wrong?
4. Would a new engineer find this where they would look for it?
5. Is the project's single source of truth still single? The model is canonical
   (`flows.json`, validated by `src/domain/model/invariants.ts`); `explorer.html`
   and `flows.dot` are generated from it and must never become a second source.
6. Is the ports-and-adapters boundary intact? `src/domain` and `src/application`
   must not import from `src/adapters`. This is convention only today (no lint
   rule enforces it), so it is a review responsibility until one does.

If a change introduces a new pattern deliberately, record it in
`docs/architecture/decisions/` as a short ADR. Three sentences is a fine ADR.
The point is that the decision is findable later, not that it is ceremonious.

**ADR numbers are handed out by the orchestrator**, checked against the default
branch *and* every open pull request, because work runs in parallel and the next
free number on your branch is often already claimed on someone else's. There is
no `check:collisions` CI job yet; if ADR-number collisions ever bite twice,
that is the moment to add one (see `references/enforcement.md`).

## Recording the review

Post the outcome on the issue or PR with these headings. Be specific and honest:

```
## Functionality
What I ran, what I clicked, what I saw. Include failures found.

## Code
What this code does, in my own words. Concerns, if any.

## Architecture
New patterns introduced, dependencies added, duplication found.

## Verdict
Ship / Ship with follow-ups (linked) / Needs work (specific changes)
```

An empty section is a signal the lens was skipped. Say "not applicable, this is
a docs-only change" rather than leaving it blank.

## This process is itself reviewable

If a gate is producing ceremony instead of signal, **change it**. Open an issue
against this document, say which gate wasted effort and what it should be
instead, and edit it. A review process nobody believes in is worse than none,
because it launders unreviewed work as reviewed.

Bias: automate anything mechanical, keep human and agent judgment for the three
lenses, and delete any step that has never once caught a real problem.
