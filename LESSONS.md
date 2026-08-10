# Lessons Learned

## Two independent gates need two independent markers — never overload a lifecycle

Spec 110 added a parallel-feature cap. A capacity-queued feature and a
user-deferred (`--pending`) feature sit in the **same** `Pending` lifecycle, and
exactly one of them may be started automatically. Encoding "queued" as a
lifecycle value (or as bare `Pending`) would either auto-start work the user
deliberately deferred, or require a new `SdlcLifecycle` member rippling through
36 files — where, per the enum lesson below, raw string comparisons compile
silently and are missed by an `SdlcLifecycle.` grep.

The marker is `Feature.queuedAt`: it is simultaneously the flag
(`isQueuedForCapacity`), the FIFO ordering key, and an honest record of *when
the user asked for the feature to run*.

Rules:

1. **When a second gate can hold an entity back, give it its own field.** Ask
   "can both conditions be true at once, and do they release on different
   events?" If yes, one lifecycle cannot represent both.
2. **Evaluate gates in dependency order and stop at the first closed one.** The
   capacity check runs only *after* the parent gate opens, so a feature that
   cannot run anyway never takes a queue place ahead of one that can.
3. **A capacity count must be derived, never decremented.** `countByLifecycles`
   recomputes from lifecycle on every call; a maintained counter leaks a slot
   forever the first time a worker crashes or a feature is force-deleted, and
   the only symptom is a queue that silently never drains.
4. **Wire the drain to every event that frees a slot, not just the obvious one.**
   Lifecycle transition, settings change (raising the limit), feature deletion,
   and a state-side sweep on dashboard load. Two of those are not lifecycle
   transitions at all, so an event-side-only hook strands features.

## Extract the spawn path before adding a gate to it

Three call sites built the feature-agent spawn options bag by hand
(`CreateFeatureUseCase`, `StartFeatureUseCase`, `CheckAndUnblockFeaturesUseCase`)
and had already drifted: the auto-unblock path omitted `agentType` and `modelId`,
so a feature created against `gemini-cli` silently restarted under the default
agent when its parent landed. Nothing failed — it just ran the wrong agent.

**Rule:** when a fourth concern (here, admission control) is about to be added to
N duplicated code paths, collapse them first. `SpawnFeatureAgentUseCase` is now
the only place that builds the bag, so the gate was written once and the drift
was fixed as a side effect. A unit test asserting the spawned options carry the
`AgentRun`'s `agentType`/`modelId` is the regression lock — assert on
`spawn.mock.calls[0][5]`, because an options-bag omission is invisible to
typecheck (every field is optional).

## `ci_watch_enabled` was written by the mapper and dropped by the SQL

Found while adding `workflow_max_parallel_features`: `settings.mapper.ts` wrote
`ci_watch_enabled` in both directions, but `sqlite-settings.repository.ts` never
listed the column in its INSERT or UPDATE. Toggling CI watch in the UI appeared
to save and silently reverted, masked by the column DEFAULT.

**Rule:** when adding a settings or feature column, grep the repository for a
*neighbouring* column name and confirm your field appears in all three lists
(INSERT columns, INSERT `@params`, UPDATE `SET`) — then check the neighbour is in
all three too. This defect class has now shipped four times; each new field is a
chance to catch an older one.

**Rule:** the round-trip test must write a **non-default** value and then a
*second, different* non-default value. Only the second write exercises UPDATE;
asserting the default alone passes even when the write path does not exist.

## A port method addition should be a one-line change, not fifteen

Adding `countByLifecycles`/`listQueued` to `IFeatureRepository` broke 22 test
files, each carrying its own `{ create: vi.fn(), findById: vi.fn(), ... }` copy
of the mock.

**Rule:** test doubles for a port live in one place
(`tests/helpers/feature-repository.mock.ts`), typed as
`{ [K in keyof IPort]: Mock }` so the compiler still enforces the shape. Before
hand-patching the same mock in more than two files, extract it.

## A copied "resume" command must carry its working directory

Agent CLI sessions (`claude`/`codex`/`cursor-agent --resume <id>`) are
**project-scoped** — the binary resolves the session from the current working
directory. The "Copy resume command" action copied a bare `claude --resume <id>`,
which the `cwd` was captured for but never included, so pasting it anywhere but
the project directory failed to find the session. "Resume in terminal" worked
only because the PTY was spawned already `cwd`'d into the project.

**Rule:** when a command depends on `cwd` and leaves the process that carries it
(copy-to-clipboard, "open in…", a docs snippet), make it self-contained:
`cd '<quoted-cwd>' && <command>`. A form that only works because *this* shell
happens to be in the right directory is a latent bug the moment it's copied
elsewhere. Keep the bare form for the in-place terminal write, add a distinct
`clipboardCommand` for anything that travels.

## A dependency gate must open on "the work landed", not on "the work started"

The dependency gate released a child as soon as its parent reached
`Implementation` (`POST_IMPLEMENTATION = {Implementation, Review, Maintain}`), so
clicking Start on a node visibly chained behind a still-running one just… started
it. Two things were wrong, and the second was invisible until the first was fixed:

1. **The gate encoded progress, not completion.** The merge node is unambiguous —
   `merged ? Maintain : Review` — so only `Maintain` means the branch actually
   landed. `Implementation` means the parent is still writing the code, and
   `Review` means its PR may still change or never merge. The gate is now
   `COMPLETED_LIFECYCLES = {Maintain}` (plus `Archived` carrying
   `previousLifecycle: Maintain`).
2. **Two paths to the same transition disagreed.** Auto-unblock rebased the child
   onto the parent branch; manual Start called `SyncFeatureBranchUseCase` with no
   parent at all and rebased onto `main` — so a manually-started child silently
   inherited *none* of its parent's work. Both now call the same use case, which
   picks the target: base branch when the parent's work is already an ancestor of
   it, parent branch while it is not.

**Rules:**
- When a gate answers "may B build on A?", the predicate is about A's work being
  **durable**, not about A having begun. Name the set for the property
  (`COMPLETED_LIFECYCLES`), not for its position in an enum (`POST_IMPLEMENTATION`)
  — the positional name is what made `Implementation` look like it belonged.
- If two code paths perform the same transition, they must share the use case that
  performs its side effects. Anything a UI button and a background reconciler both
  do WILL drift; only the divergence's victim (here, a child missing its parent's
  commits) tells you, and it tells you late.
- `verifyMerge` returns **false** for a branch it cannot resolve — the same answer
  it gives for "not merged". A deleted-after-merge parent therefore reads as
  unmerged and aims the rebase at a branch that cannot even be fetched. Probe
  existence separately (`revParse` on `<branch>` and `origin/<branch>`) before
  trusting a boolean that conflates "no" with "don't know".
- **Only the real-git integration test caught that.** Every mock returned what I
  assumed `verifyMerge` returns. Any use case that branches on a git predicate
  needs one real-repo test per branch — `push origin --delete` + `branch -D` is
  three lines and reproduces the whole class of bug.
- Changing a gate changes what the UI must say. Start on a blocked child used to
  toast "Feature started" while quietly writing `Blocked`; the use case now
  returns `{ blocked, blockedBy }` so CLI and web report the truth instead of
  re-deriving it from `feature.lifecycle === 'Blocked'`.

## `git stash push` ignores untracked files — never use it as a "make the tree clean" primitive

