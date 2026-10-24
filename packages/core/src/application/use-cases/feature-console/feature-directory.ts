/**
 * The directory a feature's terminal pane or chat agent runs in (specs 143,
 * 147): the recorded worktree when it exists on disk, else the computed
 * worktree path, else the repository (before the worker created a worktree).
 */

import type { Feature } from '../../../domain/generated/output.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';

export function resolveFeatureDirectory(
  feature: Pick<Feature, 'worktreePath' | 'repositoryPath' | 'branch'>,
  worktreePaths: IWorktreePathProvider,
  fileSystem: Pick<IFileSystemService, 'pathExists'>
): string {
  const candidates = [
    feature.worktreePath,
    feature.branch
      ? worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch)
      : undefined,
  ];
  return (
    candidates.find((path): path is string => !!path && fileSystem.pathExists(path)) ??
    feature.repositoryPath
  );
}
