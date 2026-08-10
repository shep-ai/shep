## Summary

A global cap on concurrently running feature agents, with a FIFO queue that drains automatically
when a slot frees — 15 tasks across 6 phases.

Phase 1 lays the two persisted fields and their migrations. Phase 2 defines the capacity rule
once, in the domain, before any consumer exists. Phase 3 carries both fields through the full
persistence chain and adds the two capacity queries. Phase 4 collapses three duplicated spawn
paths into one (fixing an agent-type divergence found during research), then adds admission and
the drain. Phase 5 surfaces the setting and the queued state in web, CLI and TUI. Phase 6 verifies.

## Acceptance Checklist

Before marking feature complete:

- [ ] All tasks completed
- [ ] Tests passing (`pnpm test`)
- [ ] Linting clean (`pnpm lint`)
- [ ] Types valid (`pnpm typecheck`)
- [ ] TypeSpec compiles (`pnpm tsp:codegen`)
- [ ] Translation completeness test passing across all nine locales
- [ ] Storybook builds (`pnpm build:storybook`)
- [ ] Default limit of 0 leaves existing behaviour unchanged
- [ ] PR created and CI green on every workflow run

---

_Task details are in the tasks[] array of tasks.yaml_
