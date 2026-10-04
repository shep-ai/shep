## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: the mappings and the per-field planner are pure domain code; use cases
depend on repository ports and the ITrackerClientFactory port; the Linear and Jira clients and
the ADF converter are infrastructure behind that port; the daemon watcher only calls a use case;
CLI and web call use cases through the container.

## Risks

- Tracker APIs change: each client is small, faked from recorded fixtures, and isolated behind
  the port.
- A sync writing many work items: the PM SSE stream already pushes deltas to the UI.
