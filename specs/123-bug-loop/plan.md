## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: ranking and normalising hypotheses and building prompts are pure code; the
use cases depend on the investigation repository, workspace, structured agent caller, settings
provider, space environment and feature creation; the detached-worktree workspace is
infrastructure behind a port; CLI and web call use cases through the container.

## Risks

- An agent ignores the read-only instruction: it can only change the throwaway worktree.
- A server restart mid-investigation: the record reads as Failed once past the timeout, and
  the orphan worktree is pruned by the next workspace preparation.
