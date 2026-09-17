## Summary

Fix a client-side race condition and a referential-identity bug in the
Control Center's `useWorkspaces` hook that silently drop newly created
workspaces from `localStorage` on browser close/reopen — 3 tasks across
2 phases.

## Acceptance Checklist

Before marking feature complete:

- [ ] All tasks completed
- [ ] Tests passing (`pnpm test`)
- [ ] Linting clean (`pnpm lint`)
- [ ] Types valid (`pnpm typecheck`)
- [ ] LESSONS.md updated with the confirmed root cause and fix pattern
- [ ] PR created and reviewed

---

_Task details are in the tasks[] array of tasks.yaml_
