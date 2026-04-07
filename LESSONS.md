# Lessons Learned

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
