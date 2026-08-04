# How to regenerate the explorer and DOT graph

*How-to guide. Part of the [documentation set](../README.md).*

Use this whenever the underlying traces have changed and the generated views (`explorer.html`,
`flows.dot`) need to catch up. It's the last step of both
[a fresh recovery run](run-recovery-on-your-codebase.md) and
[an update to an existing model](iterate-and-extend-a-model.md).

## If you changed any trace files

Re-merge before you regenerate, so the views reflect the merged, validated model rather than stale
per-flow slices:

```sh
npx event-storming-recovery merge <tracesDir> <out>/model/flows.json
```

If this reports errors, stop and fix the trace it names; a model with unresolved errors still gets
written to disk by this CLI (unlike the `event-storming-recovery view --traces` in-memory path,
which refuses to serve an invalid model), so check the exit code or the printed error count, don't
assume no output means success.

## If only flows.json changed (or you just re-merged)

```sh
npx event-storming-recovery generate <out>/model/flows.json <out>/model \
  --repo-root /abs/path/to/your/checkout --title "<Project> Event Storming"
```

- `--repo-root` controls where the explorer's `vscode://` source links point. It is always
  resolved to an absolute path, so the documented `--repo-root .` bakes *this machine's* absolute
  checkout path into the committed `explorer.html` and `flows.dot` (not a dead relative `./` link).
  Pass an explicit absolute path only if you generate from somewhere other than the repo root.
- The committed `explorer.html` treats that baked path as a **default**: anyone opening the board on
  another machine can click **Source root** in the tab bar and set their own local checkout path
  once (persisted in their browser), and every source link re-derives to open their files. `flows.dot`
  has no runtime, so its links stay machine-local by nature.
- Drop `--title` to fall back to the model's own `meta.title`, if it has one.

See the [CLI reference](../reference/cli.md) for the full option list (`generate`).

## Verify the render

A model that validates structurally can still render wrong. Open the new `explorer.html` and check:

- the flow list shows the flow(s) you changed
- the flow renders as a sticky lane, and clicking a sticky opens its tactical panel with source
  anchors that resolve
- any hotspot on the flow shows as a red card
- if you ran the glossary-mining phase, the **Glossary** tab lists the current terms, with flagged
  ones marked
- if you ran the data-mapping phase, the **Data model** tab shows the datastore tree and the
  read-model/aggregate detail panels list their returned fields

If something looks wrong here but the merge reported no errors, the bug is in
`src/application/commands/generate-views.ts` or the data itself, not in something you can fix by
re-running the same command.
