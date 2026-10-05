# Autopilot and factory status

Shep's loops — the [bug loop](./bug-loop.md), [opportunities](./opportunities.md),
[incidents](./incidents.md) and [outcomes](./opportunities.md#after-it-ships) — each wait for
someone to start them. **Autopilot** lets a space start the safe ones on its own, every hour, and
**factory status** shows what is moving and what waits on people.

## Factory status

```bash
shep factory status --space acme
```

Or open **Factory** in the sidebar. For one space:

| Line | Meaning |
| ---- | ------- |
| Line | Review hours used of the week's capacity, bets in the line and waiting |
| Building | Opportunities being built |
| Features in flight | Features of the space's repositories still on their way to merge |
| Waiting for approval | Those of them stopped at a gate for a person (a fix waiting to merge, a plan to review) |
| Open incidents | Incidents not resolved |
| Actions awaiting approval | Restarts, rollbacks and scales triage proposed |
| Outcomes pending | Shipped opportunities not judged yet |
| Customers to tell | Customers behind shipped opportunities not told yet |
| Autopilot | On or off, and the last pass |

Each card on the page opens the page behind it.

## Autopilot

Everything is off until you turn it on:

```bash
shep autopilot set --space acme --investigate --fix --budget 3
shep autopilot set --space acme --fill-line --project pay
shep autopilot show --space acme          # the policy and recent passes
shep autopilot run --space acme           # a pass now instead of on the hour
```

Or use the **Autopilot** form on the Factory page. A pass does, for the parts that are on:

1. **Investigate** — open work items with **Urgent** priority, in projects whose application
   repository belongs to the space, that have no investigation yet get one (at most two per
   pass; each can take many minutes). Work items carry no type, so priority is what marks them.
2. **Fix** — when a work item's latest completed investigation ranks its most likely hypothesis
   **High**, and no fix was started, autopilot starts the fix as a fast feature, at most
   `--budget` fixes in 24 hours (3 by default, 0 to 20). The requirements and plan gates are
   approved; the merge gate stops for a person unless `--merge-fixes` is on. CI and
   [docs first](./spaces.md#docs-first) still hold a fix that should not merge.
3. **Fill the line** — accepted opportunities inside the week's line that are not building yet
   are built into the project (`--project`, an id or slug), as **Build** on the Opportunities
   page does.

Every pass is recorded with what it investigated, fixed and built, and what failed; one failure
does not stop the rest. `--no-investigate`, `--no-fix`, `--no-merge-fixes` and `--no-fill-line`
turn parts off; `--clear-project` stops filling the line.

## Try it without an agent account

Set the agent type to `dev` (`shep settings agent --agent dev`): investigations, discovery and
incident triage then get fixture answers built from what they are asked, so every loop above
runs end to end locally. `.github/pr-assets/factory/demo/` replays the whole tour against an
isolated `SHEP_HOME` with a stub `kubectl`.

## Good to know

- The daemon (`shep start`, or `shep ui`) runs autopilot once an hour.
- Autopilot never runs incident actions; [incidents](./incidents.md) have their own
  `--auto-actions` setting.
