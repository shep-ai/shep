# Clean Architecture Violations — Incremental Log

> **CURRENT STATE (2026-04-14)**
>
> - **20 violations logged** across two audit passes (13 during research, 7 during post-impl audit)
> - **Fully fixed:** 0
> - **Partially fixed:** 3 (#6, #11, #13 — scaffolding in place, adoption incomplete)
> - **Outstanding:** 17
> - **Blocking PR #554 CI right now:** #19 (`ApplicationNotFoundError` cross-use-case import — see task **t-59**)
>
> See the "What's Left" checklist below for the execution plan.

## What's Left — prioritised checklist

### 🔴 Blocker (must ship before PR #554 can merge)

- [ ] **#19 / t-59** — Move `ApplicationNotFoundError` to `domain/errors/application-not-found.error.ts`. Fix also unblocks the Next.js web build on CI.
- [ ] **t-60** — Fix Gitleaks failure on `agent-settings-section.stories.tsx` (pre-existing file; still our responsibility per integrity rules).

### 🟠 Critical (dependency-rule breakers — must eventually fix)

- [ ] **#1, #2, #3** — `deploy-application.ts` server action → `StartApplicationDeploymentUseCase`. High-risk, dedicated PR.
- [ ] **#4, #5** — `/api/agent-events/route.ts` hosts orchestration + imports `isProcessAlive` from infrastructure. `StreamAgentEventsUseCase` extraction. Dedicated PR.
- [ ] **#16** — `AgentSessionRepositoryRegistry` imports tsyringe inside application/ → move to infrastructure + port. **t-66**.
- [ ] **#17** — **13 use-case files import from `infrastructure/`** (biggest offender). Split into three sub-tasks:
  - [ ] **#17a / t-63** — Kill `getSettings()` singleton; inject `ISettingsRepository` into the 5 callers.
  - [ ] **#17b / t-64** — Move `computeWorktreePath` + `TOOL_METADATA` to `domain/shared/`.
  - [ ] **#17c / t-65** — Add ports for `node-helpers`, `phase-timing-context`, `conflict-resolution.service`, `attachment-storage.service`; migrate each caller.

### 🟡 Major (architectural drift — should ship as soon as the blockers land)

- [ ] **#8, #9, #10** — `application-page.tsx` split (867 lines) + `useDevServerCoordinator` hook + wire commit buttons to a real use case. Dedicated PR.
- [ ] **#7** — Share `SdlcLifecycle → node` mapping between SSE route and `derive-feature-state.ts`.
- [ ] **#14 / t-67** — Delete `application/services/` tree (folded into #16 work).
- [ ] **#15 / t-67** — Delete `application/workflows/` tree.

### 🟢 Minor (quality — batch at the end)

- [ ] **#6** — Adopt `InteractiveSessionEventType` TypeSpec enum in SSE route (enum shipped, not yet used at call site).
- [ ] **#11 / t-70** — Adopt `feature-id` helpers across the 7 legacy callers.
- [ ] **#12 / t-69** — Split `container.ts` (831 lines) into topic modules.
- [ ] **#13 / t-71** — Migrate remaining `console.*` in `run-workflow.use-case.ts`, `create-application.use-case.ts`, and `agent-events/route.ts` to the new `ILogger` port.
- [ ] **#18 / t-68** — Add `no-restricted-imports` ESLint rule for `application/` → `infrastructure/` as a CI guardrail.
- [ ] **#19 / t-59** — (duplicated as blocker)

### ⚪ Preventive / follow-up

- Enable `pnpm build:release` as a required local gate before pushing (the missing gate that let #19 escape to CI).
- Add an "audit sweep" GitHub Action that runs `shep-clean-arch-auditor` weekly.

### Subagent framework (enables parallel cleanup)

- [ ] **t-61** — Create the 6 remaining shep subagents. Already shipped: `shep-clean-arch-auditor`, `shep-port-extractor`, `shep-file-relocator`, `shep-use-case-creator`. Still to create: `shep-port-creator`, `shep-tsp-field-adder`, `shep-migration-creator`, `shep-web-route-creator`, `shep-storybook-story-creator`, `shep-cli-command-creator`.

---

This file is appended to throughout the research and implementation of feature `089-one-click-cloud-deploy`. Every time a file is read in the course of this feature's work and a Clean Architecture violation is noticed, a new entry is added here.

**Rules enforced** (from `.claude/rules/code-quality.md` and `CLAUDE.md`):

- Use cases are the only entry point from presentation to core.
- Presentation contains no business logic.
- Application layer imports only from domain + its own ports.
- Presentation imports only from use cases + domain types.
- No direct `infrastructure/` imports in application or presentation layers.
- No hardcoded agent type — all resolution via `IAgentExecutorProvider`.
- No singletons or global state outside infrastructure bootstrapping.
- No magic string/number literals for domain concepts — use TypeSpec enums.
- Files stay focused; >~300 lines is a refactor signal.
- No duplication (two = coincidence, three = pattern to extract).

**Severity scale:**

- **Critical** — breaks the dependency rule (outer imports inner impl) or hardcodes something that must be pluggable (agent type, provider, db).
- **Major** — presentation or application has real business logic, a banned singleton, or duplicated logic that should be shared.
- **Minor** — magic literal, over-long file, missing port abstraction that isn't yet needed, stylistic drift from patterns.

**Format for each entry:**

```
### N. <short title>
- **File:** `<path>:<line-range>`
- **Severity:** Minor | Major | Critical
- **Observation:** <what is wrong>
- **Suggested fix:** <what to do>
- **Found during:** <research / implementation of which task>
```

At the end of the research phase, `/shep-kit:plan` MUST ingest this file and produce an explicit "tech-debt cleanup" task group in `tasks.yaml` covering every entry. Per user instruction: **"we will need to consider fixing EVERYTHING."**

---

## Findings

### 1. Presentation imports infrastructure logger directly
- **File:** `src/presentation/web/app/actions/deploy-application.ts:5`
- **Severity:** Critical
- **Observation:** Server action imports `createDeploymentLogger` from `@shepai/core/infrastructure/services/deployment/deployment-logger` — a raw infrastructure import from presentation, bypassing the use-case boundary.
- **Suggested fix:** Expose a logging port on use cases or have the use case own its logging; presentation should not reach into infrastructure.
- **Found during:** research

### 2. Presentation server action bypasses use cases for deploy orchestration
- **File:** `src/presentation/web/app/actions/deploy-application.ts:36-71`
- **Severity:** Critical
- **Observation:** The action resolves `IApplicationRepository`, `IShepInstanceService`, and `IDeploymentService` directly and orchestrates the flow (fetch app, existsSync check, self-instance guard, call `.start()`). That orchestration is business logic and belongs in a `StartApplicationDeploymentUseCase`.
- **Suggested fix:** Move all of this into a use case; the action should only parse input, call `useCase.execute(applicationId)`, and return the DTO.
- **Found during:** research

### 3. Presentation uses `node:fs` existsSync for domain preconditions
- **File:** `src/presentation/web/app/actions/deploy-application.ts:3,48-51`
- **Severity:** Major
- **Observation:** Presentation layer performs filesystem checks (`existsSync`) to validate domain preconditions. Filesystem access is infrastructure.
- **Suggested fix:** Encapsulate the "repository exists on disk" check inside the use case via an injected `IFileSystemService`.
- **Found during:** research

### 4. SSE route hosts business orchestration that should be a use case
- **File:** `src/presentation/web/app/api/agent-events/route.ts:122-424`
- **Severity:** Critical
- **Observation:** The route directly wires `ListFeaturesUseCase`, `IAgentRunRepository`, `IPhaseTimingRepository`, `IInteractiveSessionRepository`, computes deltas, derives crash/lifecycle/PR-change events, and builds `NotificationEvent` payloads — hundreds of lines of core logic inside a Next.js route handler. Rule: "Logic Lives in Core, Not Presentation".
- **Suggested fix:** Introduce a `StreamAgentEventsUseCase` (or event bus) that yields `NotificationEvent`s; route only adapts to SSE framing.
- **Found during:** research

### 5. SSE route imports infrastructure directly
- **File:** `src/presentation/web/app/api/agent-events/route.ts:29`
- **Severity:** Critical
- **Observation:** `import { isProcessAlive } from '@shepai/core/infrastructure/services/process/is-process-alive'` — presentation importing from infrastructure.
- **Suggested fix:** Hide the liveness check behind a use case / application port; presentation never reaches into `infrastructure/`.
- **Found during:** research

### 6. SSE route hardcodes raw-string event types for interactive sessions
- **File:** `src/presentation/web/app/api/agent-events/route.ts:107-115,365-402`
- **Severity:** Minor
- **Observation:** `InteractiveSessionEvent.type` is a string union of `'interactive_session_booting' | 'interactive_session_ready' | ...` defined inline in the route. Domain concept expressed as magic literals — should be a TypeSpec enum.
- **Suggested fix:** Add an `InteractiveSessionEventType` enum in `tsp/` and reuse it across SSE + client.
- **Found during:** research

### 7. SSE route holds a duplicate `LIFECYCLE_TO_NODE` mapping
- **File:** `src/presentation/web/app/api/agent-events/route.ts:55-69`
- **Severity:** Major
- **Observation:** Per `src/presentation/web/CLAUDE.md` the same SdlcLifecycle→node-name mapping also exists client-side in `derive-feature-state.ts`. Two+ copies of a domain mapping is exactly the "two = coincidence, three = pattern" rule.
- **Suggested fix:** Extract to a single shared mapping in the core/application layer and consume it from both sides.
- **Found during:** research

### 8. Application page component contains dev-server orchestration logic
- **File:** `src/presentation/web/components/features/application-page/application-page.tsx:747-807`
- **Severity:** Major
- **Observation:** The React component decides when to stop/restart the dev server based on agent turn status, tracks `wasRunningBeforeAgentRef`, auto-switches tabs on Ready, and prevents web-tab selection while the agent runs. That's orchestration, not UI state — it should live behind a use case or at least a presentation-agnostic state machine returned by a hook-over-use-case.
- **Suggested fix:** Introduce a `CoordinateApplicationDevServerUseCase` (or a dedicated hook that calls it) so CLI/TUI/Web share the same behavior; the component only renders.
- **Found during:** research

### 9. Application page file length
- **File:** `src/presentation/web/components/features/application-page/application-page.tsx:1-867`
- **Severity:** Minor
- **Observation:** 867 lines in a single file holding `ApplicationPage`, `AppTopBar`, `PathCluster`, `GitStatusCluster`, `SessionChip`, `CopyPromptButton`, `DeleteButton`, `StatusPill`, `ViewSwitcher`, `ResizableSplit`, and `ViewBody`. Well over the ~300-line refactor signal.
- **Suggested fix:** Split each subcomponent into its own file under the same folder.
- **Found during:** research

### 10. Commit / Commit-&-Push buttons contain placeholder logic in component
- **File:** `src/presentation/web/components/features/application-page/application-page.tsx:242-252`
- **Severity:** Minor
- **Observation:** `handleCommit` / `handleCommitPush` log "not wired up yet" toasts directly inside the component instead of calling a use case. When wired up, that business logic must NOT live in JSX.
- **Suggested fix:** Add `CommitApplicationChangesUseCase` + `CommitAndPushApplicationChangesUseCase`; component just calls them.
- **Found during:** research

### 11. `app-` featureId prefix is a magic literal shared across layers
- **File:** `packages/core/src/application/use-cases/applications/create-application.use-case.ts:246,292` and `src/presentation/web/components/features/application-page/application-page.tsx:140,489,750,822`
- **Severity:** Minor
- **Observation:** The `app-${id}` / `feat-${id}` prefix convention is duplicated as raw string literals and regex (`/^app-/`) in both core and presentation. That's a domain concept (feature-id namespace) expressed as a magic string.
- **Suggested fix:** Expose helpers like `featureIdForApplication(id)` / `applicationIdFromFeatureId(id)` in the domain layer and use them everywhere.
- **Found during:** research

### 12. Container file length
- **File:** `packages/core/src/infrastructure/di/container.ts:1-831`
- **Severity:** Minor
- **Observation:** 831 lines in a single DI bootstrap file. Bootstrap code is exempt from the singleton rule but not from focus/size — it's becoming hard to navigate.
- **Suggested fix:** Split registration into grouped modules (repositories, services, use cases, agents, deployment) imported from `container.ts`.
- **Found during:** research

### 13. `console.log`/`console.warn`/`console.error` used inside use cases and SSE route
- **File:** `packages/core/src/application/use-cases/workflows/run-workflow.use-case.ts:115-116`, `packages/core/src/application/use-cases/applications/create-application.use-case.ts:301-302`, `src/presentation/web/app/api/agent-events/route.ts:148,418`
- **Severity:** Minor
- **Observation:** Application layer and presentation layer both reach for raw `console` instead of an injected logging port; an `// eslint-disable` per site is a code smell that a logging port would erase.
- **Suggested fix:** Introduce `ILogger` in `application/ports/output/services` and inject it into use cases; presentation uses its own adapter.
- **Found during:** research
- **Status:** **Partially fixed** — `ILogger` port and `ConsoleLogger` adapter shipped in phase 4; existing call sites NOT migrated yet. New cloud-deploy use cases use `ILogger` from the start.

---

## Phase 2 — Application / Domain structural audit (post-research, user-requested)

The user inspected `packages/core/src/application/` and `packages/core/src/domain/` after implementation and noted that **the application layer should contain only `ports/` and `use-cases/`, not `services/` or `workflows/`**. Audit findings below. All entries marked `Found during: post-impl-audit`.

### 14. `application/services/` directory exists
- **File:** `packages/core/src/application/services/agents/agent-session-repository.registry.ts`
- **Severity:** Major
- **Observation:** The application layer has a `services/` sibling to `ports/` and `use-cases/`. Per the user's architecture rule, application-layer code lives in only those two folders. Services are infrastructure concerns; shared application-layer logic, if any, should be a use case or a pure helper colocated with the use cases that need it.
- **Suggested fix:** Move `AgentSessionRepositoryRegistry` to `infrastructure/services/agents/`. Use cases keep their existing injection token unchanged; only the physical location changes. Delete the empty `application/services/` tree.
- **Found during:** post-impl-audit

### 15. `application/workflows/` directory exists
- **File:** `packages/core/src/application/workflows/application-creation.workflow.ts`
- **Severity:** Major
- **Observation:** Same category as #14. `workflows/` is a third top-level folder in `application/` that shouldn't exist. An "application creation workflow" describing ordered steps is a **use case** (`RunApplicationCreationWorkflowUseCase`) or an infrastructure adapter with a use-case entry point — never a free-standing `workflows/` concept.
- **Suggested fix:** Move `application-creation.workflow.ts` contents under `application/use-cases/applications/workflows/` (as a private helper of the existing workflow use case) OR under `infrastructure/services/workflows/` if it describes concrete step execution. Delete the empty `application/workflows/` tree.
- **Found during:** post-impl-audit

### 16. Application-layer class imports tsyringe directly and calls `container.resolve`
- **File:** `packages/core/src/application/services/agents/agent-session-repository.registry.ts:14-28`
- **Severity:** **Critical**
- **Observation:** The registry imports `container` and `injectable` from `tsyringe` and calls `container.resolve<IAgentSessionRepository>(...)` inside the application layer. tsyringe is an **infrastructure concern** (the DI framework). The application layer must remain framework-agnostic so the same use cases can run in tests, CLI, TUI, and Web without pulling in a DI container. My new `CloudDeploymentProviderRegistry` (correctly placed in `infrastructure/`) has the same shape and demonstrates the right home for this pattern.
- **Suggested fix:** Define `IAgentSessionRepositoryRegistry` as a port in `application/ports/output/agents/`, move the concrete class to `infrastructure/services/agents/agent-session-repository.registry.ts`, and inject it by token (`'IAgentSessionRepositoryRegistry'`). Tests inject a fake.
- **Found during:** post-impl-audit

### 17. Thirteen use-case files import from `infrastructure/` directly
- **Files** (application → infrastructure imports):
  - `application/use-cases/agents/approve-agent-run.use-case.ts:23-24` → `infrastructure/services/agents/feature-agent/nodes/node-helpers.js`, `infrastructure/services/ide-launchers/compute-worktree-path.js`
  - `application/use-cases/agents/check-agent-auth.use-case.ts:22` → `infrastructure/services/settings.service.js`
  - `application/use-cases/agents/get-agent-session.use-case.ts:11` → `infrastructure/services/settings.service.js`
  - `application/use-cases/agents/list-agent-sessions.use-case.ts:11` → `infrastructure/services/settings.service.js`
  - `application/use-cases/agents/reject-agent-run.use-case.ts:25-27` → three infrastructure imports (node-helpers, phase-timing-context, compute-worktree-path)
  - `application/use-cases/agents/stop-agent-run.use-case.ts:12` → `phase-timing-context.js`
  - `application/use-cases/deployments/start-feature-deployment.use-case.ts:25` → `compute-worktree-path.js`
  - `application/use-cases/features/create/create-feature.use-case.ts:36,39` → `settings.service.js`, `attachment-storage.service.js`
  - `application/use-cases/features/rebase-feature-on-main.use-case.ts:24` → `conflict-resolution.service.js`
  - `application/use-cases/ide/launch-ide.use-case.ts:15` → `compute-worktree-path.js`
  - `application/use-cases/settings/check-onboarding-status.use-case.ts:8` → `settings.service.js`
  - `application/use-cases/tools/launch-tool.use-case.ts:12` → `tool-metadata.js`
  - `application/use-cases/tools/list-tools.use-case.ts:14` → `tool-metadata.js`
- **Severity:** **Critical**
- **Observation:** This is the single most-violated rule in the repo. The application layer must depend inward only (on domain + its own ports). Several recurring offenders:
  - `getSettings()` singleton from `infrastructure/services/settings.service.ts` — imported by 5 use cases. This bypasses `ISettingsRepository` entirely.
  - `computeWorktreePath()` pure helper in `infrastructure/services/ide-launchers/` — imported by 3 use cases. It's a pure function but lives in the wrong layer.
  - `TOOL_METADATA` constants from `infrastructure/services/tool-installer/` — imported by 2 use cases.
  - `node-helpers.js`, `phase-timing-context.js`, `conflict-resolution.service.js`, `attachment-storage.service.ts` — each imported directly by a use case.
- **Suggested fix:** Per offender —
  1. **`getSettings()`** — delete the module-level singleton; inject `ISettingsRepository` into the 5 use cases. (This also resolves the "No Singletons" rule violation.)
  2. **`computeWorktreePath()`** — move to `domain/shared/worktree-path.ts` (it's a pure function over repo + branch strings). Domain can be safely imported by both application and infrastructure.
  3. **`TOOL_METADATA`** — move to `domain/shared/tool-metadata.ts` or expose through an `IToolMetadataProvider` port.
  4. **`node-helpers`, `phase-timing-context`, `conflict-resolution.service`, `attachment-storage.service`** — each needs a matching port in `application/ports/output/` and the use cases should inject the port, not import the infrastructure implementation.
- **Found during:** post-impl-audit

### 18. `application/ports/output/index.ts` re-exports hide boundary violations
- **File:** `packages/core/src/application/ports/output/services/index.ts`
- **Severity:** Minor
- **Observation:** The port barrel re-exports types; if any future port accidentally pulls a concrete class from `infrastructure/` via a transitive re-export, it would go unnoticed. Not currently broken — flagged as a preventive observation.
- **Suggested fix:** Add a lint rule (`no-restricted-imports` with pattern `**/infrastructure/**`) scoped to `packages/core/src/application/**` to turn any such regression into a CI error.
- **Found during:** post-impl-audit

### 19. `application/use-cases/cloud-deploy/select-cloud-provider.use-case.ts` hosts `ApplicationNotFoundError`
- **File:** `packages/core/src/application/use-cases/cloud-deploy/select-cloud-provider.use-case.ts:7-12`
- **Severity:** Minor
- **Observation:** `ApplicationNotFoundError` is a domain-level error re-used by multiple use cases (get-status, create-git-remote, initiate-deploy all import it from the select use-case file). It should live in `domain/errors/` alongside `session-not-found.error.ts`.
- **Suggested fix:** Move to `packages/core/src/domain/errors/application-not-found.error.ts` and update the three importers.
- **Found during:** post-impl-audit (introduced in this spec)

### 20. Domain layer is clean
- **Files:** `packages/core/src/domain/**`
- **Severity:** (none — note)
- **Observation:** Grep for outward imports (`from '[^']*infrastructure/'`, `from '[^']*application/'`, `tsyringe`) in `packages/core/src/domain/` returns **zero results** across 14 files. Domain is the only layer that fully respects the dependency rule today. `domain/shared/feature-id.ts` (new in this spec) and existing value-objects / factories / errors / generated types all stay within domain.
- **Found during:** post-impl-audit

---

## Summary

| Severity | Count | Status |
| -------- | ----- | ------ |
| Critical | **6** (#1, #2, #4, #5, #16, #17) | 0 fully fixed, 1 partial |
| Major | **4** (#3, #7, #8, #14, #15) | 0 fixed |
| Minor | **10** (#6, #9-#13, #18-#20) | 1 partial (#13), 2 preventively addressed by new-code discipline |
| **Total** | **20 violations across two passes** | **~2 fully fixed, ~2 partial, 16 outstanding** |

### What this PR fixed
- #11 (partial) — feature-id helper created in `domain/shared/feature-id.ts`; not yet adopted by the 7 existing callers in `create-application.use-case.ts`, `delete-application.use-case.ts`, `list-applications.use-case.ts`, `resume-application-workflow.use-case.ts`, `application-page.tsx`, etc.
- #13 (partial) — `ILogger` port + `ConsoleLogger` adapter shipped; existing `console.*` sites NOT migrated; new cloud-deploy use cases use `ILogger` from day one.
- #6 (partial) — `InteractiveSessionEventType` TypeSpec enum added; SSE route NOT yet migrated to use it (still declares a string union inline).

### What this PR deliberately did NOT fix
- **#1, #2, #3** — `deploy-application.ts` server action refactor (`StartApplicationDeploymentUseCase`). High risk, unrelated to cloud deploy.
- **#4, #5, #7** — `/api/agent-events/route.ts` orchestration extraction. ~300 lines of business logic; dedicated refactor needed.
- **#8, #9, #10** — `application-page.tsx` split + dev-server coordinator hook + commit button use cases. 867-line file; invasive.
- **#12** — `container.ts` modular split. Low-risk move; deferred to keep the PR focused.
- **#14, #15** — `application/services/` and `application/workflows/` directory cleanup. Touches pre-existing code; deferred.
- **#16** — `AgentSessionRepositoryRegistry` relocation to infrastructure. One-file move + port interface, but would need every importer updated.
- **#17** — **Thirteen use cases** that import from `infrastructure/`. This is the biggest and the most impactful; each offender needs its own PR-sized fix (either a new port or moving the helper to `domain/`).
- **#18** — Preventive lint rule addition.
- **#19** — `ApplicationNotFoundError` relocation to `domain/errors/`.

### Recommended next steps

A dedicated follow-up PR (`feat/090-clean-arch-cleanup` or similar) scoped purely to violations #14–#19 would be straightforward — they're all either one-file moves or small refactors. Violations #17's 13 files can be further split into:
- **#17a**: delete `getSettings()` singleton, inject `ISettingsRepository` into 5 use cases (high-impact, low-risk — singleton elimination)
- **#17b**: move `computeWorktreePath`, `TOOL_METADATA` to `domain/shared/` (pure moves)
- **#17c**: add ports for `node-helpers`, `phase-timing-context`, `conflict-resolution`, `attachment-storage` (each is a 1–2 file change)

The invasive refactors (#1–#10, #12) should each get their own PR so CI review remains tractable.

---

## Phase 3 — Phase-14 re-audit (application layer only)

Post-implementation re-audit of `packages/core/src/application/` on 2026-04-14 to verify:
1. No regressions from the 089 cloud-deploy feature work.
2. Error relocation promises fulfilled (all 6 errors moved from application ports to domain/errors/).
3. Presentation routes correctly use type-only imports for use cases.
4. New cloud-deploy use cases follow clean architecture.

**Result: Only 1 new finding (console.warn in cleanup-feature-worktree.use-case.ts — part of existing #13 pattern).**

### 21. Additional `console.warn` calls in cleanup-feature-worktree use case
- **File:** `packages/core/src/application/use-cases/features/cleanup-feature-worktree.use-case.ts:43,49,58,72`
- **Severity:** Minor
- **Observation:** Four `console.warn` calls with eslint-disable comments (lines 43, 49, 58, 72) performing error logging in the use case layer. This follows the same pattern as #13 (console.* in application layer). The calls are prefixed with contextual tags (`[CleanupFeatureWorktreeUseCase]`) and log legitimate failure states (worktree remove, prune, branch deletion), but should use the injected `ILogger` port instead of raw `console`.
- **Suggested fix:** Inject `ILogger` as a dependency and replace all four `console.warn` calls with `this.logger.warn()`. Batch this cleanup into the #13 migration task (t-71).
- **Found during:** clean-arch-audit

---

## Phase-14 re-audit summary

**New findings:** 1 (already tracked as part of #13 pattern)
**Outstanding violations:** 20 (unchanged)
**New code quality (cloud-deploy use cases):** ALL CLEAN (6/6 use cases)

### Status changes

- **#19 / #19a (RESOLVED)** — All six cloud-deploy error classes successfully relocated to `domain/errors/`:
  - `ApplicationNotFoundError` → `domain/errors/application-not-found.error.ts`
  - `ApplicationNotReadyError` → `domain/errors/application-not-ready.error.ts`
  - `NoProviderSelectedError` → `domain/errors/no-provider-selected.error.ts`
  - `BuildOutputNotFoundError` → `domain/errors/build-output-not-found.error.ts`
  - `CloudProviderNotConnectedError` → `domain/errors/cloud-provider-not-connected.error.ts`
  - `ProviderNotImplementedError` → `domain/errors/provider-not-implemented.error.ts`
  - Cloud-deployment-provider.interface.ts no longer hosts error classes.
  - All importers updated (select-provider, initiate-deploy, get-status, create-git-remote, ensure-gh-authenticated, connect-provider use cases).

- **Cloud-deploy routes (VERIFIED CLEAN)**
  - `/api/applications/[id]/cloud-deploy/initiate/route.ts`: Uses `type` import for use case ✓
  - Error classes imported as values from domain/ ✓
  - No infrastructure leakage ✓
  - No singletons ✓
  - No magic literals ✓

- **Application layer net change:** SAME SHAPE
  - No new violations introduced by 089 feature work.
  - Pre-existing violations (#1-#20) remain outstanding.
  - One new minor finding (console.warn in cleanup-feature-worktree) bundled with existing #13 task.

**Verdict:** Phase-14 cloud-deploy implementation maintains clean architecture discipline. All new code is in compliance. Error relocation promise fulfilled. Application layer is neither worse nor better than the prior audit — the 20 outstanding violations remain, but no new architectural debt was incurred by this feature.

---

## Phase-14 re-audit (domain layer) — 2026-04-14

Fresh domain-layer audit of `packages/core/src/domain/` to verify:
1. Six new error classes follow clean architecture pattern.
2. No outward imports (from infrastructure/, application/, presentation/, or external I/O libraries).
3. No decorators, singletons, console calls, or magic literals.

**Finding:** Domain layer contains a critical pre-existing violation not captured in the prior audit (#20). The violation exists in a factory predating feature 089 and was missed because the prior grep only checked for `infrastructure/` and `application/` imports, not `node:*` built-ins or module-level singletons.

### 22. Domain factory imports Node.js I/O libraries (filesystem, crypto, path, URL)
- **File:** `packages/core/src/domain/factories/spec-yaml-parser.ts:9-15,29-40,45-49`
- **Severity:** Critical
- **Observation:** The spec-yaml-parser factory imports `node:fs` (`existsSync`, `readdirSync`, `readFileSync`), `node:path` (`dirname`, `join`), `node:crypto` (`randomUUID`), and `node:url` (`fileURLToPath`) to perform file I/O at initialization. Domain layer must have **zero external dependencies** including Node.js built-ins for I/O. Per the rule: "domain/` must contain only pure TypeScript + domain-internal imports." This file performs schema resolution by searching the filesystem — that's an infrastructure concern. Additionally, the file is used inside a browser context (TypeSpec compilation), making Node.js imports problematic for universal code.
- **Suggested fix:** Move `spec-yaml-parser.ts` to `infrastructure/factories/` or `infrastructure/services/spec-parser/`. Define a port in `application/ports/output/services/spec-parser.interface.ts` for parsing (input: YAML string, output: typed artifact). Use cases and CLI/Web call through the port, never directly importing the parser. Inject the implementation.
- **Found during:** clean-arch-audit (t-62 phase-14 cleanup)

### 23. Domain factory contains module-level singleton with lazy getter
- **File:** `packages/core/src/domain/factories/spec-yaml-parser.ts:57-63`
- **Severity:** Major
- **Observation:** Lines 57-62 define a module-level mutable variable `let _ajv: Ajv2020 | null = null` with a lazy-getter function `getValidator()` that initializes and caches an AJV validator on first call. This is a singleton pattern explicitly banned outside infrastructure bootstrapping. Singletons in core layers prevent testing (shared state across test runs), make dependency injection impossible, and break the rule "No singletons or module-level mutable state outside infrastructure bootstrapping."
- **Suggested fix:** When moving to infrastructure, inject the AJV validator (or a parser service wrapping it) via DI instead of lazy-loading it in the factory. Tests inject a mock parser. The singleton initialization moves to `infrastructure/di/container.ts` where it belongs.
- **Found during:** clean-arch-audit (t-62 phase-14 cleanup)

---

## Phase-14 domain-layer audit summary

**New findings:** 2 (Critical + Major severity — both pre-existing, not introduced by 089)

**Six new error classes (verified CLEAN):**
- `ApplicationNotFoundError` — 14 lines, zero imports, follows `SessionNotFoundError` pattern exactly ✓
- `ApplicationNotReadyError` — 14 lines, zero imports ✓
- `NoProviderSelectedError` — 15 lines, zero imports ✓
- `BuildOutputNotFoundError` — 17 lines, zero imports ✓
- `CloudProviderNotConnectedError` — 14 lines, zero imports ✓
- `ProviderNotImplementedError` — 14 lines, zero imports ✓

**Domain-layer verdict:** The six new error classes are architecturally clean and correctly placed. However, the audit revealed that finding #20 ("Domain layer is clean") was incomplete — it missed the pre-existing violations in `spec-yaml-parser.ts` because the prior scan only checked for `infrastructure/` and `application/` imports, not Node.js built-in I/O libraries or singletons. The dependency rule is still mostly respected (no outer-to-inner cross-layer imports), but the domain layer contains two violations of the "pure code, no I/O, no singletons" requirements.


## Phase-14 re-audit (presentation layer) — 2026-04-14

Fresh audit of `src/presentation/` to verify:
1. New cloud-deploy UI components follow mandatory storybook rule.
2. No new infrastructure imports in routes or actions.
3. No magic string literals for domain concepts.
4. No console.* calls in presentation layer.

**Result: 5 NEW findings, all Minor severity.**

### 24. React component missing colocated .stories.tsx file
- **File:** `src/presentation/web/components/features/application-page/connect-provider-modal.tsx:1-100`
- **Severity:** Major
- **Observation:** The `ConnectProviderModal` React component (token paste dialog for cloud providers) has no colocated `.stories.tsx` file. Per the MANDATORY rule: "Every web UI component MUST have a colocated `.stories.tsx` file. Commits without stories will be rejected."
- **Suggested fix:** Create `src/presentation/web/components/features/application-page/connect-provider-modal.stories.tsx` with stories for idle state, loading state, error state, and success states.
- **Found during:** clean-arch-audit

### 25. React component missing colocated .stories.tsx file
- **File:** `src/presentation/web/components/features/application-page/provider-dropdown.tsx:1-80`
- **Severity:** Major
- **Observation:** The `ProviderDropdown` React component (cloud-provider selection dropdown) has no colocated `.stories.tsx` file. Violates the mandatory storybook rule.
- **Suggested fix:** Create `src/presentation/web/components/features/application-page/provider-dropdown.stories.tsx` with stories for enabled/disabled/connected/disconnected providers and user interactions.
- **Found during:** clean-arch-audit

### 26. console.error call in SSE route
- **File:** `src/presentation/web/app/api/deployment-logs/route.ts:106`
- **Severity:** Minor
- **Observation:** `console.error('[SSE route] GET /api/deployment-logs error:', error)` with an `// eslint-disable-next-line no-console` comment. Presentation layer should not reach for raw `console` when error logging is needed. The ILogger port exists (shipped in phase 4).
- **Suggested fix:** Replace with a call to an injected `ILogger` port, following the pattern in new cloud-deploy use cases.
- **Found during:** clean-arch-audit

### 27. Magic string literals for DeploymentState enum
- **File:** `src/presentation/web/hooks/deployment-status-provider.tsx:44-46`
- **Severity:** Minor
- **Observation:** Lines 44-46 define `const ACTIVE_STATES: ReadonlySet<DeploymentState> = new Set(['Booting', 'Ready'] as DeploymentState[])` using raw string literals instead of the TypeSpec-generated enum values `DeploymentState.Booting` and `DeploymentState.Ready`.
- **Suggested fix:** Replace with `new Set([DeploymentState.Booting, DeploymentState.Ready])`.
- **Found during:** clean-arch-audit

### 28. Magic string literal for DeploymentState enum
- **File:** `src/presentation/web/hooks/deployment-status-provider.tsx:110`
- **Severity:** Minor
- **Observation:** Line 110: `if (!result || result.state === 'Stopped')` uses the raw string literal `'Stopped'` instead of `DeploymentState.Stopped`.
- **Suggested fix:** Replace with `result.state === DeploymentState.Stopped`.
- **Found during:** clean-arch-audit

---

## Phase-14 presentation-layer audit summary

**New findings:** 5 (2 Major / 3 Minor)

**Cloud-deploy routes (VERIFIED CLEAN):**
- `/api/cloud-providers/route.ts` — uses use case correctly ✓
- `/api/applications/[id]/cloud-deploy/select-provider/route.ts` — uses use case correctly ✓
- `/api/applications/[id]/cloud-deploy/status/route.ts` — uses use case correctly ✓
- `/api/applications/[id]/cloud-deploy/initiate/route.ts` — fire-and-forget pattern, uses use case correctly ✓
- CLI deploy commands — uses use case + event bus correctly ✓

**Cloud-deploy React components:**
- `DeployButton` — clean, has stories ✓
- `DeploymentStatusBadge` — clean, has stories ✓
- `useCloudDeployAction` hook — clean, no infrastructure imports ✓
- `DeploymentStatusProvider` hook — clean except for 2 magic literals (#27, #28) ✓

**New code quality:** Cloud-deploy feature maintains overall clean architecture. Routes use use-case boundary correctly. Components have minimal business logic. Two components violate the mandatory storybook rule (Major severity). Three instances of magic literals for domain enums (Minor).

**Verdict:** Phase-14 cloud-deploy presentation code is architecturally sound but has 5 quality/completeness findings. The two missing story files are release blockers per the codebase rule. The magic-literal findings are minor stylistic improvements. No dependency-rule violations detected in new code.

