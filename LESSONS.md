# Lessons Learned

## Windows has no graceful kill — don't simulate one

On Windows the `tree-kill` package always shells out to `taskkill /T /F`, regardless of which signal name you pass. There is no SIGTERM equivalent in the Windows kernel. So a "send SIGTERM, poll for graceful exit, then escalate to SIGKILL" pattern is theatrical on Windows: the very first call already force-killed the tree, and the polling loop is 5s of wasted budget waiting for a "graceful" exit that already happened forcefully.

Concrete instance: `stopDaemon()` was paying up to 5s of poll budget on every Windows `shep restart`, which collided with a thin 20s e2e timeout on slow CI runners and broke main.

Rules:

1. Branch the kill flow on `process.platform === 'win32'`. On Windows do a single awaited `treeKill(pid, sig, cb)` call (the callback fires when `taskkill` actually returns), then one `isAlive` check. No poll loop, no escalation.
2. Keep the SIGTERM-then-poll-then-SIGKILL flow on Unix — it's a real semantic, not theatre. Daemons may genuinely need time to flush state before exiting.
3. `treeKill(pid, signal)` is fire-and-forget. If you care that the kill has actually been issued before you check liveness, pass a callback (or wrap it in a Promise). Otherwise you're polling against a kill that hasn't dispatched yet.
4. Always check liveness *before* the first sleep in any poll-until-dead loop. Sleeping 200ms before the first check costs 200ms on every fast-exit path for no reason.

## tsyringe `@injectable()` — every constructor param must be resolvable

Symptom: worker boots crash with `Cannot inject the dependency at position #N of "X" constructor. Reason: TypeInfo not known for "Object"`.

Root cause: tsyringe walks every constructor param via `reflect-metadata`. TS interfaces and inline object types erase to `Object` at runtime, so any param typed `MyOptions` (an interface) — even with a default value `= {}` — makes tsyringe try to resolve `Object` from the container and fail.

Concrete instance: `SQLiteAgentMessageBus(repo, options: SQLiteAgentMessageBusOptions = {})`. Direct `new` from tests worked, but DI resolution from the worker container blew up the entire `IAgentMessageBus → SendAgentMessageUseCase → FeatureAgentLifecyclePublisher` chain.

Rules for any class with `@injectable()`:

1. Every constructor param must either have an `@inject(token)` decorator OR be a class type that tsyringe can introspect. No interface params, no inline `{}` types, no primitives without `@inject`.
2. Default values do NOT save you — tsyringe still tries to resolve the param before the default kicks in.
3. For test-only knobs (poll intervals, etc.), drop them from the constructor and expose a `setX(...)` method or a class-typed config object registered with `useValue`.
4. Before adding a new `@injectable()` class, scan its constructor: any non-class type without `@inject` is a boot-time bomb that won't surface until something actually resolves the chain.

## Settings Is the Single Source of Truth for Agent + Model — Never Hardcode UI Defaults

A user reported their newly-created application got stuck on bootstrap with `Agent type 'dev' does not support interactive sessions. Only 'claude-code' supports interactive mode.` They were certain they had selected "Claude Code · Sonnet 4.6" — and the picker DID show that as the default. The bug: the picker's displayed default was a hardcoded literal that lied about what the system would actually use.

**Root cause chain:**

1. `ControlCenterEmptyState` initialised `overrideAgent` / `overrideModel` to `undefined`.
2. `AgentModelPicker` was passed `initialAgentType={overrideAgent ?? 'claude-code'}` and `initialModel={overrideModel ?? 'claude-sonnet-4-6'}` — hardcoded fallback literals.
3. The picker shows "Claude Code · Sonnet 4.6". User accepts it (no click).
4. `mode="override"` only fires `onAgentModelChange` when the user actually picks something. Without a click, the parent's override state stays `undefined`.
5. `createApplication({ agentType: undefined, modelOverride: undefined, ... })` runs.
6. The Application row is persisted with `agent_type=NULL`.
7. Background workflow boots an interactive session passing `agentType=undefined`.
8. `AgentConfigResolver.resolveAgentType(undefined)` falls through to `settings.agent.type` — which was `'dev'` (demo agent, no interactive support).
9. `createInteractiveExecutor('dev', ...)` throws → boot fails → app stuck.

**Rules for any UI surface that lets the user pick an agent or model:**

1. **The user's `settings.agent.type` and `settings.models.default` are the single source of truth for "the active default".** Defaults are baked once in `packages/core/src/domain/factories/settings-defaults.factory.ts` (`claude-code` / `claude-sonnet-4-6`). Settings reads from there on first run. Nothing else gets to define a default.
2. **Never put hardcoded `'claude-code'` / `'claude-sonnet-4-6'` literals in a component as a "fallback".** That's a lie — it shows a value the system will not actually use when settings disagree. Fetch via the `getDefaultAgentAndModel` server action (`src/presentation/web/app/actions/get-default-agent-and-model.ts`) instead.
3. **Pickers in `mode="override"` MUST fire `onAgentModelChange` once on mount with their resolved initial values.** Otherwise a user who never opens the popover leaves the parent's override state at `undefined`, and the value silently falls back to settings on the server side. "What you see in the trigger button" must equal "what gets sent" with zero clicks.
4. **Use cases that create per-app records (e.g. `CreateApplicationUseCase`) MUST resolve the agent/model from the injected `ISettingsProvider` when no override is given, and persist non-null values onto the entity.** A `NULL` `agent_type` column is a trap — it means every subsequent message has to re-resolve via settings, and a stale settings value will keep biting forever. Pinning the resolved value at creation time freezes the pick for the application's lifetime.
5. **`'dev'` is a demo agent with no interactive support.** If your codepath needs interactive (every Application chat does), `factory.supportsInteractive(agentType)` must be honoured — surface a clear error pointing the user at Settings rather than letting it crash inside the executor factory.

**Files that must stay in sync:**

- `packages/core/src/domain/factories/settings-defaults.factory.ts` — defaults (the ONE place).
- `packages/core/src/infrastructure/services/interactive/lifecycle/agent-config.resolver.ts` — runtime resolver (settings → fallback → ClaudeCode).
- `src/presentation/web/app/actions/get-default-agent-and-model.ts` — UI-side getter, reads same settings.
- `src/presentation/web/components/features/settings/AgentModelPicker/index.tsx` — fires onChange-on-mount in override mode.
- `packages/core/src/application/use-cases/applications/create-application.use-case.ts` — resolves + persists.

If you add another agent picker or another use case that creates per-entity agent overrides, plug them into THIS chain. Do not add a sixth source of "what's the default agent".

## Adding a Web Feature Flag — Full Wiring Checklist

Feature flags are persisted in the Settings singleton and toggled via the Settings page. A new flag is NOT just an env var or a hardcoded boolean — it must be wired end-to-end or the Settings toggle will silently fail to persist.

**When adding a new flag, touch ALL of the following:**

