## Summary

Hidden-ref checkpoints per feature-agent step, with per-step and cross-step diffs and a safe
restore in CLI and web — 12 tasks across 5 phases.

## Acceptance Checklist

Before marking feature complete:

- [ ] All tasks completed
- [ ] Tests passing (`pnpm test:unit`, `pnpm test:int`)
- [ ] Linting clean (`pnpm lint`), formatting clean (`pnpm format:check`)
- [ ] Types valid (`pnpm typecheck`)
- [ ] TypeSpec compiles without warnings (`pnpm tsp:compile`), `pnpm generate` committed
- [ ] `pnpm build`, `pnpm build:web`, `pnpm build:storybook`, `pnpm check:stories` pass
- [ ] PR created, CI green

---

_Task details are in the tasks[] array of tasks.yaml_
