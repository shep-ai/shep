## Summary

WhatsApp-native task dispatch + interactive control — 15 tasks across 4 phases,
delivered as independently testable slices under MANDATORY TDD. Foundation
(TypeSpec, ports, persistence, settings) → core (templates, dispatch, reply
routing) → adapters + connection (Cloud API, Baileys, watcher, notification
channel) → wiring + presentation (DI, CLI, web settings, bootstrap, docs).

## Acceptance Checklist

Before marking feature complete:

- [ ] All tasks completed
- [ ] Tests passing (`pnpm test:unit && pnpm test:int`)
- [ ] Linting clean (`pnpm lint`)
- [ ] Types valid (`pnpm typecheck`)
- [ ] TypeSpec compiles (`pnpm tsp:compile`)
- [ ] Storybook builds (`pnpm build:storybook`)
- [ ] Build green (`pnpm build`)

---

_Task details are in the tasks[] array of tasks.yaml_
