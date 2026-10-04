## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: proposal validation is pure domain code; the run use case gathers
evidence through repository ports, calls the agent through the IStructuredAgentCaller port and
writes through the opportunity use cases; CLI, web and the daemon reach it through the
container.

## Risks

- Cost: discovery is off until a space schedules it; one run per space at a time; at most five
  proposals per run.
