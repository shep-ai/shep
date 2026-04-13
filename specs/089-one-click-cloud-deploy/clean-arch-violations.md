# Clean Architecture Violations — Incremental Log

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
