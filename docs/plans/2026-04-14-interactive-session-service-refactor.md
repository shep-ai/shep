# Interactive Session Service — Refactor Findings & Plan

**Date:** 2026-04-14
**Target:** [packages/core/src/infrastructure/services/interactive/interactive-session.service.ts](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts)
**Current size:** 1576 lines, one class, ~10 mixed responsibilities

---

## 1. Post-pull review — what changed on main

Pulled `main` fast-forward from `3349156b` → `29342f80d` (one commit: `feat: one-click cloud deploy for applications (spec 089) (#554)`).

### 1.1 Changes inside the target file

Only one self-contained change touched this file — a correctness fix, not a structural one. 43 lines added, 12 removed:

1. **New private field `lastMessageTs` + helper `nextMessageDate()`** ([interactive-session.service.ts:146-157](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L146-L157), [interactive-session.service.ts:1461-1476](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1461-L1476))
   - Monotonic clock: `max(Date.now(), lastMessageTs + 1)`.
   - Reason stated in-file: `Date.now()` has millisecond resolution, and the Claude SDK fires `tool_use` + `tool_result` in the same millisecond. Two rows with identical `created_at` break `ORDER BY created_at ASC` in `interactiveMessageRepo.findByFeatureId`, which breaks the tool→Output pairing in `StepTracker.classifyMessages` on the frontend.
   - The counter is **process-wide** (one per `InteractiveSessionService` instance), not per session — deliberately, because it guards message ordering within the shared `messages` table regardless of which session wrote the row.

2. **`persistToolEvent` and `flushAssistantBuffer` now consume `this.nextMessageDate()`** instead of `new Date()` ([interactive-session.service.ts:1415-1424](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1415-L1424), [interactive-session.service.ts:1445-1456](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1445-L1456)).

3. **Five `void this.persistToolEvent(...)` calls rewritten as `await this.persistToolEvent(...)`** inside both the boot stream loop and the turn stream loop:
   - `thinking` event ([interactive-session.service.ts:431](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L431), [interactive-session.service.ts:694](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L694))
   - `tool_use` event ([interactive-session.service.ts:445](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L445), [interactive-session.service.ts:708](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L708))
   - `tool_result` event ([interactive-session.service.ts:459](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L459), [interactive-session.service.ts:722](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L722))
   - `task_started` event ([interactive-session.service.ts:811](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L811))
   - `task_done` event ([interactive-session.service.ts:830](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L830))
   - Together with the monotonic clock, this guarantees that each tool-event row is fully persisted before the next call observes `lastMessageTs`. Firing them in parallel via `void` could race against the counter and silently re-introduce duplicates.

### 1.2 Relevant changes elsewhere on main

- **[application/ports/output/services/logger.interface.ts](../../packages/core/src/application/ports/output/services/logger.interface.ts)** is NEW on main. It's the `ILogger` port I had previously recommended adding as step 6 of the original plan. The port already exists — so the refactor can just inject it; no new port to create.
- **[application/ports/output/services/interactive-session-service.interface.ts](../../packages/core/src/application/ports/output/services/interactive-session-service.interface.ts)** is UNCHANGED by the pull. The refactor stays internal to `infrastructure/`.
- **No `ISettingsProvider` port exists yet.** The file still imports `getSettings` / `hasSettings` singletons from [settings.service.ts](../../packages/core/src/infrastructure/services/settings.service.ts) at lines [44](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L44), [1395](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1395), [1403](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1403), [1572](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1572) — that port still needs to be added as part of this refactor.
- **Many other new ports** were added alongside the cloud-deploy feature (cloud provider registry, event bus, operation log, worktree path provider, etc.) — none relevant to this refactor. They do demonstrate that the team is already splitting services via per-concern port interfaces, so the approach below fits the repo style.

### 1.3 Impact on the original refactor plan

