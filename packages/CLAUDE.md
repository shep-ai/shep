# Cross-Platform Development Rules (STRICT)

All code under `packages/` MUST work correctly on **Windows, macOS, and Linux**. This is not optional.

## Mandatory Requirements

### Path Handling

- **NEVER** assume forward slashes (`/`) as path separators. Use `path.join()`, `path.resolve()`, or `path.normalize()` for constructing paths.
- **ALWAYS** normalize paths to forward slashes before storing in the database, comparing, or hashing. Windows APIs and dialogs return backslash paths (`C:\Users\...`), while git and many Node.js APIs use forward slashes.
- **NEVER** use hardcoded path separators in string operations. Use `path.sep` or normalize first.
- When comparing paths, normalize both sides: `p.replace(/\\/g, '/')`.
- When storing paths in SQLite, **normalize to forward slashes on write** — see
  `domain/shared/repository-path.ts`, and do it in the mapper so every INSERT and
  UPDATE goes through one place.
- **Do NOT wrap a path column in `REPLACE(column, '\', '/')` in a query.** Any
  function around a column makes its index unusable: that pattern turned
  `findByBranch` into a full table scan (`SCAN features`) and silently disabled
  `idx_features_repo`. Normalize on write, compare the column directly, and add a
  migration to back-fill rows written before the normalizer existed.

### Process Spawning

- **NEVER** use `shell: true` with `spawn()` unless absolutely necessary — it causes argument escaping issues on Windows (DEP0190) and mangles prompts with special characters.
- Use `windowsHide: true` on Windows to prevent blank console windows from flashing.
- Always explicitly set `stdio: ['pipe', 'pipe', 'pipe']` when the parent process may disconnect (detached workers, daemon processes).
- Native executables (`.exe`) on Windows are found by `spawn()` on PATH without `shell: true`.
- npm-installed CLIs are `.cmd` shims on Windows, which `spawn()` cannot launch. Spawn agent CLIs
  through `createSpawnFunction()` / `createExecFunction()` (`infrastructure/services/process/`),
  which resolve PATHEXT and run shims via cmd.exe with safe quoting. Arguments containing line
  breaks cannot pass through cmd.exe — send long or multi-line input over stdin.

### Line Endings

- Configure `git config core.autocrlf false` in CI and test setup to prevent phantom modifications.
- Do not assume `\n` — use `os.EOL` when writing platform-specific output, or normalize with `.replace(/\r\n/g, '\n')` when parsing.

### Temporary Directories

- Use `os.tmpdir()` and `fs.mkdtempSync()` — never hardcode `/tmp` or `C:\Temp`.

### Process Management

- `process.kill(pid, 0)` works on all platforms for checking if a process is alive.
- `pkill` does not exist on Windows. Use platform-specific process termination or tree-kill utilities.
- Exit codes differ: Windows uses unsigned 32-bit codes (e.g., `0xC0000005` = access violation). Check for both Unix and Windows exit code conventions.

### File System

- Windows paths are case-insensitive. Use `.toLowerCase()` when comparing paths on Windows.
- Windows has a 260-character path limit by default. Keep paths short, especially in nested worktrees.
- Windows may use 8.3 short paths (e.g., `RUNNER~1`). Use `fs.realpathSync()` to resolve to actual paths.
- File locks are more aggressive on Windows — a file open for reading may block deletion.

## When Cross-Platform Is Not Feasible

If a feature genuinely cannot work on a specific platform:

1. **Detect the platform** using `process.platform` (`'win32'`, `'darwin'`, `'linux'`).
2. **Provide a clear error message** explaining the limitation and suggesting alternatives.
3. **Never silently fail** — always warn or error if a platform-specific feature is unavailable.
4. **Document the limitation** in the relevant tool/service JSON metadata (see `openDirectory` field patterns in tool installer JSONs).

## Testing

- All tests MUST pass on all platforms. The unit/integration and E2E CLI jobs run on both `ubuntu-latest` and `windows-latest`; the two Electron jobs additionally run on `macos-latest`.
- In test assertions, normalize paths before comparing: `tempRepo.replace(/\\/g, '/')`.
- When computing path-dependent hashes in tests, normalize the input path first.
