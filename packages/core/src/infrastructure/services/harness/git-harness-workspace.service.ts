/**
 * Git worktree workspaces for standalone harness runs (spec 119, F4).
 *
 * Creation and removal go through the shared worktree service (so worktree
 * hooks and path conventions apply); diff, commit and branch creation are
 * plain git in the harness's own worktree — the user's checkout is never
 * touched.
 */
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import type {
  HarnessWorkspace,
  HarnessWorkspaceChanges,
  IHarnessWorkspaceService,
} from '../../../application/ports/output/harness/index.js';
import type { IWorktreeService } from '../../../application/ports/output/services/worktree-service.interface.js';
import type { IWorktreePathProvider } from '../../../application/ports/output/services/worktree-path-provider.interface.js';
import { assertSafeGitRef } from '../../../domain/shared/git-ref-argument.js';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
/** Prefix of standalone harness branches. */
export const HARNESS_BRANCH_PREFIX = 'harness/';
const SESSION_ID_CHARS = 8;
const FALLBACK_IDENTITY = [
  '-c',
  'user.name=Shep Harness',
  '-c',
  'user.email=shep-harness@users.noreply.local',
];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    encoding: 'utf8',
    windowsHide: true,
  });
  return stdout;
}

async function hasIdentity(cwd: string): Promise<boolean> {
  try {
    return (await git(cwd, ['config', 'user.email'])).trim().length > 0;
  } catch {
    return false;
  }
}

export class GitHarnessWorkspaceService implements IHarnessWorkspaceService {
  constructor(
    private readonly worktrees: IWorktreeService,
    private readonly paths: IWorktreePathProvider
  ) {}

  async create(repoRoot: string, sessionId: string): Promise<HarnessWorkspace> {
    await this.worktrees.ensureGitRepository(repoRoot);
    const baseCommit = (await git(repoRoot, ['rev-parse', 'HEAD'])).trim();
    const branch = `${HARNESS_BRANCH_PREFIX}${sessionId.slice(0, SESSION_ID_CHARS)}`;
    const path = this.paths.getWorktreePath(repoRoot, branch);
    const info = await this.worktrees.create(repoRoot, branch, path, baseCommit);
    return { path: info.path, branch, baseCommit };
  }

  async changes(workspacePath: string, baseCommit: string): Promise<HarnessWorkspaceChanges> {
    assertSafeGitRef(baseCommit, 'baseCommit');
    await git(workspacePath, ['add', '-A']);
    const patch = await git(workspacePath, ['diff', '--cached', '--no-color', baseCommit, '--']);
    const names = await git(workspacePath, ['diff', '--cached', '--name-only', baseCommit, '--']);
    return {
      patch,
      files: names
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    };
  }

  async commitAll(workspacePath: string, message: string): Promise<string | undefined> {
    await git(workspacePath, ['add', '-A']);
    const staged = (await git(workspacePath, ['diff', '--cached', '--name-only'])).trim();
    if (!staged) return undefined;
    const identity = (await hasIdentity(workspacePath)) ? [] : FALLBACK_IDENTITY;
    await git(workspacePath, [...identity, 'commit', '--no-verify', '-q', '-m', message]);
    return (await git(workspacePath, ['rev-parse', 'HEAD'])).trim();
  }

  async createBranch(repoRoot: string, branch: string, commit: string): Promise<void> {
    assertSafeGitRef(branch, 'branch');
    assertSafeGitRef(commit, 'commit');
    // Without -f, git refuses to move an existing branch.
    await git(repoRoot, ['branch', '--', branch, commit]);
  }

  async remove(repoRoot: string, workspacePath: string): Promise<void> {
    await this.worktrees.remove(repoRoot, workspacePath, true);
  }

  async exists(workspacePath: string): Promise<boolean> {
    try {
      await access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }
}
