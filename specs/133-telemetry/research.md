## Findings

- Daemon watchers follow one shape (`auto-archive-watcher.service.ts`): a class with
  `start()/stop()/isRunning()`, `setInterval`, and module-level `initialize*/get*/reset*`
  functions; `_serve.command.ts` starts and stops them.
- Migrations are discovered by `readdirSync`; the highest is 165. `addColumn()` keeps ALTERs
  idempotent.
- `settings.mapper.ts` (957 lines) and `settings-page-client.tsx` (2309 lines) already exceed the
  file-length rule. New telemetry code goes in separate modules beside them instead of growing
  them; a full split of those files is out of scope and flagged in the PR.
- `IGitHubRepositoryService.getAuthenticatedUser()` already wraps `gh api user --jq .login`.
- `parseGitHubOwnerRepo` lives in a prompt module under infrastructure; it moves to domain.
- Merge is observed in `merge.node.ts`, both paths of `pr-sync-watcher.service.ts`, and
  `github-webhook.service.ts` — hence the once-key.
- Feature runs reach a terminal status in `feature-agent-worker.ts` via `finishRun`.
- CLI and the feature worker have `uncaughtException` handlers; the daemon has none.

## Content Boundary Checklist

| Never sent | How it is prevented |
| ---------- | ------------------- |
| Prompts, code, titles | Typed per-event property map has no string fields for them |
| Paths, repo and branch names | Owners only; route templates replace dynamic params |
| Error messages | errorClass + hashed top frame only |
| Local ids | onceKey is hashed and stays local |
