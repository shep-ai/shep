/**
 * Worktree Path Provider (infrastructure adapter)
 *
 * Adapts the pure `computeWorktreePath` helper to the
 * `IWorktreePathProvider` output port so application-layer use cases can
 * depend on the abstraction rather than the concrete module.
 */

import { injectable } from 'tsyringe';
import type { IWorktreePathProvider } from '../../../application/ports/output/services/worktree-path-provider.interface.js';
import { computeWorktreePath } from './compute-worktree-path.js';

@injectable()
export class WorktreePathProvider implements IWorktreePathProvider {
  getWorktreePath(repoPath: string, branch: string): string {
    return computeWorktreePath(repoPath, branch);
  }
}
