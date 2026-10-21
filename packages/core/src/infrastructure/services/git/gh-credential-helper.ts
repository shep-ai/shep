/**
 * Wire the `gh` CLI as git's credential helper (`gh auth setup-git`) so a push
 * over an HTTPS remote authenticates with gh's stored token.
 *
 * Best-effort and idempotent: a failure is returned, never thrown, because the
 * push that follows reports a clearer error when credentials really are
 * missing — and SSH remotes do not need the helper at all.
 */

import type { ExecFunction } from './worktree.service.js';

export async function setupGhGitCredentials(
  execFile: ExecFunction,
  cwd: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await execFile('gh', ['auth', 'setup-git'], { cwd });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
