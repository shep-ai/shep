# Fleet Control Plane

> Spec: [`specs/111-fleet-control-plane/`](../../specs/111-fleet-control-plane/)
> — see [`spec.yaml`](../../specs/111-fleet-control-plane/spec.yaml) for the requirements and
> [`tasks.yaml`](../../specs/111-fleet-control-plane/tasks.yaml) for delivery state.

One person can supervise a handful of agents by watching them. At fifty that stops working: the
same attention budget is spread across a screen of nodes, most of which are healthy, and the human
becomes the bottleneck the parallelism was supposed to remove. Worse, the two available modes are
both wrong — approve every gate by hand, or hand the fleet to a supervisor with no bounds.

The fleet control plane is the layer that assumes more agents than the screen can show:

| Pillar | Question it answers | Surface |
| --- | --- | --- |
| **Triage** | *Which handful of features actually need me right now?* | `shep fleet triage`, web triage drawer |
| **Guardrails** | *Which gates are provably safe to approve without me?* | guardrail rules on the supervisor policy, `fleet approve --low-risk` |
| **Circuit breaker** | *When should the fleet stop taking new work?* | breaker trip → admission queue pause |
| **Batch actions** | *How do I act on many features at once, safely?* | `fleet approve / retry / pause / resume`, drawer actions |

## Design rule: read-time truth

There are no fleet counters to reconcile. Every number — cruising, queued, attention needed,
failed — is derived at query time from `features`, `agent_runs` and `agent_questions`, with the
indexes added by migration 143. A daemon crash, a stopped process or a run that was reconciled
after a restart therefore cannot leave the dashboard disagreeing with the database, because there
is no second copy of the truth to drift.

`attentionNeeded` is not a fourth independent query: it is the number of distinct features the
triage feed would show. The status bar and the drawer cannot disagree.

## Triage: only the exceptions

`shep fleet triage` and the web drawer read the same feed. Healthy features are omitted; what
remains is ordered by priority, then newest first.

| Priority | Category | Triggered by |
| --- | --- | --- |
| P1 | `gate` | run parked in `waiting_approval` — the reason names the gate (`prd`, `plan`, `merge`) |
| P1 | `question` | a pending **blocking** agent question |
| P2 | `crash` | run `failed` or `interrupted` |
| P2 | `conflict` | open PR with `pr_mergeable = 0` |
| P2 | `ci_failed` | open PR with a failing CI status |
| P3 | `warning` | a run still `running` after 45 minutes |

Archived features are outside the fleet and never appear. `--repo <path>` scopes the feed — and
every other fleet read — to one repository, so a multi-repo install can triage one product line
without the rest drowning it.

`interrupted` is deliberately a P2 rather than noise: a run the user stopped, or one a daemon
restart reconciled, is a real thing to show and offer to retry.

## Guardrails: deterministic bounds before the model

A supervisor policy can carry **deterministic** rules that decide a gate *before* the LLM
evaluator runs. Math and path bounds (`diff ≤ 250 lines`, no blocked files, CI green) are exact,
cost no tokens, and must never be left to a model's judgement.

Rules live on `SupervisorPolicy.guardrailRulesJson` and are edited in the supervisor config form
(`SupervisorGuardrailRules`) or set programmatically through `ConfigureSupervisorUseCase`:

```jsonc
[
  {
    "id": "rule-low-risk-merge",
    "gate": "merge",              // prd | plan | merge | all
    "maxDiffLines": 250,
    "maxFilesChanged": 5,
    "blockedPathPatterns": ["**/auth/**", "**/migrations/**"],
    "requireCiPass": true,
    "autoApprove": true
  }
]
```

| Field | Meaning |
| --- | --- |
| `gate` | which gate the rule applies to; `all` matches every gate |
| `maxDiffLines` | maximum added + removed lines in the change |
| `maxFilesChanged` | maximum number of files touched |
| `blockedPathPatterns` | glob patterns that must **not** be touched |
| `requireCiPass` | the PR's CI must be green |
| `autoApprove` | the rule permits approval without a human |

