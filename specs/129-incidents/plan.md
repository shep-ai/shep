## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: policy checks, hypothesis ranking and the postmortem are pure domain code;
use cases depend on repository ports, the runtime controller port and the structured agent
caller; the kubectl adapter is infrastructure; CLI, web and the alert route call use cases.

## Risks

- Acting on production: nothing runs unless the space allows its kind or a person approves;
  every command and its output is recorded; actions only touch the incident's own workload.
