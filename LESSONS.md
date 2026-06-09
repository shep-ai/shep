# Lessons Learned

## npm trusted publishing requires npm >= 11.5 on the runner

`@semantic-release/npm` v13 added OIDC trusted publishing. In `lib/verify-auth.js`, when the OIDC token exchange with npmjs.com succeeds, the plugin **early-returns and does NOT write `NPM_TOKEN` to the userconfig `.npmrc`**. It then runs plain `npm publish` and relies on the **npm CLI itself** to do trusted publishing — which needs **npm >= 11.5.0**.

Node 22 ships npm 10.9.x, so the Release job logged "OIDC token exchange with the npm registry succeeded" in verifyConditions and then died at publish with `npm error code ENEEDAUTH`. Two versions (`v1.205.1`, `v1.206.0`) got tagged + the release commit got pushed to main but never made it to npm, because semantic-release succeeded with the tag/push plugins before failing on `@semantic-release/npm`.

Rules:

1. When using `@semantic-release/npm` v13+ with `permissions: id-token: write`, the Release job MUST install npm >= 11.5 before invoking semantic-release. Add `npm install -g npm@^11.5` between setup-node and `npx semantic-release`.
2. Keep `NPM_TOKEN` in the env as a fallback — the plugin uses it only when OIDC isn't available, but you want belt-and-suspenders in case npmjs trusted-publisher config gets removed.
3. After a Release job failure, ALWAYS verify with `npm view <pkg> dist-tags` that the version actually landed. A "successful" re-run of a failed release is usually a no-op ("local branch main is behind the remote") and silently leaves the version missing from npm — the tag exists, the chore(release) commit exists, but the package is gone.
4. A passing OIDC token exchange in verifyConditions only proves the package is configured as a trusted publisher on npmjs.com — it does NOT prove the runner can actually publish. Treat the runner's npm version as a separate, mandatory check.

## Tool install commands must bootstrap their own package manager

The `project-bedrock.json` tool definition shipped with `pipx install project-bedrock` on every platform, assuming pipx was already present. It often isn't (fresh macOS, fresh Linux dev box), and the install failed silently from the user's perspective — they saw `command not found: pipx` and reported "the tools install is broken." Two follow-on traps appeared while fixing it:

1. **`python3 -m pipx` does NOT work after `brew install pipx`.** Homebrew installs pipx as a standalone binary, not as a module of the user's `python3`. Verified locally: `brew install pipx` succeeded, then `python3 -m pipx ensurepath` failed with `No module named pipx`. Always invoke the `pipx` binary directly when it's available; only fall back to `python3 -m pipx` when pipx was installed via `pip --user`.

2. **Modern Linux + macOS (Sequoia + Homebrew Python) ship PEP-668 protected Python.** A plain `python3 -m pip install --user pipx` errors with `externally-managed-environment`. Always have a fallback to `--break-system-packages` for the bootstrap path, gated behind a try-without-it-first.

Rules:

1. Every `tools/*.json` `commands` field must bootstrap its own package manager when feasible. `pipx install X` is fine for end users with pipx; it is **not** fine inside an automated installer.
2. After bootstrapping a tool into `~/.local/bin`, prepend that to `PATH` in the same command so the next step finds the new binary. The current shell doesn't pick up `pipx ensurepath` until next login.
3. Test new install commands on a machine **without** the package manager preinstalled. If you only test on your dev box where the tool already exists, you'll ship the same "works on my machine" failure mode.

## When you add a settings column, the repository SQL must read AND write it

Migration 104 added `feature_flag_bedrock_integration` (DEFAULT 0). The mapper (`settings.mapper.ts`) handled both directions correctly. But `sqlite-settings.repository.ts` INSERT/UPDATE statements were never updated to include the new column. Result: writes silently dropped the field, the DEFAULT-0 backfill always supplied the read value, and `bedrockIntegration: false` was *coincidentally* always correct — so tests passed. The bug only surfaced when the migration default was flipped to 1 to enable-by-default: now the column read back `true` even when the caller had explicitly passed `false`.

Rules:

1. Adding a settings field is a four-touch change, not three: tsp/, factory, mapper, **and the INSERT + UPDATE column lists in `sqlite-settings.repository.ts`**. If any of the four is missing, persistence silently lies.
2. Never rely on a column DEFAULT to make a feature behave correctly. Defaults are migration-fill values for existing rows, not the production write path. If the write path omits the column, the bug is masked exactly until someone changes the default — which they will, eventually.
3. Roundtrip tests must use at least one non-default value per field (`true` AND `false`, both halves of every enum). A test that only ever asserts the DEFAULT for a field doesn't exercise the write path at all.

