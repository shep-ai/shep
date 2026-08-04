## Summary

Second Control Center sidenav with a repository -> feature -> session tree,
plus session archive and delete - 10 tasks across 4 phases.

Phase 1 builds the tree data in core. **Phase 2 is when the feature becomes
visible in the UI** (task-5 mounts it). Phase 3 makes sessions mutable:
archive first because it is safe by construction, then delete behind a
confirmation. Phase 4 validates.

## Ordering Rationale

The user asked twice where the sidebar was. Phase 2 is deliberately scheduled
before the archive/delete work so the double sidenav appears on screen at the
earliest point at which it has real data to show.

## Acceptance Checklist

- [ ] All 10 tasks completed
- [ ] Two sidenavs visible on the Control Center, tree open by default
- [ ] Adopted vs unadopted sessions distinguishable at a glance
- [ ] Archive reversible and never touching provider files
- [ ] Delete confirmation-gated, never cascading into the adopted feature
- [ ] Other routes visually unchanged
- [ ] Tests, lint, typecheck, builds, storybook all green
- [ ] i18n keys in all nine locales

---

_Task details are in the tasks[] array of tasks.yaml_
