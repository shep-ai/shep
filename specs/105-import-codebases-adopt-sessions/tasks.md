## Summary

Bulk local repo import plus real adoption of in-flight Claude Code / Cursor
sessions — 18 tasks across 6 phases.

Phase 1 lands the TypeSpec and persistence foundation. Phases 2 and 3 are
independent and may run in parallel. Phase 4 delivers the priority adoption
path on top of Phase 3. Phase 5 is the only presentation phase and the only
destructive one — it deletes the duplicated web scanner, which is safe solely
because Phase 3 closes the Cursor, worktree, and filePath gaps first. Phase 6
validates.

Tasks marked `[P]` within a phase are parallelizable.

## Sequencing Constraint

Do not start Phase 5 before Phase 3 is green. `session-scanner.ts` is
currently the only source of Cursor sessions, worktree sessions, and
`filePath` for the canvas; deleting it early is a silent UI regression rather
than a test failure.

## Acceptance Checklist

Before marking feature complete:

- [ ] All 18 tasks completed
- [ ] Tests passing (`pnpm test`)
- [ ] Linting clean (`pnpm lint`)
- [ ] Types valid (`pnpm typecheck`)
- [ ] TypeSpec compiles (`pnpm tsp:compile`)
- [ ] `smoke-imports.test.ts` passing (domain/ helpers shared with web)
- [ ] `pnpm build:storybook` passing (new/changed components have stories)
- [ ] Cursor + worktree sessions still visible on the canvas after scanner deletion
- [ ] No copied resume command contains `--project`
- [ ] PR created and reviewed

---

_Task details are in the tasks[] array of tasks.yaml_
