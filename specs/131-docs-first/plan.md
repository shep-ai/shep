## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: path matching and instructions are pure domain code; the gate is a use
case over the space context; the merge node receives it as a dependency.

## Risks

- Blocking merges by mistake: the gate never fails a run, it only asks a person.
