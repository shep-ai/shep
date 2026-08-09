/**
 * Deployment Target Resolver
 *
 * Run plans are keyed by `repoPath` and are deliberately shared across all
 * three deployment target types (`dev_server_run_plans.repo_path` is the
 * primary key). So every run-plan use case needs exactly one thing from its
 * `{ targetType, targetId }` input: the directory the plan applies to. This
 * service is the single place that answers that, and the single place that
 * maps a failure to a typed result instead of an exception.
 *
 * It also answers the question only the CLI ever asks — "which target owns
 * this directory?" — so `shep dev plan show` can run with no arguments from
 * inside a repository without a terminal-shaped helper re-deriving target
 * resolution outside core.
 *
 * Depends only on output ports (repositories, filesystem, worktree paths);
 * nothing here imports from `infrastructure/`.
 */

import { inject, injectable } from 'tsyringe';

import { DeploymentTargetType } from '../../domain/generated/output.js';
import { isAbsolutePath } from '../../domain/shared/absolute-path.js';
import { normalizePath } from '../../domain/shared/normalize-path.js';
import { isPathInside } from '../../domain/shared/path-confinement.js';
import type { IApplicationRepository } from '../ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '../ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '../ports/output/repositories/repository-repository.interface.js';
import type { IFileSystemService } from '../ports/output/services/file-system-service.interface.js';
import type { IWorktreePathProvider } from '../ports/output/services/worktree-path-provider.interface.js';

/** Outcome of a resolution attempt. Never thrown — always returned. */
export enum DeploymentTargetResolutionStatus {
  Resolved = 'resolved',
  /** No such target id (or the id was blank). */
  NotFound = 'not-found',
  /** The target exists but its directory is gone from disk. */
  PathMissing = 'path-missing',
  /** Several equally-specific targets own the directory. */
  Ambiguous = 'ambiguous',
  /** No registered target owns the directory. */
  Unmatched = 'unmatched',
}

/** A deployment target and the directory its run plan is keyed by. */
export interface ResolvedDeploymentTarget {
  targetType: DeploymentTargetType;
  targetId: string;
  /** Absolute, forward-slash-normalized repository/worktree path. */
  repoPath: string;
}

export interface DeploymentTargetRef {
  targetType: DeploymentTargetType;
  targetId: string;
}

export type DeploymentTargetResolution =
  | { status: DeploymentTargetResolutionStatus.Resolved; target: ResolvedDeploymentTarget }
  | {
      status: DeploymentTargetResolutionStatus.NotFound;
      targetType: DeploymentTargetType;
      targetId: string;
      message: string;
    }
  | {
      status: DeploymentTargetResolutionStatus.PathMissing;
      target: ResolvedDeploymentTarget;
      message: string;
    }
  | {
      status: DeploymentTargetResolutionStatus.Ambiguous;
      candidates: ResolvedDeploymentTarget[];
      message: string;
    }
  | { status: DeploymentTargetResolutionStatus.Unmatched; cwd: string; message: string };

/**
 * Tie-break order when several targets own the same directory: a feature
 * worktree is a narrower statement of intent than an application, which is
 * narrower than a bare repository. Without this, the extremely common case of
 * an application registered at a repository's own path would read as
 * ambiguous on every `shep dev` invocation.
 */
const TARGET_TYPE_SPECIFICITY: readonly DeploymentTargetType[] = [
  DeploymentTargetType.Feature,
  DeploymentTargetType.Application,
  DeploymentTargetType.Repository,
];

