# Merge Review Evidence — Issues 580 / 582 / 583

This branch ships three independent UX/agent bug fixes plus the LESSONS.md entries
documenting the underlying patterns. Evidence below proves correctness on the merge
commit (post `merge origin/main`, conflict in `LESSONS.md` resolved by keeping both
sets of new lessons).

## Fixes

### Issue #580 — White-on-white inventory rows in dark mode
- **Commit:** `ed7ec1f3 fix(web): clear white over white inventory rows in dark mode`
- **Root cause:** `tabulator-tables` hardcodes `background: #fff` on `.tabulator-table`
  in addition to `.tabulator-row`; the dark-mode override only patched the row, leaving
  a solid white plate behind the rows.
- **Fix:** extend the dark-mode CSS in
  `src/presentation/web/components/features/feature-tree-table/feature-tree-table.css`
  to override every layer in the visual stack (table, tableholder, row, cell).

### Issue #582 — MCP tools rejected through interactive chat
- **Commit:** `3dc38c7b fix(agents): allow mcp tools through interactive chat`
- **Root cause:** Claude Agent SDK V2 hardcodes `allowDangerouslySkipPermissions: false`
  and `allowedTools` accepts no wildcards, so dynamically-discovered MCP tools fall
  through to the default permission gate. `canUseTool` was previously installed only
  when `onUserQuestion` was provided, leaving regular chat sessions to silently deny
  every MCP call.
- **Fix:** install `canUseTool` unconditionally and use it both as the AskUserQuestion
  interception point and as the catch-all "allow" for unknown tools.

### Issue #583 — `Open in terminal` lands at $HOME on macOS
- **Commit:** `1bd37d65 fix(web): open terminal in the actual repo path on macos`
- **Root cause:** `open -a Terminal /path` is unreliable when Terminal.app is already
  running — the new window often opens at `$HOME` rather than the supplied path. The
  template tokenization step also shredded paths with spaces by splitting on
  whitespace AFTER substituting `{dir}`.
- **Fix:** use `osascript` with `do script "cd '...'"` so the working directory is
  set programmatically; tokenize the template BEFORE substituting `{dir}` so paths
  with spaces survive the spawn-args split.

## Verification artifacts

| Artifact                       | Result                                       |
| ------------------------------ | -------------------------------------------- |
| `typecheck-output.txt`         | `tsc --noEmit` — passed (no errors)          |
| `lint-output.txt`              | `eslint . --max-warnings 0 --cache` — passed |
| `unit-test-results.txt`        | 520 files / **6840 tests** passed            |
| `integration-test-results.txt` | 61 files / **786 tests** passed              |
| `bug-fix-tests.txt`            | 31 targeted tests for #582 + #583 — passed   |
| `build-output.txt`             | `pnpm build` — exit 0                        |
| `changed-files.txt`            | Diff of source/test files vs `main`          |

All checks ran on the merged tip after `merge origin/main`, confirming the branch
is conflict-free with remote and the fixes hold against the latest `main`.
