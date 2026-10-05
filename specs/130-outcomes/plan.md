## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: similarity, verdicts, the customer note and calibration are pure domain
code; use cases depend on repository ports; CLI, web and the daemon call use cases.

## Risks

- A wrong verdict misleads: the page shows the counts behind each verdict and the similar
  signals, so a person can judge.
