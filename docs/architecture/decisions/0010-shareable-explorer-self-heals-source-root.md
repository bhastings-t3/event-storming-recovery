# 10. A shareable committed explorer self-heals its source root on first open

Date: 2026-08-06

## Status

Accepted

Extends [6. The committed explorer bakes an absolute source root as a reader-overridable default](0006-reader-overridable-source-root.md).

## Context

ADR-0006 made `explorer.html` bake the generating machine's absolute path as a source-root default the
reader can override (`localStorage['esRepoRoot']`). That works but is undiscoverable: a teammate who
opens a committed board on a different machine gets 100% dead `vscode://` links with **zero signal** that
the links are foreign or that an override exists, and the `●` "you've set it" state only appears once
they already know to look. The shipped bundled example was worse — it baked a stable placeholder root
(`/event-storming-recovery`) that is dead for *everyone*, so the first explorer most people see (the
"30-second demo") had 100% dead links with no explanation (issue #74). The **live** `view` path is
unaffected: it resolves the root against the reader's cwd at serve time and does not use this client.

## Decision

Two coordinated changes, both confined to the static committed artifact:

1. **Neutral baked default.** `generate --shareable` (used by `scripts/build-example.mjs`) bakes the
   **empty string** as `REPO_ROOT_DEFAULT` — a neutral "generated elsewhere" sentinel — instead of an
   absolute path. The client reads the empty default as "no reader root set yet." `flows.dot` still
   bakes the resolved `--repo-root` (it has no runtime to self-heal and is machine-local by nature, per
   ADR-0006), so `--shareable` affects the HTML only. Without the flag, the HTML keeps baking the
   resolved root (today's behavior), so solo/local use is unchanged.

2. **Self-heal on first open.** The client (`src/web/static-explorer/explorer-client.ts`) shows a
   one-time, dismissible banner when no reader root is set, and intercepts the **first** click on any
   source link (capture phase) to open the existing #27 `promptRepoRoot` instead of firing a dead deep
   link. Setting a root flips every rendered link via the existing `refreshAnchors`/`data-anchor`
   machinery and dismisses the banner; the dismissal persists (`localStorage['esRepoRootBannerDismissed']`),
   so once resolved the board stays quiet.

## Consequences

- One committed board works for every teammate with no prior knowledge of the override: they are told
  the links are foreign and are walked into setting their path on the first click.
- The bundled example no longer ships a misleading dead absolute path; it ships the honest sentinel and
  self-heals like any shared board.
- The generator stays a pure string builder; all self-heal logic lives in the client, reusing the #27
  override rather than reinventing it. The golden fixture (`tests/generate-views-golden.test.mjs`) was
  re-baselined because the emitted client bytes changed (new banner/self-heal code + CSS); `flows.dot`
  output is byte-unchanged. Behaviour is guarded by a new static-explorer E2E scenario.
- The live SPA and the `view` server are untouched.
