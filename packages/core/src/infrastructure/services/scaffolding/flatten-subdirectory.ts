/**
 * Flatten a single-child directory into its parent.
 *
 * `shadcn init --template vite` scaffolds a new project into a child
 * folder named after the user's prompt response (even with `--yes`).
 * Our contract with `CreateApplicationUseCase` is that `package.json`
 * lives exactly at the resolved `repositoryPath` — so right after
 * `shadcn init` returns we move every file (including dotfiles) from
 * the single child directory up into `repositoryPath` and remove the
 * now-empty child.
 *
 * This is intentionally a standalone helper, not an agent-run bash
 * one-liner:
 *   - Bash `shopt -s dotglob; mv "$c"/* .` is fragile across shells
 *     and relies on the agent executing a prescribed command in the
 *     exact step where we asked for it. When it doesn't, every
 *     subsequent step pays the cost of fixing the layout.
 *   - Node `fs.renameSync` is deterministic, cross-platform, and runs
 *     synchronously inside our own code so we catch failures before
 *     persisting the Application row.
 *
 * The function is idempotent: if `repositoryPath` already contains a
 * `package.json` at the root (either because scaffolding succeeded
 * into `.` directly, or because the flatten has already run), it is
 * a no-op returning `false`. When it did flatten a child it returns
 * `true`, so callers can branch or log accordingly.
 *
 * @throws Error when the layout is ambiguous (no `package.json`
 *         anywhere, or more than one candidate child directory).
 */

import { existsSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface FlattenResult {
  /** True if a child directory was flattened, false if the layout was already flat. */
  readonly flattened: boolean;
  /** Name of the child directory that was flattened, if any. */
  readonly childName: string | null;
}

export function flattenSingleChildProject(repositoryPath: string): FlattenResult {
  // Already flat — `shadcn init` chose `.` or the flatten already ran.
  if (existsSync(join(repositoryPath, 'package.json'))) {
    return { flattened: false, childName: null };
  }

  // Find the single child directory that contains the scaffolded
  // `package.json`. We only walk ONE level deep — the scaffold never
  // puts `package.json` any deeper than that.
  const entries = readdirSync(repositoryPath);
  const candidates: string[] = [];
  for (const entry of entries) {
    const entryPath = join(repositoryPath, entry);
    let isDir: boolean;
    try {
      isDir = statSync(entryPath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (existsSync(join(entryPath, 'package.json'))) {
      candidates.push(entry);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `flattenSingleChildProject: no package.json found at "${repositoryPath}" ` +
        `or in any immediate child — the scaffold did not produce a recognizable project.`
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `flattenSingleChildProject: multiple candidate child directories contain package.json ` +
        `at "${repositoryPath}" (${candidates.join(', ')}) — the scaffold layout is ambiguous.`
    );
  }

  const childName = candidates[0];
  const childPath = join(repositoryPath, childName);

  // Move everything (including dotfiles) from child → parent. We use
  // `renameSync` rather than `fs.cpSync` + `rmSync` because both
  // source and destination live on the same filesystem (same mount
  // point) — rename is atomic on POSIX and cheap on Windows.
  //
  // Collision is impossible: the parent already only contains
  // `childName`, so the destination slots are empty. If a future
  // shadcn version starts creating files in the parent too, the first
  // collision will surface as a clear EEXIST error instead of silent
  // overwrite, which is the right failure mode.
  for (const entry of readdirSync(childPath)) {
    const from = join(childPath, entry);
    const to = join(repositoryPath, entry);
    if (existsSync(to)) {
      throw new Error(
        `flattenSingleChildProject: destination "${to}" already exists — ` +
          `the parent directory is not empty and the scaffold layout is unexpected.`
      );
    }
    renameSync(from, to);
  }

  rmdirSync(childPath);

  return { flattened: true, childName };
}
