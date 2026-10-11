## Architecture
Clean Architecture: application use case depends on the existing repository,
worktree, git and model provider ports. Infrastructure provides the concrete
components. The model owns bounded defer/continue discretion; runtime validates
and applies only the selected, allowed coordination action.

## TDD and release
RED: write failing tests for interference evidence, owned decision and safe
refusal. GREEN: implement the smallest use case and a feature-flagged lifecycle
hook using existing dependency gates. REFACTOR: consolidate stale-data checks
and keep runtime enforcement separate from agent judgment.
Run focused Vitest, TypeScript, ESLint, Prettier, and spec validation. Before
upstream submission, demonstrate one actual two-feature integration scenario.

## Risks
Reparenting is not atomic with fresh Git evidence. Git-diff overlap is a
conservative but incomplete witness. Verify worker stopping, concurrent
updates, and after-gate resume before claiming reliable production closure.
