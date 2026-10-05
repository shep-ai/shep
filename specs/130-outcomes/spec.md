## Problem Statement

- Nothing ever marks an opportunity Shipped: the board keeps building work forever.
- Nobody learns whether a shipped bet worked: the same complaints can keep arriving.
- Customers who asked are never told, and review-hour estimates are never checked.

## Product Shape

- **Ship tracking**: a Building opportunity follows its work item. Completed → Shipped with a
  ship time; Cancelled → Accepted again, unlinked from the work item. An opportunity built
  outside a work item can be marked shipped by hand.
- **Outcome** (per shipped opportunity): ship time, review time (ship time plus a 14-day
  window), signals in the window before shipping that read like it, signals after,
  verdict Pending → Solved or Persisting, the review hours it really took, when it was checked.
- **Similar signal**: a signal of the space whose words overlap the opportunity's evidence
  (title, problem and its linked signals) as much as feedback themes require.
- **Customers to tell**: the distinct customers on the opportunity's linked signals not yet
  told, with the signal links, and a short note naming what shipped. Marking them told stamps
  those signals.
- **Calibration** (space): over judged outcomes, actual against estimated review hours where
  actual hours were recorded, and the share Solved.

## User Flows

**F1. Ship.** A work item built from "Faster guest checkout" moves to Done. Within the hour
the daemon marks the opportunity Shipped; the Opportunities page lists it under Outcomes as
Pending with Globex and Initech to tell.

**F2. Tell.** `shep outcome tell <opportunity>` prints the note and the customers' links;
`--done` marks them told.

**F3. Judge.** Fourteen days later the outcome turns Solved: two similar reports after, against
six before. The board's calibration reads "actual hours 1.4× estimates, 3 of 4 solved".

## Success Criteria

- [ ] A Completed work item ships its opportunity exactly once; a Cancelled one returns it to
      Accepted; other opportunities are untouched.
- [ ] Outcomes are judged only after their window, with before and after counted over equal
      windows from the space's own signals.
- [ ] Telling customers stamps only the opportunity's untold signals that name a customer.
- [ ] Calibration ignores outcomes without actual hours for the hours ratio.
- [ ] CLI and web cover outcomes, telling, hours and calibration; the daemon checks hourly;
      strings in 9 locales; stories for every new component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Low | OpportunityOutcome, OutcomeVerdict; Opportunity.shippedAt; Signal.toldAt |
| Persistence | Low | Migration 163 |
| Application | Medium | Track ships and judge outcomes; tell customers; record hours |
| Presentation | Medium | `shep outcome`, Outcomes panel on /opportunities, daemon tick |

## Dependencies

- Specs 126 (opportunities, work items), 127 (themes' similarity).

## Out of Scope

- Sending the note to customers through a support tool; shep prepares it and records that it
  went out.
- Product analytics (usage after ship): outcome evidence is the signals shep already has.

## Size Estimate

**M**: 10 tasks.