`RebaseFeatureOnMainUseCase` stashed before rebasing, so a dirty worktree was supposed to be
handled. It wasn't: `git stash push` (no `-u`) leaves untracked files in place, so a worktree
holding only new files stayed dirty, `hasUncommittedChanges` (which reads `git status --porcelain`,
and DOES report `??` entries) still returned true, and the rebase aborted with "Cannot rebase:
working directory has uncommitted changes" — the exact error the stash was added to prevent. The
stash/pop pair also has a second failure mode: a pop that conflicts strands work outside the branch.

Rules:

1. **To guarantee a clean tree before a git operation, commit — don't stash.** A commit lands on the
   branch, survives every subsequent failure, and is undone with `git reset --soft HEAD~1`.
   `SyncFeatureBranchUseCase` is the shared commit-then-rebase workflow; use it instead of
   reimplementing the dance.
2. **If you must stash, `-u` is mandatory** — and remember `git status --porcelain` and
   `git stash push` disagree about what "dirty" means. Any guard that pairs them is a latent bug.
3. **Automated commits pass `{ noVerify: true }` to `commitAll`.** The target repo's pre-commit
   linter or commitlint rules must never be able to block Shep's own housekeeping commit.
4. **Test the untracked-file case with real git.** Every mock-based test passed; only
   `tests/integration/application/use-cases/features/sync-feature-branch.use-case.test.ts` (real
   repo, real remote, untracked file) reproduces it.

## A second surface for an entity must offer the same actions — parity is part of the feature

Spec 106 added the session-tree sub-nav as a second way to browse repositories, but the rows were
read-only: every action (IDE, shell, folder, webhook, chat, new feature, dev server, remove) still
required going back to the canvas card. The user's report was one sentence: "we should be able to do
the same actions we can do on the canvas on a repo."

Rules:

1. **When you add a second surface onto an existing entity, the action set is part of the scope, not
   a follow-up.** Ask "what can the user do to this thing on the surface that already exists?" and
   answer all of it, or say explicitly which parts you left out and why.
2. **Two surfaces means the action list gets extracted, not copied.** `repository-actions.ts` is a
   pure builder (labels, tones, loading/disabled rules) that both the canvas toolbar and the tree
   dropdown consume via `useRepositoryCardActions`. The payoff is the invariant: an action added
   there appears on both surfaces, and it is unit-testable without React, routers, or providers.
3. **Anything the new surface renders per row must be lazy.** The tree renders one action menu per
   repository. Mounting the hooks eagerly fired a webhook probe and a deployment hydration for all
   22 rows on every tree load. Putting the hook-bearing component *inside* `DropdownMenuContent`
   fixes it for free — Radix unmounts closed content — and a test asserting `fetch` is untouched
   before the menu opens keeps it that way.

## Provider access is a layout decision — check the React tree before promising a shared action

The session tree lived in `app-shell` (root layout) while `DeploymentStatusProvider` and
`SessionsProvider` lived under the `(dashboard)` layout and inside `ControlCenter`. `useDeployAction`
falls back to a **silent no-op store** when its provider is absent, so a Start Dev Server button in
the tree would have rendered, clicked, and done nothing — no error, no log. Moving the panel into the
`(dashboard)` layout put it inside both providers and let the route-gate module
(`session-tree-visibility.ts`) be deleted outright: the layout boundary already answers "which routes
show the tree", and it cannot be wrong.

Rules:

1. **Before wiring a shared action into a new surface, verify the provider is an ancestor of that
   surface** — not merely "somewhere in the app". Optional-context hooks with no-op fallbacks
   (`useDeploymentStatusContextOptional`, `useSessionsContext`) fail silently by design.
2. **Prefer moving the consumer into the provider's subtree over mounting a second provider.** Two
   stores for the same data means the same Run button shows different state on two surfaces.
3. **A route-group layout is a better route gate than a path list.** If chrome belongs to every route
   in a group, render it in that group's `layout.tsx` and delete the predicate.

## A new Feature column needs FOUR edits, and the mapper test won't catch the missing one

Adding `sourceAgentSessionId`/`sourceAgentType` (spec 105) needed: the TypeSpec model, the
migration, `feature.mapper.ts`, **and** the explicit column lists in
`sqlite-feature.repository.ts`. I did the first three, and the mapper unit test passed happily —
because `toDatabase()` produced the fields correctly. But `INSERT` and `UPDATE` in the repository
enumerate every column by name (`active_plugins, ...` / `active_plugins = @active_plugins`), so the
new fields were silently dropped on the way to SQLite. Only a repository-level round-trip test
(`create` → `findById`) exposed it.

**Rule:** when adding a persisted field, write the assertion at the **repository** level, not the
mapper level. A mapper test proves the object was shaped right; it proves nothing about whether the
SQL carries it. Grep the repository for a neighbouring column name (e.g. `active_plugins`) and
confirm you've added yours to every list that mentions it — there are three: INSERT columns, INSERT
`@params`, and the UPDATE `SET` clause.

## `startsWith('/')` is not an absolute-path check — CI runs windows-latest

I guarded two use cases with `if (!path.startsWith('/'))`. `normalizePath` converts backslashes to
forward slashes, so a valid Windows path arrives as `C:/Users/dev/project` — which fails that check,
meaning bulk import would have rejected every path on Windows. Local tests all passed because they
used POSIX fixtures.

**Rule:** use `domain/shared/absolute-path.ts` (`isAbsolutePath`) for absolute-path validation, never
a `startsWith('/')` literal. When adding any path predicate, add a Windows drive-letter case to the
test in the same commit — `src/CLAUDE.md` and `packages/CLAUDE.md` both mandate cross-platform
behaviour, and macOS-only test runs will not tell you.

## Adding one key to `translations/en/*.json` breaks eight other locales

Adding the `commands.repo.import.*` keys to `en/cli.json` turned
`tests/unit/translations/translation-completeness.test.ts` red with 8 failures — it asserts key
parity between English and each of de, fr, es, pt, ru, uk, ar, he.

**Rule:** i18n keys are added to all nine locale files in the same change, never English-only. Read
the key order from the English file and write the same ordered keys into each locale so the diff
stays reviewable.

## `pnpm tsp:compile` leaves the generated file unformatted — use `pnpm tsp:codegen`

Running `tsp:compile` as a validation step rewrote
`packages/core/src/domain/generated/output.ts` with double quotes, producing a 500-line phantom diff
that looks like codegen drift. `tsp:codegen` is `tsp compile` **plus** `prettier --write` on the
generated directory.

**Rule:** always regenerate with `pnpm tsp:codegen`. If `tsp:compile` has already dirtied the
generated file, run `pnpm tsp:codegen` to restore it rather than reverting — and don't mistake the
quote-style churn for a real model change.

## New files under `domain/` must NOT use `.js` extensions in relative imports

