# RFC: Shep Fleet Control Plane (Exception-Based Triage, Guardrailed Auto-Approvals & Fleet Circuit Breaker)

**Author:** [@patrikkopcinski](https://github.com/patrikkopcinski) / Antigravity  
**Spec Reference:** `specs/111-fleet-control-plane/`  
**Related PRs & Specs:** PR #847 (`specs/110-max-parallel-features`, **open / unmerged**), Spec 093 (`093-agent-collaboration-supervision`)

---

## 📌 Current Implementation Status

This RFC describes the full target. What actually exists in this branch today:

| Pillar | Status |
| ------ | ------ |
| `shep fleet status` + `shep fleet triage` + `shep fleet approve` | Implemented, unit + real-SQLite integration tested |
| TypeSpec models + generated JSON Schema (`apis/json-schema/`) | Implemented |
| `SQLiteFleetRepository` (derived read model) + indexes (migration 143) | Implemented |
| Circuit breaker evaluation (consecutive failures / rolling rate) | Implemented as a reported status signal |
| Guardrail rule evaluator (`EvaluateGateGuardrailsUseCase`) | **Not in this PR** — deferred to the guardrails slice, since nothing would call it yet |
| `--low-risk`, `fleet retry`, `fleet pause` / `resume` | Not implemented |
| Web status bar + triage drawer + Storybook stories | Not started |

PR #847 is **not merged** — it is open, conflicts with `main`, and has no
`specs/110-max-parallel-features/` directory in this tree. Nothing in this spec imports
from it, and the circuit breaker therefore reports a trip signal rather than pausing a
queue that does not exist on `main` yet.

---

## 🎯 Background & Motivation

Shep’s core value proposition is:
> *"Run a fleet of coding agents. Merge real PRs. One agent session is fine; five is chaos. Shep is the part that keeps it from being chaos."*

PR #847 by @arielshad proposes `workflow.maxParallelFeatures`, an admission control mechanism that would prevent local machines from getting crushed when queuing dozens of features. It is currently **open and unmerged**, so this RFC treats admission control as a future dependency rather than an existing foundation.

However, once users actually try to operate a fleet of **50+ features**, a new bottleneck arises: **the human attention and operational safety limit**.

1. **Human Cognitive Overload (The Attention Bottleneck)**:
   50 features $\times$ 3 lifecycle gates (PRD, Plan, PR) = up to 150 approval interruptions. Scrolling through a 50-node React Flow canvas or scanning 50 rows in `shep feat ls` to spot what’s stuck is exhausting. In reality, **80% of features cruise smoothly without human intervention**, but the user is forced to inspect all 50 to find the 5 that actually need a human.
2. **Coarse "All-or-Nothing" Autonomy**:
   Today, users either hand-approve every routine step, or turn on `--allow-all` / `autonomous` supervisor mode and pray an LLM doesn't make an expensive mistake. Users need **deterministic, criteria-based guardrails** (e.g. auto-approve if diff < 200 lines and CI passes, but escalate if `auth/` or `billing/` files are touched).
3. **Blast Radius & Cascade Failures**:
   If a base branch commit breaks the build or an agent gets caught in a loop, all 50 queued features can run and fail sequentially, burning API budgets and disk space.
4. **No Fleet-Level Batch Operations**:
   Approving 10 passed PRDs or retrying 3 transient CI failures currently requires running 10 or 3 single commands one-by-one.

---

## 💡 The Proposal: Shep Fleet Control Plane

We propose **Spec 111: Fleet Control Plane**, focusing on **"Management by Exception"**: let the healthy 80% cruise autonomously in the background, and focus the human strictly on the 10–20% of anomalies, backed by safety circuit breakers and 1-click batch controls.

### Pillar 1: Exception-Based Fleet Triage ("Needs Attention" Feed)
- **`shep fleet status`**: Clean ASCII fleet health banner:
  ```text
  === Shep Fleet Health ===
  Total Features:   52
  ✓ Cruising:        42
  ⠋ Queued:          5
  ▲ Attention Needed: 3
  ✗ Failed:          2

  ✓ Circuit Breaker: Normal (0 alerts)
  ```
- **`shep fleet triage`**: Filters out the noise and surfaces only the items requiring human decision:
  ```text
  === Fleet Triage Feed (4 actionable items) ===
  [P1] Payment Stripe (payment-stripe)
       Reason:   Waiting on the plan approval gate
       Gate:     plan
       Action:   shep feat approve payment-stripe
  [P1] Auth SSO (auth-sso)
       Reason:   Blocking question: Should we support SAML 2.0 or OIDC?
  [P2] CSV Export (csv-export)
       Reason:   CI is failing on the pull request
  [P2] Profile Modal (profile-modal)
       Reason:   Pull request has merge conflicts
  ```
- **Web UI**: Pinned compact status bar on the dashboard + a slide-out **Fleet Triage Drawer** with inline action buttons (*Approve*, *Answer Question*, *Retry CI*).

### Pillar 2: Deterministic Guardrails in `SupervisorPolicy`
Extends `SupervisorPolicy` (which already has `policyRulesJson`) with measurable, deterministic bounds:
- **`GuardrailRule`**:
  - `maxDiffLines`: e.g. 250 lines
  - `blockedPathPatterns`: e.g. `["**/auth/**", "**/migrations/**", "package.json"]`
  - `requireCiPass`: true
- **Execution**: Evaluated in pure TypeScript before LLM invocation. If all criteria pass, the gate is auto-approved with reason: `"Auto-approved: diff 38 lines, CI passed, 0 sensitive files"`. If violated, it immediately surfaces in the triage feed with the exact breach detail.

### Pillar 3: Fleet Circuit Breaker & Batch Actions
- **Fleet Circuit Breaker**: If 4 consecutive runs fail or the rolling failure rate exceeds 25% across at least 4 finished runs in a 15-minute window, `shep fleet status` reports the fleet as tripped so the operator can act before starting more work. Once PR #847 lands, the same signal can drive automatic admission-queue pausing; it deliberately does not promise that today.
- **Batch Actions**:
  - `shep fleet approve [--all | --low-risk | --gate <type>]`
  - `shep fleet retry [--ci | --failed]`
  - `shep fleet pause / resume`

---

## 🏗️ Architecture & Zero Regression Promise

- **Clean Architecture**: Follows Shep's strict four-layer model. TypeSpec domain models (`tsp/`) $\rightarrow$ use cases (`application/`) $\rightarrow$ SQLite indexed queries (`infrastructure/`) $\rightarrow$ Commander CLI & Next.js/shadcn Web components (`presentation/`).
- **Self-Healing & Derived State**: Matches PR #847's pattern: triage counts are derived at query time from indexed SQLite tables rather than maintaining mutable counters that can leak when processes crash.
- **Strict TDD**: Every use case will have 100% RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR unit test coverage, with integration tests running against real SQLite.
- **Cross-Platform**: Strict normalization of path separators (`path.normalize().replace(/\\/g, '/')`) and process management across Windows, macOS, and Linux.

---

## 🤝 Maintainer Collaboration & Phasing

We have drafted the complete spec in `specs/111-fleet-control-plane/`, with an explicit per-task delivery status in `tasks.yaml`:
- `spec.yaml`
- `research.yaml`
- `plan.yaml`
- `tasks.yaml`

To keep PRs reviewable and deliver incremental value, we propose shipping this in three focused PRs:
1. **PR 1 (Core Domain & CLI)**: TypeSpec models + `SQLiteFleetRepository` + migration + `GetFleetOverviewUseCase` + `ListFleetTriageItemsUseCase` + `BatchApproveFeaturesUseCase` + `shep fleet status` / `triage` / `approve`. **This is the slice implemented in this branch.**
2. **PR 2 (Guardrails)**: `EvaluateGateGuardrailsUseCase`, rule configuration on `SupervisorPolicy`, wiring the evaluator into the worker gate path ahead of the LLM, `--low-risk`, and `fleet retry` / `pause` / `resume`.
3. **PR 3 (Web UI)**: Fleet status bar + Fleet Triage Drawer with colocated Storybook stories.

I am eager to contribute, help maintain this part of Shep, and collaborate with the team on feedback and refinements!

Looking forward to your thoughts,  
Patrik Kopcinski
