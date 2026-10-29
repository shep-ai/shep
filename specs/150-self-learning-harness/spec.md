## Problem Statement

Shep runs the same agents with the same harness on every feature. When a run stumbles —
a CI-fix loop that needed five attempts, a plan the user rejected twice, an implement phase
that hand-rolled the same migration boilerplate again — the only thing that persists is a
handful of Shep Brain facts, and only if the feature merged. Nothing changes *how* the agent
works next time: no new skill, no helper script, no guardrail, no hook. And nothing records
whether a change actually helped.

Harness² (Google Research, 2026) shows that this is the cheapest lever left once model
weights are fixed. Two recursion levels:

1. **Task level — Propose–Probe–Compose.** Run the base harness; two scoped editors propose
   edits (INV: procedure, tools, completion; DOM: practitioner knowledge); each edited
   harness is executed on the *same* task; a composer merges what the behavioural contrasts
   support; a blind selector picks one output among anonymised finals. No ground truth.
2. **Harnessing level — the experience library.** After adoption a reflector writes, per
   changed component, what the edit did and a verdict (helped / hurt / no observed effect /
   confounded), plus at most one transferable lesson (cue, lesson, evidence, confidence).
   The adopted harness and lesson go into a per-domain library that every later
   refinement reads first.

Measured gains: up to +11.5 points on WorkBuddy-Bench, +4.5 on JobBench, +11.8 pp on LAB
for one step; k = 5 parallel recursion lifts WorkBuddy from 72.4 to 80.8. Ablations: the
library is worth −3.1 / −1.8 points when removed, the INV/DOM split −2.9 / −3.7,
composition −1.6 / −1.9. Skills and scripts carry most of the gain (removing them costs
5.3 and 3.7 points on average) and make up about half of all edits. A memory-only baseline
(ReasoningBank — which is what Shep Brain is today) gains 1 point and regresses on code.

Shep is unusually well placed to adopt this: it already isolates runs in worktrees,
snapshots every agent step as a git checkpoint, records per-phase cost and turns, keeps
rejection, CI-fix, validation and review history, and has a scoped memory with a relevance
scorer and a unified decisions inbox. What is missing is the harness as editable, versioned
data, the propose/compose/reflect stages, evidence-backed verdicts, and a way to probe.

## Success Criteria

- [ ] The learned harness is TypeSpec-modelled data: `LearnedHarnessVersion` with
      components of eight kinds (`HarnessComponentKind`: Instructions, Guardrails, Memory,
      ToolGuidance, Skill, Script, Subagent, Hook), a parent version, a status
      (Candidate, Adopted, Rejected, RolledBack) and a scope reusing `MemoryScope`
      (Project, Space, ProductLine)
- [ ] A pure domain validator rejects a harness tree with actionable messages: off-surface
      paths, bad component names, a skill without frontmatter or without a trigger line in
      always-on text, a script referenced but not shipped, template braces in always-on
      text, always-on text over its character cap, malformed hooks; an `autotrigger`
      repair adds missing trigger lines when the cap allows
- [ ] An `IHarnessInstaller` port materialises the adopted version for the run's agent type
      (Claude Code: appended system prompt + `.claude/skills` + `.claude/agents` + hooks;
      Codex: `.agents/skills` + appended instructions; every other agent: always-on text and
      skill index as a prompt section), never committed, and every feature-agent prompt —
      analyze, requirements, research, plan, implement, fast-implement, merge, CI-fix and the
      interactive agent — receives it (one parametrised breadth test)
- [ ] Reflect mode: after any feature run that reached implement (merged, failed or
      stopped), `ReflectOnFeatureRunUseCase` builds an evidence bundle, runs INV and DOM
      proposers in parallel and one composer through `IAgentExecutorProvider`, validates
      with one retry carrying the validator's message, and stores the result as a Candidate
      version — or records KEEP_BASE — without blocking or failing the run
- [ ] A Candidate is filed as a `DecisionKind.HarnessChange` decision showing the diff, the
      trajectory moment behind each edit and the projected always-on cost; approving adopts
      it, rejecting stores the feedback for the next reflection; Scripts and Hooks are never
      adopted without a human approval regardless of policy
- [ ] Explore mode (opt-in per feature or per repository, budget `k`, default 1): the
      implement phase runs Propose–Probe–Compose in sibling worktrees forked from the
      pre-implement checkpoint (4k rollouts, 3k improvement sessions, enforced by a ledger
      with a USD cap that falls back to the base result), and the feature continues with the
      output chosen by blind selection over anonymised finals
- [ ] Every refinement writes edit records with verdicts and at most one lesson; reflect-only
      edit records are marked `untested` and their lessons can never exceed Low confidence;
      lessons are retrieved per scope with the existing relevance scorer and fed to the
      improver, never to the solver prompt
- [ ] Each adopted version accumulates outcome metrics from the features that ran on it
      (CI-fix attempts, gate rejections, validation repairs, cost, turns, merge rate); a
      version that regresses against its parent on a configurable minimum sample is flagged
      and one-click rollback restores the parent