Adding `domain/shared/worktree-config.ts` (spec-less feature for issue #833), I wrote
`import type { WorktreeConfig } from '../generated/output.js'` — the extension convention every
`infrastructure/` file uses. `tests/unit/presentation/web/smoke-imports.test.ts` failed: the web
package consumes `packages/core/src/domain/` as **raw .ts source**, and Turbopack cannot resolve a
`.js` specifier pointing at a `.ts` file. Nothing else caught it — typecheck, lint, `pnpm build`,
and the CLI all pass, because tsc + `tsc-alias --resolve-full-paths` rewrite extensions for the
Node build. The break only appears in the web bundler.

Rules:

1. Inside `packages/core/src/domain/`, relative imports carry **no extension**
   (`from '../generated/output'`). Everywhere else in core keeps `.js`. Copy the convention from a
   sibling in the same directory, not from the layer you were last editing.
2. Importers **outside** `domain/` still use `.js` when importing a domain file
   (`from '../../../domain/shared/worktree-config.js'`) — the asymmetry is correct, not a typo.
3. When adding a helper meant to be shared by core *and* the web package, run
   `npx vitest run tests/unit/presentation/web/smoke-imports.test.ts` before pushing. It is the only
   check that catches this, and it lives under web tests where you would not think to look.

## Shared config semantics belong in `domain/`, not duplicated per surface

`settings.worktree` is read by four places: the SQLite mapper, the hook runner, the CLI
`settings worktree` command, and the web Settings section. My first pass had "trim the command,
treat blank as unset" and the `300000` default timeout re-implemented in each — three copies of a
magic number and four chances to disagree about what an empty string means. Collapsed into
`domain/shared/worktree-config.ts` (`normalizeWorktreeConfig`, `resolveWorktreeCommandTimeoutMs`,
`DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS`), which every surface now calls.

**Rule:** the moment a settings field has non-trivial semantics (normalization, a default, a
validity rule), put those semantics in a domain helper *before* wiring the second consumer.
Persistence mappers and presentation layers are consumers of the rule, never co-owners of it —
otherwise "blank means unset" silently means four different things.

## Native modules (better-sqlite3) break global installs — surface a fix, don't crash

A user's `npm i -g @shepai/cli` crashed at startup with `Could not locate the bindings file` from `better-sqlite3`. `better-sqlite3` is a native addon: its compiled `.node` binary must match the running Node ABI, and a global install can end up with no binary at all (install scripts skipped via `ignore-scripts`, no prebuilt for a brand-new Node like v24/ABI 137, or a stale binary after a Node upgrade). The raw error is a meaningless multi-line stack to an end user.

Rules:

1. **Any `new Database()` (or other native-addon load) at bootstrap MUST be wrapped** so the raw failure becomes a typed, actionable error. See `infrastructure/errors/sqlite-native-binding-error.ts` (`isSqliteNativeBindingError`/`toSqliteNativeBindingError`) + the try/catch in `sqlite/connection.ts`. The CLI bootstrap prints `err.remediation`, not a stack.
2. **`bootstrap()` opens the DB before ANY command (including `doctor`) is parsed.** So a `shep doctor` diagnostic that probes the binding is UNREACHABLE in the exact failure it targets — the process dies at DB init first. Don't add a doctor check for a bootstrap-fatal dependency; fix it on the failure path (runtime error) + install path (postinstall guard) instead.
3. **Migrating shep's own persistence to `node:sqlite` would NOT remove `better-sqlite3`** — `@langchain/langgraph-checkpoint-sqlite`'s `SqliteSaver` depends on it directly (confirmed in `pnpm-lock.yaml`). Before scoping a "drop the native dep" migration, grep the lockfile for transitive dependents; the dep often survives the migration via a library you don't control.
4. **A `files`-allowlisted `postinstall` guard must never fail the install.** `scripts/verify-native-bindings.mjs` probes the addon, attempts ONE `npm rebuild`, prints guidance, and always `exit(0)`. A throwing postinstall bricks `npm i`. Remember to add the script path to `package.json` `files` or it won't ship in the tarball.

## Adding Enum Members — Grep String Literals, Not Just `Enum.Member`

Adding `Analyzing`/`Installing` to `DeploymentState` (spec 103, task-14) required updating every place that treats a deployment as "active". Grepping for `DeploymentState\.` found the touchpoints written as `deploy.status === DeploymentState.Booting`, but missed FIVE more call sites that compared against raw **string literals** instead: `deployAction.status === 'Booting' || deployAction.status === 'Ready'` in `base-drawer.tsx`, `repository-node.tsx`, `feature-node.tsx`, `repository-drawer-client.tsx`, and `feature-drawer-client.tsx`. All five happened to reuse the exact variable name `isDeploymentActive`/`isDeployActive` — a strong signal it should have been one shared helper from the start.

**Rule:** When adding a member to a string enum, grep for BOTH forms: `EnumName\.` (typed comparisons) AND the enum's string values as bare literals (`'Booting'`, `"Ready"`, etc.) — TS allows comparing a typed enum value against a matching string literal, so these compile silently and never show up in an `EnumName.` grep. A literal-string comparison against an enum value is itself a code smell to fix opportunistically when you touch it.

**Rule:** The moment the same derived boolean (`isDeploymentActive = status === X || status === Y`) appears in a second file, extract it to a shared helper (e.g. `isDeploymentActive(state)` next to the enum-consuming store/hook) instead of waiting for a third occurrence — string-literal duplicates are easy to miss in a `no-duplication` grep since they don't share an obvious import.

**Gotcha:** `const flag = someOptionalString && predicate(...)` gets special TS narrowing (control-flow analysis of aliased conditions) that lets `{flag ? <Component requiredString={someOptionalString} /> : null}` typecheck. Rewriting it as `Boolean(someOptionalString) && predicate(...)` breaks that narrowing — TS no longer sees the direct `x && ...` shape and the required-string prop errors. Keep the literal `x && ...` form when refactoring this pattern into a shared helper call.


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

1. **Every** constructor param needs an explicit `@inject(token)` — including class-typed ones, which take the class itself as the token: `@inject(MyUseCase) private readonly x: MyUseCase`. Relying on tsyringe introspecting the class type is NOT safe here; see the next lesson. No interface params, no inline `{}` types, no primitives without `@inject`.
2. Default values do NOT save you — tsyringe still tries to resolve the param before the default kicks in.
3. For test-only knobs (poll intervals, etc.), drop them from the constructor and expose a `setX(...)` method or a class-typed config object registered with `useValue`.
4. Before adding a new `@injectable()` class, scan its constructor: any param without `@inject` is a bomb that won't surface until something actually resolves the chain.

## A class-typed constructor param without `@inject` is silently `undefined` when run from source

Symptom: "Rebase on Main" in the web UI failed with
`Cannot read properties of undefined (reading 'execute')`. `RebaseFeatureOnMainUseCase`
resolved fine, but its `syncFeatureBranch` field was `undefined`.

Root cause: implicit class-token injection depends on `design:paramtypes`, which
only `tsc` emits. **Every runtime we actually develop against uses esbuild or SWC
— `tsx` (`pnpm dev:cli`, `pnpm dev:web`), vitest, and Next.js — and none of them
emit decorator metadata.** With no metadata, tsyringe passes `undefined` for every
param that has no explicit token, and *still constructs the object*. So it works in
a packaged `pnpm build:cli` (tsc) release and breaks for anyone running from source
— the exact inverse of the usual "works locally, breaks in prod".

There is no error at the injection site. The crash surfaces later, at the first
property access on the hollow field, pointing at a line that looks unrelated.

**Rules:**

1. Never write a bare class-typed constructor param. Always `@inject(TheClass)`.
2. A DI guard test that only asserts `container.resolve(X)` is `toBeDefined()` proves
   nothing — resolution succeeds with hollow dependencies. Assert the injected field
   itself: `expect(injected(resolve(X), 'dep')).toBeInstanceOf(Dep)`.
3. Because vitest shares the metadata-less runtime, this class of bug IS catchable by
   unit tests — but only with assertion #2.
4. `tests/unit/infrastructure/di/hollow-dependency-guard.test.ts` now sweeps the whole
   container for this automatically. If it fails, the named class has a constructor
   parameter missing its `@inject(Token)` — do not weaken the guard, add the token.
   It isolates constructor parameters as the LAST `ctor.length` own keys, because
   TypeScript assigns parameter properties after declared field initializers run; that
   keeps optional state (`private qr?: string`) out of the assertion.

The same defect was present in `EvaluateSupervisorDecisionUseCase`,
`AgentQuestionSupervisorRouter` and `FeatureAgentSupervisorGateEvaluator`, each with
some parameters correctly tokenised and the `GetSupervisorPolicyUseCase` /
`EvaluateSupervisorDecisionUseCase` ones bare — a partially-decorated constructor is
the signature of this bug.

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
## Messaging Remote Control: HttpGatewayClient Uses an Unsupported OAuth Grant

`HttpGatewayClient.fetchAccessToken` (feat/messaging-remote-control, feature 082) hardcodes
`grant_type=client_credentials` in its call to `POST /oauth/token`. The OSS Commands Gateway
demo mode (`AUTH_MODE=demo`) advertises only `authorization_code` and `refresh_token` in its
`.well-known/openid-configuration` and returns `400 {"error":"unsupported grant_type"}` for
`client_credentials`. As a result, `BeginMessagingPairingUseCase` always throws
"Gateway authentication failed: ..." and the web pairing dialog never opens — the Pair button
silently fails because (a) the server action returns `{ success: false, error }` and
(b) no `<Toaster />` is mounted in the web layout, so the `toast.error(...)` never renders.

**What to fix before this can work end-to-end against a real gateway:**
1. Swap `HttpGatewayClient.fetchAccessToken` to the authorization-code + PKCE flow
   (matches the gateway's supported grants), OR add device-code support on the gateway side.
2. Mount a sonner `<Toaster />` in the web root layout so pairing failures are visible to
   the user instead of silently failing.
3. The feature was marked `fast-implement` complete and merged to main without ever being
   exercised against a live OSS gateway. Add a smoke test that spins up the gateway Go binary
   in CI and runs `BeginMessagingPairingUseCase` against it.

**Rule:** Any time a feature integrates with an external service, it must be validated against
a live instance of that service — unit tests with fetch mocks are not sufficient because they
only verify what you *think* the protocol is.

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

## Canvas Loader Must Forward Global Settings to buildGraphNodes

`buildGraphNodes()` in `src/presentation/web/app/build-graph-nodes.ts` accepts an options bag (`enableEvidence`, `commitEvidence`, `ciWatchEnabled`, `securityMode`, …) that controls what gets rendered on feature/repo nodes. The single call site is `src/presentation/web/app/(dashboard)/get-graph-data.ts`. When you add a new option to `buildGraphNodes`, you MUST also update that call site to pull the value from `getSettings()` and pass it in — otherwise the flag stays stranded and the UI never sees it (the bug looks like "component is wired but renders nothing").

**Symptom:** A Storybook story proves the node variant works, but the live canvas never shows it.

**Check:** After adding an option to `buildGraphNodes`, grep `get-graph-data.ts` for the new field name. If it's absent, wire it.

**Regression lock:** Add a unit test in `tests/unit/presentation/web/app/build-graph-nodes.test.ts` asserting `data.<flag>` is set on the output node when the option is passed.

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

## Never Hardcode a Timeout a Helper Already Chooses Per-Platform

`tests/helpers/cli/runner.ts` sets `timeout: process.platform === 'win32' ? 30000 : 15000` on purpose — a
Windows CLI spawn pays tsx/SQLite startup that Linux does not. `settings-initialization.test.ts` then passed
`timeout: 15000` into every `createCliRunner({...})` call, which **silently overrode that default and forced
Windows onto the Linux budget**. The test died at 15024ms on windows-latest while sibling tests running the
exact same `version` command took 12.7s and 14.9s — it had been sitting one scheduling hiccup from red the
whole time, and Ubuntu was green on the same commit.

The EBUSY that followed in `afterEach` was a *cascade*, not a second bug: the timed-out CLI child still held
the SQLite handle, so `rmSync` threw and reported as a second failure that masked the real assertion.

**Rules:**

1. **Passing an option that a helper already defaults is a decision — justify it or omit it.** Before writing
   `timeout:`/`retries:`/`cwd:` into a helper call, read the helper's defaults. If it already branches on
   `process.platform`, hardcoding a scalar there is always a regression on the slow platform. Omit the option
   and inherit.
2. **Size a test's vitest timeout from the number of sequential spawns it makes**, not from a round number.
   `timeoutForRuns(n) = n * CLI_SPAWN_BUDGET_MS + slack` — two `run()` calls under a 30s-per-spawn budget
   cannot live inside a 30s test timeout, and a bare `30_000` hides that arithmetic.
3. **Cleanup in `afterEach` must be best-effort (`try/catch`) whenever the test spawns a child that touches
   SQLite or the filesystem.** A cleanup throw outranks nothing — it only ever *masks* the assertion you
   actually needed to read. `createIsolatedCliRunner().cleanup()` already models this.
4. **A test that passes at 15024ms/15000ms was never passing.** When a CI failure's duration matches its
   timeout to within a few ms, the diagnosis is "the budget is wrong," not "the runner was slow." Compare
   against sibling tests doing identical work before touching the assertion.

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

## LangGraph Node Wiring Must Stay One Fluent Chain (Node-Name Types)

`new StateGraph(...).addNode('a',...).addNode('b',...)` returns a type whose
node-name string-literal union grows with each `.addNode`. If you split the chain
across statements that re-reference the same `const graph` — e.g.
`graph.addNode('merge',...).addEdge(...); ... graph.addConditionalEdges('merge',...)`
— the second statement sees `graph`'s ORIGINAL declared type (without `'merge'`)
and fails with `Argument of type '"merge"' is not assignable to parameter of type
'<existing node union>'`. Keep every `.addNode/.addEdge/.addConditionalEdges` for
new nodes in a SINGLE fluent expression so the augmented node-name type flows
through. (Hit when wiring the post-merge `extract_memory` node in both
feature-agent-graph.ts and fast-feature-agent-graph.ts.)

## Prompt Files Live One Dir Deeper Than Nodes — Relative Imports Need +1 `../`

`feature-agent/nodes/*.ts` reach `domain/generated/output.js` with five `../`.
Files under `feature-agent/nodes/prompts/*.ts` are one level deeper and need SIX
`../`. This only fails at test/runtime (`Cannot find module`), not always at
typecheck. When adding a new prompt builder that imports a domain type, copy the
import depth from a sibling in `nodes/prompts/`, not from `nodes/`.

## Adding a FeatureAgentAnnotation State Channel Ripples to Full-State Fixtures

LangGraph's `StateType` makes every channel a REQUIRED key (value may be
`undefined`, but the key must be present). Adding a channel to
`FeatureAgentAnnotation` breaks every fixture that builds a *complete*
`FeatureAgentState` object literal (not `Partial`) — they fail with `Property 'x'
is missing`. Also update `state.test.ts`: it asserts `channelNames.length).toBe(N)`
and lists each channel via `toContain`. Known full-state fixtures to update:
`merge-step-real-git/setup.ts` (`makeState`), `repair.node.test.ts` (`baseState`),
`langgraph/nodes/fast-implement.node.test.ts` (`createMockState`).

## Test Git Harnesses Must Disable commit.gpgsign

Throwaway git repos created by integration harnesses inherit the developer's /
runner's global `commit.gpgsign=true`. In environments where signing is enforced
(e.g. a sandbox signing server that can 400), `git commit` fails during harness
SETUP — surfacing as unrelated-looking failures (`createLocalOnlyHarness`,
verify-merge, local-merge). Always `git config commit.gpgsign false` in the
harness's repo right after setting `user.name/email`, so the harness never
depends on ambient signing config.

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

## A New Cross-Cutting Context (Memory/Skills) Must Reach EVERY Agent Prompt, Not Just the First Node

When wiring a repository-wide context blob ("Shep Brain" project memory) into the
feature-agent, the first cut only injected it into the `analyze` and `research`
prompts. That left the highest-value phases — `implement`, `fast-implement`,
`merge` (commit + CI-fix) — and the entire interactive chat agent with NO memory.
The user immediately asked "is anything injecting this when relevant?" — because
a feature that only reaches 2 of ~8 agent prompts looks done but isn't.

Rules for any cross-cutting context that "every agent should see":

1. **Enumerate every agent-call prompt before claiming done.** For the
   feature-agent that is: analyze, requirements, research, plan, implement,
   fast-implement, merge commit-push-pr, AND the CI-fix loop prompt. Plus the
   interactive agent's `FeatureContextBuilder.buildContext`. Grep for
   `executor.execute(` and every `build*Prompt(` to find them all.
2. **Custom-execution nodes are easy to miss.** `analyze/requirements/research/
   plan` go through `executeNode(name, executor, buildXPrompt)`, but `implement`,
   `fast-implement`, and `merge` build prompts inline and call the executor
   directly — they will NOT inherit anything you add to `executeNode`.
3. **Prompts that don't take graph state need a parameter.** `buildCiWatchFixPrompt`
   and `buildLocalSquashMergePrompt` take primitives, not `state`. Thread the blob
   through as an explicit optional arg (and update the caller that has `state`).
   The CI-fix prompt is the single most relevant place for "past CI fixes" memory.
4. **The interactive agent is a separate subsystem.** It boots via
   `BootPromptResolver` → `FeatureContextBuilder.buildContext`. Inject the read
   use case into the resolver, load by `feature.repositoryPath`, pass the blob in.
   Best-effort: a load failure must never block session boot.
5. **Provide a raw-string renderer, not just a state-based one.** Expose
   `renderProjectMemoryBlock(blob)` alongside `buildProjectMemorySection(state)`
   so non-state prompts can render the identical block without duplicating the
   defensive framing text.
6. **Test the breadth.** One parametrised test asserting the section appears in
   every prompt (and is omitted when empty) is the proof that "all agents see it".

## Injecting a Knowledge Store Into Prompts: Select Per-Prompt, Don't Dump the Whole Thing

First we injected the FULL project-memory blob into every agent prompt. The user
pushed back: "we shouldn't inject the whole memory, we should have a smart
mechanism to understand what we need to inject per project/repo/task/prompt."
Dumping everything bloats prompts, drowns the relevant entries in noise, and
scales badly as the store grows.

The pattern for injecting any growing knowledge store (memory, skills, docs)
into an LLM prompt:

1. **Make selection a first-class, pluggable port.** Define an
   `IMemoryRelevanceScorer` (score(query, entries) → ranked) so a deterministic
   scorer ships now and a semantic/embedding scorer can drop in later without
   touching callers. Keep it agent-agnostic — no provider SDK in the port.
2. **A deterministic scorer is enough for v1 and needs no deps:** combine
   (a) lexical overlap between the entry and the task text, (b) phase→category
   affinity (CI-fix cares about past CI fixes; implement cares about conventions
   & naming), and (c) recency. Weight and sum to [0,1].
3. **Budget, don't cap by count.** Greedily include top-ranked entries up to a
   token budget so prompt size is bounded no matter how big the store is. Always
   include at least the single most relevant entry.
4. **Select per prompt at execution time, not once globally.** The worker used to
   load ONE blob into state. Wrong — each phase/task wants a different subset.
   Select inside the node boundary (async) with the phase + a derived task text,
   then pass the selected blob to the (still pure, still sync) prompt builder via
   a shallow-cloned state. Prompt builders and their tests stay unchanged.
5. **The query is context-specific.** Derive task text from the spec/research/plan
   for producer phases; use the FAILURE LOGS as the query for the CI-fix prompt
   (so matching past fixes surface); use the feature name/description for the
   interactive agent.
6. **Thread the selector as an OPTIONAL dep** through graph deps → node factories
   → executeNode (and the custom nodes). Optional = existing tests/callers keep
   compiling and behave as before (no selector → no selection).
7. **When you mock node-helpers in a node test, add every new export the node
   imports** (e.g. `applyMemorySelection`) or the node throws "x is not a
   function" at runtime.

## Wiring an Optional External Capability (Embeddings) Agent-Agnostically + CI-Safe

To add semantic memory ranking without violating the agent-agnostic rule or
breaking offline CI:

1. **Define an output port** (`IEmbeddingProvider { isAvailable(); embed() }`) and
   keep the concrete adapter provider-agnostic — any OpenAI-compatible endpoint
   via `fetch`, configured by env (`SHEP_EMBEDDINGS_API_KEY/BASE_URL/MODEL`). No
   provider SDK imported, no hardcoded vendor.
2. **Gate on config + degrade gracefully.** `isAvailable()` is false without an
   API key, so the default/offline/CI path makes ZERO network calls and behaves
   exactly as before. The semantic scorer composes the deterministic one and
   **falls back to it** when the provider is unavailable, the task text is empty,
   or any embedding call throws. Selection must never fail.
3. **Compose, don't fork.** The embedding scorer injects the lexical scorer as
   its fallback and both share one `rankByContentScore(query, entries, contentFn)`
   helper — only the content signal differs (token overlap vs. cosine). No
   duplicated category/recency/weight/sort logic.
4. **Cache embeddings in-process** keyed by a hash of the text, so the same entry
   isn't re-embedded across the many selections in one agent run.
5. **Test offline.** Stub the provider for the scorer tests (cosine ranking,
   fallback, cache); spy on `globalThis.fetch` for the adapter test. Never make a
   real network call — the no-key default keeps the whole suite deterministic.
6. **eslint `prefer-nullish-coalescing` vs. empty env strings:** `process.env.X ||
   DEFAULT` is flagged. But `??` won't fall back on an empty string. Use
   `const v = process.env.X?.trim(); return v && v.length ? v : DEFAULT;`.
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

## Tag-triggered CI is defeated by `[skip ci]`; org ghcr first-push needs a PAT

The `docker-publish.yml` workflow (issue #822 / PR #824) was written to trigger on `push: tags: v*`, then never ran on any release. Two independent bugs:

1. **`[skip ci]` on the tagged commit skips the tag-push event.** semantic-release's `@semantic-release/git` commits `chore(release): x.y.z [skip ci]`, then tags THAT commit. GitHub Actions inspects the head commit of a pushed ref (including tag pushes) and skips ALL workflows when it contains `[skip ci]`. So a `push: tags: v*` trigger for a semantic-release tag can NEVER fire.
2. **`GITHUB_TOKEN` 403s on the first org package publish.** Pushing to `ghcr.io/<org>/<repo>` returns `403 Forbidden` until the package exists and is linked to the repo. First creation needs a PAT with `write:packages` (we already have `RELEASE_TOKEN`), or a one-time manual publish + repo-link.

Rules:

- To run CI **after a semantic-release release**, trigger on `on: release: types: [published]` — the `release` event is immune to `[skip ci]` and cascades because the release is created with a PAT (`RELEASE_TOKEN`), not the default `GITHUB_TOKEN`. Do NOT rely on `push: tags: v*`.
- For **org-owned ghcr packages**, authenticate the first publish with a PAT that has `write:packages`; the built-in `GITHUB_TOKEN` cannot create the package. After it exists and is repo-linked, `GITHUB_TOKEN` works.
- A merged PR whose mechanism was never exercised end-to-end is not "done." Verify a workflow actually RAN (`gh run list --workflow=…`) and produced the artifact — a green syntax check proves nothing about triggers.
- Install `git` in the Docker **builder** stage if the build invokes it (prebuild/generate) — `git: not found` silently drops version metadata even when the build "succeeds".
## Client Components May Only TYPE-Import From Server-Only lib Modules (fs-backed)

`src/presentation/web/lib/skills.ts` reads the filesystem (`node:fs/promises`, `node:path`, `node:os`, `js-yaml`) and is therefore **server-only**. `skill-list.tsx` (a client component) originally imported **only types** from it (`import type { SkillData }`) — types are erased at compile time, so nothing from the module reaches the browser bundle.

I added a runtime helper (`derivePackage`) + a constant to `lib/skills.ts` and imported them as **values** into `skill-list.tsx`. `tsc`, vitest, and `pnpm build` all passed. But `pnpm build:storybook` (a Vite/Rollup **browser** bundle) failed:

```
"readdir" is not exported by "__vite-browser-external", imported by "src/presentation/web/lib/skills.ts"
```

A value import forces the bundler to actually include the module, dragging Node built-ins into a browser build that has no polyfills for them.

**Rules:**
1. From a client component (or anything Storybook bundles), import **only `type`** from an fs-backed / Node-built-in-importing lib module. Never import a runtime value (function, `const`, class) from it.
2. When a client component needs a **pure** helper that logically belongs "next to" server-only code, put the helper in its own **browser-safe module** (no `node:*` / `fs` / `js-yaml` imports) and import it from both sides. Here: `lib/skill-package.ts` holds `derivePackage` + `UNGROUPED_PACKAGE_LABEL`, imported by both the client component and (potentially) the server module.
3. `pnpm typecheck` + `pnpm build` (CLI/`tsc`) will **not** catch this — only the browser bundle does. For any web-UI change, run `pnpm build:storybook` locally before pushing (already required by `.claude/rules/cicd.md`). Treat a value-import from a server-only lib as the first suspect when the preview build fails with `"X" is not exported by "__vite-browser-external"`.

## Deduplicate a Merged List Across the WHOLE Set, Not Just One Source vs Another

`getSkills` merges project + global skills and used them as React keys (`key={skill.name}`). It deduped **project-vs-global** only (`seen = new Set(projectSkills.map(...))`, then `globalSkills.filter((s) => !seen.has(s.name))`) but never added accepted global names back to `seen`. Two global skill directories (`connect-chrome` and `open-gstack-browser`) both declared `name: open-gstack-browser`, so both survived → duplicate React keys → runtime "Encountered two children with the same key" error (only visible in the browser console / Next.js dev overlay, not in tests or `tsc`).

**Rules:**
1. When deduping a **merged** collection, dedupe across the entire combined set — add every accepted item's key back into the `seen` set as you go, not just the keys from the first source.
2. Two distinct on-disk entries can advertise the **same logical id** (frontmatter `name`). Never assume directory names guarantee uniqueness of the id you key on.
3. Duplicate-key bugs don't fail `tsc`/vitest — surface them by loading the real page and watching the **browser console** (Playwright `page.on('console')`) during evidence capture.

## Adding a Model to the Catalog Is a Four-Touch Change, Not One

`claude-sonnet-5` was added to `CLAUDE_CODE_MODELS` and `CURSOR_MODELS` in
`agent-model-catalog.ts` plus `model-metadata.ts` — but **not** to
`CURSOR_MODEL_MAP` in `cursor-executor.service.ts`. `toCursorModelName()` falls
back to pass-through, so the Cursor CLI silently received `claude-sonnet-5`
instead of the short `sonnet-5` name it expects. A pass-through fallback means
a missing mapping never throws; it just sends the wrong flag value at runtime.
The Storybook mocks had drifted too (`get-supported-models.ts` /
`get-all-agent-models.ts` still listed the pre-Fable-5 set).

**When adding or retiring a model ID, touch all four:**

1. `packages/core/src/infrastructure/services/agents/common/agent-model-catalog.ts` — every agent list that actually supports it (ordered most-capable first).
2. Per-agent **name translation maps** — `CURSOR_MODEL_MAP` (cursor-executor) and `LEGACY_MODEL_ALIASES` (copilot-cli-executor). Each agent CLI has its own naming convention; a pass-through fallback hides the omission.
3. `src/presentation/web/lib/model-metadata.ts` — display name + description. Without it the picker shows a prettified raw ID and an empty description. Re-check the *neighbouring* descriptions too: a new flagship makes the old "Most capable" line a lie.
4. `.storybook/mocks/app/actions/get-supported-models.ts` and `get-all-agent-models.ts` — static mocks that don't import the catalog, so they drift silently and stories render a stale list.

**Do NOT** add a Claude model to `COPILOT_CLI_MODELS` / `OPENROUTER_MODELS` just
because Anthropic shipped it — those lists are gated by what the third party
actually serves. Verify against that provider before extending them.

**Regression lock:** `tests/unit/infrastructure/services/agents/agent-executor-factory.test.ts`
asserts the exact list per agent, and `cursor-executor.test.ts` asserts the
`--model` flag value per canonical ID. Extend both in the same diff.

## MCP tool handler return types must be `type`, not `interface`

Extracting the shared `withErrorHandling` helper for MCP tools, I typed its
return as `interface McpToolResult { ... }`. The four existing tool files had
used an inline anonymous object literal. `packages/core` typecheck then failed
on every `server.registerTool(...)` call: `Index signature for type 'string'
is missing in type 'McpToolResult'`. The SDK's handler return type is
`{ [x: string]: unknown; content: ...; ... }`, and a **named `interface` does
NOT get an implicit index signature** (it can be augmented via declaration
merging), whereas a **`type` alias / inline object literal does**. So an
interface is not assignable to a type that has an index signature, but the
equivalent `type` is.

**Rules:**
1. Any object shape that must satisfy a third-party "bag of unknown props"
   contract (an index signature like `{ [x: string]: unknown }`) MUST be a
   `type` alias, never an `interface`.
2. This repo's eslint enforces `@typescript-eslint/consistent-type-definitions`
   (prefer `interface`). When a `type` is required for the index-signature
   reason above, add a one-line `// eslint-disable-next-line` with a comment
   explaining why — don't silently fight the linter.
3. Refactoring an inline type into a named one can introduce this failure even
   when the values are identical; run `tsc` on the touched package after the
   extraction, not just the unit tests (vitest transpiles per-file and won't
   catch a cross-call assignability error).

## Capturing Storybook evidence screenshots in a sandboxed session

Needed screenshots of a new web component for PR evidence. Two traps:

1. **The Playwright MCP defaults to system Chrome** (`/opt/google/chrome/chrome`),
   which isn't installed — it errors with "Chromium distribution 'chrome' is
   not found". The sandbox ships Playwright's own Chromium at
   `/opt/pw-browsers/chromium-<rev>/chrome-linux/chrome`
   (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Don't run
   `playwright install`. Instead drive it with the project's `@playwright/test`
   via a script: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium-<rev>/chrome-linux/chrome' })`.
2. **A `.mjs` script placed in the scratchpad (`/tmp/...`) can't resolve repo
   `node_modules`** — `import ... from '@playwright/test'` throws
   ERR_MODULE_NOT_FOUND. Write the throwaway script at the repo root (then
   `rm` it) so Node resolves modules from the project.

Workflow that works: `storybook dev -p 6006 --no-open --quiet` in the
background → poll `curl -sf localhost:6006/index.json` → find story ids in
`index.json` → screenshot each `iframe.html?id=<story-id>&viewMode=story`,
toggling `colorScheme` / `document.documentElement.classList.add('dark')` for
dark mode. Commit PNGs under an `evidence/` dir and embed in the PR comment
via `https://github.com/<owner>/<repo>/blob/<branch>/<path>.png?raw=true`
(renders inline for authorized viewers, private repos included).

## Two vocabularies for the same concept = a silently wrong default

The create drawer's Fast/Spec picker showed **nothing** selected and every
web-created feature ran the spec workflow even when Fast was clicked. Two
independent causes, both invisible to the type system:

1. **Casing drift between a persisted label and a domain enum.**
   `settings.workflow.defaultMode` predates `BuildMode` and stores
   `'Regular' | 'Fast' | 'Exploration'`; the enum is lowercase
   (`'fast' | 'spec' | ...`). Consumers wrote `defaultMode as BuildMode` and
   `defaultMode !== 'spec'` — both compile, both are always wrong. Fix:
   `normalizeBuildMode()` in `domain/shared/build-mode.ts` is the ONE bridge;
   every reader funnels through it.
2. **A field renamed at a layer boundary and dropped by an object spread.**
   The web action forwarded `...(mode ? { mode } : {})` while
   `CreateFeatureUseCase` reads `buildMode`. Excess-property checking does NOT
   apply to spread properties, so TS never flagged it and the mode vanished.

**Rules:**
- Never write `someString as SomeEnum`. If a stored value must become an enum,
  route it through a normalizer that handles legacy spellings and has a
  documented fallback — and unit-test the legacy spellings, not just the
  canonical ones.
- A UI picker whose "selected" state is `value === option` MUST render exactly
  one pressed option for ANY input. Collapse out-of-range/legacy values onto a
  renderable option instead of letting the group render all-unpressed.
- When wiring a payload across a layer boundary, grep the *receiving* type for
  the field name. `...(x ? { x } : {})` into a typed parameter is an
  unchecked hole — a typo or rename there fails silently at runtime.
- Component tests that only feed canonical enum values prove nothing about
  production data. Add a case using the value the DB actually holds
  (`sqlite3 ~/.shep/data "select default_mode from settings"` — check it).

## A unit test that spawns a real binary is a timeout waiting for CPU contention

`project-memory-section.test.ts` passed alone in 22s and failed in the full
suite with `Test timed out in 60000ms` — on a *synchronous* test body. The cause
was not the test but what it reached: `FeatureContextBuilder.buildContext()`
builds its CLI-reference section with `execFileSync('shep', ['--help'])` plus
one `execFileSync('shep', [cmd, '--help'])` per subcommand. With shep installed
in PATH that is dozens of real CLI boots inside a "unit" test; with shep absent
it silently takes the `catch` branch instead. Either way the assertions under
test (the project-memory block) never needed a subprocess.

**Rules:**
- A test under `tests/unit/` must not spawn a process, touch the network, or
  depend on what is installed in PATH. If the code under test does, mock the
  boundary (`vi.mock('node:child_process', ...)`) — do not raise the timeout.
- Diagnose a timeout on a synchronous test body as hidden I/O, never as
  flakiness. Sync code cannot time out on its own; something under it blocked.
- A test that passes in isolation and fails in the full suite is a resource
  problem, not a fluke. Compare its solo duration against the timeout: 22s of
  a 60s budget leaves no headroom once workers compete for CPU.
- Machine-dependent branches (`try { spawn } catch { fallback }`) make a test
  assert different things on CI than on a dev box. Pin the branch explicitly.


## An event-only invariant strands state the moment nobody is listening

A feature sat `Blocked` under a parent that had merged, completed, and been
archived. Nothing was ever going to release it, for three compounding reasons:

1. **Wrong argument to a fan-out.** `ReparentFeatureUseCase` called
   `checkAndUnblock.execute(featureId)` — the *reparented child's* id, which
   evaluates that child's own children. The feature just attached was never
   evaluated against its NEW parent. Its `newLifecycle` branch also only ever
   *added* `Blocked`; there was no branch that cleared it.
2. **A gate duplicated in four places.** `COMPLETED_LIFECYCLES.has(parent.lifecycle)` (then named `POST_IMPLEMENTATION`)
   was inlined in create / start / reparent / check-and-unblock. Copies drift.
3. **`Archived` slammed the gate shut.** Auto-archive moves *every* completed
   feature to `Archived` on a delay, and `Archived ∉` the gate set — so
   waiting long enough was itself enough to strand a child forever.

**Rules:**
- An invariant enforced only as a side effect of a *transition* is dead the
  moment nothing transitions again. Terminal states have no next event. For any
  "when X advances, release Y" rule, also provide a **state-side reconciler**
  that restores it from the data (`ReconcileBlockedFeaturesUseCase`, swept
  fire-and-forget on dashboard load next to `AutoResolveMergedBranchesUseCase`).
- A gate belongs in ONE domain predicate (`satisfiesDependencyGate()`), not as
  `SET.has(entity.field)` at each call site. Callers delegate; they do not
  re-derive. Make the owning use case *return what it did* so callers never need
  to re-check the condition themselves.
- Ask of every terminal/bookkeeping state: does it still satisfy the predicates
  the pre-terminal state satisfied? `Archived` must answer via
  `previousLifecycle` — archiving is filing, not a rollback of progress.
- Every writer of a lifecycle field must route through the use case that owns the
  transition's side effects. `merge.node.ts` wrote `Maintain` straight to the
  repository, so the LAST transition a feature ever made was the one that never
  fired its hook. Use `setFeatureLifecycle()` to announce transitions with no
  graph node of their own.
- When a status tree looks self-contradictory, check whether the two columns come
  from two sources: `feat ls` derives "Completed" from the **agent run** and
  "Blocked" from the **feature lifecycle**. Confirm against the DB
  (`sqlite3 ~/.shep/data`) before theorising — and read `phase_timings.phase` to
  tell which code path actually ran (`rebase` = manual, `rebase-on-parent` = auto).
- `findByParentId` deliberately includes soft-deleted rows for cascade deletes.
  Any other caller must filter `deletedAt` or it will resurrect deleted work.

## A timeout override that shortens the budget on the slowest platform

`E2E CLI (windows-latest)` failed with `expected 1 to be +0` on
`shep restart` — no stack, no CLI output, nothing to diagnose. Two defects:

1. **The override went the wrong way.** `createCliRunner`'s default timeout is
   platform-aware (15s posix / **30s win32**), but five call sites in
   `daemon-lifecycle.test.ts` hardcoded `timeout: 20_000` with the comment
   "needs longer timeout on Windows". A flat 20s is *longer* than the posix
   default and *shorter* than the Windows one — so the most expensive commands
   in the suite (restart/upgrade: stop with a 5s poll + start + spawn) got the
   tightest budget on the slowest platform.
2. **A killed process is indistinguishable from a failed one.** `execSync` sets
   `status: null` when it kills on timeout, and the helper did
   `exitCode: execError.status ?? 1`. Every timeout therefore reported as
   "exited 1", which is why the CI log said nothing useful.

**Rules:**
- Never hardcode a timeout that overrides a platform-aware default. Derive it
  (`isWindows ? … : …`) and assert the relationship you intend — an override
  meant to *raise* a budget must be checked against the value it replaces.
- Keep the layered timeouts ordered: per-command exec timeout < vitest per-test
  timeout, so the inner one wins and produces the diagnosable error. Raising one
  without the other just changes which layer kills you.
- Any `?? 1` fallback for an exit code erases the difference between "killed" and
  "failed". Detect the kill (`status == null`) and say so in `stderr` — the CI log
  is the only forensic artifact you get from a platform you cannot reproduce on.
- Before blaming your diff for a platform-only CI failure, check the last main
  run (`gh run list --branch main --workflow CI/CD`), then read the *mechanism*.
  Latent flakes surface when a budget is already at its edge.
- `tests/e2e/cli/script-runner.test.ts` skips Docker scripts when Docker is
  absent, but if Docker is present-but-cold the base-image pull happens *inside*
  the build deadline and fails as `DeadlineExceeded`. `docker pull node:22-slim`
  first, then re-run.

## A self-healing sweep on one presentation surface is not an escape hatch

`ReconcileBlockedFeaturesUseCase` fixes the stranded-Blocked invariant, but it is
wired into exactly one caller: the web dashboard's `get-graph-data`. A CLI-only
user hitting `shep feat start` on a stranded feature gets
`not in Pending state (current: Blocked)` and has **no command** to recover —
there is no `shep feat unblock`, and `feat start` has no `--force`. The only route
was a raw `UPDATE features SET lifecycle='Pending'` plus temporarily
unarchiving the parent so the gate would pass on the older installed build.

**Rules:**
- When you fix a stuck-state bug, ship the manual override alongside the automatic
  repair. The automatic path only helps users already on the new version; the
  override is what rescues the DBs that are *already* wrong.
- A reconcile/repair use case must be reachable from every presentation layer
  (per `.claude/rules/code-quality.md` — "every feature MUST be implementable in
  ALL presentation layers"). Registering it in the DI container and calling it
  from one Next.js loader is half a feature.
- Any lifecycle precondition that rejects a state the system can enter *by itself*
  needs a documented recovery command in the error message — "Only pending
  features can be started" tells the user what is wrong and nothing about what to do.

## A test that kills processes must not share state with one that expects success

The timeout test above then failed on `ubuntu-latest` only: two tests killed the
CLI 1ms into first-run SQLite initialisation, and a third asserted
`shep --version` exits 0 — all three sharing the runner's module-level
`SHEP_HOME` (one temp dir per test *file*, not per test). A dying process can
still hold the DB lock, so the third test inherited the wreckage. It passed on
macOS, where 1ms barely clears `exec` and nothing had touched the DB yet.

**Rules:**
- A test that deliberately kills a process must own its `SHEP_HOME`
  (`createIsolatedCliRunner()`), never the file-level shared one. Auto-isolation
  is per *file* — that is not isolation between tests that corrupt state.
- Don't assert on a *success* path to prove a *failure*-classification flag.
  Asserting "a real non-zero exit is not flagged as a timeout" via an unknown
  command needs no database and tests the distinction directly; asserting it via
  `--version` exit 0 imports every first-run initialisation risk for nothing.
- Every assertion on a spawned process must carry stdout/stderr in its message.
  `expect(result.exitCode).toBe(0)` on a remote platform yields
  `expected 1 to be +0` and nothing else — the second CI round-trip is the price.
- Confirm the mechanism locally before pushing a theory: scripting the exact
  sequence (kill, kill, run) disproved the first guess in 30s, which is what
  redirected the fix from "harden the assertion" to "stop sharing the home".

## React Context Over-Rendering and Aggressive Polling Cause UI Lag

**Symptom:** The `shep` web application became extremely laggy, with click interactions taking a long time to react. The application felt unresponsive.

**Root Causes:**

1. **Context Over-Rendering:** `TurnStatusesProvider` managed a large `Record<string, TurnStatus>` object representing all active session statuses. It passed this entire object down via `TurnStatusesContext`. Because `useAllTurnStatuses` updated this object with a new reference on *any* status change (via a single SSE stream), `TurnStatusesProvider` re-rendered. This caused *every* component calling `useTurnStatus(id)` to re-render, even if their specific `id` hadn't changed, because the context value identity changed. This is a classic React context anti-pattern.
2. **Aggressive Database Polling:** Several components (`applications-page-client.tsx`, `clusters-page-client.tsx`, `git-status-cluster.tsx`) were using `refetchInterval` of 3,000ms or 5,000ms. The `listDeployments` action polled the database synchronously via `better-sqlite3` and checked `process.kill(pid, 0)` every 3 seconds per open browser tab. While individually fast, this frequent synchronous activity caused noticeable background noise and event-loop pressure.
3. **Heavy Component Re-renders:** Heavy components like `@monaco-editor/react` (used in `EditorPane`) were subject to these frequent parent re-renders. Even if Monaco is dynamically loaded, frequent React reconciliation around it contributes significantly to UI jank.

**Rules and Fixes:**

1. **Use Zustand for Fine-Grained Subscriptions:** Global, frequently updating state (like event streams) should NOT be passed through React Context as a single large object. Replaced `TurnStatusesContext` with a Zustand store (`useTurnStatusStore`). Components now subscribe only to the specific slice they need (`useTurnStatusStore(state => state.statuses[scopeId])`), preventing widespread re-renders.
2. **Memoize Heavy Components:** Wrapped `EditorPane` with `React.memo` to ensure the heavy Monaco editor only re-renders when its specific props (`activePath`, `openFiles`, etc.) actually change, shielding it from unrelated parent updates.
3. **Audit Polling Intervals:** Increased `refetchInterval` from 3,000ms/5,000ms to 10,000ms. If real-time updates are critical, use SSE or WebSockets instead of frequent short-interval polling, especially when the backend performs synchronous I/O or system calls.


## AgentType Additions
- When adding a new `AgentType` (like `LlmProxy`), you must update `tests/unit/domain/shared/agent-resume-descriptor.test.ts` to include the new enum value in the exhaustive enum sweep check, otherwise it will fail to compile (TS2741).
- In `tests/unit/infrastructure/services/agents/agent-executor-factory.test.ts`, the test `should list supported agents` has a strict `.toHaveLength(N)` assertion which must be incremented manually when adding a new supported agent type.

## YAML Specifications
- The tests parsing existing specs (`spec-yaml-backward-compatibility.test.ts`) require valid YAML formatting for block scalars (`content: |`). Empty lines must be completely empty (no trailing spaces), and lines starting with special characters like `@` without spaces at the column start break the indentation.

## Vitest mock exports must match actual module exports

When modifying a module's exports (e.g. changing `useAllTurnStatuses` to `useTurnStatusSync`), vitest mocks using `vi.mock()` that return an object missing the expected exports will fail at runtime with `TypeError: (0, ...useTurnStatus) is not a function` or `Error: [vitest] No "useTurnStatusSync" export is defined...`. Vitest strictly verifies that if a module is mocked, any named import actually exists on the mocked object. 

**Rule:** Always search the codebase for `vi.mock('path/to/module')` whenever you rename, add, or remove an exported function from a module, and ensure all test files update their mock returns to match the new signature.
