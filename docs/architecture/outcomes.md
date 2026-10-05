# Outcomes

Spec: [`specs/130-outcomes`](../../specs/130-outcomes/). User guide:
[`docs/guides/opportunities.md`](../guides/opportunities.md#after-it-ships).

## Model

`tsp/domain/entities/outcome.tsp` adds `OpportunityOutcome` (opportunity, space, shipped at,
review at, `OutcomeVerdict` `Pending` / `Solved` / `Persisting`, similar signals before and after,
judged at, actual review hours). `Opportunity` gains `shippedAt`; `Signal` gains `toldAt`.
Migration `163-create-outcomes` creates `opportunity_outcomes` (one row per opportunity) and
adds the two columns through `addColumn` (`persistence/sqlite/add-column.ts`, shared with
migrations 160 and 161 — it lives outside `migrations/` because every file there is loaded as a
migration).

## Rules (`domain/shared/outcomes.ts`)

- `outcomeReviewAt`: ship time plus `OUTCOME_WINDOW_DAYS` (14).
- `similarSignals`: linked to the opportunity, or `termSimilarity` (`text-terms.ts`, shared with
  feedback themes) of at least `THEME_SIMILARITY` with the opportunity's title and problem or with
  one of its linked signals.
- `assessOutcome`: similar signals in the window before and the window after shipping;
  `judgeOutcome` is Solved when after ≤ half of before.
- `customersToTell`: distinct customers on signals with no `toldAt`, with their links.
- `calibrate`: judged and solved counts, and actual over estimated hours across outcomes with
  hours recorded.

## Use cases (`application/use-cases/outcomes/`)

| Use case | Does |
| -------- | ---- |
| `TrackOutcomesUseCase.run(now)` | For each Building opportunity, reads its work item's state group: Completed → `shipOpportunity` (Shipped + a Pending outcome); Cancelled → Accepted, unlinked. Then judges every Pending outcome whose `reviewAt` has passed |
| `ManageOutcomesUseCase` | `list(space)` with customers and calibration, `show`, `ship` by hand (Proposed, Accepted or Building), `tell` (stamps `toldAt`), `recordHours` |

`shipOpportunity` (`ship-opportunity.ts`) is the one place an opportunity becomes Shipped.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| Daemon | `createOutcomeWatcher` (`infrastructure/services/scheduling/outcome-watcher.ts`), hourly, started by `startBackgroundSync` |
| CLI | `shep outcome ls|check|ship|tell|hours` |
| Web | Outcomes panel and Mark shipped on `/opportunities` |
| DI | `infrastructure/di/modules/register-outcomes.ts` |
