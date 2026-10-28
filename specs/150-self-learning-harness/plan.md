## Architecture Overview

Three layers of change, each usable on its own:

1. **Harness as data.** A `LearnedHarnessVersion` per scope holds an overlay of eight
   component kinds. The base version is empty: with nothing learned, every run is byte-for-
   byte what it is today. `IHarnessInstaller` materialises the current version for the
   run's agent type before each node executes, using a `SurfaceSpec` that describes, as
   data, where each component lives for that agent (the harness2 `SurfaceSpec` idea).
2. **Reflect mode (harnessing-level recursion).** A terminal `reflect_harness` node runs
   after every feature that reached implement — merged, failed or stopped — unlike
   `extract_memory`, which needs a merge. It builds an evidence workspace, runs INV and
   DOM proposers concurrently, composes one candidate, validates it with one retry, and
   writes a Candidate version, its edit rows and at most one lesson. The candidate becomes
   a `HarnessChange` decision. Facts the composer wants the solver to know go to Shep
   Brain through `RecordProjectMemoryUseCase` (the Memory component), not a second store.
3. **Explore mode (task-level recursion).** When enabled, `explore_implement` replaces
   `implement` / `fast-implement`: from the pre-implement git checkpoint it forks sibling
   worktrees, runs k base rollouts, 2k probes and k composed finals, runs the repository's
   checks on each, picks one by blind anonymised selection (k = 1 needs no selector),
   restores the chosen tree into the feature worktree and continues to merge. Its edit
   rows have real contrasts, so its lessons may reach Medium or High confidence.

Per-version outcome metrics (CI-fix attempts, gate rejections, validation repairs, cost,
turns, tool error rate, merge) close the loop across features: they are the slow,
confounded but real signal that a version helps, and they drive regression flags.

## Clean Architecture Placement

| Layer | What lives there |
| --- | --- |
| Domain | Generated types; pure tree, surfaces (as data), validator, diff, ledger, anonymiser, reply parsers, metrics, candidate scan — no I/O |
| Application | Use cases for reflect, refine, select, adopt, reject, rollback, history, outcomes, lessons; output ports for repository, installer, improver, evidence workspace, probe worktrees — injected by string token |
| Infrastructure | SQLite repository + migration; installers per agent family; improver over `IAgentExecutorProvider`; prompts; evidence workspace; git probe worktrees; graph nodes |
| Presentation | `shep learn`, the `/learning` page and TUI decision view — thin calls to use cases only |

No use case imports infrastructure; no presentation code holds learning logic; no agent
type is hardcoded outside the catalog's surface data.

## Implementation Strategy

Foundation first because every layer needs the TypeSpec types. The domain phase is pure
and parallel: tree / validator, ledger / anonymiser / parsers, and metrics have no
dependencies on each other. Persistence and ports come next so use cases can be written
against fakes.

Installation (phase 4) ships before any learning. It is invisible with an empty harness,
and it proves the hardest integration — every prompt, every agent type, nothing committed
— on its own. A manually adopted version (`shep learn adopt --from-dir`) exercises it end
to end.

Reflect mode (phase 5) is the first slice with user value and is cheap enough to run on
every feature. Explore mode (phase 6) reuses the improver, validator, workspace and
reflection from phase 5 and adds only probing, the ledger and selection. Presentation
(phase 7) is parallel across CLI, Web and TUI because all three call the same use cases
and decisions already render everywhere. Telemetry, docs and the end-to-end proof close.

## Files to Create