@injectable()
export class DeploymentTargetResolver {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    @inject('IWorktreePathProvider')
    private readonly worktreePaths: IWorktreePathProvider
  ) {}

  /** Resolve an explicit `{ targetType, targetId }` to its repository path. */
  async resolve(ref: DeploymentTargetRef): Promise<DeploymentTargetResolution> {
    const { targetType, targetId } = ref;

    if (!targetId?.trim()) {
      return this.notFound(targetType, targetId ?? '');
    }

    const repoPath = await this.lookupRepoPath(targetType, targetId.trim());
    if (repoPath === null) {
      return this.notFound(targetType, targetId);
    }

    return this.confirmOnDisk({ targetType, targetId, repoPath });
  }

  /**
   * Resolve the target that owns `cwd` — the directory itself or any ancestor.
   * The deepest owner wins; ties are broken by target specificity, and a tie
   * that survives that (two applications registered at one path) is reported
   * rather than guessed.
   */
  async resolveFromCwd(cwd: string): Promise<DeploymentTargetResolution> {
    const normalizedCwd = normalizePath(cwd);
    if (!normalizedCwd) {
      return this.unmatched(cwd);
    }

    const owners = (await this.allTargets()).filter((candidate) =>
      isPathInside(candidate.repoPath, normalizedCwd)
    );
    if (owners.length === 0) {
      return this.unmatched(cwd);
    }

    const deepest = Math.max(...owners.map((candidate) => candidate.repoPath.length));
    const finalists = owners.filter((candidate) => candidate.repoPath.length === deepest);
    const winners = mostSpecific(finalists);

    if (winners.length > 1) {
      return {
        status: DeploymentTargetResolutionStatus.Ambiguous,
        candidates: winners,
        message:
          `Several ${winners[0].targetType} targets are registered at ${winners[0].repoPath} — ` +
          `pass an explicit target to choose one.`,
      };
    }

    return this.confirmOnDisk(winners[0]);
  }

  /** The repository path for a target, or null when the target is unknown. */
  private async lookupRepoPath(
    targetType: DeploymentTargetType,
    targetId: string
  ): Promise<string | null> {
    switch (targetType) {
      case DeploymentTargetType.Application: {
        const application = await this.applicationRepo.findById(targetId);
        return application ? normalizePath(application.repositoryPath) : null;
      }
      case DeploymentTargetType.Feature: {
        const feature = await this.featureRepo.findById(targetId);
        return feature ? normalizePath(this.worktreePathOf(feature)) : null;
      }
      case DeploymentTargetType.Repository:
        return this.lookupRepositoryPath(targetId);
      default:
        return null;
    }
  }

  /**
   * Repository targets are keyed by path today (`StartRepositoryDeploymentUseCase`
   * passes the path as both id and path), but a registered repository's UUID is
   * an equally reasonable thing for a caller to hold — so both are accepted, and
   * an absolute path that is not registered still resolves.
   */
  private async lookupRepositoryPath(targetId: string): Promise<string | null> {
    const byId = await this.repositoryRepo.findById(targetId);
    if (byId) return normalizePath(byId.path);

    if (!isAbsolutePath(targetId)) return null;

    const normalized = normalizePath(targetId);
    const byPath = await this.repositoryRepo.findByPath(normalized);
    return byPath ? normalizePath(byPath.path) : normalized;
  }

  /** Every registered target, paired with the directory it deploys from. */
  private async allTargets(): Promise<ResolvedDeploymentTarget[]> {
    const [applications, features, repositories] = await Promise.all([
      this.applicationRepo.list(),
      this.featureRepo.list(),
      this.repositoryRepo.list(),
    ]);

    return [
      ...features.map((feature) => ({
        targetType: DeploymentTargetType.Feature,
        targetId: feature.id,
        repoPath: normalizePath(this.worktreePathOf(feature)),
      })),
      ...applications.map((application) => ({
        targetType: DeploymentTargetType.Application,
        targetId: application.id,
        repoPath: normalizePath(application.repositoryPath),
      })),
      ...repositories.map((repository) => ({
        targetType: DeploymentTargetType.Repository,
        targetId: repository.path,
        repoPath: normalizePath(repository.path),
      })),
    ].filter((candidate) => candidate.repoPath.length > 0);
  }

  /** A feature's worktree, derived from repository + branch when unstored. */
  private worktreePathOf(feature: {
    worktreePath?: string;
    repositoryPath: string;
    branch: string;
  }): string {
    return (
      feature.worktreePath ??
      this.worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch)
    );
  }

  /** A resolved target is only usable if its directory still exists. */
  private confirmOnDisk(target: ResolvedDeploymentTarget): DeploymentTargetResolution {
    if (!this.fileSystem.pathExists(target.repoPath)) {
      return {
        status: DeploymentTargetResolutionStatus.PathMissing,
        target,
        message: `Directory does not exist: ${target.repoPath}`,
      };
    }
    return { status: DeploymentTargetResolutionStatus.Resolved, target };
  }

  private notFound(targetType: DeploymentTargetType, targetId: string): DeploymentTargetResolution {
    return {
      status: DeploymentTargetResolutionStatus.NotFound,
      targetType,
      targetId,
      message: `No ${targetType} found for "${targetId}"`,
    };
  }

  private unmatched(cwd: string): DeploymentTargetResolution {
    return {
      status: DeploymentTargetResolutionStatus.Unmatched,
      cwd,
      message: `No application, feature or repository is registered for ${cwd || '(empty path)'}`,
    };
  }
}

/** The candidates of the narrowest target type present in the list. */
function mostSpecific(candidates: ResolvedDeploymentTarget[]): ResolvedDeploymentTarget[] {
  for (const targetType of TARGET_TYPE_SPECIFICITY) {
    const matches = candidates.filter((candidate) => candidate.targetType === targetType);
    if (matches.length > 0) return matches;
  }
  return candidates;
}