## Required TypeSpec fields propagate to every entity fixture

Adding `bedrockEnabled: boolean` to `Repository` and `Feature` in tsp/ broke ~30 unit/integration tests that construct fixtures via `Partial<Feature>` / `Partial<Repository>`. The TS error was `Property 'bedrockEnabled' is missing in type '{ ... }' but required in type 'Feature'` — even though the helper accepted Partial overrides, the literal it spread into still had to satisfy the full required type.

Rules:

1. New tsp fields default to **required** in the generated TS. If you add a required field to a widely-used entity (Feature, Repository, Application), expect O(20+) test fixture updates.
2. For backwards-compat-friendly fields whose default value is the same on every existing row (e.g. `false` for a feature flag), declare them **optional** in tsp (`field?: boolean`). The mapper compares `=== 1` which already collapses `undefined` and `null` to `false`, so persistence stays deterministic.
3. Reserve required tsp fields for invariants the domain genuinely requires (id, slug, name, etc.). Per-feature toggles are not invariants — make them optional.

## Storybook needs mocks for every new `'use server'` action

When a client component imports a server action, Storybook (which bundles only the client side) needs a parallel mock at `.storybook/mocks/app/actions/<filename>.ts` exporting the same symbols. Forgetting it gives a `Could not load ./.storybook/mocks/app/actions/<name>` ENOENT during `pnpm build:storybook`. Always pair every new `app/actions/<x>.action.ts` with its mock.

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
10. Gate the UI on `featureFlags.<name>` wherever the feature is exposed (sidebar, routes, search, FAB actions). **If the feature ships any pages under `src/presentation/web/app/<name>/`, you MUST also ADD a `SidebarNavItem` in `app-sidebar.tsx` gated on the flag — "gate the existing sidebar entry" silently passes when there is no entry to gate. See the "New Feature Pages Must Be Reachable" lesson below.**
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

When a new feature flag gates pages (e.g. `/agent-questions`, `/application/[id]/supervisor`, `/aspm`), implementation is NOT done until:

1. **Sidebar nav item** added in `src/presentation/web/components/layouts/app-sidebar/app-sidebar.tsx` (gated on the flag) so the page is discoverable — add `badge` support when there's a live count (e.g. pending questions). Pattern: `{featureFlags.<name> ? <SidebarNavItem icon={...} label={t('navigation.<name>')} href="/<name>" active={pathname?.startsWith('/<name>') ?? false} /> : null}`
2. **Entry point from related surfaces** — e.g. supervisor config linked from the app overflow menu, not just a raw URL
3. **First-run onboarding callout** — when the flag first turns on and the user has never tried it, show a dismissable callout (use `localStorage` for dismissed state) with links to the new surfaces
4. **Translation keys** for any new nav label (all 9 locales: en, ar, de, es, fr, he, pt, ru, uk) under `navigation.<name>`

**Concrete heuristic:** If you create a directory under `src/presentation/web/app/<name>/`, the same diff must add a `SidebarNavItem` for it. Treat them as inseparable — a route without nav is a dead page.

**Self-check before claiming done:** open the app, enable the flag in Settings → Feature Flags, and verify you can navigate to the new page WITHOUT typing the URL. If the only way in is the URL bar, the work is incomplete.

**Failures of this lesson (recurring — fix the pattern, not just the symptom):**

- **Spec 093 (collaboration flag):** All four items missing. Pages existed, SSE events were wired, users had no way to reach them. `agentQuestions` and `supervisorDecisions` events were received by the hook but nothing consumed them visually.
- **Spec 098 (ASPM flag):** Sidebar nav item missing. The user enabled the flag from Settings, but the only way to reach `/aspm` was to type the URL. Caught when the user asked "once enabled, how do I get it from the sidenav?" — should have been caught by me when shipping the gate.

**Rule:** After building any feature-flagged page, immediately ask: "Can a user who just turned on the flag actually find and use this?" If the answer requires knowing the URL, it's not done. This is the second time this lesson has been violated — the pattern is "I gated the existing surfaces" without checking whether a sidebar entry needed to be CREATED. Gating presupposes existence; creation is a separate step.

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

## Static Repo Polish Ships LAST — Not First — In a Multi-Phase Feature

Spec 097 (ai-native-contributor-onboarding) was tempting to slice "M1: static repo files" first because they're pure markdown and ship value to real contributors immediately. We didn't. The implementation order put TypeSpec → ports → use cases → agent → workflows → web → static docs, in that sequence, inside one PR.

