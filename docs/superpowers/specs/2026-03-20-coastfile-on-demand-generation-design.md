# Coastfile On-Demand Generation

## Summary

Move Coastfile generation from automatic (during dev server startup) to on-demand, triggered explicitly by the user via either a CLI command (`shep coasts init`) or a web UI button on the repository node. When the dev server starts in coasts mode and no Coastfile exists, it fails with a helpful error pointing the user to both generation methods.

## Motivation

The current implementation auto-generates a Coastfile when the dev server starts in coasts mode and no Coastfile is found. This is wrong because Coastfile generation is a per-repo setup step (like generating specs) — it should be an explicit user action, not a side effect of starting the dev server.

## Design

### 1. Dev Server Change

**File:** `src/presentation/web/coasts-dev-server.ts`

Replace the auto-generation block (lines 47-52) with an error throw. When `hasCoastfile(workDir)` returns false:

```
[dev-server:coasts] No Coastfile found in <workDir> (expected: Coastfile).
Generate one with:
  - CLI:    shep coasts init
  - Web UI: Use the "Generate Coastfile" button on the repository node
```

The dev server exits with code 1. No fallback, no auto-generation.

### 2. CLI Command: `shep coasts init`

**New files:**
- `src/presentation/cli/commands/coasts/index.ts` — parent `coasts` command
- `src/presentation/cli/commands/coasts/init.command.ts` — `init` subcommand

**DI resolution:** `container.resolve<ICoastsService>('ICoastsService')` — direct container import from `@/infrastructure/di/container.js` (same as all other CLI commands).

**Behavior:**
1. Resolve `ICoastsService` from DI container
2. Check if Coastfile already exists in cwd — if yes, prompt "Coastfile already exists. Regenerate? (y/n)". Support `--force` / `-f` flag to skip confirmation (for CI/non-TTY contexts).
3. Run `checkPrerequisites()` — coast binary needed for `coast installation-prompt`
4. Run `generateCoastfile(cwd)` with a spinner
5. Run `build(cwd)` automatically after generation with a spinner
6. Print success messages

**Registration:** `program.addCommand(createCoastsCommand())` in CLI `index.ts`

**Pattern:** Parent-with-subcommands (like `feat/index.ts`). Only `init` is implemented now; future subcommands (`status`, `stop`, etc.) can be added without breaking changes.

### 3. Web UI Button

**Server action:** `src/presentation/web/app/actions/generate-coastfile.ts`
- `'use server'` directive
- Resolves `ICoastsService` via `resolve<ICoastsService>('ICoastsService')` from `@/lib/server-container` (same as all other server actions)
- Accepts `repositoryPath: string`
- **Input validation:** Validates `repositoryPath` is non-empty, is an absolute path (`path.isAbsolute()`), and the directory exists (`existsSync()`) — matching the pattern in `deploy-repository.ts`
- Calls `generateCoastfile(repositoryPath)` then `build(repositoryPath)`
- Returns `{ success: boolean; coastfilePath?: string; error?: string }`

**Coastfile existence check action:** `src/presentation/web/app/actions/check-coastfile.ts`
- Lightweight server action: resolves `ICoastsService`, calls `hasCoastfile(repositoryPath)`, returns `{ exists: boolean }`
- Called by the repository node on mount to determine initial button label

**Button placement:** Dev server section (Row 4) of `repository-node.tsx`
- Only visible when `featureFlags.coastsDevServer` is enabled
- Label: "Generate Coastfile" when none exists, "Regenerate Coastfile" when one exists
- Icon: `FileCode2` from lucide-react

**State management:** New `useCoastsActions` hook (separate from `useRepositoryActions` since this is a stateful multi-step operation, not a fire-and-forget action):
- `coastfileExists: boolean` — initial value from `checkCoastfileAction()` called on mount
- `generating: boolean` — loading state
- `error: string | null` — with 5-second auto-clear (same pattern as `useRepositoryActions`)
- `generateCoastfile()` — calls the server action; on success, sets `coastfileExists = true` optimistically
- Lives in `src/presentation/web/components/common/repository-node/use-coasts-actions.ts`

**Flow:** Mount -> `checkCoastfileAction()` sets initial `coastfileExists` -> User clicks button -> spinner -> server action calls `generateCoastfile()` + `build()` -> success toast -> `coastfileExists` flipped to true -> label changes to "Regenerate Coastfile"

**Storybook:** Add mock for `generate-coastfile.ts` and `check-coastfile.ts` in `.storybook/mocks/app/actions/` if that pattern is still used, or verify mock setup is not needed.

### 4. Tests

**Unit tests:**
- `coasts-dev-server.ts` — assert throws with helpful error when no Coastfile (instead of calling `generateCoastfile()`)
- `init.command.ts` — CLI command calls `generateCoastfile()` + `build()`, handles already-exists, handles prerequisite failures
- `generate-coastfile.ts` server action — resolves service and calls correct methods

**Integration tests:**
- Dev server branching: coasts mode + no Coastfile -> exit code 1 with correct error message

**No changes to CoastsService tests** — service methods are unchanged.

### 5. Spec Update

Update `specs/072-coasts-dev-server/spec.yaml`:
- **FR-8** — rewrite: on-demand generation via CLI and web UI (not auto during startup)
- **FR-9 step 3** — fail with helpful error instead of auto-generating
- **FR-14 (new)** — CLI command `shep coasts init`
- **FR-15 (new)** — Web UI generate Coastfile button in repo node dev server section

## Files Changed

| File | Change |
|------|--------|
| `src/presentation/web/coasts-dev-server.ts` | Replace auto-generation with error throw |
| `src/presentation/cli/commands/coasts/index.ts` | New — parent `coasts` command |
| `src/presentation/cli/commands/coasts/init.command.ts` | New — `init` subcommand |
| `src/presentation/cli/index.ts` | Register `coasts` command |
| `src/presentation/web/app/actions/generate-coastfile.ts` | New — server action |
| `src/presentation/web/components/common/repository-node/repository-node.tsx` | Add button in dev server section |
| `src/presentation/web/components/common/repository-node/use-coasts-actions.ts` | New — hook for coastfile generation state |
| `src/presentation/web/app/actions/check-coastfile.ts` | New — lightweight server action for coastfile existence |
| `specs/072-coasts-dev-server/spec.yaml` | Update FR-8, FR-9; add FR-14, FR-15 |
| Tests (multiple) | New + updated tests |

## What Does NOT Change

- `CoastsService` implementation — `generateCoastfile()` and `build()` methods are untouched
- `ICoastsService` interface — no new methods needed
- DI registration — already registered
- Feature flag wiring — already complete
