# Working an issue

How a change gets from an issue to the default branch. Read `review.md` first:
it defines what "done" means. This file is only the mechanics.

## Before you start

Read, in this order:

1. `AGENTS.md` for the invariants and how to run the environment
2. `docs/explanation/architecture.md` for the ports-and-adapters layering and
   why the model is canonical
3. `docs/process/review.md` for the three review lenses
4. The issue itself, including its parent epic

If the issue conflicts with something you find in the code, say so on the issue
rather than quietly picking one. **A stale issue is a normal thing to find**, and
checking the premise is part of the job.

## Branch and commits

```
<area>/<issue-number>-<short-slug>
```

for example `explorer/11-filter-papercuts` or `fs/9-atomic-sidecar-write`.

Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`,
`docs:`, `chore:`, `test:`) and say **why**, not what. The diff already says what.

## Verify before you open the PR

Do not open a PR you have not run.

```bash
npm run dev          # API on :5178, explorer on :5179; Ctrl-C to stop
```

Then exercise the change the way the real user would, and confirm the mechanical
gates pass locally:

```bash
npm run typecheck
npm test             # pretest builds dist/node first
npm run build
npm run demo         # example self-model regenerates cleanly
```

`npm run dev` is per-process and stops on Ctrl-C, so there is nothing global to
tear down; just stop it before your worktree is removed.

## The pull request

Title: what changed, in plain language, Conventional-Commits style. Reference the
issue with `Closes #N`.

The body is the three lenses, filled in honestly. See
`.github/pull_request_template.md`. An empty section means the lens was skipped;
write "not applicable, docs only" rather than leaving it blank.

## You do not merge. Ever.

If you are an agent working an issue, these are prohibited, without exception:

- `gh pr merge` in any form
- `git push` to the default branch, including `git push origin HEAD:main`
- `git merge` while standing on the default branch
- merging through `gh api`

Push your branch, open the PR, report back, and stop. The orchestrator reviews
and merges. This holds even when your checks are green, even when the change is
trivial, and even when you are confident.

## Merge discipline

CI runs **1 required check: `test`** (`.github/workflows/ci.yml`, which runs the
tests and the example smoke build). A separate `provenance` workflow runs on
pushes to `main` only and is not a PR check.

**GitHub itself does not enforce the check.** Branch protection needs a paid plan
on a private repo, and this repo is private. Three things stand in for it, and
each is worth exactly what it covers:

1. **`node scripts/merge-pr.mjs <n>`**, the only sanctioned way to land a PR. It
   refuses unless every required check is green, and always squash merges.
   *Not covered:* anyone who does not use the command. It is a tool, not a gate.
2. **`scripts/guard-merge.mjs`**, a PreToolUse hook wired up in
   `.claude/settings.json`. It denies the commands above before they run.
   *Not covered:* sessions that did not load it. A net, not a guarantee.
3. **`scripts/check-main-provenance.mjs`**, run on every push to the default
   branch. It asks the API whether each new commit belongs to a merged pull
   request and fails loudly when one does not.
   *Not covered:* prevention. It notices afterwards, which is why it cannot be
   bypassed.

Landing a PR:

```bash
node scripts/merge-pr.mjs 42
```

**Squash, always.** One issue becomes one commit, so the log stays a readable
list of changes and reverting means reverting one commit.

If a commit ever reaches the default branch outside this path, treat it as a
**defect in the guard** rather than a mistake by whoever did it: work out what
the guard missed, add the case, and say so.

## When the process is the problem

If the same manual check is done on every issue, that check belongs in CI, not
in a reviewer's head. If a rule keeps getting broken by accident, it probably
needs a linter rule rather than another paragraph in `AGENTS.md`.

Open an issue and say what you observed. Improving the process is in scope.
