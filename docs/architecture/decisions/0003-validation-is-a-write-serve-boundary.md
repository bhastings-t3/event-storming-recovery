# 3. Model validation is a hard boundary on every write and serve path

Date: 2026-08-04

## Status

Accepted

## Context

The model validator (`src/domain/model/invariants.ts`, exposed via the merge
result and the `Model.validate()` aggregate method) is the model's single schema.
But several paths sidestepped it (issue #8): `es-merge` wrote `flows.json` to disk
*before* checking validation errors, so a failed validation still left an invalid
artifact behind; `es-generate` rendered any `flows.json` with no validation and no
try/catch; and `resolve-model`'s non-`--traces` tiers (`--model`, discovered,
bundled example) ran only a shape check (nodes/flows arrays present), so an invalid
model could be served. Only the `--traces` tier ran the full invariants, and it
*threw* on error, so the write and serve paths disagreed with each other.

## Decision

Route every model write and serve path through the one existing validator, never a
second implementation:

- **`es-merge`** validates before writing: on errors it prints the report and exits
  non-zero *without* writing, so an invalid `flows.json` is never persisted.
- **`es-generate`** runs `Model.validate()` before rendering and wraps the render in
  a guard, so a broken model fails with a useful message instead of a corrupt
  explorer or a mid-render crash.
- **`resolve-model`** runs `Model.validate()` on the `--model`, discovered, and
  bundled tiers. The fail-vs-warn policy is uniform across all tiers, including
  `--traces`: **errors fail** (serving a model whose steps/edges reference
  nonexistent nodes surfaces broken references in the explorer and MCP), and
  **warnings are surfaced but never fatal** (a working model with, say, an orphan
  node keeps loading exactly as before).

## Consequences

- The `--model`, discovered, and bundled serve tiers now **refuse an invalid model**
  where they previously served it silently. This is a deliberate behavior change:
  the failure is loud and points at the specific invariant, and only hard errors
  (not warnings) trigger it, so a model that merely draws warnings is unaffected.
- Validation logic stays in `src/domain/model/*`; the CLI and resolver only *call*
  it, so the validator's error/warning strings and their order remain byte-identical
  and the string-assertion tests stay green. Atomic writes are out of scope (issue
  #9): this ADR only guarantees an invalid artifact is not written at all.
