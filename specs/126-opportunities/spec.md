## Problem Statement

- Shep has no notion of why something should be built: work items arrive as tasks, with no
  evidence, value or customer attached.
- Nothing compares the value of a piece of work with what it costs the reviewers who must read
  and merge it, so a busy team cannot see which bets fit the week.
- The upcoming feedback, discovery and incident loops have nowhere to put what they find.

## Product Shape

- **Signal** (space, optional product line): kind (Feedback, Incident, Tracker, Discovery,
  Manual), title, detail, customer, monthly revenue at stake, urgent, link, and the opportunity
  it supports, if any.
- **Opportunity** (space, optional product line): title, problem, status (Proposed, Accepted,
  Building, Shipped, Dropped), estimate in review hours, confidence (0–1), strategic flag, the
  work item it became, the drop reason.
- **Weights** per space: reach (per customer), revenue (per 1,000 a month at stake), urgency
  (per urgent signal), strategic (once, for strategic bets), and weekly review capacity in
  hours. Defaults apply until a space sets its own.
- **Evidence**: an opportunity's signals give its customers (distinct named customers; a signal
  without a customer counts as one), revenue at stake (the largest amount per customer, summed)
  and urgent signals.
- **Score**: value = reach × customers + revenue × revenue ÷ 1,000 + urgency × urgent +
  strategic × strategic; score = value × confidence ÷ review hours (value per review hour).
- **The line**: building opportunities consume capacity first; accepted ones join by score
  while their hours fit; the rest wait.
- **Build**: an accepted or proposed opportunity becomes a work item in a chosen project, its
  description carrying the problem and evidence; the opportunity moves to Building.

## User Flows

**F1. Capture evidence.** `shep signal add "Guest checkout times out" --space acme --customer
Globex --revenue 4000 --urgent` records a signal; the web Opportunities page has the same form.

**F2. Shape a bet.** `shep opportunity add "Faster guest checkout" --hours 6 --confidence 0.7`,
then `shep opportunity link <signal> <opportunity>`. The opportunity shows its evidence and
score.

**F3. Decide.** `shep opportunity ls` ranks by value per review hour and marks the line;
`accept`, `drop --reason` or `build --project pay` act on one. The web page shows the capacity
bar, the ranked list, unlinked signals and the weights.

## Success Criteria

- [ ] Scores follow the formula with the space's weights, and the ranking and line follow
      score and capacity; tested in pure domain code.
- [ ] Signals and opportunities stay inside their space; a signal links only to an opportunity
      of its own space.
- [ ] Building creates exactly one work item carrying the problem and evidence and records it;
      dropped and shipped opportunities cannot be built.
- [ ] CLI and web expose capture, linking, ranking, decisions and weights; strings in 9
      locales; stories for every new component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Medium | Signal, Opportunity, OpportunityWeights and their enums |
| Persistence | Medium | Migration 159: signals, opportunities, opportunity_weights |
| Domain | Medium | Evidence, scoring and the capacity line, pure |
| Application | High | Record signals, manage opportunities, board, build, weights |
| CLI and Web | Medium | `shep signal`, `shep opportunity`, /opportunities page |

## Dependencies

- Spec 120 (spaces, product lines); work items and projects (existing PM model).

## Out of Scope

- Automatic signal sources (specs 127, 128, 129) and outcomes after shipping (spec 130).
- Revenue integrations (Stripe and similar): revenue is entered on the signal for now.
- Filling the line automatically (spec 132).

## Size Estimate

**L**: 11 tasks.
