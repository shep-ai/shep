# Signals and opportunities

Spec: [`specs/126-opportunities`](../../specs/126-opportunities/). User guide:
[`docs/guides/opportunities.md`](../guides/opportunities.md).

## Model

`tsp/domain/entities/opportunity.tsp`, tables in migration `159-create-opportunities`:

| Entity | Purpose |
| ------ | ------- |
| `Signal` | Evidence in a space (optionally a product line): kind, title, customer, monthly revenue, urgent, link, and the opportunity it supports. |
| `Opportunity` | A bet in a space: status (`Proposed`, `Accepted`, `Building`, `Shipped`, `Dropped`), review hours, confidence, strategic, the work item it became, the drop reason. |
| `OpportunityWeights` | A space's weights and weekly review hours; a space without a row uses `DEFAULT_OPPORTUNITY_WEIGHTS`. |

## Domain

`domain/shared/opportunity-score.ts` is pure:

- `evidenceOf(signals)`: distinct named customers (plus one per anonymous signal), the largest
  revenue per customer summed, urgent signals.
- `scoreOpportunity`: value under the weights, and `value × confidence ÷ max(hours, 0.5)`.
- `rankOpportunities`: score, then cheaper review, then older.
- `drawLine(scored, capacity)`: building opportunities first, then accepted ones best-first
  while their hours fit.

`domain/shared/opportunity-brief.ts` renders the work item description a built opportunity
carries (problem, numbers, up to 10 signals).

## Use cases

`application/use-cases/opportunities/`:

| Use case | Does |
| -------- | ---- |
| `ManageSignalsUseCase` | `record`, `list`, `link` (same space only), `remove`. Later loops record their findings here. |
| `ManageOpportunitiesUseCase` | `create`, `estimate`, `accept`, `drop` (needs a reason), `show` with score. |
| `GetOpportunityBoardUseCase` | A space's ranked open opportunities, the line, unlinked signals, recent decisions. |
| `ManageOpportunityWeightsUseCase` | `get` (with defaults) and `set` a space's weights. |
| `BuildOpportunityUseCase` | Creates a work item through `CreateWorkItemUseCase` and moves the opportunity to `Building`. |

`opportunity-scope.ts` resolves a space and product line by id or slug and a space's weights.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep signal …`, `shep opportunity …` |
| Web | `/opportunities` (`components/features/opportunities/`), linked from the sidebar |
| DI | `infrastructure/di/modules/register-opportunities.ts` |
