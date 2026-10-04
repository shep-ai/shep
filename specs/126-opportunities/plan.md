## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: evidence, scoring and the line are pure domain functions; use cases depend
on repository ports and the existing work item use case; SQLite repositories implement the
ports; CLI and web call use cases through the container.

## Risks

- Scores that look precise but rest on guesses: every input is shown next to the score, and
  confidence is explicit.
- Revenue entered by hand drifts: it is per signal, so a newer signal replaces an older one's
  weight for the same customer (largest amount per customer).
