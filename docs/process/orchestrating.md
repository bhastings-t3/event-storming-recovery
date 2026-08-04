# Orchestrating this repo

How work runs here. You (the orchestrator) brief, review and merge; you do not
write features. Agents work issues in isolated worktrees, push, open a PR, and
stop. This file is the repo-specific version of the general loop; read it with
`review.md` (what "done" means) and `working-an-issue.md` (the mechanics).

## The five constraints, as they apply here

1. **Do not review your own work.** Briefing, reviewing and merging are yours;
   features are not. The exceptions are discovery artifacts and process docs
   (this file, `AGENTS.md`, the enforcement scripts were all orchestrator-authored).
2. **Agents do not land code.** They push and open a PR. You land it through
   `node scripts/merge-pr.mjs <n>`, which refuses unless the `test` check is green.
3. **Verify the central claim yourself.** A green suite over an app that does not
   load is a common outcome here (tests run against `dist/node`, not `src`). Drive
   the running thing: `npm run dev` for the explorer, the real CLI/MCP subcommand
   otherwise.
4. **Prevention plus detection.** The guard hook (`guard-merge.mjs`) prevents;
   the `provenance` workflow detects on the result. See ADR 0001.
5. **Decisions live in the repo.** ADRs in `docs/architecture/decisions/`, process
   in `docs/process/`, invariants in `AGENTS.md`. Correct an instruction where the
   next agent will meet it, not just in chat.

## The loop

1. Pick work that unblocks the most; finish a journey before starting another.
2. Batch by collision surface, not theme. Issues touching the same file or the
   same registry go together; unrelated surfaces go apart.
3. Write the brief (see the skill's `references/briefing.md`). Every issue carries
   a **"watch out for"** section: it is the part that pays.
4. Dispatch `general-purpose` agents with `isolation: "worktree"`, several in one
   message. Read-only hunting/audit passes get no worktree.
5. While they run, touch nothing they touch. Reviewing, filing and mining the
   record are safe; editing is not.
6. Review through the three lenses. Post only what you independently verified.
7. Merge via the wrapper, or send it back.
8. File what surfaced and could not be fixed there.

**Default: three agents per wave.** The real variable is collision surface, not
count. Two agents in one module is a rebase you chose.

## This repo's specifics

- **Private repo, no org.** Branch protection is unavailable, which is the entire
  reason the enforcement layer exists. If this repo moves into an org or onto a
  protected-branch plan, protect the branch and delete most of the layer (ADR 0001
  revisit trigger).
- **One CI check: `test`.** That is the name `merge-pr.mjs` matches. If a merge is
  refused with "test: never ran", confirm the real name against a live PR run
  (`gh pr view <n> --json statusCheckRollup --jq '.statusCheckRollup[].name'`) and
  fix `REQUIRED` in `merge-pr.mjs` in its own PR.
- **The model is the single source of truth.** `flows.json`, validated by
  `src/domain/model/invariants.ts`. Generated artifacts (`explorer.html`,
  `flows.dot`) must never become a second source. Guard this in Lens 3.
- **The domain/application -> adapters boundary is convention only.** No lint rule
  enforces it yet. If it gets violated twice, that is the signal to add a boundary
  check (a linter or a build-output scan), not another paragraph in `AGENTS.md`.
- **Hand out ADR numbers explicitly**, checked against `main` and every open PR.
  There is no collision CI check; if ADR-number collisions bite twice, add one.

## Escalation

- **Decide yourself:** sequencing, batching, which of two reasonable
  implementations, whether a follow-up is worth an issue.
- **Ask the owner (Blake):** anything about what the tool promises or should do
  that you cannot derive from the code. For example, whether a field in the model
  is genuinely retired, or what a downstream consumer (a Claude terminal via MCP)
  must keep receiving. Give a recommendation and say what it costs.
- **Refuse to start work whose inputs are missing.** Starting produces work built
  on an invisible guess.

## Gotchas the orchestrator will hit

- **The guard reads literal command text.** `guard-merge.mjs` denies any Bash
  command whose text *contains* `gh pr merge`, a `.../merge` API path, or a push
  to `main`, even when those appear only as data (a test harness, an echo, a grep
  pattern). This is deliberate (matching on data would be a gap), but it means:
  drive anything that must mention those strings from a file run with `node <file>`,
  not from an inline Bash command. This was hit while testing the guard itself.
- **Tests build first.** `pretest` compiles `dist/node`; a hand-run
  `node dist/...` does not. Stale `dist` is a common source of "it passed for me".

## Improving the loop

The loop is supposed to change. Change it when you have seen the same thing
**twice** (once is an incident). Route the fix to the cheapest layer that holds:
a repeated manual review check becomes CI; a rule broken by accident becomes a
linter or a hook; an agent rebuilding a settled decision becomes reading order in
the brief. Delete as readily as you add: a gotcha comes out when its cause is
fixed, and a gate that has never caught anything gets deleted. Say what changed
and why, or the next orchestrator cannot tell a fix from a preference.