**Why:** when CONTRIBUTING.md says "run `pnpm dev:cli doctor`" or "use `pnpm dev:cli contributors groom-issue --number 1234`", those commands need to actually exist and work. If the docs land first, every line is a promise the codebase doesn't yet keep — and contributors who try them immediately hit "command not found" on the second step of the onboarding flow. That's a worse first impression than no docs at all.

**Rules for any future feature that bundles "user-facing copy" with "platform capability":**

1. **Docs reference shipped capability, not future capability.** Land the use case, command, port, or workflow first. Land the doc that mentions it last. The PR can still be one bundled commit; what matters is the order inside it.
2. **CONTRIBUTING.md, ROADMAP.md, ARCHITECTURE.md, GOOD_FIRST_ISSUES.md must cross-link.** Each should appear in the README contributor block, in CONTRIBUTING.md's nav, and in each other's "Related" section. Orphaned docs rot fastest. The contributor-onboarding pipeline expects all four to exist — the agent can be told "see GOOD_FIRST_ISSUES.md" and that file will resolve.
3. **Issue-template fields must match the actual TypeSpec enum.** When `ContributorLane` is `docs | agents | ui | cli | infra`, every `.github/ISSUE_TEMPLATE/*.yml` lane dropdown must list those exact strings (case-sensitive). The grooming agent reads the issue body's `### Lane` section back into the enum — a "Web UI" string vs "ui" string will silently fail the parse. Same for `ContributionDifficulty` (`goodFirst | easy | medium | hard`).
4. **`.all-contributorsrc` ships empty + valid.** An empty `contributors: []` array with the right `projectName` / `projectOwner` / `files` block lets the in-house `IAllContributorsWriter` start appending on the first merge without a special "initialize" path. Don't ship pre-seeded fake contributors; don't ship without the file.
5. **PR template includes architecture self-checks, not just CI checkboxes.** "No `application/` or `presentation/` file imports anything from `infrastructure/`" catches the violation that lint won't catch on a fresh module. "TDD landed RED-first" reminds reviewers to ask for the test commit. These are the rules CI doesn't enforce — the template is where they live.
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

## DI Tokens: Register Under the Exact String the Consumer Resolves

Spec 097 shipped these failure modes — all caught only by E2E `shep ui` boot, not by unit tests:

1. **Concrete-name vs port-interface token mismatch.** `DesktopNotifier` was registered as `'DesktopNotifier'` but every consumer resolved `'IDesktopNotifier'`. Unit tests pass (they mock `container.resolve` and intercept by string), but production boot dies with `Attempted to resolve unregistered dependency token: "IDesktopNotifier"`.
2. **`@injectAll('Token')` requires bare-token registrations.** Channel-suffixed tokens like `'IRecapPublisher:file'`, `'IRecapPublisher:discord'` do NOT satisfy `@injectAll('IRecapPublisher')` — tsyringe matches the EXACT token string. If you want multi-injection, register each adapter under both the suffixed AND the bare token.
3. **Defining a port without an adapter is a boot bomb.** `IContributorActionGate` was defined in `application/ports/output/services/` but no `register-*.ts` ever wired a concrete. The use cases that `@inject` it crash at boot the first time anything resolves them.
4. **Production deps in `devDependencies` are invisible to local dev but break `npm pack` consumers.** `@octokit/rest`, `@octokit/plugin-retry`, `@octokit/plugin-throttling` were declared as devDependencies. Local `pnpm install` saw them because pnpm installs devDeps in workspaces, but `script-runner.test.ts` (which does `npm pack` → `npm install -g` in a clean Docker container) crashed with `ERR_MODULE_NOT_FOUND: '@octokit/rest'`. **Rule:** every package imported anywhere under `packages/core/src/` or `src/presentation/` MUST be in `dependencies`, never `devDependencies`. devDependencies are only for build tooling, linters, and test-only packages.

**Mandatory checks when adding any new port/adapter or library:**

1. The string in `container.register(...)` must EXACTLY match the string in every `@inject(...)` and `container.resolve(...)`. Grep both sides before pushing.
2. If any consumer uses `@injectAll('Token')`, register each adapter under the bare `'Token'` — not just under suffixed discriminator tokens.
3. Add the new I-prefixed token to `CRITICAL_INFRA_TOKENS` in `tests/integration/infrastructure/di/container-bootstrap.test.ts` so boot is verified in unit-level CI.
4. Any `import` from a third-party package in `packages/core/src/` or `src/` must have a matching entry in `dependencies` (not `devDependencies`). Use `grep '"<pkg>"' package.json` to confirm.

## Playwright Navigation Waits Must Use `waitForURL`, Not `toHaveURL`, Against `pnpm dev:web`

`expect(page).toHaveURL(...)` uses the `expect` timeout (default **5 s**). `page.waitForURL(...)` uses the navigation timeout (default **30 s**).

