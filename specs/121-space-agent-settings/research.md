## Findings

- `buildSpawnOptions` (process-stream.ts) copies `process.env` at spawn time; Gemini, Codex
  and Kimi executors add their own token variables on top of the same copy.
- The feature worker is forked with `{ ...process.env, ... }` and receives `--repo`; its
  executors run with `cwd` set to the worktree, which lives under the Shep home and so cannot
  be used for space resolution.
- `ClaudeCodeInteractiveExecutor` passes `env` to the SDK per session; `AcpAgentProcess`
  spawns per session through `buildSpawnOptions`.
- `ClaudeCodeSessionRepository` and the session file collector assume `~/.claude`.
