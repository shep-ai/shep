'use server';

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { resolve } from '@/lib/server-container';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { IGitPrService } from '@shepai/core/application/ports/output/services/git-pr-service.interface';
import type {
  MergeReviewData,
  MergeReviewEvidence,
} from '@/components/common/merge-review/merge-review-config';
import { computeWorktreePath } from '@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';

type GetMergeReviewDataResult = MergeReviewData | { error: string };

/**
 * Compute the shep evidence directory for a given repository and feature.
 * Path: ~/.shep/repos/<sha256-hash-prefix>/evidence/<featureId>/
 */
function computeEvidenceDir(repositoryPath: string, featureId: string): string {
  const repoHash = createHash('sha256').update(repositoryPath).digest('hex').slice(0, 16);
  return join(getShepHomeDir(), 'repos', repoHash, 'evidence', featureId).replace(/\\/g, '/');
}

/**
 * Normalize evidence paths so they all point to the shep evidence directory.
 * When commitEvidence was enabled, the manifest may contain relative paths
 * (e.g. "specs/066-feature/evidence/file.png"). After merge the worktree is
 * deleted so those paths no longer resolve. The evidence files were also saved
 * to the shep evidence dir with the same filename, so we map relative paths
 * to absolute paths there.
 */
function normalizeEvidencePaths(
  evidence: MergeReviewEvidence[],
  evidenceDir: string
): MergeReviewEvidence[] {
  return evidence.map((e) => {
    if (e.relativePath.startsWith('/')) {
      // Already absolute — check if the file exists; if not, try the evidence dir
      if (existsSync(e.relativePath)) return e;
      const fallback = join(evidenceDir, basename(e.relativePath)).replace(/\\/g, '/');
      if (existsSync(fallback)) return { ...e, relativePath: fallback };
      return e;
    }
    // Relative path — resolve to evidence dir using the filename
    const absolutePath = join(evidenceDir, basename(e.relativePath)).replace(/\\/g, '/');
    return { ...e, relativePath: absolutePath };
  });
}

export async function getMergeReviewData(featureId: string): Promise<GetMergeReviewDataResult> {
  if (!featureId.trim()) {
    return { error: 'Feature id is required' };
  }

  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const feature = await featureRepo.findById(featureId);

    if (!feature) {
      return { error: 'Feature not found' };
    }

    const { workflow } = getSettings();

    const pr = feature.pr
      ? {
          url: feature.pr.url,
          number: feature.pr.number,
          status: feature.pr.status,
          commitHash: feature.pr.commitHash,
          ciStatus: feature.pr.ciStatus,
          mergeable: feature.pr.mergeable,
        }
      : undefined;

    const worktreePath =
      feature.worktreePath ??
      (feature.repositoryPath && feature.branch
        ? computeWorktreePath(feature.repositoryPath, feature.branch)
        : null);

    // Detect the actual default branch (main, master, etc.) for diff comparison.
    const gitPrService = resolve<IGitPrService>('IGitPrService');
    const diffCwd = worktreePath ?? feature.repositoryPath ?? null;
    let defaultBranch = 'main';
    if (diffCwd) {
      try {
        defaultBranch = await gitPrService.getDefaultBranch(diffCwd);
      } catch {
        // Fall back to 'main' if detection fails
      }
    }

    const branch = feature.branch ? { source: feature.branch, target: defaultBranch } : undefined;

    // Load evidence manifest (best-effort).
    // Evidence is stored independently of the worktree at:
    //   ~/.shep/repos/<hash>/evidence/<featureId>/manifest.json
    // We compute this path from repositoryPath so evidence is accessible
    // even after the worktree has been deleted post-merge.
    let evidence: MergeReviewEvidence[] | undefined;
    const evidenceDir = feature.repositoryPath
      ? computeEvidenceDir(feature.repositoryPath, featureId)
      : worktreePath
        ? join(dirname(dirname(worktreePath)), 'evidence', featureId).replace(/\\/g, '/')
        : null;

    if (evidenceDir) {
      try {
        const manifestPath = join(evidenceDir, 'manifest.json');
        if (existsSync(manifestPath)) {
          const raw: MergeReviewEvidence[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          const normalized = normalizeEvidencePaths(raw, evidenceDir);
          // Deduplicate: same type + relativePath means the same evidence entry
          const seen = new Set<string>();
          evidence = normalized.filter((e) => {
            const key = `${e.type}:${e.relativePath}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      } catch {
        // Evidence unavailable — not critical
      }
    }

    if (!worktreePath) {
      return {
        pr,
        branch,
        evidence,
        warning: pr ? undefined : 'No PR or diff data available',
        hideCiStatus: workflow.hideCiStatus,
      };
    }

    try {
      let fileDiffsWarning: string | undefined;
      const [diffSummary, fileDiffs] = await Promise.all([
        gitPrService.getPrDiffSummary(worktreePath, defaultBranch),
        gitPrService.getFileDiffs(worktreePath, defaultBranch).catch(() => {
          fileDiffsWarning = 'File diffs unavailable';
          return undefined;
        }),
      ]);
      return {
        pr,
        branch,
        diffSummary,
        fileDiffs,
        evidence,
        warning: fileDiffsWarning,
        hideCiStatus: workflow.hideCiStatus,
      };
    } catch {
      return {
        pr,
        branch,
        evidence,
        warning: 'Diff statistics unavailable',
        hideCiStatus: workflow.hideCiStatus,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load merge review data';
    return { error: message };
  }
}