- [ ] CLI (`shep learn status|history|show|diff|adopt|reject|rollback|reflect`; `shep harness`
      already belongs to spec 119), Web (a Learned harness page per repository with version timeline, diff, edit verdicts,
      lessons and metrics; decisions in the existing inbox) and TUI (decisions in the
      control center) all call the same use cases
- [ ] Opt-in at every level: `FeatureFlags.selfLearning` defaults off, and with it on
      `Settings.learning.mode` still defaults to Off — the user picks Reflect or Explore.
      Adoption policy defaults to Manual. With the flag off, or the mode Off and no adopted
      version, prompts and worktrees are byte-identical to today; content-free telemetry
      events only
- [ ] Web Settings has a Self-learning section (shown when the flag is on): mode, Explore
      k and USD cap, adoption policy, always-on character cap, regression sample size —
      with the cost of Explore stated next to it; the flag itself appears in the existing
      feature-flags list
- [ ] Explore can be switched on for a single feature from every surface that creates one:
      a toggle in the web feature-create drawer, `shep feat new --explore [--explore-k N]`
      and the TUI create flow; the choice is stored on the feature and overrides the scope
      mode for that run only
- [ ] Prompt texts adapted from Harness² carry the Apache-2.0 attribution header and a
      `NOTICE.md` beside them

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/domain/entities/learned-harness.tsp`, `tsp/common/enums/learned-harness.tsp` | High | New versioned harness, edit record, lesson, refinement run; enums |
| `tsp/domain/entities/settings.tsp`, `tsp/agents/decision.tsp` | Medium | `LearningConfig`, `selfLearning` flag, `DecisionKind.HarnessChange` |
| `packages/core/src/domain/harness-learning/` | High | Pure tree model, surface specs, validator, autotrigger, diff, ledger, anonymiser, reply parsers |
| `packages/core/src/application/use-cases/harness-learning/` | High | Reflect, refine (parallel/sequential), select, adopt, reject, rollback, metrics, read |
| `packages/core/src/application/ports/output/` | Medium | `ILearnedHarnessRepository`, `IHarnessInstaller`, `IHarnessImprover`, `IEvidenceWorkspace`, `IProbeWorktreeService` |
| `packages/core/src/infrastructure/services/harness-learning/` | High | Installers per agent type, improver over `IAgentExecutorProvider`, prompts, evidence workspace, probe worktrees |
| `persistence/sqlite/migrations/`, `repositories/`, `mappers/` | Medium | Four additive tables and their repository |
| `infrastructure/services/agents/feature-agent/` | High | Overlay injection into every prompt, `reflect_harness` node, explore branch around implement |
| `infrastructure/services/interactive/feature-context.builder.ts` | Low | Interactive agent gets the overlay |
| `infrastructure/di/modules/` | Low | Register the new ports and use cases by string token |
| `src/presentation/cli/commands/learn/` | Medium | Nine subcommands, nine locales |
| `src/presentation/web/app/learning/`, `components/features/learned-harness/` | Medium | Page, components with stories, server actions |
| `src/presentation/tui/` | Low | HarnessChange decisions render in the control center; explore toggle in the create flow |
| `components/features/settings/`, `components/common/feature-create-drawer/` | Medium | Self-learning settings section; per-feature Explore toggle |
| `tsp/domain/entities/feature.tsp`, `create-feature.use-case.ts`, `feat/new.command.ts` | Low | `exploreHarness` / `exploreK` on the feature and its create input |
| `docs/architecture/self-learning-harness.md`, prompts `NOTICE.md` | Low | Architecture doc and attribution |

## Dependencies

- Shep Brain (spec 102): the Memory component *is* project memory; refinement writes facts
  through `RecordProjectMemoryUseCase`, never a second memory store
- Skill injector (spec 081): its never-commit pathspec handling is generalised for the
  installer
- Git checkpoints (spec 138): probes fork from the pre-implement checkpoint
- Unified decisions (spec 134): candidates are decisions, so every inbox shows them
- Spaces and product lines (spec 120): scope isolation, so a work repository's lessons never
  reach a personal one
- Agent session transcript readers: trajectories for CLI agents come from their own files

## Out of Scope

- Editing Shep's built-in phase prompts (`nodes/prompts/*`); they stay reserved. Prompt
  overrides through `IAgentPromptResolver` for feature nodes are a follow-up
- Probing phases other than implement / fast-implement (analyze → plan probes are a
  follow-up once implement explore mode has data)
- A replay gym that re-runs merged features from their base commit as an offline regression
  suite (follow-up spec; Explore mode's ledger and selection are built to be reused by it)
- Running the Harness² Python package, its benchmarks, judges or bridge
- Fine-tuning or any change to model weights

## Size Estimate

**XL** — a new domain (four entities, five enums), a validator, five ports with adapters
per agent type, two LangGraph integrations, a reflect pipeline and a probe orchestrator,
four migrations' worth of tables, CLI + Web + TUI surfaces and docs. Delivered in phases
so Reflect mode ships value before Explore mode exists.