Evaluation is **conjunctive**: every rule matching the gate must pass, so adding a stricter rule
can only make the outcome safer. A rule with no criteria (`{ "gate": "all", "autoApprove": true }`)
passes trivially — that is the explicit "approve everything" configuration.

Three properties are deliberate and are covered in more depth in
[the supervision architecture doc](../architecture/supervision.md#deterministic-guardrails-spec-111):

- **Failing closed.** Unreadable rules, or diff/CI facts that cannot be computed, escalate to a
  human. Treating an unknown diff size as `0` would let a `maxDiffLines` rule pass.
- **A breach is terminal.** The LLM is not consulted after a violation; a deterministic breach
  must not be overridable by a model verdict.
- **The default path is untouched.** With no rules, a disabled policy, or the `collaboration` flag
  off, gate evaluation behaves exactly as it did before spec 111.

### `shep fleet approve --low-risk`

The same evaluator decides the batch: a gate is approved only when **every** matching rule passes
*and* permits auto-approval. A breached rule, an advise-only rule, unreadable rules, a disabled
policy, or a missing metric leaves the gate for a human — with the reason printed.

**No rules configured means no approvals.** That is deliberate: a flag that approved everything
when nothing is configured would be a synonym for `--all`. The command says so and exits `1`.

## Circuit breaker → admission queue

The breaker watches agent runs in a rolling **15-minute** window and trips on **4 consecutive
failed runs**, or on a failure rate above **25%** across at least **4** finished runs. The sample
floor matters: without it, one failure out of one run reads as 100% and parks a healthy fleet.

A trip does two things:

1. **Reports** — `circuitBreakerTripped` and its reason appear in `shep fleet status`, the status
   bar and the drawer.
2. **Acts** — when `workflow.circuitBreakerAutoPauseQueue` is set, the trip parks the **admission
   queue**: no queued feature starts, and no manual start is admitted, until someone releases it.

Points worth knowing:

- **The switch ships off.** A trip is reported either way; until an install opts in, the pause is
  a decision the operator makes with `shep fleet pause`. The dashboard's own reads are the most
  common thing that trips the breaker, and it cannot release a pause itself, so a default that
  parked the queue would strand a web-only user.
- **The pause is its own record** (`workflow.queuePaused`), never `maxParallelFeatures = 0` — in
  that field `0` means *unlimited*, so overloading it would remove the cap entirely.
- **A breaker pause never clears itself.** `shep fleet resume`, or **Resume** on the status bar,
  is the only way out; otherwise a fleet that tripped overnight would restart into the same
  failing conditions as soon as the window looked healthy.
- **Resume acknowledges the trip, so it sticks.** The breaker judges only runs that finished
  after the acknowledgement, so the same failures cannot re-park the queue immediately. A *new*
  failure trips again.
- **Only `failed` counts.** `interrupted` runs appear in triage but do not trip the breaker;
  otherwise stopping four agents, or restarting the daemon with four running, would park the fleet.
- **A scoped read does not park the fleet.** `shep fleet status --repo <path>` reports the trip for
  that repository but never writes the global pause.

## Batch actions

| Command | Scope is required | What it does |
| --- | --- | --- |
| `shep fleet approve --all` | yes | approve every feature waiting at a gate |
| `shep fleet approve --gate <type>` | yes | approve one gate type |
| `shep fleet approve --low-risk` | yes | approve only gates the guardrail rules prove safe |
| `shep fleet retry --failed` | yes | restart runs that crashed, failed or were stopped |
| `shep fleet pause [--reason]` | — | park the admission queue |
| `shep fleet resume` | — | release the pause and drain what now fits |

The safety rules are shared, and they exist because a batch command with a loose scope is worse
than no command at all:

- **A bare command can never act on the whole fleet.** `approve` requires one of
  `--all` / `--gate` / `--low-risk`; `retry` requires `--failed`.
- **An empty selection is not "everything".** An empty `featureIds` array means *nothing*, not
  *no filter* — a stale UI selection must never turn into a fleet-wide action.
- **Exit `1` whenever any selected item was not acted on.** `fleet approve --low-risk && …` must
  not read a partial batch as a cleared fleet.
- **Each feature is retried once**, even when the feed lists it twice (a crashed run *and* failing
  CI). Two agents in one worktree on one branch is worse than a skipped retry.
- **Gates and questions are never retried.** They are decisions for a human; re-running them would
  bypass the gate.
- **A paused queue refuses a batch once**, naming the pause, instead of printing one identical
  refusal per feature.

## Surfaces

**CLI.** `shep fleet status | triage | approve | retry | pause | resume`. Flags, output and exit
codes are in the [command reference](../cli/commands.md#fleet-commands).

**Web.** `FleetControl` mounts a compact status bar into the dashboard header; clicking it opens
the triage drawer.

- The **status bar** shows the counts and how many features need attention, and surfaces a pause
  with its reason and a **Resume** action. The bar clears only after the re-read — it shows the
  pause the server reports, never an optimistic guess.
- The **drawer** lists the same exceptions as `shep fleet triage`, with per-row **Approve** and
  **Retry**, a footer **Approve all P1** and **Retry all failed** behind confirmations, and a
  refresh action. An unread empty feed renders as loading, not as "nothing needs you".
- The drawer's **Approve all P1** approves those gates outright. The guardrail-filtered path is
  `--low-risk` in the CLI.

## Not built yet

These are known gaps, tracked in
[`tasks.yaml`](../../specs/111-fleet-control-plane/tasks.yaml), not silent omissions:

- **No CLI authoring surface.** Rules are edited in the web supervisor form and settable through
  `ConfigureSupervisorUseCase`, but `shep supervisor configure` has no `--guardrail` flag.
- **Thresholds are not user-configurable.** The breaker's window, consecutive count and failure
  rate are constants; exposing them needs a settings model, migration and mapper round-trip.
- **No 50-agent simulation.** Unit and real-SQLite integration coverage exist for the use cases;
  the end-to-end fleet scenario (task-18) is not written.

## Where it lives

| Concern | Location |
| --- | --- |
| Fleet and guardrail models | `tsp/domain/entities/fleet-overview.tsp`, `tsp/agents/fleet-guardrails.tsp` |
| Indexes | `packages/core/src/infrastructure/persistence/sqlite/migrations/143-create-fleet-indexes.ts` |
| Derived read model | `packages/core/src/infrastructure/repositories/sqlite-fleet.repository.ts` |
| Overview + breaker | `packages/core/src/application/use-cases/fleet/get-fleet-overview.use-case.ts` |
| Triage feed | `.../fleet/list-fleet-triage-items.use-case.ts` |
| Guardrail evaluation | `.../fleet/evaluate-gate-guardrails.use-case.ts`, `evaluate-feature-low-risk.use-case.ts` |
| Batch actions | `.../fleet/batch-approve-features.use-case.ts`, `retry-failed-fleet-features.use-case.ts` |
| Queue pause | `.../fleet/set-fleet-queue-pause.use-case.ts`, `packages/core/src/domain/shared/parallel-feature-limit.ts` |
| CLI | `src/presentation/cli/commands/fleet/` |
| Web | `src/presentation/web/components/fleet/` |
| Guardrail rule editor | `src/presentation/web/components/supervisor/supervisor-guardrail-rules.tsx` |

## Related

- [CLI command reference](../cli/commands.md#fleet-commands) — every flag, example and exit code.
- [Agent collaboration & supervision](../architecture/supervision.md#deterministic-guardrails-spec-111)
  — where guardrails sit relative to the supervisor agent and the LLM evaluator.
