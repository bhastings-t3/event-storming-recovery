# 5. The E2E harness is Gherkin BDD on playwright-bdd

Date: 2026-08-04

## Status

Accepted

## Context

Issue #19 (under epic #18) asks for a Gherkin/BDD end-to-end harness that drives
the **actual running app**, uses Playwright and its resilient locators, and runs
in CI, alongside (not replacing) the `node --test` unit suite. The app has three
faces, each an E2E target: the Explorer SPA (a real browser), the CLI
(`merge`/`generate`), and the MCP server (`POST /mcp`).

## Decision

Use **playwright-bdd**: Gherkin `.feature` files compiled onto the Playwright
test runner (`@playwright/test`) by its `bddgen` step, with step definitions in
TypeScript.

- The **SPA** face is what Playwright is for: a real Chromium against the built
  SPA, driven by auto-waiting, resilient locators — the "self-healing" the owner
  asked for, natively.
- The **CLI** and **MCP** faces are driven by step definitions that shell out to
  the built bin and connect an MCP SDK client, respectively. One runner, one
  reporter, one Gherkin vocabulary across all three faces, instead of a second
  BDD stack bolted beside Playwright.

The harness owns bring-up: a `globalSetup` builds once (every face runs against
`dist/`), and each scenario spawns its own `view` process, parsing the real bound
URL (the server walks forward from its port on EADDRINUSE). Per-scenario server
instances keep the process-global session (selection + bundle, single-user-local
by design — issue #10) from bleeding between scenarios. Layout: `e2e/features/`,
`e2e/steps/`, `e2e/support/`, with a shared fixtures module — the seam issue #20
scales into.

## Alternatives considered

- **cucumber-js** (the reference Gherkin runner for Node) driving Playwright as a
  library. Rejected: it needs its own world/hooks/runner wired to Playwright by
  hand and would run the browser scenarios *outside* the Playwright runner,
  forfeiting its report, trace viewer, fixtures, and auto-waiting — the exact
  tooling the issue names. playwright-bdd gives the Gherkin surface on top of that
  runner with none of that glue.
- **Plain `@playwright/test`, no Gherkin.** Rejected: the issue is explicit that
  scenarios are expressed in Given/When/Then.

## Consequences

- A new dev dependency surface (`@playwright/test`, `playwright-bdd`, browser
  binaries). CI installs browsers with `npx playwright install --with-deps`.
- The generated specs (`.features-gen/`) and run output are git-ignored; the
  features + steps are the source of truth.
- The `e2e` CI job is **not** a required merge check yet (`scripts/merge-pr.mjs`
  `REQUIRED` still lists only `test`). A brand-new browser suite should prove
  stable before it can block a merge; promoting it is a deliberate later step.