| Original plan item | Impact |
|---|---|
| **Action 3 — `SessionPersistence`** | Must now also own `lastMessageTs` + `nextMessageDate()`. The monotonic counter is a persistence concern, not session state. It stays **process-singleton inside the persistence module**, NOT per-session. |
| **Action 7 — `AgentStreamConsumer`** | MUST preserve the `await this.persistToolEvent(...)` sequencing. This is no longer a cosmetic choice — it is an **ordering invariant** the frontend depends on. Any extraction that reintroduces `void`-fire-and-forget will regress tool→Output pairing in `StepTracker.classifyMessages` and must fail review. Document this in the stream consumer's doc comment. |
| **Action 19 — drop `console.*`** | `ILogger` port already exists on main — no port to create, just inject it. Removes one step. |
| **Actions 1, 2, 4, 5, 6, 8–18, 20** | Unchanged. |

The line count went from 1545 to 1576 — the file grew, not shrank. The refactor is MORE justified post-pull, not less.

---

## 2. Repository conventions that shape the plan

Two conventions govern file placement:

- **Tests live in a separate mirrored tree** at [tests/unit/infrastructure/services/interactive/](../../tests/unit/infrastructure/services/interactive/) — **not colocated**. Current tests already live there: [interactive-session.service.test.ts](../../tests/unit/infrastructure/services/interactive/interactive-session.service.test.ts), [feature-context.builder.test.ts](../../tests/unit/infrastructure/services/interactive/feature-context.builder.test.ts). Every new collaborator gets its test at `tests/unit/<mirror-of-src-path>.test.ts`.
- **Complex service folders are subgrouped.** [packages/core/src/infrastructure/services/agents/](../../packages/core/src/infrastructure/services/agents/) — the other large service in the repo — already uses semantic subfolders (`sessions/`, `streaming/`, `common/`, `application-creation/`, `analyze-repo/`, `feature-agent/`, `conflict-resolution/`). With ~15 production files the interactive service qualifies for the same treatment.

---

## 3. Refactoring plan (single-row action items)

Target: a thin `InteractiveSessionService` facade (~200 lines) at the root of [packages/core/src/infrastructure/services/interactive/](../../packages/core/src/infrastructure/services/interactive/), composing small single-responsibility collaborators organised into four semantic subfolders (`core/`, `lifecycle/`, `runtime/`, `api/`). All collaborators stay inside the `infrastructure/` layer — no new application ports except `ISettingsProvider` (action 4a).

1. **Extract `SessionState` + `SessionRegistry`** → new `interactive/core/session-registry.ts`. Move `SessionState` interface ([62-99](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L62-L99)), `sessions` map, `stoppedAgentSessionIds`, `activeStepByFeature`, and `findActiveStateForFeature` ([1378-1384](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1378-L1384)). Expose typed getters/setters only — no business logic.

2. **Extract `StreamEventDispatcher`** → new `interactive/core/stream-event-dispatcher.ts`. Owns `featureSubscribers`, `globalSubscribers`, session subscribers, plus `subscribe` / `subscribeByFeature` / `subscribeAll` ([939-947](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L939-L947), [1180-1203](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1180-L1203)) and `notify` / `notifyByFeatureId` ([1486-1506](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1486-L1506)). Pure pub/sub — no DB, no state.

3. **Extract `SessionPersistence`** → new `interactive/core/session-persistence.ts`. Consolidates `persistMessage` ([1518-1528](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1518-L1528)), `updateSessionStatusAndNotify` ([1533-1549](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1533-L1549)), `updateTurnStatusAndNotify` ([1552-1563](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1552-L1563)), `flushAssistantBuffer` ([1445-1459](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1445-L1459)), `persistToolEvent` ([1407-1430](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1407-L1430)), **AND the new monotonic clock** (`lastMessageTs` field at [146-157](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L146-L157) + `nextMessageDate()` at [1461-1476](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1461-L1476)). The counter is module-private state of this collaborator — registered as a **singleton inside the DI container** so one instance guards the whole process. Deps: `IInteractiveMessageRepository`, `IInteractiveSessionRepository`, `SessionRegistry` (for `activeStepByFeature` read), `StreamEventDispatcher`.

4. **Extract `AgentConfigResolver`** → new `interactive/lifecycle/agent-config.resolver.ts`. Moves `resolveAgentType` ([1391-1399](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1391-L1399)), `resolveAuthConfig` ([1402-1411](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1402-L1411)), and `getCap` ([1571-1575](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1571-L1575)). Takes an injected `ISettingsProvider` (see 4a) so this file stops importing `getSettings` / `hasSettings` from [settings.service.ts](../../packages/core/src/infrastructure/services/settings.service.ts) at [44](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L44).

