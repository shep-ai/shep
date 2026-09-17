import { injectable, inject } from 'tsyringe';
import type {
  RemoteInfo,
  ForkParentInfo,
} from '../../../application/services/pr-target-resolution.js';
import type { ExecFunction } from './worktree.service.js';

/**
 * Read-only git/gh lookups backing upstream PR-target resolution in the
 * feature-agent merge node. Errors are swallowed (returning empty/null) so a
 * broken gh or missing upstream can never break the standard origin flow.
 */
@injectable()
export class GitRemoteListService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async listRemotes(cwd: string): Promise<RemoteInfo[]> {
    const { stdout } = await this.execFile('git', ['remote', '-v'], { cwd });
    const byName = new Map<string, string>();
    for (const line of stdout.split('\n')) {
      const match = /^(\S+)\t(\S+)\s+\(fetch\)$/.exec(line.trim());
      if (match) byName.set(match[1], match[2]);
    }
    return [...byName].map(([name, url]) => ({ name, url }));
  }

  async getForkParentInfo(cwd: string): Promise<ForkParentInfo | null> {
    try {
      const { stdout } = await this.execFile('gh', ['repo', 'view', '--json', 'parent'], { cwd });
      const parent = (
        JSON.parse(stdout) as { parent?: { name?: string; owner?: { login?: string } } | null }
      ).parent;
      const owner = parent?.owner?.login;
      const repo = parent?.name;
      if (!owner || !repo) return null;

      const { stdout: branchStdout } = await this.execFile(
        'gh',
        ['repo', 'view', `${owner}/${repo}`, '--json', 'defaultBranchRef'],
        { cwd }
      );
      const defaultBranch = (
        JSON.parse(branchStdout) as { defaultBranchRef?: { name?: string } | null }
      ).defaultBranchRef?.name;
      if (!defaultBranch) return null;

      return { owner, repo, defaultBranch };
    } catch {
      return null;
    }
  }
}
