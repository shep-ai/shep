## Summary

28 tasks in 8 phases. Phases 1–5 deliver Reflect mode: the learned harness as data,
installed for every agent and every prompt, and a reflection after every run that files
candidates as decisions with per-version metrics and rollback. Phase 6 adds Explore mode
(Propose–Probe–Compose on implement with blind selection). Phases 7–8 add the CLI, Web and
TUI surfaces — including the Self-learning settings section and a per-feature Explore
toggle on every create surface — telemetry, docs and an end-to-end proof.

## Acceptance Checklist

- [ ] Flag off: every existing test passes and prompts are byte-identical
- [ ] Defaults are flag off, mode Off, policy Manual — learning is opt-in at every level
- [ ] Settings section and per-feature Explore toggle exist on web, CLI and TUI
- [ ] Empty harness: nothing installed, nothing committed
- [ ] Reflect mode files a validated candidate after a merged run and after a failed run
- [ ] Script and Hook components are never adopted without a person
- [ ] Explore mode respects the 4k / 3k ledger and the USD cap
- [ ] Selection is blind and fails closed
- [ ] Adopted versions show outcome metrics; regressions are flagged; rollback works
- [ ] CLI, Web and TUI expose the same use cases
- [ ] Telemetry is content-free
- [ ] pnpm validate, test:unit, test:int, build and build:storybook pass
