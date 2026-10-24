## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Architecture Overview (Clean Architecture)

```
shep ps ──► ListShepProcessesUseCase (application)
               ├─ IDaemonService.read()             daemon.json
               ├─ ListAgentRunsUseCase              runs (crashed runs reconciled first)
               ├─ IFeatureRepository.list()         feature names
               ├─ IProcessLivenessProbe             alive?
               ├─ IProcessStatsProbe.sample(pids)   one ps call (infrastructure)
               └─ GetWorkerLogPathUseCase           log path of feature workers
shep ps stop ──► StopShepProcessUseCase ──► StopAgentRunUseCase
shep status  ──► SampleProcessStatsUseCase ──► IProcessStatsProbe
```

## TDD

Each core unit gets a failing test first (RED), then the implementation (GREEN), then
refactoring. The command is tested through seams; the e2e runs the built CLI.
