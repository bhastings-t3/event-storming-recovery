# 7. The static explorer client is a typed, built, inlined asset

Date: 2026-08-05

## Status

Accepted

## Context

`generate` emits a self-contained `explorer.html` whose ~1,100-line interactive
client (`renderSidebar`, `layoutFlow`, `buildGallery`, `dataModelTree`,
`setupPanZoom`, …) used to live as a single untyped **template string** in
`src/application/commands/generate-views/client-script.ts`. Because it was a
string, `tsc` never type-checked it, editors could not navigate it, and a typo
against the model shape surfaced only at runtime in a reader's browser. Issue #41
(follow-up to the #40 god-module split) asked to make it a real, type-checked,
built asset — without changing what the explorer renders, and while keeping
`explorer.html` a single offline file with no external `<script>`/CDN.

The trap: the client is browser code (it uses `document`/`window`/SVG), so it
cannot be part of the Node build (`tsconfig.node.json`, no DOM lib), and the
generator that inlines it is in `src/application`, which the ports-and-adapters
rule forbids from importing `src/web`/`src/adapters`
(`tests/architecture-boundary.test.mjs`).

## Decision

Adopt a **build-and-inline** delivery pattern for the static client:

1. **Typed source.** The client is real TypeScript at
   `src/web/static-explorer/explorer-client.ts` — browser code, homed under
   `src/web`, which the Node build/typecheck already exclude. It imports the
   domain `Model`/`PaletteEntry` **type-only** (erased at build) so it is typed
   against the real model shape; deeper dynamic traversal stays loose exactly as
   the sibling `generate-views/dot.ts` render code does. A dedicated
   `tsconfig.client.json` (DOM lib, lenient) type-checks it, and `npm run
   typecheck` now runs both the Node and the client project.

2. **Built to `dist`.** `scripts/build-client.mjs` (esbuild) bundles it into a
   single self-contained IIFE at `dist/client/explorer-client.js` — a new
   `build:client` step in `npm run build` (and `pretest`/`demo`). It lands in
   `dist/client` (not `dist/web`, which `vite build` empties; not `dist/node`,
   the tsc tree); `package.json` `files` ships all of `dist`, so it is present in
   a published install.

3. **Inlined with injected globals.** The generator (`generate-views/html.ts`,
   `src/application`) **reads** the built bundle from `dist` at generate time
   (`fs`, resolved relative to its own `dist/node/...` location via
   `import.meta.url`, so it works from a published install exactly as the bin
   does) and inlines it behind a tiny preamble:
   `window.__ES__ = { MODEL, REPO_ROOT_DEFAULT, PALETTE }`. The client reads
   those globals, so the source itself carries no interpolation. The
   reader-overridable source root (localStorage `esRepoRoot`, ADR-0006) is the
   client's own unchanged logic.

The fs read of a built `dist` artifact is a runtime read, **not** an `import`
into `src/web`, so the ports-and-adapters boundary stays intact (the boundary
test scans import specifiers, not fs reads).

## Consequences

- The client is now type-checked, navigable, and lintable. #42 (de-dup the
  layout/tree math with the live SPA) builds directly on this delivery
  mechanism.
- `explorer.html` stays a single self-contained offline file: the bundle is
  inlined, not linked (`tests/smoke.test.mjs` self-contained assertion stays
  green).
- Behaviour is identical, proven by the static-explorer + SPA E2E
  (`e2e/features/static-explorer*.feature`) staying green with no assertion
  changes. The golden fixture (`tests/generate-views-golden.test.mjs`) was
  **re-baselined** because the emitted client bytes are now a built bundle plus
  the preamble rather than the hand-inlined string; byte-identity is no longer
  the guarantee, the E2E is. `flows.dot` output is unchanged.
- A new build step and a dev-dependency-on-esbuild-at-build (esbuild is already
  a transitive dep of vite). `generate` now depends on `dist/client` existing,
  so `pretest` and `demo` build it alongside `dist/node`.