E2E specs in `tests/e2e/web/` run against `pnpm dev:web` (Next.js dev mode, Turbopack). The **first** navigation to any route triggers on-demand compilation, during which the App Router waits for the RSC payload before updating `window.location`. The URL stays on the source page until the server response arrives — easily >5 s on a cold CI runner.

Symptom: `toHaveURL` fails with `N × unexpected value "<old url>"`, then passes on retry. Reported as `1 flaky` in the Playwright summary.

**Rule:** in any spec under `tests/e2e/web/`, when waiting for navigation after a click, use `await page.waitForURL(...)`, never `await expect(page).toHaveURL(...)`. Reserve `toHaveURL` for asserting the URL **after** you already know navigation completed (e.g., after a `waitForURL` or after the destination's content is visible).

## Optional Heavy Provider Deps — Load via Non-Literal Dynamic Import (spec 101)

`@whiskeysockets/baileys` (WhatsApp Web) carries a large, partly-native
transitive tree (libsignal, protobufjs) that breaks Next.js / Storybook /
Electron bundling, and its `latest` dist-tag is a release candidate. Adding it
to `package.json` without a matching lockfile also breaks `pnpm install
--frozen-lockfile` in CI.

**Rule:** for an OPTIONAL provider dependency, load it with a NON-LITERAL
dynamic import so TypeScript does not try to resolve the (absent) module and
the eager build graph never includes it:

```ts
const pkg: string = '@whiskeysockets/baileys'; // typed as string → import() returns any
try { return await import(pkg); } catch { throw new NotInstalledError(); }
```

`import('@literal')` would make tsc resolve the module (typecheck error when not
installed) AND pull it into the bundle. The `string`-typed indirection avoids
both. Surface a clear, actionable install hint when the import fails; keep the
ban-safe alternative adapter (Cloud API over `fetch`, zero deps) behind the same
port so the feature still works without the optional package.

## App-Layer Enums Are NOT in domain/generated/output.ts (spec 101)

`WhatsAppMessageKind` was defined in `application/use-cases/whatsapp/` (an
application-layer taxonomy), but the renderer imported it from
`domain/generated/output.js` — it compiled (TS resolved the name from somewhere)
but was `undefined` at runtime, crashing the catalog at module load with
`Cannot read properties of undefined (reading 'NotLinked')`.

**Rule:** only TypeSpec-derived enums (e.g. `WhatsAppAdapterKind`,
`WhatsAppConnectionStatus`, `WhatsAppThreadTargetKind`) live in
`domain/generated/output.ts`. Application-layer enums/const-objects must be
imported from their own module. If an enum is undefined at runtime but the build
passed, check the import path first.

## Settings Repository INSERT/UPDATE Omits Some Columns — Add Runtime-Mutated Ones (spec 101)

`sqlite-settings.repository.ts` hardcodes its INSERT/UPDATE column lists and
silently omits several columns the mapper produces (`default_home_page`,
`skill_injection_*`), relying on DB DEFAULTs. better-sqlite3 IGNORES extra keys
on the bound object, so this doesn't error — it just never persists those
fields. For WhatsApp, `status` and `linkedNumber` change at RUNTIME and the
`whatsappDispatch` toggle must persist, so I added every new column to BOTH the
INSERT (column list + VALUES) and the UPDATE SET clause. Round-trip tests with
non-default values are the only way to catch a missing column.

## Adding a Required Method to a Port Breaks Every Full Mock of It (spec 101)

Adding `findLatestByFeatureId` to `IAgentRunRepository` compiled the production
impl fine but broke ~17 unit tests that build a FULL typed mock object
(`const repo: IAgentRunRepository = { create: vi.fn(), findById: vi.fn(), ... }`).
TS2741 "Property X is missing" fires at every such fixture — not at the
interface.

**Rule:** when you add a method to a widely-mocked output port, grep for an
existing sibling method (e.g. `findByThreadId:`) across `tests/` and add the new
`vi.fn()` next to it in every full mock in one pass. `as any` / `Partial<>`
mocks are unaffected; only fully-typed object literals break. Prefer this over
making the method optional — optional methods on a port are a smell.

## A Web Feature Is Not Done Until the PAGE Exists and Is Reachable — Components + Storybook Are Not Enough

When building a web UI feature, shipping the presentational components and their Storybook stories is only HALF the job. Storybook proves a component renders in isolation; it does NOT make the feature usable. A user cannot reach a Storybook story from the running app.

**What went wrong:** During the SDLC board build, the board components (`SdlcBoard`/`Column`/`Card`) + stories were built and `build:storybook` passed — but there was no `app/sdlc/page.tsx` route, no client component wiring the SSE hook + server actions, and no sidebar nav link. The feature was invisible in `shep ui` / `pnpm dev:web`. The user had to say "always build the page UI!".

**Rule — every web feature MUST include, in the same body of work, ALL of:**
1. The **route/page** under `src/presentation/web/app/<feature>/page.tsx` (server loader that resolves the use case via DI, `export const dynamic = 'force-dynamic'`).
2. The **client component** that wires real-time (SSE hook) + mutations (server actions) + optimistic UI to the presentational components.
3. The **sidebar nav entry** (+ any entry points) so the page is discoverable — see the sibling lesson "New Feature Pages Must Be Reachable".
4. Only THEN the isolated components + Storybook stories.

**Sequencing:** build the page UI as a first-class deliverable of the same phase, not a "later". When planning a UI feature, the route + client + nav are line items, never assumed. Treat "build:storybook passes" as a quality gate, NOT as "the UI is done".
## Adding a New Claude Model — Exact Touchpoints

Model lists are centralized, but several adapters keep their own provider-format copies. Claude Code passes `options.model` straight to the `claude` CLI via `--model`, so no mapping is needed there — but Cursor and Copilot rewrite the canonical hyphenated ID into their own format. To add a model (e.g. `claude-opus-4-8`), touch ALL of:

1. `packages/core/src/infrastructure/services/agents/common/agent-model-catalog.ts` — add to `CLAUDE_CODE_MODELS`, `CURSOR_MODELS`, and `COPILOT_CLI_MODELS` (note Copilot uses dotted form `claude-opus-4.8`, the others hyphenated). This is the source of truth for `AgentExecutorFactory.getSupportedModels()`.
2. `src/presentation/web/lib/model-metadata.ts` — add a `displayName`/`description` entry (hyphenated key). Missing entries fall back to a prettified raw ID.
3. `packages/core/src/infrastructure/services/agents/common/executors/cursor-executor.service.ts` — `CURSOR_MODEL_MAP` maps `claude-opus-4-8` → `opus-4.8`. Unmapped IDs pass through unchanged (a silent bug — the catalog can list a model the map doesn't translate).
4. `packages/core/src/infrastructure/services/agents/common/executors/copilot-cli-executor.service.ts` — `LEGACY_MODEL_ALIASES` maps hyphenated → dotted for old settings payloads.
5. `.storybook/mocks/app/actions/get-all-agent-models.ts` and `get-supported-models.ts` — Storybook bundles the client only, so these mocks must mirror the catalog or the picker stories drift.
6. `tests/unit/infrastructure/services/agents/agent-executor-factory.test.ts` — `getSupportedModels` tests assert exact lists AND lengths per agent (Claude Code, Cursor, Copilot). Update the arrays and the `toHaveLength` count.

The default model (`settings-defaults.factory.ts` `DEFAULT_MODEL`) is a SEPARATE decision — adding a model does NOT change the default. Don't touch it unless explicitly asked.

## A Use Case Is Not Wired Until It's Registered in the DI Container by STRING Token

`@injectable()` on a use case only makes it resolvable by its CLASS token (`container.resolve(MyUseCase)`), which is how CLI commands resolve. The web/server layer resolves by STRING token (`resolve('MyUseCase')` via `server-container.ts`). A string token throws "Attempted to resolve unregistered dependency token" unless it is explicitly registered.

**What went wrong:** The plane-like PM feature (PR #552) added ~74 use cases (projects, work-items, cycles, modules, epics, intake, pages, time-entries, members, notifications, search, analytics, auth, etc.) and their repositories, but NONE of the use cases were registered in the DI container. Repositories were registered, so it looked wired — but every PM web page threw at runtime (`/projects` was the one the user hit). The whole feature was dead in the web UI.

**Rule — registering a use case requires BOTH lines, in a `register-*.ts` module called from `container.ts`:**
1. `container.registerSingleton(MyUseCase);` — class token (CLI).
2. `container.register('MyUseCase', { useFactory: (c) => c.resolve(MyUseCase) });` — string token (web).

**How to catch the whole class of bug:** diff the string tokens the web resolves against what the container registers:
```
grep -rhoP "resolve<\w+>\('(\w+UseCase)'\)" src/presentation/web | grep -oP "'\w+UseCase'" | tr -d "'" | sort -u  # web side
grep -rhoP "register(Singleton|Instance)?(<[^>]+>)?\('(\w+UseCase)'" packages/core/src/infrastructure/di/ | grep -oP "'\w+UseCase'" | tr -d "'" | sort -u  # registered
```
`comm -23` the two lists. Beware: registrations use generic syntax `register<IFoo>('Foo', ...)` and const tokens (`IBedrockIntegrationServiceToken = 'IBedrockIntegrationService'`) — naive greps miss both and produce false "missing" hits. Always confirm against the real container by RESOLVING, not just grepping.

**Prevention:** every new feature's DI wiring needs a registration test that bootstraps the real container and resolves each string token — see `tests/unit/infrastructure/di/pm-use-case-registrations.test.ts`. A feature with web pages but no DI-registration test is not done. When a file like `register-use-cases.ts` exceeds ~300 lines, add a dedicated `register-<feature>.ts` module instead of growing it.

## User Dev Servers Must Not Inherit cli-only Env (NEXT_ASSET_PREFIX, PORT)

In the cloud org-runner pod, the cli process runs with `NEXT_ASSET_PREFIX=/cli` and `PORT=3000` set pod-wide (so the cli's own Next.js UI is served correctly behind the shep-cloud `/cli` proxy). `DeploymentService.start()` spawned user dev servers with `env: { ...process.env }`, so a user's Next.js dev server **inherited `NEXT_ASSET_PREFIX=/cli`** and emitted `/cli/_next/...` asset URLs. Those 404 on the preview origin (`<port>-<orgHex>.preview.shep.bot`) because a Next server serves static at `/_next/...`, not `/cli/_next/...` — every previewed app loaded unstyled with a console full of `/cli/_next/static/*` 404s.

**Rule:** scrub cli-only vars (`NEXT_ASSET_PREFIX`, `PORT`, Anthropic creds) from the env at the spawn point via `buildDevServerEnv()` — do NOT rely on the org-runner `env-scrub` PATH wrappers, which only intercept `npm/pnpm/yarn/bun/npx` by name and are bypassed when the binary (e.g. `bun`, or a globally-installed pnpm in `/data/.npm-global/bin`) resolves ahead of `/usr/local/sbin`. Keep `HOST`/`HOSTNAME` (intentionally `0.0.0.0` so the preview proxy can reach the dev server on the pod IP).

## Debugging Prod 404s: Read the Request's Referer/Origin BEFORE Theorizing

I first "fixed" these `/cli/_next/*` 404s as a per-org-pod build-skew problem (shep-cloud PR #22) — plausible, but WRONG: the failing requests' **`Referer` was the preview host** (`<port>-<org>.preview.shep.bot`), i.e. they came from a *user dev server*, not the cli UI. The ingress access log line carries Referer, status, and `upstream_addr` — read those FIRST. A 404 from a path that a healthy pod serves at 200 means the request isn't going where you assume; the Referer/Host tells you which proxy path (`/cli/*` vs `/preview-proxy`) actually handled it. Confirm the exact failing request path end-to-end before writing a fix.

## No CLI-Only Flows in the Web UI — Every Workflow Must Be Doable from the App

The web UI is the product, not a console for the CLI. Telling a user to "Run `shep aspm ingest --sarif <file> --application <slug>`" from a web empty state is a UX failure: it requires them to leave the browser, know the CLI, know their app slug, and find the file path — none of which the UI helped with. Worse, the empty state stays empty forever because there's no way to populate it from the UI, so the section silently appears broken on every visit.

**Concrete recurrence (spec 098 — ASPM):** Three places shipped with `<code>shep aspm ingest --sarif</code>` instructions in their empty states (`posture-cards.tsx`, `findings-table.tsx`, `aspm-application-section.tsx`). The CLI command existed, the use case existed, the DI wiring existed for everything except the web — but no server action, no dialog, no button. Users had no way to fill the dashboard from the app itself.

**Rule:** If a CLI command exists for a workflow that has any UI surface, the SAME workflow must be reachable from that UI. The CLI is for power users and automation; it is never the primary or only way to do something users will encounter in the browser.

**Checklist when shipping a CLI command that has a paired web surface:**

1. **String-token alias for the use case** — register `container.register('XUseCase', { useFactory: ... })` in the appropriate `register-*.ts` module so a web server action can `resolve<XUseCase>('XUseCase')`. The CLI uses class tokens; the web cannot. Also add the token to `tests/integration/infrastructure/di/container-bootstrap.test.ts` `WEB_ROUTE_TOKENS` so a missing registration trips CI, not production.
2. **Server action** at `src/presentation/web/app/actions/<name>.ts` that wraps the use case. Always start with `requireFeatureFlag(<name>)`, catch `FeatureFlagDisabledError` separately, and translate other errors into `{ ok: false, error }` so the UI sees a usable shape (never a raw 500).
3. **Storybook mock** at `.storybook/mocks/app/actions/<name>.ts` — same exported names and signatures, returning fixture data. Without this, the Storybook build fails the moment any component imports the action.
4. **Dialog or page** that drives the action. File upload? Use FormData + a `<input type="file">` + a labeled drop target. Multi-step? Use the existing `Dialog` primitive with a result panel inline (no second navigation).
5. **Empty-state CTAs that include the trigger** — never write "Run `shep …`" in an empty state. Write a one-line description of what's missing, then place the trigger button right under it. The user should be able to fix the empty state from where they're standing.
6. **Persistent entry point** in addition to empty-state CTAs — surface the same trigger somewhere always-visible (sub-nav action, page header button) so a user with existing data can re-run the workflow without first deleting it.
7. **Revalidate after success** — `revalidatePath('/<section>', 'layout')` so server-component data refreshes without the user reloading.

**Anti-patterns to refuse on sight:**

- `<span>Run <code>shep …</code> to do X</span>` in any web component empty state. Always replace with a button that does X.
- A web feature that depends on a CLI step the user must run "first" before the web works (e.g. "run `shep init` then refresh"). If init is required, the UI must offer to run it.
- Surfacing the CLI command as the documentation/help text inside a "How to populate this view" tooltip. Documenting the gap doesn't close it.

**The 5-second test:** open the page in a browser, look at it as a user who has never seen the CLI. Can you complete the primary task on this page without opening a terminal? If no, the page is incomplete.

## Web pages must `import type` use cases — not runtime-import them

Symptom: every `/aspm/*` route returned `Internal Server Error`; Next.js/turbopack logged `Module not found: Can't resolve '../../../../domain/generated/output.js'` (and similar `.js` resolutions deeper in the package). The control-center even returned 500s once the bundler had walked the failing graph once.

Root cause: ASPM server components did `import { GetPostureSummaryUseCase, ... } from '@shepai/core/application/use-cases/aspm/posture/get-posture-summary'`. Importing the *class* as a runtime value forces Next.js to bundle the use-case source, which then walks every `.js`-suffixed relative import inside `packages/core/`. Turbopack's `.js → .ts` resolution doesn't follow those deeper paths reliably, so the bundle fails. Once the graph fails, the dev server enters a stuck state where unrelated routes also 500.

Concrete instance: `src/presentation/web/app/aspm/page.tsx` (and every sibling under `app/aspm/`) used runtime `import { UseCase }` + `resolve(UseCase)`. The convention elsewhere in the repo is `import type { UseCase }` + `resolve<UseCase>('UseCase')` paired with a string-token registration alongside the class token (see `register-use-cases.ts`).

Rules for any new web page or server route:

1. **Always `import type` use cases from `@shepai/core`** — never `import { ClassName }`. Webpack/turbopack will bundle the entire use-case source otherwise, which can break deep relative `.js` imports inside `packages/core/`.
2. **Resolve via string token** — `resolve<UseCase>('UseCase').execute()`. The use case must also be registered under that string in its DI module.
3. **Add the string-token alias next to the class registration** in the relevant `register-*.ts` module: `container.register('UseCase', { useFactory: (c) => c.resolve(UseCase) })`. This keeps existing class-token consumers (CLI, tests) working while letting type-only web imports resolve at runtime.
4. **Domain error classes are safe to runtime-import** when the file has no transitive imports (e.g. `FindingNotFoundError`). Bundling those is harmless because there's no resolution chain to follow.
5. **If `/aspm/*` (or any route) returns 500 and the log says "Module not found" inside `packages/core/src/`**, the fix is at the *web page*, not the package: swap runtime imports for type imports.

## Owners surface must be populated, not just resolved (feat/aspm-platform, 2026-05-21)

Bug: the ASPM `/aspm/owners` page sat on "No owners yet" forever even when the
spec promised ownership derived from git committers.

Cause: `ScanApplicationUseCase` resolved a git author email via
`IGitOwnershipPort.lookup` and then stuffed that raw email straight into
`SecurityFinding.ownerId`. It never wrote a row to the `owners` table, so
`IOwnerRepository.listAll()` (which `ListOwnerRollupsUseCase` powers the
Owners page with) returned empty.

Rule: whenever an external signal (git, OIDC, SSO, agent output) maps to a
domain entity that has its own rollup/list view, the use case orchestrating
that signal MUST upsert the entity, not just stamp its identifier on the
adjacent record. "Resolves to" and "creates the row for" are two separate
contracts.

How to apply:

- Before reusing an "id" string returned by a port, ask: is there a table whose
  rollup screen lists rows of that type? If yes, ensure your use case has
  injected the matching repository and is doing a find-or-create.
- Cache within a single run (Map<email, ownerId>) to avoid N round-trips when
  many findings share a committer.
- Guard the create call against the unique-handle race: on error, re-query.

## In ASPM UI, "branch" = a Feature (worktree), not a git ref on a Repository

The `Repository` domain entity does NOT track multiple branches — it is just `{id, name, path, remoteUrl?}`. The thing users call a "branch" when they ask to "scan this branch" is a **Feature** with a `worktreePath` (and `applicationId` linking back to the parent Application).

When the user requested "scan a repository branch" for ASPM, the right wiring was:

- pass the Feature’s `worktreePath` as a new `scanPath?: string` override on `ScanApplicationUseCase`
- still attribute findings to `feature.applicationId` (the schema requires it)

Rule: before designing a "scan a branch" / "build a branch" / "deploy a branch" feature, check the Feature entity — not the Repository entity — for `worktreePath` + `branch`. Repositories are just paths.

How to apply:

- If you catch yourself proposing a `branchName` field on Repository, stop — you almost certainly want a Feature reference instead.
- When extending a use case to scan/build an alternate working tree, prefer an optional `scanPath?: string` (or equivalent) override on the existing use case over inventing a new one. Findings/results still attribute to the Application/Repository row the user cares about.

## Feature.worktreePath is rarely populated — never filter on it

In the live DB virtually every Feature row has `worktree_path = NULL`, even for features in active lifecycle states (Review, Implementation, Maintain). The field only gets set by a few specific flows. Treating it as the source of truth for "is this feature a real branch?" hides almost every feature from any UI that filters on it.

Concrete instance: the ASPM /aspm/inventory page filtered features by `worktreePath !== undefined` so it would only show "scannable" branches. The user expected to see their `feat/aspm-platform` feature under the `cli` repo and instead saw "no applications or branches yet" — because the feature had a null worktree_path even though it had been worked on for weeks.

Rule: never filter feature rows on `worktreePath` for *display* purposes. Use `branch` and `repositoryPath` as the identity of a feature on disk. `worktreePath` is only meaningful when you are about to scan/checkout/spawn against it, and even then you should fall back to `git worktree list` or `<repositoryPath>` instead of hiding the row.

How to apply:

- Inventory / list / explorer views: include every non-Archived, non-deleted Feature. Render `branch` as the secondary identifier.
- Scan / build / deploy actions: when the action requires an on-disk path, check `worktreePath` per row at action time and disable the action (or fall back) when it is missing — do not pre-filter the row out of the list.
- Tests: pin down the "row with null worktreePath still appears" case explicitly. It is the more common shape in real data.

## Release-notes generator: ground the tagline in commit types, pin evidence to an immutable ref

Two bugs shipped together in the v1.210.0 GitHub release (custom `scripts/release-notes-*.mjs` semantic-release plugin):

1. **Tagline contradicted the changelog.** Claude wrote _"Under the hood maintenance and housekeeping — no user-facing changes…"_ for a release whose only commit was a `feat` (gated behind a feature flag). A flagged feature still ships. The prompt let Claude reason "behind a flag ⇒ internal", and nothing validated the result against the actual commit types.
2. **Evidence images 404'd.** PR bodies embedded `raw.githubusercontent.com/owner/repo/<feature-branch>/specs/.../evidence/*.png`. After squash-merge the branch is deleted ⇒ broken images. The extractor added PR-body URLs verbatim.

Fixes:

- `buildPrompt` now branches on `hasUserFacingChanges` (any feat/fix/perf) and explicitly forbids "maintenance / housekeeping / under the hood / behind the scenes / no user-facing changes" framings for user-facing releases. Plus a post-generation guard (`isMaintenanceOnlyFraming`) rejects a contradictory tagline and falls back to the static one.
- `normalizeRepoMediaUrl` rewrites any repo-hosted raw/blob URL to the immutable release tag (`nextRelease.gitTag`), threaded through as `ref`. Bare `specs|docs|evidence` paths now also pin to the tag, not `main`.

Rules:

- A git **ref can contain slashes** (`feat/aspm-platform`). You cannot split ref-from-path positionally in a `raw.githubusercontent.com/owner/repo/<ref>/<path>` URL. Recover the path by locating the first known repo root segment (`specs`/`docs`/`evidence`), not by `slice(3)`.
- Anything permanent (release notes, changelog) must reference an **immutable ref** (tag or commit SHA), never a branch — branches get deleted.
- When an LLM writes user-facing copy from structured data, **validate the output against that same data** before publishing. Don't trust the prompt alone; add a deterministic guard that falls back on contradiction.
- `.mjs` scripts under ESLint need browser/Node globals declared: `/* global fetch, URL */`.
