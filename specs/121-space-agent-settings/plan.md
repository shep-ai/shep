## Approach

TDD throughout: every task starts with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: the settings → environment mapping is a pure domain function; the use
cases depend only on the space ports and ResolveSpaceContextUseCase; infrastructure applies the
environment at the worker and the interactive bootstrapper; CLI and web call the use cases.

## Risks

- The worker mutates its own `process.env`. Safe because a worker serves exactly one run, and
  the change happens before any executor or subprocess exists.
- Claude transcripts for a space with its own config directory live under that directory;
  session lookups read `CLAUDE_CONFIG_DIR`, which the worker has set.
