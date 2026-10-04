/**
 * Detached-worktree investigation workspace (spec 123).
 *
 * `git worktree add --detach` of the repository's HEAD under
 * `<shep home>/inv/<id>`: it shares the object store, so it takes seconds,
 * creates no branch, and isolates file changes from the user's checkout.
 * The user's worktree hooks are deliberately not run — an investigation only
 * reads.
 *
 * A process that dies mid-investigation leaves its copy behind; the next
 * prepare() removes copies older than the stale threshold and prunes git's
 * record of them.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IInvestigationWorkspace,
  InvestigationCheckout,
} from '../../../application/ports/output/services/investigation-workspace.interface.js';
import { InvestigationWorkspaceError } from '../../../application/ports/output/services/investigation-workspace.interface.js';
import { INVESTIGATION_STALE_AFTER_MS } from '../../../domain/shared/investigation.js';
import type { ExecFunction } from './worktree.service.js';

/** Short directory names keep Windows paths well under MAX_PATH. */
const DIRECTORY_NAME_LENGTH = 8;

export class GitInvestigationWorkspace implements IInvestigationWorkspace {
  constructor(
    private readonly execFile: ExecFunction,
    /** Directory holding the copies. */
    private readonly root: string
  ) {}

  async prepare(repositoryPath: string, id: string): Promise<InvestigationCheckout> {
    const commitSha = await this.headCommit(repositoryPath);
    mkdirSync(this.root, { recursive: true });
    await this.sweepStale(repositoryPath);

    const path = join(this.root, id.slice(0, DIRECTORY_NAME_LENGTH));
    if (existsSync(path)) await this.dispose(repositoryPath, { path, commitSha });
    await this.git(repositoryPath, ['worktree', 'add', '--detach', '--', path, commitSha]);
    return { path, commitSha };
  }

  async dispose(repositoryPath: string, checkout: InvestigationCheckout): Promise<void> {
    try {
      await this.git(repositoryPath, ['worktree', 'remove', '--force', '--', checkout.path]);
    } catch {
      // Already gone, or git refused: remove the files and forget the registration.
      rmSync(checkout.path, { recursive: true, force: true });
      await this.git(repositoryPath, ['worktree', 'prune']).catch(() => undefined);
    }
  }

  private async headCommit(repositoryPath: string): Promise<string> {
    try {
      await this.git(repositoryPath, ['rev-parse', '--git-dir']);
    } catch {
      throw new InvestigationWorkspaceError(`${repositoryPath} is not a git repository.`);
    }
    try {
      return (await this.git(repositoryPath, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    } catch {
      throw new InvestigationWorkspaceError(`${repositoryPath} has no commits to investigate.`);
    }
  }

  private async sweepStale(repositoryPath: string): Promise<void> {
    const cutoff = Date.now() - INVESTIGATION_STALE_AFTER_MS;
    let swept = false;
    for (const entry of readdirSync(this.root)) {
      const path = join(this.root, entry);
      try {
        if (statSync(path).mtimeMs < cutoff) {
          rmSync(path, { recursive: true, force: true });
          swept = true;
        }
      } catch {
        // Removed by another process meanwhile.
      }
    }
    if (swept) await this.git(repositoryPath, ['worktree', 'prune']).catch(() => undefined);
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    return (await this.execFile('git', args, { cwd })).stdout;
  }
}