4a. **Add application port `ISettingsProvider`** → new [settings-provider.interface.ts](../../packages/core/src/application/ports/output/services/settings-provider.interface.ts). Minimal shape `{ has(): boolean; get(): ShepSettings }`. Adapter `interactive/lifecycle/settings-provider.adapter.ts` wraps the existing [settings.service.ts](../../packages/core/src/infrastructure/services/settings.service.ts) singleton. This is the one real clean-arch fix — removes the singleton violation flagged by [.claude/rules/code-quality.md](../../.claude/rules/code-quality.md) "No Singletons or Global State Outside Infrastructure Bootstrapping".

5. **Extract `UserInteractionCoordinator`** → new `interactive/runtime/user-interaction.coordinator.ts`. Moves `buildOnUserQuestionCallback` ([1329-1376](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1329-L1376)) and `respondToInteraction` ([1233-1274](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1233-L1274)). Owns `pendingInteraction` / `pendingInteractionResolver` lifecycle on `SessionState`.

6. **Extract `BootPromptResolver`** → new `interactive/lifecycle/boot-prompt.resolver.ts`. Pure function computing `(context, bootPrompt)` from `SessionState` + `IFeatureRepository` + `FeatureContextBuilder` — the three-case branch at [280-321](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L280-L321). Unit-testable without handles or streams.

7. **Extract `AgentStreamConsumer`** → new `interactive/runtime/agent-stream.consumer.ts`. Single method `consume(handle, state, { mode: 'boot' | 'turn', abortSignal })` owning the event switch shared between `completeBootAsync` ([410-517](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L410-L517)) and `executeAndPersistTurn` ([683-850](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L683-L850)) — kills the ~200-line duplication. **CRITICAL**: preserves the `await this.persistToolEvent(...)` sequencing from the recent fix — this is an ordering invariant, not cosmetic. Document it in the consumer's header comment.

8. **Extract `BootWatchdog`** → new `interactive/lifecycle/boot-watchdog.ts`. Moves `BOOT_IDLE_TIMEOUT_MS` + the idle-timer dance ([386-394](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L386-L394)). Exposes `start() / bump() / stop()` — trivial to unit-test with fake timers.

9. **Extract `SessionBootstrapper`** → new `interactive/lifecycle/session-bootstrapper.ts`. Owns `startSession` ([159-260](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L159-L260)) and `completeBootAsync` ([268-558](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L268-L558)). Depends on: `AgentConfigResolver`, `BootPromptResolver`, `AgentStreamConsumer`, `BootWatchdog`, `SessionRegistry`, `SessionPersistence`, `IAgentExecutorFactory`, `IInteractiveSessionRepository`.

10. **Extract `TurnExecutor`** → new `interactive/runtime/turn.executor.ts`. Owns `executeAndPersistTurn` ([646-892](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L646-L892)) + the per-session turn queue lock ([633-638](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L633-L638), [998-1003](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L998-L1003), [902-909](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L902-L909)). Delegates the stream event loop to `AgentStreamConsumer`. Exposes `enqueueTurn(state, prompt)`.

11. **Extract `SessionTerminator`** → new `interactive/lifecycle/session-terminator.ts`. Moves `stopSession` ([560-604](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L560-L604)) and `stopByFeature` ([1205-1209](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1205-L1209)). Replace the diagnostic `console.log(new Error().stack)` at [568-571](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L568-L571) with an injected `ILogger.debug` call.

12. **Extract `ChatStateAssembler`** → new `interactive/api/chat-state.assembler.ts`. Moves the 113-line `getChatState` ([1066-1178](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1066-L1178)) — read-only orchestration, no mutation.

13. **Extract `MessageDispatcher`** → new `interactive/api/message-dispatcher.ts`. Owns `sendMessage` ([606-641](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L606-L641)) and `sendUserMessage` ([960-1064](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L960-L1064)) — the model-change-restart logic and cold-boot-vs-hot-turn routing. Depends on: `SessionBootstrapper`, `TurnExecutor`, `SessionRegistry`, `SessionPersistence`.