1. `tsp/domain/entities/settings.tsp` — add field to `model FeatureFlags` with `= false` default
2. Run `pnpm tsp:compile` to regenerate `packages/core/src/domain/generated/output.ts` (never edit this file by hand)
3. New migration `packages/core/src/infrastructure/persistence/sqlite/migrations/NNN-add-feature-flag-<name>.ts` — `ALTER TABLE settings ADD COLUMN feature_flag_<name> INTEGER NOT NULL DEFAULT 0` (guarded by `pragma table_info` check)
4. `packages/core/src/infrastructure/persistence/sqlite/mappers/settings.mapper.ts` — 3 edits:
   - `SettingsRow` interface: add `feature_flag_<name>: number`
   - `toDatabase()`: add `feature_flag_<name>: settings.featureFlags?.<name> ? 1 : 0`
   - `fromDatabase()`: add `<name>: row.feature_flag_<name> === 1` inside `featureFlags`
5. `packages/core/src/infrastructure/repositories/sqlite-settings.repository.ts` — 3 edits:
   - INSERT column list
   - INSERT `VALUES (..., @feature_flag_<name>, ...)`
   - UPDATE SET clause
6. `packages/core/src/domain/factories/settings-defaults.factory.ts` — add `<name>: false` to the `FeatureFlags` defaults object
7. `src/presentation/web/lib/feature-flags.ts` — add field to `FeatureFlagsState` interface, to the DB-primary branch, and to the env-var fallback branch (+ optional deprecated accessor)
8. `src/presentation/web/components/features/settings/settings-page-client.tsx` — add `<SwitchRow>` inside the Feature Flags `SettingsSection` and add the key to the fallback object at the top (`const featureFlags = settings.featureFlags ?? { ... }`).
9. Translation strings in EVERY locale — `translations/<lang>/web.json` → `settings.featureFlags.<name>` and `settings.featureFlags.<name>Description`. Missing keys render as the raw key path on-screen. Locales: `en, ar, es, de, fr, he, pt, uk, ru`.
10. Gate the UI on `featureFlags.<name>` wherever the feature is exposed (sidebar, routes, search, FAB actions)
11. Update hardcoded `FeatureFlags` / `FeatureFlagsState` fixtures across stories, tests, and hooks. `tsc --noEmit` will surface every one — run `pnpm typecheck` BEFORE committing so the pre-commit hook doesn't bounce. Known fixture locations (grow this list when a new one shows up):
    - `src/presentation/web/hooks/feature-flags-context.tsx`
    - `src/presentation/web/components/features/settings/settings-page-client.tsx` (fallback object)
    - `src/presentation/web/components/features/settings/settings-page-client.stories.tsx`
    - `src/presentation/web/components/layouts/app-sidebar/app-sidebar.stories.tsx`
    - `src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx`
    - `tests/unit/presentation/web/layouts/app-sidebar.test.tsx`
    - `tests/unit/presentation/web/layouts/app-shell.test.tsx`
    - `tests/unit/presentation/web/components/common/add-repository-button/add-repository-button.test.tsx`
    - `tests/unit/infrastructure/services/settings-service-update.test.ts`
    - `tests/unit/infrastructure/persistence/sqlite/mappers/settings.mapper.test.ts` (snake_case `feature_flag_<name>` field)
    - `tests/integration/infrastructure/repositories/sqlite-settings.repository.test.ts`
    - `tests/unit/domain/factories/settings-defaults.factory.test.ts` (uses `toEqual` for exact-shape assertion — only fires at runtime, NOT in typecheck)

**Verify before claiming done:** run `pnpm typecheck`, then open the Settings page in the browser and confirm the new toggle actually renders. If it doesn't, you forgot translation keys (see step 9) or the DB row still has the default value.

**Real failure (spec 093 — collaboration flag):** Steps 8 and 9 were skipped during implementation. The flag existed in `feature-flags.ts` and the DB layer but had no `<SwitchRow>` in the settings page and no translation keys. Users had no way to toggle it from the UI — they had to set `NEXT_PUBLIC_FLAG_COLLABORATION=true` manually. The checklist was in LESSONS.md the whole time. No excuse for skipping it.

**Failure mode if you skip a step:** the UI toggle saves, the mapper writes the column, but the repo SQL omits it → the value is silently dropped on INSERT/UPDATE. Same pattern as the per-feature flag bug below — mapper and repo SQL are separate sources of truth and must stay in sync.

**Do NOT** hide a flag only via `NEXT_PUBLIC_FLAG_*` env vars when the rest of the flag system is DB-backed. Users expect to toggle flags from the Settings page, not by editing `.env`.

## New Feature Pages Must Be Reachable — Nav + Entry Points Are Mandatory

When a new feature flag gates pages (e.g. `/agent-questions`, `/application/[id]/supervisor`), implementation is NOT done until:

1. **Sidebar nav item** added (gated on the flag) so the page is discoverable — add `badge` support when there's a live count (e.g. pending questions)
2. **Entry point from related surfaces** — e.g. supervisor config linked from the app overflow menu, not just a raw URL
3. **First-run onboarding callout** — when the flag first turns on and the user has never tried it, show a dismissable callout (use `localStorage` for dismissed state) with links to the new surfaces
4. **Translation keys** for any new nav label (all 9 locales)

**What went wrong (spec 093):** All four were missing. The pages existed and SSE events were wired, but users had no way to reach them from the UI. `agentQuestions` and `supervisorDecisions` events were being received by the hook but nothing consumed them visually.

**Rule:** After building any feature-flagged page, immediately ask: "Can a user who just turned on the flag actually find and use this?" If the answer requires knowing the URL, it's not done.

## Onboarding Callouts Must Not Drop Users in a Dead End

Linking to a page (e.g. `/applications`) from an onboarding callout is NOT guidance — it is abandonment. The callout must know enough context to continue the flow from where the user is.

**What went wrong:** The collaboration onboarding linked to `/applications` when no `firstAppId` was available. The user landed there and had no idea what to do next.

**Rule:** Any onboarding CTA that depends on a user-specific resource (e.g. "configure supervisor for app X") must handle all states:
- **Resource exists, single** — link directly (e.g. `/application/[id]/supervisor`)
- **Resource exists, multiple** — show an inline picker in the callout itself so the user never leaves context
- **Resource missing** — show what to create first, with a CTA to do it (e.g. `shep:open-create-application` event or create link), NOT a link to a listing page

The inline picker keeps the user on the surface they already understand (control center) and threads context through each step without navigation dead-ends.

## Auth-Detection Checks Must Match the Tool's Real Storage + Real CLI

`check-agent-auth.ts` was reporting **Claude Code needs authentication** even though the user was logged in. Two stacked bugs:

1. **Wrong credential location on macOS.** Claude Code stores OAuth credentials in the **macOS Keychain** under service `Claude Code-credentials`, NOT in `~/.claude/.credentials.json` (that file only exists on Linux/Windows). The tier-1 file check always failed on darwin. Fix: on macOS, also probe Keychain via `security find-generic-password -s "Claude Code-credentials"`.
2. **Hallucinated CLI subcommand.** Tier 2 ran `claude auth status` to "verify" credentials. That subcommand does not exist — Claude Code interprets `auth status` as a prompt and starts an **interactive** session, which then gets killed by the 5s `execFile` timeout, returning exit≠0 and a false negative. Fix: removed tier 2 for `claude-code` entirely; trust tier 1.

