# Self-Learning Harness (spec 150)

Shep can learn, per repository, how its agents should work there: rules, skills, scripts,
subagents and hooks that make later features go better. What it learns is a **versioned
learned harness**. Each version is reviewed, adopted, measured and can be rolled back.

The ideas, and the improver prompts adapted from them, come from Harness²
([google-research/harness2](https://github.com/google-research/harness2), Apache-2.0).
Attribution is in [`prompts/NOTICE.md`](../../packages/core/src/infrastructure/services/harness-learning/prompts/NOTICE.md).
Shep ports the ideas, not the code: the loop runs on Shep's own agents, through
`IAgentExecutorProvider`, for every agent type.

Spec: [`specs/150-self-learning-harness`](../../specs/150-self-learning-harness/spec.md).

## Opt-in at every level

| Level | Default | Where to change it |
| ----- | ------- | ------------------ |
| `selfLearning` feature flag | off | Settings → Flags, `shep settings flags enable selfLearning` |
| Learning mode | **Off** | Settings → Self-learning, or `settings.learning.mode` |
| Per-feature Explore | off | Create drawer *Explore harness variants*, `shep feat new --explore-harness [--explore-k N]`, the TUI new-feature view |
| Adoption policy | **Manual** | Settings → Self-learning |

With the flag off nothing changes: there is no learning, no overlay and no UI, and prompts are
byte-identical. With the flag on and the mode Off, versions that are already adopted still apply,
and a person can still run `shep learn reflect` or adopt a version by hand.

## The learned harness

A version is a tree of files in an agent-neutral layout:

| Path | Kind | How an agent gets it |
| ---- | ---- | -------------------- |
| `instructions.md`, `guardrails.md`, `tool-guidance.md` | always-on text | In context on every call (capped by `alwaysOnCharCap`) |
| `memory.md` | memory | Becomes Shep Brain project-memory entries when the version is adopted |
| `skills/<name>/SKILL.md` (+ `skills/<name>/scripts/*`) | skill | The agent's own skill directory, or an index in the prompt |
| `scripts/*` | script | `.shep/learned/scripts/` |
| `subagents/<name>/AGENT.md` | subagent | The agent's subagent directory, or an index in the prompt |
| `hooks/hooks.json` | hook | Claude Code `--settings` only |

`domain/harness-learning/harness-validator.ts` enforces the shape before anything is stored:
file count and size, names, frontmatter, a trigger line in always-on text for every skill,
script references that resolve, and hook events that exist.

### Scope

Versions belong to a repository (`MemoryScope.Project`). Product-line and space versions use the
same table. A run uses the repository's adopted version first, then its product line's, then its
space's (`ILearnedHarnessRepository.findAdopted`). There is only ever one adopted version per
placement.

### Installing into a run

`LearnedHarnessExecutorProxy` wraps the worker's executor. `LearnedHarnessRunSession` pins one
version per run, so a version adopted mid-run takes effect on the next run. The installer
writes the version into the worktree for the agent's family (`AGENT_CATALOG[*].harnessSurface`):

| Family | Always-on text | Skills | Subagents | Hooks |
| ------ | -------------- | ------ | --------- | ----- |
| `ClaudeCode` | system prompt | `.claude/skills/shep-learned-*` | `.claude/agents/shep-learned-*.md` | `--settings` file |
| `Codex` | prompt section | `.agents/skills/shep-learned-*` | prompt index | — |
| `PromptSection` (every other agent) | prompt section | prompt index + `.shep/learned/` | prompt index | — |

Everything installed is prefixed `shep-learned-` or lives under `.shep/learned/`, and is listed in
`.git/info/exclude`, so a learned harness is never committed into the user's repository. Interactive
chat sessions get the same always-on text through `boot-prompt.resolver.ts`.

## Loop 1 — Reflect (after every run)

Runs in the feature-agent worker's `finally` block (`feature-agent/learn-from-run.ts`) once the
graph settles, whether the run **completed or failed**. Graph nodes never run on the failure path,
and failed runs are the most useful to learn from. An interrupted run does not reflect.

1. `RecordVersionOutcomeUseCase`: how this run did on the version it used (merged, CI-fix
   attempts, gate rejections, validation repairs, turns, cost).
2. `ReflectOnFeatureRunUseCase` gathers the run's evidence into a scratch workspace
   (`BuildEvidenceBundleUseCase`): the task, transcripts, run signals, the current harness, and the
   library index of earlier lessons and rejected proposals. It then runs, through
   `IHarnessImprover`:
   - an **INV** and a **DOM** proposal (`propose.prompt.ts`);
   - a **composition** (`compose.prompt.ts`);
   - an **experience** pass (`experience.prompt.ts`) that writes a verdict for each edit and at
     most one lesson.
3. Unless KEEP_BASE wins, a validated **candidate** is stored. Reflect edits are never probed, so
   their verdicts are `Untested` and their lesson confidence is capped at Low.
4. `OfferHarnessCandidateUseCase` scans it (`candidate-scan.ts`) and then either adopts it under
   the policy or files a `HarnessChange` decision in the inbox.

Every improver reply is parsed fail-closed (`improver-reply-parsers.ts`). A rejected reply gets one
retry with the validator's feedback; after that the stage keeps its input.

## Loop 2 — Explore (on the implement step)

When the mode is Explore, or the feature was created with Explore on, `withExplore` wraps the
`implement` / `fast-implement` node. `RefineHarnessUseCase` then runs the task-level
Propose–Probe–Compose of Harness²:

- k **base** attempts, then:
  - **parallel**: 2k proposals, 2k probes, k compositions, k final attempts;
  - **sequential**: k rounds, each round editing the previous checkpoint;
- exactly **4k rollouts and 3k improver sessions**, checked by `RefinementLedger`.

Each attempt runs the real implement step, in its own **probe worktree** forked from the feature
worktree's HEAD (`GitProbeWorktreeService`), and is checked with the repository's own test
command. **Blind selection** (`SelectProbeOutputUseCase`) then compares the final attempts as
anonymous A/B/C… diffs plus check results. It never sees a harness, a label or an origin, and a
malformed reply never picks silently.

The chosen attempt's commits are fast-forwarded into the feature worktree, `withCheckpoint` records
the step, and the graph carries on to merge. When Explore keeps an attempt, the implement node's
own evidence sub-agent and board update are skipped; the attempt's checks stand in for them. If
the chosen harness differs from the base, it becomes an `Explore` candidate with real execution
contrasts behind its verdicts.

The USD cap (`exploreMaxCostUsd`) stops new work. Past it, the best base attempt is kept, so the
feature still gets its change. With nothing kept, the original node runs unchanged. Probes are
always disposed.

## Adoption, outcomes and rollback

| Action | Use case | Surfaces |
| ------ | -------- | -------- |
| Adopt | `AdoptHarnessVersionUseCase` (records `memory.md` as project memory, closes the inbox question) | Learning page, inbox decision, TUI decisions, `shep learn adopt` |
| Import a hand-written harness | `ImportHarnessVersionUseCase` (same validator; stored as `Manual`, then adopted) | `shep learn adopt --from-dir <dir>` |
| Reject (with feedback the next reflection reads) | `RejectHarnessVersionUseCase` | Learning page, inbox, TUI, `shep learn reject` |
| Roll back to the parent | `RollbackHarnessVersionUseCase` | Learning page, `shep learn rollback` |
| History, metrics, regression flags | `ListHarnessHistoryUseCase`, `GetHarnessVersionUseCase` | Learning page, `shep learn status/history/show/diff` |
| Reflect on demand | `ReflectOnFeatureUseCase` (runs even while the mode is Off) | `shep learn reflect <feature>` |

`version-metrics.ts` compares each version with its parent once both have
`regressionMinSample` runs. A friction score worse by more than the tolerance flags the version as
**Regressed** on the Learning page and in `shep learn history`.

Version ids can be given in full or as a unique prefix (`resolve-harness-version.ts`).

## Safety

- **Scripts and hooks are never adopted automatically**, under any policy
  (`adoption-policy.ts`).
- A candidate with static-scan findings (`candidate-scan.ts`: network fetches, destructive commands,
  credential reads, and similar) is never auto-adopted, and the findings show in the decision.
- Evidence files are written only inside the workspace. The improver's edits are read back only
  from the editable surface; anything else is reported and dropped.
- The installed files never enter the user's repository: name prefix plus `.git/info/exclude`.
- Explore's selector is blind, and every parser fails closed.

## Settings

`Settings.learning` (`LearningConfig`), always read through `resolveLearningConfig`:

| Field | Default | Meaning |
| ----- | ------- | ------- |
| `mode` | `off` | `off`, `reflect` or `explore` |
| `exploreK` | 1 | Explore budget k (1–5); 4k attempts per feature |
| `exploreRecursion` | `parallel` | `parallel` or `sequential` |
| `exploreMaxCostUsd` | 20 | Explore stops starting new work past this spend |
| `adoptionPolicy` | `manual` | `manual`, `auto-text-only` (Explore candidates with text only) or `auto` (any text-only candidate) |
| `alwaysOnCharCap` | 4000 | Most always-on characters added to every prompt |
| `regressionMinSample` | 5 | Runs on a version (and its parent) before a trend is reported |

Per feature: `Feature.exploreHarness` and `Feature.exploreK`.

## Data

SQLite (migrations 174–176): `learned_harness_versions`, `learned_harness_edits`,
`harness_lessons`, `harness_refinement_runs` and `harness_version_outcomes`. There are also the
settings columns for the flag and `learning_config`, and the feature columns `explore_harness` and
`explore_k`.

## Telemetry

Content-free events, listed in [telemetry.md](../telemetry.md):
`harness.candidate.proposed`, `harness.version.adopted`, `harness.version.rejected`,
`harness.version.rolled-back` and `harness.refinement.finished`. They carry enums, counts and
booleans only.

## Key files

| Layer | Path |
| ----- | ---- |
| Domain | `packages/core/src/domain/harness-learning/` |
| Use cases | `packages/core/src/application/use-cases/harness-learning/` |
| Infrastructure | `packages/core/src/infrastructure/services/harness-learning/` (installer, proxy, workspace, improver, probe worktrees, prompts) |
| Graph wiring | `feature-agent/explore/`, `feature-agent/learn-from-run.ts`, `feature-agent-worker.ts` |
| CLI | `src/presentation/cli/commands/learn/`, `feat/explore-harness-option.ts` |
| Web | `app/learning/`, `components/features/learning/`, `settings/self-learning-settings-section.tsx`, `feature-create-drawer/explore-harness-row.tsx` |
| TUI | `src/presentation/tui/feature-console/` (harness decisions view, new-feature Explore choice) |
