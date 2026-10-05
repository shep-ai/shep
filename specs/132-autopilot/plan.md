## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: the pass composes existing use cases (investigate, approve hypothesis,
board, build) through injection; selection rules are pure domain code.

## Risks

- Starting work nobody wanted: every part is off by default, fixes need High confidence and
  a budget, and merging stays with people unless allowed.