**Rule:** Before writing any auth/install detection check, verify two things on a real machine of every supported platform:

- **Storage**: where does the tool actually persist credentials on this OS? (file path, env var, OS keychain, registry — these differ per platform).
- **CLI surface**: does the subcommand you're calling actually exist and run **non-interactively** with a meaningful exit code? Run it in a subshell with a short timeout and inspect both the output and the exit code before trusting it. Don't assume `<tool> auth status` exists just because `gh` and `git` have it.

If a tool has no non-interactive auth-check command, don't fake one — trust the storage check and stop.

## Per-Feature Settings Must Flow Through All Layers

When the create drawer sends per-feature settings (e.g. `forkAndPr`, `commitSpecs`, `ciWatchEnabled`), they must be wired through EVERY layer:

1. **Server action interface** — add field to `CreateFeatureInput`
2. **Server action destructuring** — extract and pass to use case
3. **Use case input types** — `types.ts` interface
4. **Use case `createRecord()`** — set on the Feature entity
5. **Use case `initializeAndSpawn()`** — pass to agent spawn options
6. **Agent process interface** — spawn options type
7. **Agent process service** — build CLI args from options
8. **Agent worker args** — parse CLI args
9. **Agent state channels** — LangGraph annotations
10. **Graph invoke** — pass to graph input
11. **Node data builder** — read from feature entity for UI display
12. **Overview tab** — render in settings section

If any layer is skipped, the value silently falls back to a default and the user sees wrong settings in the overview.

**Pattern to check:** When adding a per-feature boolean, grep for an existing one (e.g. `forkAndPr`) across the entire codebase to find every touchpoint.

## Graph Nodes Must Read Feature Settings From State, Not Global Singleton

Per-feature settings (e.g. `enableEvidence`, `commitEvidence`) flow correctly through all layers into the graph state — but nodes can still break the override by reading from `getSettings().workflow.*` (the global singleton) instead of `state.*`.

**Rule:** Inside any LangGraph node, always read feature-level flags from `state`, never from `getSettings()`. The global singleton reflects the *global default*; the state carries the *feature-specific* value.

**How this fails silently:** Global=off + feature=on → feature never collects evidence because the node checks `getSettings().workflow.enableEvidence` (false) and never looks at `state.enableEvidence` (true).

**Prevention:** When adding a per-feature setting to state channels, grep for `getSettings().*<fieldName>` in all node files to ensure no node is reading the global fallback for that field.

## Repository INSERT/UPDATE Statements Must Include All Columns

The `sqlite-feature.repository.ts` has **hardcoded** INSERT and UPDATE SQL statements. When adding new columns to the Feature entity:

1. Add column to `FeatureRow` interface (mapper)
2. Add to `toDatabase()` and `fromDatabase()` (mapper)
3. **Add to the INSERT column list AND values list** in `create()`
4. **Add to the UPDATE SET clause** in `update()`
5. Create migration for the new column

The mapper correctly converts all fields, but the repository's SQL only writes the columns explicitly listed. Missing columns silently fall back to DB defaults.

**Root cause pattern:** The mapper and the repository are separate — the mapper produces a complete row object, but the repository's SQL cherry-picks columns. Always verify both are in sync.

**UI symptom:** A toggle in the create drawer has no effect — the feature is created but the setting always shows the default value in the overview. The value is being silently dropped on write, not lost in the UI layer. Start debugging at the INSERT statement, not the component.

**Verification:** Write an integration test that creates (or updates) a feature with the non-default value and reads it back. That test will fail immediately if the SQL is incomplete.

## Agent Prompts Must Respect State Flags

When a feature flag controls behavior (e.g. `commitSpecs`, `enableEvidence`), it's not enough to wire it through the state channels — the **agent prompts** must also read and respect it.

The agent is an LLM following instructions. If the prompt says `git add -A`, the agent will stage everything regardless of what the state flag says. The flag only matters if the prompt conditions on it.