| Area | Files |
| --- | --- |
| TypeSpec | `tsp/common/enums/learned-harness.tsp`, `tsp/domain/entities/learned-harness.tsp` |
| Domain (pure) | `domain/harness-learning/`: tree, surfaces, validator, diff, ledger, anonymiser, reply parsers, version metrics, candidate scan |
| Ports | learned-harness repository, harness installer, harness improver, evidence workspace, probe worktree |
| Use cases | `application/use-cases/harness-learning/`: build evidence, reflect on run, refine, select, reflect on adoption, adopt, reject, rollback, get current, history, record outcome, select lessons |
| Infrastructure | migration 174, mapper, SQLite repository, installers + registry, agent improver, evidence workspace, git probe worktrees, prompts + `NOTICE.md`, two graph nodes, overlay prompt section, DI module |
| Presentation | `shep learn` command group; `/learning` page, server actions, three components with stories |
| Docs | `docs/architecture/self-learning-harness.md` |

## Files to Modify

| File | Change |
| --- | --- |
| `tsp/domain/entities/settings.tsp`, `tsp/agents/decision.tsp`, `tsp/common/enums/telemetry.tsp` | `LearningConfig`, `selfLearning` flag, `DecisionKind.HarnessChange`, telemetry events |
| `feature-flag-catalog.ts`, `settings-defaults.factory.ts`, `settings.mapper.ts` | Flag and learning settings wiring (LESSONS.md flag checklist) |
| `feature-agent-graph.ts`, `fast-feature-agent-graph.ts`, `state.ts`, `feature-agent-worker.ts` | New nodes, explore branch, `learnedHarness` state channel, deps |
| `node-helpers.ts`, `implement.node.ts`, `fast-implement.node.ts`, `merge.node.ts`, `ci-watch-fix-loop.ts` | Install before execute; overlay section in every prompt |
| `feature-context.builder.ts` | Interactive agent receives the overlay |
| `git-commit.service.ts` | Generalise the never-commit pathspec to installer paths |
| `container.ts`, CLI index, control center, TUI, locales | Registration and surfaces |

## Testing Strategy (TDD: Tests FIRST)

**MANDATORY TDD**: every phase with executable code follows RED → GREEN → REFACTOR.

- **Domain unit tests** — table-driven: every validator rule with its exact message, the
  autotrigger repair and its cap, diff kept/added/removed/modified, ledger identity for
  k = 1..5 in both modes, seeded anonymisation stable across calls, reply parsers failing
  closed on every malformed shape (LESSONS.md "a gate that reads an LLM's words must fail
  closed"), regression detection on synthetic metric series, candidate scan findings.
- **Use-case unit tests** with in-memory fakes of every port: reflect stores a Candidate,
  inherits on two invalid proposals, records KEEP_BASE, never throws into the run;
  adoption refuses Script/Hook under any auto policy; rollback restores the parent;
  refine runs exactly 4k rollouts and 3k sessions and falls back on the USD cap.
- **Integration tests** on a real temporary git repository: installers write the right
  paths per agent type and nothing reaches a commit; probe worktrees fork from a
  checkpoint and are cleaned up; SQLite round-trip of every entity field (LESSONS.md
  "a new field is not done until it round-trips the database").
- **Breadth test** — one parametrised test asserting the overlay section appears in every
  feature-agent prompt and in the interactive context, and is absent when the harness is
  empty.
- **Graph tests** — reflect node runs after merge and after failure, is skipped with the
  flag off; explore node replaces implement only in Explore mode.
- **Presentation** — CLI command tests, component unit tests and stories, an e2e test of
  the `/learning` page adopting and rolling back a version.
- **End to end** — a mock-executor feature run that produces a candidate, adopts it, and
  shows the next run receiving the new skill.

## Risk Mitigation

| Risk | Mitigation |
| --- | --- |
| Persistent injection through learned skills, scripts, hooks | Evidence-is-data prompt block; static scan; human adoption for Script/Hook; provenance; rollback |
| Drift and always-on bloat | Validator cap; per-version metrics; regression flag; rollback |
| Overlay files committed | Generalised never-commit pathspec; real-git integration test |
| Explore cost | Ledger identity checks; USD cap with fallback to base |
| Confident wrong lessons | Untested verdicts and Low-confidence cap for reflect-only lessons |
| Overlay misses a prompt | Parametrised breadth test over every prompt builder |
