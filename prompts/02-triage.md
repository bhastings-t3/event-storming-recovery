# Triage step (Phase 2)

Between the inventory and the trace fleet, put the flow-candidate list in front of the human.
This is the one point where a person's knowledge of the system changes the plan cheaply.

Present:
- the **Tier-1 list** — flows proposed for individual deep tracing (the ones with real business
  behavior), each a one-liner;
- the **Tier-2 patterns** — repetitive families (admin CRUD, file attach, observability reads)
  where you'll trace one exemplar and list the rest as instances;
- the **excluded-with-reason** list (scaffolding, dead-obvious stubs, unused deps);
- the **candidate hotspots** already visible from the inventory.

Ask for exactly the decisions you can't infer:
1. **Coverage depth** — full-inventory/tiered (default), core-domain-only, or exhaustive.
2. **Promotions/demotions** — anything the human wants pulled up to Tier 1 or dropped.
3. **Canonical format & delivery** — where the artifact lives, how source links should open.

Then **run one pilot trace and check it** before committing to the full fleet — cheaper to fix
the schema/briefing once than across 25 traces.