14. **Extract `WorkflowOrchestratorHooks`** → new `interactive/api/workflow-hooks.ts`. Moves `setActiveStep` / `clearActiveStep` / `notifyWorkflowStep` / `waitForTurnDone` ([1280-1322](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L1280-L1322)). Small but a distinct audience (the orchestrator, not the chat UI).

15. **Re-shape `InteractiveSessionService` as a thin facade** ([interactive-session.service.ts](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts)) implementing `IInteractiveSessionService` by delegating to collaborators above. Lives at the root of `interactive/` (not in a subfolder). Target ≤200 lines, no private state, no direct repo access. Preserves the application port contract so nothing above `application/` has to change.

16. **Wire new collaborators in the DI container** — add constructions at the existing `new InteractiveSessionService(...)` site. Compose in dependency order: `core/*` → settings-provider adapter → `lifecycle/*` → `runtime/*` → `api/*` → facade. The facade is registered as the singleton binding for `IInteractiveSessionService`. `SessionPersistence` is the only collaborator registered as a process-singleton in its own right (so the monotonic clock is shared).

17. **Enforce subfolder layering with ESLint `no-restricted-imports`** — `core/*` MUST NOT import from `lifecycle/` / `runtime/` / `api/`; `lifecycle/*` MUST NOT import from `runtime/` / `api/`; `runtime/*` MUST NOT import from `api/`; `api/*` may import from all of the above. Add the rule to [eslint.config.mjs](../../eslint.config.mjs) so the layering is load-bearing, not aspirational.

18. **Strangler migration, one collaborator per commit**, per [.claude/rules/code-quality.md](../../.claude/rules/code-quality.md) "Refactor Before Extending". Order: (a) create `core/` subfolder + move registry + dispatcher (pure move) → (b) persistence with monotonic clock → (c) settings-provider port + lifecycle/ config resolver + adapter → (d) runtime/ stream consumer + lifecycle/ watchdog (kills duplication; carries ordering invariant) → (e) lifecycle/ bootstrapper + terminator + runtime/ turn executor + user-interaction coordinator + boot-prompt resolver → (f) api/ message dispatcher + chat-state assembler + workflow hooks → (g) facade reshape + delete dead code + add ESLint layering rule. Each commit runs full test suite green before moving on.

19. **Per-collaborator TDD tests in the mirrored test tree** — every new production file at `packages/core/src/infrastructure/services/interactive/<subfolder>/<file>.ts` gets a test at `tests/unit/infrastructure/services/interactive/<subfolder>/<file>.test.ts`. The existing [tests/unit/infrastructure/services/interactive/interactive-session.service.test.ts](../../tests/unit/infrastructure/services/interactive/interactive-session.service.test.ts) becomes a thin facade test; the meat moves into per-collaborator specs. **Must-have test for `SessionPersistence`** at [tests/unit/infrastructure/services/interactive/core/session-persistence.test.ts](../../tests/unit/infrastructure/services/interactive/core/session-persistence.test.ts): persisting 100 messages in a tight loop produces 100 strictly-increasing `createdAt` values even when `Date.now()` returns the same value for all calls (use `vi.useFakeTimers()` + `vi.setSystemTime()`). This codifies the recent fix so the refactor cannot regress it.

