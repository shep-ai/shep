## Problem Statement

- Urgent bugs wait until someone runs an investigation, and a confident hypothesis waits until
  someone approves it.
- The capacity line says what to build this week, but nothing builds it.
- No single place shows what the factory is doing and what waits on people.

## Product Shape

- **Autopilot policy** (space, off by default): investigate urgent work items; fix confident
  hypotheses (with a daily fix budget, and whether fixes may merge on their own); fill the
  line into a project.
- **Urgent work item**: a work item of a project whose application repository belongs to the
  space, with Urgent priority, not in a Completed or Cancelled state. (Work items carry no type,
  so priority is the signal.)
- **Confident fix**: the latest completed investigation's hypothesis 1 has High confidence and
  no fix was started. Fixes run as fast features with the requirements and plan gates approved;
  merge waits for a person unless the policy allows it. Docs first and the CI gate still apply.
- **Fill the line**: accepted opportunities inside the week's line that are not building are
  built into the policy's project.
- **Autopilot pass**: what one pass investigated, fixed and built, and what failed.
- **Factory status** (space): line usage and waiting bets, building opportunities, open
  incidents, runtime actions awaiting approval, pending outcomes, customers to tell, the
  policy and the last pass.

## User Flows

**F1. Turn it on.** `shep autopilot set --space acme --investigate --fix --fill-line --project pay`.

**F2. Night.** PAY-42 is filed as Urgent at 02:10. At 03:00 shep investigates it; the top
hypothesis is High, so the fix feature starts and opens a PR that waits for merge approval.

**F3. Morning.** `shep factory status` (or `/factory`) shows the fix waiting to merge, two
opportunities building, one incident open and Globex to tell.

## Success Criteria

- [ ] Nothing happens in a space without autopilot; each part runs only when enabled.
- [ ] An urgent work item is investigated once; a fix starts only for a High-confidence top
      hypothesis with no fix yet, within the daily budget.
- [ ] Fixes never merge on their own unless the policy allows it.
- [ ] Only accepted opportunities inside the line are built, each once.
- [ ] Every pass is recorded with its actions and errors; one failure does not stop the rest.
- [ ] CLI and web cover the policy, a pass now, and factory status; strings in 9 locales; stories.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Low | AutopilotPolicy, AutopilotRun |
| Persistence | Low | Migration 164 |
| Application | High | Autopilot pass, policy, factory status; fix gates through approve-hypothesis |
| Presentation | Medium | `shep autopilot`, `shep factory status`, /factory page, daemon watcher |

## Dependencies

- Specs 123 (investigations and fixes), 126 (line and build), 129 (incidents), 130 (outcomes).

## Out of Scope

- Approving PR merges beyond the policy flag; the supervisor (fleet) stays as it is.
- Running incident triage automatically (spec 129's policy already covers runtime actions).

## Size Estimate

**L**: 12 tasks.
