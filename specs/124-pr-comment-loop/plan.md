## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: trigger rules, the reply marker and reply text are pure domain code; use
cases depend on comment and round repositories, the PR comment client port, the structured
agent caller and the space environment; the gh client is infrastructure behind its port; the
daemon only calls a use case.

## Risks

- A reviewer comment the agent misreads: replies say what changed and the commit, and Off or
  Mention keep the human in charge.
- GitHub rate limits: two-minute polling, only features in Review with an open PR.