20. **Drop `/* eslint-disable no-console */` and `console.*` calls** scattered through the file ([482-488](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L482-L488), [542-543](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L542-L543), [568-571](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L568-L571), [770-774](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L770-L774), [866-869](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L866-L869), [893-894](../../packages/core/src/infrastructure/services/interactive/interactive-session.service.ts#L893-L894)) — each collaborator takes an injected `ILogger` from [logger.interface.ts](../../packages/core/src/application/ports/output/services/logger.interface.ts) (already on main, no port to create).

21. **Verify `IInteractiveSessionService` is unchanged** at [interactive-session-service.interface.ts](../../packages/core/src/application/ports/output/services/interactive-session-service.interface.ts). Run `pnpm typecheck && pnpm vitest run tests/unit/infrastructure/services/interactive` after each step per [.claude/rules/cicd.md](../../.claude/rules/cicd.md) pre-push sequence.

---

## 4. Clean-arch posture

- **No new application ports for the collaborators themselves** — they're infrastructure-private composition details. Creating `ITurnExecutor` / `IBootstrapper` / `IStreamConsumer` ports would be ceremony, not architecture.
- **One new port needed: `ISettingsProvider`** (action 4a) — removes the singleton violation.
- **Zero new exported domain models.** `SessionState` is infrastructure-private. All domain types already live in [domain/generated/output.ts](../../packages/core/src/domain/generated/output.ts) via TypeSpec — do NOT touch.
- **`ILogger` port already exists on main** — just inject it.
- **The `IInteractiveSessionService` port contract is unchanged** — the entire refactor is internal to `infrastructure/services/interactive/`.
- **Subfolder layering enforced via ESLint** (action 17) — `core/` ← `lifecycle/` ← `runtime/` ← `api/` ← facade. No upward imports; siblings don't cross-import. This matches the [agents/](../../packages/core/src/infrastructure/services/agents/) convention already in the repo.

---

## 5. Estimated sizes & final structure

### 5.1 Per-file size estimates

| Group | File | Est. lines |
|---|---|---:|
| root | `interactive-session.service.ts` (facade) | ~200 |
| root | `feature-context.builder.ts` *(existing, unchanged)* | — |
| `core/` | `session-registry.ts` | ~90 |
| `core/` | `stream-event-dispatcher.ts` | ~100 |
| `core/` | `session-persistence.ts` ★ monotonic clock | ~170 |
| `lifecycle/` | `agent-config.resolver.ts` | ~55 |
| `lifecycle/` | `settings-provider.adapter.ts` | ~25 |
| `lifecycle/` | `boot-prompt.resolver.ts` | ~75 |
| `lifecycle/` | `boot-watchdog.ts` | ~55 |
| `lifecycle/` | `session-bootstrapper.ts` | ~220 |
| `lifecycle/` | `session-terminator.ts` | ~90 |
| `runtime/` | `agent-stream.consumer.ts` ⭐ single event switch | ~230 |
| `runtime/` | `turn.executor.ts` | ~125 |
| `runtime/` | `user-interaction.coordinator.ts` | ~135 |
| `api/` | `message-dispatcher.ts` | ~165 |
| `api/` | `chat-state.assembler.ts` | ~145 |
| `api/` | `workflow-hooks.ts` | ~85 |
| *application* | `settings-provider.interface.ts` *(new port)* | ~20 |

### 5.2 Before vs after

| | Before | After |
|---|---:|---:|
| Production lines | **1576** (1 file) | **~1885** (15 files + 1 port) |
| Largest file | **1576** | **~230** (`agent-stream.consumer.ts`) |
| Largest class | **1 × 1576-line class** | **15 classes, each ≤230 lines** |
| Files over 300 lines | 1 | **0** ✅ ([code-quality.md](../../.claude/rules/code-quality.md) "File Length & Focus") |
| Hidden `getSettings()` singleton calls | 4 | **0** |
| Duplicated stream event switch | 2× (~280 lines) | **1×** (~230 lines) |

Growth: **~+19%** (309 lines). Normal cost of splitting (file headers, class decls, constructor signatures, imports, jsdoc). Each individual unit shrinks dramatically — biggest file drops 85% (1576 → 230), which is the real win.

### 5.3 Final production tree

```
packages/core/src/
│
├── application/ports/output/services/
│   ├── interactive-session-service.interface.ts     (unchanged)
│   ├── logger.interface.ts                           (already on main)
│   └── settings-provider.interface.ts                ★ NEW port (action 4a)
│
└── infrastructure/services/interactive/
    │
    ├── interactive-session.service.ts                ~200   ★ facade (was 1576)
    ├── feature-context.builder.ts                             (existing, unchanged)
    │
    ├── core/                                          ← shared plumbing, no business logic
    │   ├── session-registry.ts                       ~90
    │   ├── stream-event-dispatcher.ts                ~100
    │   └── session-persistence.ts                    ~170   ← owns monotonic clock
    │
    ├── lifecycle/                                     ← start / boot / stop a session
    │   ├── agent-config.resolver.ts                  ~55
    │   ├── settings-provider.adapter.ts              ~25
    │   ├── boot-prompt.resolver.ts                   ~75
    │   ├── boot-watchdog.ts                          ~55
    │   ├── session-bootstrapper.ts                   ~220
    │   └── session-terminator.ts                     ~90
    │
    ├── runtime/                                       ← what happens during a live session
    │   ├── agent-stream.consumer.ts                  ~230   ⭐ single event-switch source of truth
    │   ├── turn.executor.ts                          ~125
    │   └── user-interaction.coordinator.ts           ~135
    │
    └── api/                                           ← request-shaped entry & read operations
        ├── message-dispatcher.ts                     ~165
        ├── chat-state.assembler.ts                   ~145
        └── workflow-hooks.ts                         ~85
```

### 5.4 Final test tree (mirrored at `tests/unit/`)

Tests live in a **separate tree mirroring the production structure** — **not colocated** — per the repo convention ([tests/unit/infrastructure/services/interactive/](../../tests/unit/infrastructure/services/interactive/) already follows this pattern).

```
tests/unit/infrastructure/services/interactive/
│
├── interactive-session.service.test.ts                 (existing — reshape into facade test)
├── feature-context.builder.test.ts                     (existing, unchanged)
│
├── core/
│   ├── session-registry.test.ts
│   ├── stream-event-dispatcher.test.ts
│   └── session-persistence.test.ts                     ★ MUST HAVE: monotonic-clock regression test
│                                                         (100 msgs under vi.setSystemTime() → 100 unique createdAt)
│
├── lifecycle/
│   ├── agent-config.resolver.test.ts
│   ├── boot-prompt.resolver.test.ts                    ← pure fn, easiest TDD cycle
│   ├── boot-watchdog.test.ts                           ← fake-timers
│   ├── session-bootstrapper.test.ts
│   └── session-terminator.test.ts
│
├── runtime/
│   ├── agent-stream.consumer.test.ts                   ★ critical: preserves await sequencing invariant
│   ├── turn.executor.test.ts
│   └── user-interaction.coordinator.test.ts
│
└── api/
    ├── message-dispatcher.test.ts
    ├── chat-state.assembler.test.ts
    └── workflow-hooks.test.ts
```

Thirteen new test files. `settings-provider.adapter.ts` is a five-line passthrough and doesn't need its own spec — it's covered transitively by `agent-config.resolver.test.ts` which injects a fake `ISettingsProvider`.

### 5.5 Composition (DI wiring order)

```
ISettingsProvider (new port)
         │
         ▼
 settings-provider.adapter (lifecycle/)
         │
         ▼
 AgentConfigResolver (lifecycle/)
         │
         ▼
 SessionBootstrapper (lifecycle/) ──► needs BootPromptResolver, BootWatchdog,
         │                             AgentStreamConsumer (runtime/)
         ▼
 InteractiveSessionService (facade, root)
         ▲
         │ composes:
 ┌───────┴────────┬─────────────────┬────────────────────┐
 │                │                 │                    │
SessionRegistry   StreamEventDispatcher   SessionPersistence (singleton — owns the monotonic clock)
         ▲
         │
 ┌───────┴───────┬──────────────┬─────────────────┬──────────────┬────────────┐
 │               │              │                 │              │            │
MessageDispatcher TurnExecutor  SessionTerminator ChatStateAssembler UserInteractionCoordinator WorkflowHooks
 (api/)         (runtime/)      (lifecycle/)      (api/)         (runtime/)    (api/)
```

Only `InteractiveSessionService` (the facade) is registered as the singleton binding for `IInteractiveSessionService`. Every collaborator is constructed by hand at the existing `new InteractiveSessionService(...)` site — no DI-framework magic, just `new Foo(bar, baz)` calls in dependency order.

---

## 6. Outcome

One ~200-line facade + 14 focused collaborators organised into four enforceable subfolders (`core/`, `lifecycle/`, `runtime/`, `api/`), each ≤230 lines, each independently testable against a mirrored test tree. The SDK stream event switch (biggest duplication source) exists in exactly one place. The monotonic-clock ordering invariant from the recent fix is preserved and codified by a targeted regression test. No component calls `getSettings` / `hasSettings` directly. Layering is enforced by ESLint, not by convention alone. Ready to ship incrementally behind the existing application port.
