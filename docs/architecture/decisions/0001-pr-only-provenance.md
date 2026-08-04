# 1. Everything reaches main through a pull request, enforced procedurally

Date: 2026-08-04

## Status

Accepted

## Context

This repository is private and not in an organization, so GitHub branch
protection is unavailable: nothing at GitHub's end stops a direct push to `main`
or a merge taken with CI red. We run implementation work through unattended
agents, and "the process doc says not to" is not a control.

## Decision

Land code on `main` only through a pull request, and substitute for branch
protection with three layers, weakest first (full rationale in
`references/enforcement.md`, summarised in `docs/process/working-an-issue.md`):

1. **`scripts/merge-pr.mjs`** — the only sanctioned merge path. Refuses unless
   the required `test` check is green; always squash merges. It merges via the
   REST endpoint, not `gh pr merge`, so the guard below cannot block it.
2. **`scripts/guard-merge.mjs`** — a PreToolUse hook wired in
   `.claude/settings.json`. Denies `gh pr merge`, `gh api .../merge`, pushes to
   `main`, and bare `git push`/`git merge` while standing on `main`, before the
   command runs.
3. **`scripts/check-main-provenance.mjs`** — the `provenance` workflow, on every
   push to `main`. Asks the API which merged PR each new commit belongs to and
   fails loudly when none does. Detection, not prevention: it runs on the result,
   so it cannot be bypassed.

The provenance baseline is `8f438d5` (`chore: initial public snapshot`), the last
commit before this control existed. History at or below it is not judged;
everything after came through a PR, starting with the PR that introduced these
scripts.

## Consequences

- Prevention (layers 1–2) can be bypassed by a session that never loaded the
  hook or a human at a terminal; detection (layer 3) is what makes the claim
  auditable rather than a promise.
- A commit that reaches `main` outside this path is treated as a **defect in the
  guard**, not a mistake by whoever pushed: find the gap, add the case to
  `guard-merge.mjs`, and say so. The baseline is **never** moved forward to
  silence a provenance failure.
- **Revisit trigger:** if this repo moves into an org or onto a plan with
  protected branches, protect the branch and delete most of this. The whole
  justification is the absence of the thing that would then exist.
