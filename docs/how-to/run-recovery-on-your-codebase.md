# How to recover an Event Storming model from your own codebase

*How-to guide. Part of the [documentation set](../README.md).*

This gets you a validated `flows.json` and an interactive explorer for a codebase you point it at.
It assumes you've already been through the [Getting Started tutorial](../tutorials/getting-started.md)
and know the shape of the output. For the reasoning behind each phase, see
[the method](../explanation/METHOD.md); for the exact data contract every trace conforms to, see
[the flows.json reference](../reference/flows-schema.md).

## Start the recovery

If you have the plugin installed, tell Claude:

> use the event-storming-recovery skill on this repo

The skill drives all six phases below. If you're driving it by hand, or with any other agent, start
from `prompts/00-orchestrator.md` instead and fill in its placeholders (`{REPO_ROOT}`, `{EXCLUDE}`,
`{SCRATCH}`, `{OUT}`).

## The six phases, as a checklist

1. **Inventory.** Five scouts (`prompts/01-scouts.md`) run concurrently over UI entry points,
   automations, API/auth/protocol, external integrations, and the data layer. They return a
   flow-candidate list and a shared-id glossary. You don't drive this step; just wait for it to
   land before triage.
2. **Triage.** You're the human checkpoint here. Decide, with the candidate list in front of you:
   - If you want full coverage at reasonable cost, agree **tiered depth**: trace every core domain
     flow individually, collapse repetitive CRUD screens into one traced exemplar plus a listed
     instance set.
   - If you only care about the core domain, say **core only** and skip generic admin/CRUD
     entirely.
   - If you need every entry point traced individually regardless of cost, say **exhaustive**.
   Also flag anything in the candidate list that's actually one flow duplicated, or that's dead.
3. **Deep-trace.** Confirm the pilot trace's "schema friction" section looks sane before the rest
   run, since every subsequent trace inherits whatever gaps that pilot surfaces. If a trace comes
   back naming something `dead`, check it names a concrete removal commit or an exhaustive search;
   a trigger it merely couldn't find should be a hotspot, not a `dead` verdict.
4. **Merge.** Run the merge once the trace waves land:
   ```sh
   node tools/merge-flows.js <tracesDir> <out>/model/flows.json
   ```
   (see the [CLI reference](../reference/cli.md) for `es-merge`). If it reports errors, fix the
   offending trace and re-run; don't hand-edit the output. If two traces modeled the same concept
   under different ids, that's ubiquitous-language drift: pick one id and fix both traces, unless
   they're genuinely different altitudes of the same action (see METHOD.md's note on altitude
   variations), in which case leave them distinct.
5. **Ubiquitous language mining (optional but recommended).** Dispatch the glossary-mining wave
   (`prompts/04-glossary-mining.md`) so a newcomer gets the domain vocabulary, not just the
   behavioral stickies. Skip it if you only need the behavioral model quickly.
6. **Data mapping (optional).** If you also want "what does this read model return and where does
   it live", dispatch the data-mapping wave (`prompts/05-data-mapping.md`) before the final merge.
   Skip it if the storage layer isn't interesting for your purpose.
7. **Generate and verify.** See
   [how to regenerate the explorer and DOT graph](regenerate-views.md) for the exact command, then
   actually open the explorer, don't just trust that validation passed.

## If the target system isn't transactional

If a part of the codebase is a dataflow or pipeline (an ETL job, an AI transform chain, a
parsing/ingestion pipeline) rather than command-and-aggregate behavior, don't force the
command/aggregate/event grammar onto it. Model it as its own plane joined at a named seam, and
promote only the domain-significant facts that cross that seam to events; the rest stays as
tactical detail on the surrounding command. See METHOD.md's two-plane rule for the full reasoning.

## When you're done

Commit the traces directory and the generated `<out>/model/` alongside your code, the same way
`examples/event-storming-recovery/` is committed in this repo, so the model stays reviewable and
regenerable. To keep the model current as the code changes, see
[how to extend an existing model](iterate-and-extend-a-model.md).