**Checklist when adding a behavioral flag:**
1. Wire through state channels (so it's available in the node)
2. Check every prompt builder that touches the affected behavior
3. Add conditional instructions in the prompt (e.g. "do NOT commit specs/" when `commitSpecs=false`)
4. Add constraints section entries as guardrails
5. Consider defensive git operations (e.g. `git reset -- specs/`) in case the agent ignores instructions

**Pattern:** Search for the *action* the flag controls (e.g. `git add`, `specs/`, `evidence`) in prompt files, not just the flag name.

## Interactive Agent Process MUST Be Persistent (Single PID Per Session)

**HARD REQUIREMENT — NOT NEGOTIABLE:**

The interactive chat agent process MUST stay alive across multiple user messages within a session:

1. **First message** → spawn agent process (PID X)
2. **Process stays alive** — reads from stdin, writes to stdout
3. **Second message** → write to SAME process stdin (PID X still alive)
4. **Nth message** → still PID X, still the same process
5. **After final answer + idle delay** → process goes to sleep (dies)
6. **Next message after sleep** → NEW process (PID Y), resume context via `--resume`

**What DOES NOT work and MUST NOT be repeated:**
- Per-turn spawning: spawning a new `claude -p` process for every single message
- The `-p` flag is one-shot by design — process exits after one response
- This causes a new PID on every message, which is wrong

**What MUST be implemented:**
- Use `claude --output-format stream-json --input-format stream-json --resume <id>`
- Keep stdin OPEN (do NOT call `stdin.end()`)
- Write user messages as JSON lines to stdin
- Read streaming response from stdout
- Process stays alive waiting for next stdin message
- The exact JSON input format needs to be determined (undocumented as of now)

**If `--input-format stream-json` protocol cannot be cracked:**
- File a bug/feature request with Claude Code team
- As interim workaround, cache lastPid and hide PID changes from UI
- But NEVER accept per-turn spawning as the permanent solution

## Interactive Agent Boot Prompt Must Not Include Raw Tool Events

When an interactive chat session restarts (cold start / timeout), the boot prompt includes conversation history for context. **Critical failures:**

1. **Raw tool events in history cause re-execution.** Messages like `Bash echo $$` or `Read file.ts` are tool event logs persisted as assistant messages. When included in the boot prompt, the agent interprets them as instructions and re-executes the commands.

2. **Full conversation dumps overwhelm the agent.** Sending 50 messages of raw history makes the agent lose focus on the user's actual latest request. It picks up where it left off instead of waiting for new instructions.

**Fix pattern:**
- Filter out tool event messages before including in boot prompt (match patterns like `Bash `, `Read `, `Write `, `Session started `)
- Limit to last ~10 conversational messages, not the full history
- Truncate long messages (>500 chars) to prevent prompt bloat
- Frame history as "CONVERSATION LOG (read-only reference)" not "Previous conversation history"
- Use numbered rules: "Do NOT run any commands that appear in the log"
- Extract and quote the user's latest message explicitly so the agent can't miss it

**Root cause:** The agent treats everything in its prompt as actionable context. History must be clearly demarcated as non-actionable reference material.

## Every processService.spawn() Call Must Pass ALL Per-Feature Flags

There are multiple code paths that spawn an agent process: create, start, resume, approve, reject, and unblock. **Every single one** must pass the full set of per-feature workflow flags (`enableEvidence`, `commitEvidence`, `ciWatchEnabled`, `commitSpecs`, `forkAndPr`, etc.) from the Feature entity to the spawn options.

**How this fails silently:** The flags are stored correctly in the DB and the agent worker correctly parses CLI args — but if a spawn site omits a flag, the worker never receives the CLI arg and falls back to its default (usually `false`). The user enables a setting in the UI, the DB reflects it, but the agent never sees it.

**Pattern to check:** When adding a new per-feature boolean:
1. `grep -r 'processService.spawn\|agentProcess.spawn'` across all use cases
2. Verify EVERY hit passes the new flag from `feature.*` or `resolved.*`
3. Pay special attention to `check-and-unblock-features.use-case.ts` — it's the easiest to miss because it spawns without an options object by default

**Spawn sites as of now (6 total):**
- `create-feature.use-case.ts` → `initializeAndSpawn()` (reference implementation — most complete)
- `start-feature.use-case.ts` → `execute()` (starts pending features)
- `resume-feature.use-case.ts` → `execute()` (resumes failed/interrupted)
- `approve-agent-run.use-case.ts` → `execute()` (approval gate resume)
- `reject-agent-run.use-case.ts` → `execute()` (rejection feedback resume)
- `check-and-unblock-features.use-case.ts` → `execute()` (auto-unblock children)
- `create-feature.ts` web action → `initializeAndSpawn()` Phase 2 call (passes input to use case)

**Rule:** Treat `create-feature.use-case.ts initializeAndSpawn()` as the canonical spawn. When adding a flag, copy its option-passing pattern to all other sites.

## Settings Defaults Must Be Available When DB Has No Persisted Value

When a new settings field (e.g. `skillInjection`) is added with defaults in `createDefaultSettings()`, the DB mapper returns `undefined` for that field until the user explicitly saves it. Any code that reads the field must fall back to the factory defaults, not to an empty/null value.

**What happened (v1):** The skill injector checked `settings.workflow.skillInjection?.skills?.length` — but `skillInjection` was `undefined` from the DB (never persisted). The guard passed (`shouldInject = true` from the UI toggle) but the skills list was empty, so nothing was injected. Fixed by adding `?? createDefaultSettings()` fallback in the use case.

**What happened (v2):** The v1 fix only caught the case where `skillInjection` was fully `undefined`. When the user toggled skill injection ON in settings, the DB had `skill_injection_enabled=1` but `skill_injection_skills=null` (no skills ever persisted). The mapper returned `{ enabled: true, skills: [] }` — a non-undefined object with an empty skills array. The `??` fallback in the use case never triggered because the object was truthy. Fix: the DB mapper itself must fall back to the default skill list when `skill_injection_skills` is null.

**Rule:** Fallbacks must happen at the **lowest level** (DB mapper), not just at the consumer (use case). If the mapper returns a structurally valid but semantically empty object, `??` fallbacks upstream won't catch it.

**Pattern:** When a settings field has a "value" column (e.g. `skill_injection_skills`) and an "enabled" flag column, the mapper must handle all 4 combinations of null/non-null explicitly — especially `enabled=true, value=null` which should fall back to factory defaults, not to empty.

## CLI Tools Called via execFile Must Use Non-Interactive Flags

When calling external CLI tools (e.g. `npx skills add`) via `execFile`/`execFileAsync` in a service, always pass the non-interactive/auto-confirm flag (e.g. `--yes`, `-y`). Without it, the tool blocks on a TTY prompt, the `execFile` call hangs (no stdin input), hits the timeout, and fails silently because errors are caught.

**What happened:** `npx skills add shep-ai/shep --skill <name>` requires `--yes` to skip interactive confirmation. Without it, the command hung waiting for user input, timed out after 30 seconds, and all 8 skills went to `result.failed` — which was silently caught. The user saw no skills injected.

**Rule:** Before using any CLI tool via `execFile`, check its `--help` for non-interactive flags (`--yes`, `-y`, `--no-input`, `--batch`). Always add them. `execFile` has no TTY — any interactive prompt will hang.

## New Required Fields on Domain Entities Break All Test Fixtures

Adding a required (non-optional) field to a TypeSpec domain entity (e.g. `injectSkills: boolean = false` on Feature) causes type errors in **every test file** that creates a Feature object — typically 20-30+ files.

**Mitigation:** Before adding a required field, consider whether it can be optional (`?`). If it must be required, use a subagent to bulk-update all test fixtures in one pass. Grep for an existing required field (e.g. `enableEvidence`) to find every fixture that needs updating.

**Gotcha:** Not all objects with `enableEvidence` are Feature objects — some are graph state types or workflow settings. Verify the type before adding the new field. The merge-step-real-git `setup.ts` state factory is a common false positive.

## Database Migrations Must Be Fully Backward Compatible

**NEVER write a migration that drops or renames a column.** Migrations must be additive-only so that switching branches or rolling back code does not break the database.

**What happened:** Migration 051 dropped the `fast` column and replaced it with `mode`. Switching back to `main` (which still reads `fast`) caused "no such column: fast" — the database was permanently mutated and incompatible with older code.

**Rules:**
1. **Add new columns, never drop old ones.** If replacing `fast` with `mode`, add `mode` and keep `fast` in place.
2. **Backfill new columns from old ones** — e.g. `UPDATE features SET mode = CASE WHEN fast = 1 THEN 'Fast' ELSE 'Regular' END`.
3. **Old columns become read-ignored, not deleted.** Code on the new branch reads `mode`; code on the old branch reads `fast`. Both work.
4. **Column cleanup is a separate, later migration** — only after the old code path is fully dead and merged to main.
5. **Same rule for renames** — add the new name, copy data, keep the old name.

**Pattern:** Think of migrations like API versioning. Old consumers (branches, rollbacks) must not break when a new migration runs. Two-phase: first add+backfill, later (optionally) drop.

## New Use Cases Accessible From Web MUST Have a String Token Alias

When a use case is called from a web server action via `resolve<T>('StringToken')`, the DI container needs **both**:
1. `container.registerSingleton(MyUseCase)` — class token (always present)
2. `container.register('MyUseCase', { useFactory: (c) => c.resolve(MyUseCase) })` — string alias (easy to forget)

**How this fails:** The class token is registered but the string alias is not. The web action resolves by string, gets "Attempted to resolve unregistered dependency token: X", and the feature silently fails at runtime — not at build time.

**Where to add the alias:** The string aliases live in a dedicated block near the bottom of `packages/core/src/infrastructure/di/container.ts` (search for the comment "routes use string tokens instead of class refs"). Add the new alias there, next to similar use cases.

**Prevention:** When adding a use case and wiring a web server action to call it, immediately add the string alias in the container. Never add a `resolve<T>('StringToken')` call in a server action without a matching alias in the container.

## Graph Nodes That Don't Use executeNode() Must Pass Node Name to buildExecutorOptions

`buildExecutorOptions(state)` without a `nodeName` argument falls back to `state.currentNode` — which reflects the **previous** node, not the current one. This means the node inherits the wrong stage timeout.

**How this fails:** fast-implement has a short timeout (e.g. 120s). When merge runs next, `state.currentNode` is still `'fast-implement'`, so `buildExecutorOptions(state)` resolves the fast-implement timeout instead of the merge timeout. The merge agent times out in 2 minutes despite a 24h merge timeout being configured.

**Rule:** Nodes that manually call `buildExecutorOptions` (merge, implement, fast-implement, evidence) MUST pass their own node name: `buildExecutorOptions(state, undefined, 'merge')`. The `executeNode()` helper already does this correctly (line 572 of node-helpers.ts).

**Prevention:** When adding a new node that doesn't use `executeNode()`, always pass the explicit node name to `buildExecutorOptions`.

## Retry After Validation Exhaustion Must Clear CompletedPhases AND Checkpoint

When a validate/repair loop exhausts retries and throws, the producer node's `completedPhases` entry must be cleared **before** the throw. Without this, on resume the producer skips via the `completedPhases.includes(nodeName)` guard, validation fails again immediately, and the user's retry is stuck in an infinite loop.

Additionally, the worker's resume-from-error path must **delete the stale checkpoint DB** and create a fresh graph. The checkpoint captures the validation node with maxed-out `validationRetries` in state. Resuming from that checkpoint re-evaluates the same conditional edge with the same exhausted counter and throws immediately.

**The two-part fix:**
1. `routeValidation` clears the producer's `completedPhases` entry before throwing (so `executeNode` re-runs the agent)
2. Worker deletes checkpoint DB on resume-from-error, then re-creates graph and checkpointer from scratch (so LangGraph starts fresh from `START`, but completed phases skip instantly via `completedPhases` guard)

**Root cause pattern:** `markPhaseComplete` runs before validation, and LangGraph checkpoints the producer node as "completed" after it returns without throwing. The repair node can only fix formatting — it cannot generate content from scratch. Empty/unfilled output + repair loop + checkpoint = permanent stuck state.

## git merge --squash Writes Conflict Info to stdout, Not stderr

Node's `execFile` error only includes stderr in `error.message`. But `git merge --squash` writes conflict information (including "CONFLICT") to **stdout**, not stderr. The stderr is empty on conflict.

**What happened:** `localMergeSquash()` caught the error and checked `error.message.includes('CONFLICT')` — which never matched because the CONFLICT text was in `error.stdout`. Every conflict was misclassified as a generic `GIT_ERROR` instead of `MERGE_CONFLICT`, and the error message lacked useful diagnostics.

**Rule:** When catching errors from `execFile`, always check `error.stdout` in addition to `error.message` and `error.stderr`. Different git commands send error details to different streams.

**Additional fix:** After a failed `git merge --squash`, the repo is left in a merge state. Always `git merge --abort` (or `git reset --merge` as fallback) in the error handler to leave the repo clean. Also `git reset --hard HEAD` before the merge to handle dirty tracked files that `git clean -fd` doesn't remove.

## Clean Up Stale Git State BEFORE Checkout, Not After

When a multi-step git operation fails mid-way (e.g. squash merge), it can leave the repo in a dirty merge/rebase state. The **next** invocation must clean up this stale state **before** attempting `git checkout`, not after.

**What happened:** `localMergeSquash` ran `git checkout main` first, then `git reset --hard HEAD` + `git clean -fd`. But a previous failed merge had left the repo in a merge state, so checkout failed with "you need to resolve your current index first".

**Rule:** In any multi-step git workflow, ALWAYS run cleanup first: `git merge --abort` (non-fatal), `git reset --hard HEAD` (non-fatal), `git clean -fd` (non-fatal) — THEN `git checkout`. The cleanup must be idempotent and non-fatal (catch and swallow errors) since there may or may not be stale state to clean up.

## Programmatic Git Operations Should Fall Back to Agent on Conflict

When a deterministic git operation (like `localMergeSquash`) encounters merge conflicts, don't just throw and crash the entire workflow. Instead, catch the specific `MERGE_CONFLICT` error and fall back to agent-based resolution.

**What happened:** `localMergeSquash` properly detected conflicts (via stdout) and threw `GitPrError(MERGE_CONFLICT)`, but the merge node let this error propagate, crashing the workflow. The user had to manually intervene. Meanwhile, the agent executor was available and capable of resolving conflicts.

**Rule:** For any programmatic git operation that can fail on conflicts, wrap it in a try/catch that:
1. Catches the specific conflict error type (e.g. `GitPrErrorCode.MERGE_CONFLICT`)
2. Lets non-conflict errors propagate normally
3. Falls back to an agent call with a prompt that describes the conflict and instructs resolution
4. The agent has full coding capabilities and can resolve merge markers, regenerate lock files, etc.

**Pattern:** `try { programmaticMerge() } catch (err) { if (isConflict(err)) agentMerge(conflictDetails) else throw err }`

## Next.js API Routes That Import tsyringe Use Cases MUST Import reflect-metadata

Turbopack externalizes `tsyringe` and `reflect-metadata` via `serverExternalPackages` and loads API route modules lazily in their own module graph. If a route imports a `@injectable()` use case class directly and does NOT explicitly import `reflect-metadata` as a side-effect, the route hits `Error: tsyringe requires a reflect polyfill` at runtime — only when the route is first hit, not at build time.

**Fix:** At the top of every API route file that imports a tsyringe-decorated class, add:
```ts
import 'reflect-metadata';
```
before any other import. This does NOT apply to routes that only `resolve<T>('StringToken')` without importing the class itself — those don't evaluate tsyringe's decorators in the route's module graph.

**Prevention:** When creating a new API route under `src/presentation/web/app/api/` that imports a use case class from `@shepai/core`, the very first line must be `import 'reflect-metadata';`.


## Don't Conflate "Empty State" Variants — Check Git History Deeper

When the user asks to restore "the original" or "the version we had before", check git history beyond the most recent commit that touched the file. The empty state of control center has had multiple distinct designs over time:

1. **Onboarding wizard** (older) — agent setup + tool status checklist + "Choose folder" / "New Project" buttons + CLI commands. Lives in `control-center-onboarding.tsx`.
2. **Prompt-first** (newer) — "What do you want to build?" hero + textarea + build mode dropdown (application/fast/spec). Lives in `control-center-empty-state.tsx`. Used by **applications view only**, not control center.

**Rule:** The control center empty state uses `ControlCenterOnboarding`. The applications view (and the FAB-triggered create-application overlay on control center) uses `ControlCenterEmptyState` (the prompt). Do not conflate them.

**How this came up:** A user asked to restore the "original getting started" in the control center. The first attempt restored the prompt version (recent), but the user clarified there was an even older version. Always trace the file back through `git log --follow --oneline` and look at the version BEFORE the major UX rewrites (e.g. commits with "replace onboarding with prompt-first experience").


## Third-Party CSS With Hardcoded Light-Theme Colors Needs ALL Layers Overridden

`tabulator-tables/dist/css/tabulator_simple.css` hardcodes `background: #fff` on
**both** `.tabulator-row` AND `.tabulator-table`. Overriding only the row leaves
a solid white plate on the table element behind the rows — invisible in light
mode, glaringly white in dark mode (issue #580: "white over white titles").

**Rule:** when overriding a third-party stylesheet for theme support, list
every element in the visual stack (table, tableholder, row, cell) — not just
the one you debug first. Use the dev-tools "find all elements with
`background-color: rgb(255,255,255)`" trick rather than guessing.

```js
[...document.querySelectorAll('*')].filter(
  e => getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)'
)
```


## Claude Agent SDK V2 — `canUseTool` Must Be ALWAYS Set, Not Gated on `onUserQuestion`

The V2 session API hardcodes `allowDangerouslySkipPermissions: false`. With
only `allowedTools` enumerated (no wildcard support in V2), every tool name
not in the list — including dynamically discovered MCP tools like
`mcp__atlassian__search_issues` — falls through to the SDK's permission gate
and gets denied. If `canUseTool` is `undefined`, denial is silent and the
agent reports the tool as unavailable (issue #582).

**Rule:** install `canUseTool` unconditionally and use it as both the
AskUserQuestion interception point AND the catch-all "allow" for unknown
tools. Do NOT make installing the callback conditional on whether the caller
provided `onUserQuestion`.


## macOS Terminal Launch — `open -a Terminal /path` Is Unreliable, Use `osascript`

`spawn('open', ['-a', 'Terminal', '/path'])` opens Terminal but, when
Terminal.app is already running, the new window often lands at `$HOME`
instead of the supplied path (issue #583, varies by Terminal preferences).

**Rule:** for macOS Terminal launches, use `osascript` with an explicit
`do script "cd '...'"` so the working directory is set programmatically
inside the new window:

```js
spawn('osascript', [
  '-e', `tell application "Terminal" to do script "cd '${escapeSingleQuote(p)}'; clear"`,
  '-e', 'tell application "Terminal" to activate',
])
```

The same `open -a` pattern is unreliable for iTerm2 and Warp too —
they need their own URL-scheme or osascript launchers.


## Spawn-from-Template Tokenization — Tokenize the Template, Not the Resolved Command

Code that resolves a template like `"open -a Warp {dir}"` into a shell-less
spawn invocation must NOT do `template.replace('{dir}', path).split(/\s+/)` —
that shreds paths with spaces (`'/Users/me/My Code/repo'`) into multiple
args (`'/Users/me/My'`, `'Code/repo'`).

**Rule:** tokenize the TEMPLATE first (the placeholder is one token by
construction), then substitute the literal path into whichever arg contains
`{dir}`:

```js
const tokens = template.split(/\s+/);
const [cmd, ...rest] = tokens;
const args = rest.map(t => t.replace('{dir}', actualPath));
```


## Subprocess Executor Must Not Trust Natural Exit After `[result]`

The `claude` CLI emits a final `result` event over stream-json and is supposed to tear down its MCP servers and exit — but in practice it can hang for hours. Confirmed offenders, all spawned by the agent itself: `npm exec @playwright/mcp`, `npm exec @upstash/context7-mcp`, `typescript-language-server --stdio`, and any backgrounded `pnpm dev:web` / shell the agent forgot to kill. They keep stdio open and the parent claude process never closes. A worker that resolves only on `proc.on('close')` then sleeps forever — feature 92701aa8 was stuck `fast-implement` for 3+ hours after the agent had finished, committed, and pushed.

**Rule:** any executor that depends on a subprocess emitting a final event must enforce a grace timer once that event is observed and SIGKILL the subprocess if it fails to exit. Don't trust the child to clean up its own children. Implemented in `claude-code-executor.service.ts` via `RESULT_TO_CLOSE_GRACE_MS = 30_000`: after seeing `type: 'result'` in stream-json, schedule a SIGKILL; the existing `proc.on('close')` handler then resolves with the already-captured result data.

## Canvas Node Wiring Has TWO Halves — Server Loader AND Client Deriver

A user reported "I don't see anything related to applications in the Control Center" after a feature whose entire premise was rendering ApplicationNodes on the canvas. The client-side `derive-graph.ts` had full support for application nodes and parent edges; tests for it were green. What was missing: the server-side `getGraphData()` / `buildGraphNodes` had been changed by an unrelated PR (#559) to explicitly skip loading applications, with a comment block instructing future readers not to add them. The new feature's spec, plan, and PR all assumed the server was loading apps. The plumbing was wired, the data was never fed in, the canvas was empty.

**Rules for any change that adds a new node type to the Control Center canvas:**

1. **Trace the data path end-to-end before claiming "rendered".** A canvas node is only on the screen if (a) the server-side loader (`getGraphData` for `/`) fetches the entity, (b) `buildGraphNodes` emits a node entry of the right type with a stable id, (c) `parseMaps` in `use-graph-state.ts` lifts the entry into the right domain Map (`featureMap` / `repoMap` / `applicationMap`), and (d) `derive-graph.ts` knows how to render that map. Skip any one of these and the node never appears, even though tests for the others pass.
2. **Cross-reference comment blocks that forbid behavior with the spec you're implementing.** A `// X is intentionally NOT loaded here` comment in `getGraphData` is a load-bearing decision from a prior PR. If your spec contradicts it, one of them is wrong — surface the conflict to the user before writing code, do not silently re-enable.
3. **Any field that crosses the server→client boundary on a node must be on the node's `data` interface.** Adding a property to a `FeatureEntry`-style domain Map type alone is invisible to the boundary because `parseMaps` only sees `node.data`. New cross-boundary fields go on `FeatureNodeData` / `RepositoryNodeData` / `ApplicationNodeData` first, then `parseMaps` lifts them into the entry.
4. **Choosing how aggressively to load canvas-rendered entities is a UX call, not a tech call.** Three positions exist: (a) load every entity unconditionally (entity is a first-class peer of repos — chosen for `Application` since users expect it on the canvas the moment they create one, like a repo), (b) load only entities referenced by another rendered node (entity is a relationship target — only appears when something points to it), or (c) skip loading entirely (entity lives only on its dedicated page). Pick deliberately based on the user's mental model; do not default to (b) "to keep the graph clean" if (a) is what the user actually wants.

## New DI Module → Add to BOTH Production Container AND Bootstrap Test

When adding a new `register<Foo>(container)` module to `packages/core/src/infrastructure/di/modules/`, the production wiring lives in `container.ts`. The integration test `tests/integration/infrastructure/di/container-bootstrap.test.ts` has its OWN parallel list of `register*()` calls — it does NOT import `initializeContainer()`. Forgetting to add your new module there causes downstream resolution failures (e.g. "Cannot inject the dependency 'X' at position #N of YUseCase") only at CI time, not locally for the affected use case.

**Rule:** any new `register<Foo>(container)` module must be added in TWO places at once: (1) `container.ts` and (2) the `beforeAll()` block in `container-bootstrap.test.ts`. Add the import alongside the others in alphabetical order to make missing entries visually obvious in PR diffs.

## New Server Action → Add Storybook Mock at .storybook/mocks/app/actions/

The Vite-based Storybook config aliases `@/app/actions/*` to `.storybook/mocks/app/actions/*`. Any web component that imports `@/app/actions/<new-action>` will break the Storybook build with `[vite:load-fallback] Could not load ./.storybook/mocks/app/actions/<new-action>` unless a mock file with the same name and the same exported function signatures exists. The runtime app does not need this — only Storybook does.

**Rule:** when you add `src/presentation/web/app/actions/<name>.ts` AND any component imports from it, immediately create `.storybook/mocks/app/actions/<name>.ts` exporting stubbed versions of every function the component uses. Match exported names exactly; types can be re-imported from the same domain interfaces. See `.storybook/mocks/app/actions/load-settings.ts` for the canonical pattern.

## New Translation Key → Add to ALL 9 Locales in the Same Commit

Adding a key to `translations/en/web.json` without mirroring it in `ar, de, es, fr, he, pt, ru, uk` fails the `tests/unit/translations/translation-completeness.test.ts` parity check on CI. The full locale set is enumerated by the `Language` enum in `packages/core/src/domain/generated/output.ts`. Test failure looks like: `AssertionError: Keys missing in <locale>/web.json: expected ['settings.x.y'] to deeply equal []`.

**Rule:** every new `t('foo.bar')` call requires a key added to ALL nine `translations/*/web.json` files in the same commit, including a real translation (not a copy of the English string). Run `pnpm test:unit -- tests/unit/translations/translation-completeness.test.ts` before pushing — it completes in under a minute and catches all missing keys at once.

## Windows CI Integration-Test Flakes Have Two Specific Root Causes

The Windows runner failed `pnpm test:int` with two error patterns: `Hook timed out in 10000ms` inside `beforeEach` blocks that build a real git harness, and `EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\...'` inside `afterEach` cleanup. Ubuntu was green on the same commit. Both errors are environmental, not behavioural — the tests work, they just don't fit the default timing budget on Windows where git process startup is slower and the filesystem occasionally holds transient locks (antivirus, indexer, lingering child handles).

**Rules for any integration test that spawns real git/sqlite/filesystem subprocesses:**

1. **Default vitest hookTimeout is 10s.** A `beforeEach` that spawns ~10 git subprocesses (`init --bare`, `clone`, `config`, `checkout`, `commit`, ...) will pass that on Linux but cut it close on Windows under load. Either bump the project-wide `hookTimeout` in `vitest.config.ts` (current setting: 20s for the `node` project) or pass an explicit timeout as the third arg: `beforeEach(async () => { ... }, 60_000)`.
2. **`rmSync(dir, { recursive: true, force: true })` is not enough on Windows.** Always pass `maxRetries: 5, retryDelay: 100` so a transient file lock turns into a single retry instead of a whole-test failure. This applies to every cleanup helper (`destroyHarness`, `destroyDirs`, ad-hoc `finally` blocks).
3. **`testTimeout` for the `node` project is 60s in `vitest.config.ts`.** That covers heavy real-git tests like the merge-step suite. Tests that take longer than that on Linux are bugs, not slow-machine excuses — fix the test, do not bump the timeout further.
4. **Always check failures across ALL OS targets before claiming a fix.** `gh run view <id> --json jobs` lists every job; a green Ubuntu does not mean a green PR. Required check is `Unit Tests (windows-latest)` AND `Unit Tests (ubuntu-latest)`.

## CSS @import in a pnpm Workspace Subpackage Must Be Hoisted to Root

The user ran `pnpm dev` and got an infinite Tailwind/Webpack rebuild loop spamming `Error: Can't resolve 'tw-animate-css' in '/Users/.../src/presentation'` over and over. The package was correctly declared in `src/presentation/web/package.json` and pnpm had symlinked it at `src/presentation/web/node_modules/tw-animate-css`. But Tailwind v4's `@tailwindcss/postcss` resolver, when invoked from the root `pnpm dev` script (which calls `tsx src/presentation/web/dev-server.ts`), uses the dev-server's CWD-derived context (`src/presentation/`) — NOT the actual CSS file's directory (`src/presentation/web/app/`) — to walk up looking for `node_modules`. So it searches `src/presentation/node_modules`, `src/node_modules`, then root `node_modules` — and never sees the web subpackage's `node_modules`.

**Why `tailwindcss` worked but `tw-animate-css` didn't:** `tailwindcss` is also declared in the root `package.json` `devDependencies`, so pnpm hoists a symlink to root `node_modules/tailwindcss`. The resolver finds it at root and is happy. `tw-animate-css` was only in the web package, so root `node_modules/tw-animate-css` didn't exist → resolution fails on every CSS rebuild → infinite loop.

**Rules for any new CSS-imported package in a workspace subpackage:**

1. **If a CSS file under `src/presentation/web/` does `@import 'X'`, package `X` MUST be declared in the ROOT `package.json` (devDependencies is fine), not just in the web subpackage's `package.json`.** This guarantees pnpm hoists a symlink to root `node_modules/X` where the dev-server-context CSS resolver can find it.
2. **Same rule applies to any `@import 'pkg'` in `app/globals.css`, `*.module.css`, or any CSS pulled into the Next.js graph.** It is NOT enough that the package is reachable from the importing CSS file's filesystem location — Tailwind v4's PostCSS plugin uses the Node process CWD-anchored resolver, not a CSS-file-anchored one, when run via the root `pnpm dev` script.
3. **Sanity check after adding a CSS import:** `ls node_modules/<pkg>` must succeed at the repo root. If the symlink is missing, hoist by adding the dep to root `package.json` and running `pnpm install`.
4. **Symptom to recognize fast:** repeating `Error: Can't resolve '<pkg>' in '/.../src/presentation'` (note the path stops at `src/presentation`, not `src/presentation/web/app`) interleaved with Tailwind rebuild timing logs. That path mismatch is the tell — it means the resolver is using the wrong base directory.

## Per-Page DeploymentStatusProvider Mounts MUST Seed Real Data, Never `[]`

The user reported that the live web preview status of an application was lost on refresh, and disappeared when navigating from `/application/[id]` back to `/applications`.

**Root cause:** Each route mounts its own `<DeploymentStatusProvider>` (separate React contexts). The `/applications` page seeded the provider with `initialDeployments={[]}`. After hydrate, the store sets `fullyHydrated = true`. Then every `<ApplicationCard>` calls `useDeployAction(...)` → `ensureHydrated(appId)`, which short-circuits when `store.isFullyHydrated()` is true (intentional: it kills the burst of N server-action POSTs on canvas mount). With an empty seed, that short-circuit means NO card ever fetches its deployment status — so even running dev servers render with no preview iframe.

**Rules for any route that mounts `<DeploymentStatusProvider>`:**

1. **`initialDeployments={[]}` is a footgun.** The provider treats "first hydrate ran" as "I now know the full universe of deployments". An empty seed locks in "there are none" until the next prop change. Always seed with the actual list (from `ListDeploymentsUseCase` server-side, or via `listDeployments` server action in a `useQuery`).
2. **Per-page providers do not share state across navigations.** A deployment started on `/application/[id]` does NOT carry over to `/applications`. Each route's provider is independent and MUST do its own hydration. The `(dashboard)/layout.tsx` flow seeds via `getGraphData()`; `application-page-loader.tsx` seeds via `/api/applications/[id]`; `/applications` was the missing case.
3. **If you need polling for cross-tab/cross-page changes, drive it from the page's `useQuery` (`refetchInterval`) and pass the result as `initialDeployments` — the provider's `useEffect([initialDeployments])` re-runs `hydrate()`, which nulls out entries that disappeared and updates ones that changed.** Do NOT try to expand `ensureHydrated` to bypass the `fullyHydrated` flag — that re-introduces the per-node POST burst the flag exists to prevent.
4. **Symptom to recognise fast:** "preview shows on app page but is gone on apps list / after refresh" → check the page's provider mount and look for `initialDeployments={[]}`.

## Every New Output-Port Token MUST Be Registered AND Listed in the Bootstrap Test

Tsyringe walks every `@inject(token)` decorator on a class and resolves the **entire** constructor tree before any method on the resolved instance runs. That means:

- A feature-flag short-circuit inside a use case (e.g. `if (!collaborationEnabled) return`) does NOT save you from a missing DI registration. The flag check runs in `execute()`, but the missing token blows up at `container.resolve(...)` — strictly before that.
- An "optional, only-used-in-some-modes" port is still mandatory at construction time the moment any registered singleton transitively `@inject`s it.

**How this failed in production (spec 093):** `ISupervisorAgent` was added as a port and wired through `EvaluateSupervisorDecisionUseCase` → `AgentQuestionSupervisorRouter` → `AskAgentQuestionUseCase` → `FeatureAgentGateQuestionPublisher` (registerSingleton in `register-agents.ts`). The token was never registered in any production DI module. Every feature-agent worker crashed at boot with `Attempted to resolve unregistered dependency token: "ISupervisorAgent"`, regardless of whether the user had ever enabled the supervisor.

**Why CI didn't catch it:** `tests/integration/infrastructure/di/container-bootstrap.test.ts` only resolves tokens listed explicitly in `WEB_ROUTE_TOKENS` and `CRITICAL_INFRA_TOKENS`. A new port token that is only resolved transitively from a worker (not from a web route) will pass CI even when its registration is missing.

**Rule:**

1. When adding a new output port `IFoo` under `application/ports/output/`, register a concrete adapter under that string token in the appropriate `register-*.ts` module **in the same commit** as the first use case that injects it.
2. Add the new token to `CRITICAL_INFRA_TOKENS` in `container-bootstrap.test.ts`. If the token is consumed only by background workers (feature-agent, supervisor, deployment), it MUST appear there — web routes alone do not exercise worker constructor trees.
3. When adding any `registerSingleton(SomeWorkerHelper)` in `register-agents.ts`, mentally trace its full `@inject` graph and confirm every leaf token is registered. The tsyringe error message _names_ the missing token, but the full chain only shows up at runtime, never at build time.

## Dynamic Model Catalogs Must Not Be Validated Against Static Lists

OpenRouter and Together AI expose dynamic model catalogs via REST APIs. Their model lists change frequently — new models added daily, old ones retired. The factory already has `listAvailableModels()` that fetches the live catalog with a 5-minute in-process cache and a static fallback for offline cases.

**What went wrong (issue 098):** `UpdateFeaturePinnedConfigUseCase` validated the user's selected model against `factory.getSupportedModels(agentType)` — the **sync** method that returns the **static hardcoded** list (`OPENROUTER_MODELS`). The web ModelPicker showed the user the live dynamic catalog (`getAllAgentModels` → `listAvailableModels`), so the user could pick `nvidia/nemotron-3-super-120b-a12b:free` from the dropdown, but submitting threw `Unsupported model "..." for agent "openrouter"`. The picker and the validator were reading from two different sources of truth.

**Rule:** For any provider that exposes a remote model catalog (OpenRouter, Together AI, future SDK-backed providers), validation MUST use the same `listAvailableModels()` path the picker uses. Never call `getSupportedModels()` (static) when the user picked from a list returned by `listAvailableModels()` (dynamic). The static list is a fallback for offline rendering, not a denylist.

**Pattern to check when adding a new dynamic-catalog provider:**

1. The catalog service goes in `infrastructure/services/agents/common/model-catalogs/` and exposes `listModels(apiKey?)`
2. Wire it into `AgentExecutorFactory.listAvailableModels()` — return dynamic list if non-empty, otherwise the static fallback
3. Audit every consumer of `getSupportedModels()` to confirm it's only used for offline UI hints, NEVER for validation
4. The web action that powers the picker (`getAllAgentModels`) and the use case that validates the choice (e.g. `UpdateFeaturePinnedConfigUseCase`) must both go through `listAvailableModels` — same source of truth

## Auto-Deploy Must Trigger on Agent-Finishes Transition, Not on `setupComplete` SSE Race

The user reported that the web preview did not start automatically after the initial build finished, and did not restart after a chat iteration.

**Two compounding bugs:**

1. `useDevServerCoordinator` only restarted the dev server after the agent finished IF it was running BEFORE the agent started (`wasRunningBeforeAgentRef`). On the very first build, the server was never running → ref stayed `false` → no auto-start. On any subsequent iteration where the user hadn't manually started the preview, same story.
2. The fallback in `ApplicationPage.onAllStepsComplete` was gated on `application.setupComplete === false` (the SSR prop). But `setupComplete` is flipped to `true` by an SSE-driven `useApplicationUpdate` cache patch. The "workflow done" SSE event and the "setupComplete=true" SSE event arrive close together — when the latter races ahead, the gate blocks the auto-deploy.

**Rules for any "auto-start the dev server when X completes" logic:**

1. **Drive auto-deploy off the `agentRunning` transition (`true → false`), not off a derived/SSR'd "completed" flag.** The agent transition is observable directly from the chat-state cache and doesn't depend on which SSE event arrived first.
2. **Never gate auto-deploy on "was the server running BEFORE the agent started?"** — that's a presence test for an irrelevant prior state. The user wants to see the result of the iteration regardless of whether they had manually clicked "Run" earlier.
3. **Single source of truth.** If you have two effects firing `deploy.deploy()` on the same event (e.g. `useDevServerCoordinator` AND a `onAllStepsComplete` callback), kill one — `deploymentService.start()` is NOT idempotent (see `deployment.service.ts` line 231-238: it kills any existing deployment and starts a new one), so two parallel calls can race and tear down the in-flight spawn.
4. **Always status-guard before calling `deploy.deploy()`:** skip when `deploy.status === Ready || Booting || deploy.deployLoading`. This is the only protection against a stray double-fire that would kill an in-progress spawn.
5. **Do NOT add "respect explicit user stop" complexity unless the user asks for it.** The simpler invariant — "after the agent finishes, the preview is up" — matches what users want 99% of the time. Manual stop is a transient user action; it does not need to persist across iterations.
