## Findings

- Work items have no repository; the project's application may carry one, and repositories
  are listed by ListRepositoriesUseCase, so the web offers a picker.
- Claude Code accepts `--tools` to restrict built-in tools; other CLI agents accept no
  equivalent, so the detached worktree is the containment for them.
- The agent-run liveness reconciler kills stale run pids, so investigations do not create
  AgentRun rows owned by the server process; they keep their own status and timestamps.
