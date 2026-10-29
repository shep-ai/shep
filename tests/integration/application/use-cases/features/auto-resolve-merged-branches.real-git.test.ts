/**
 * AutoResolveMergedBranchesUseCase against a real repository (no remote).
 *
 * A feature parked at its merge gate on a branch nobody has committed to yet
 * is "contained in" main, exactly like a merged one. Only a branch with a
 * commit made after the feature began, and contained in main, was merged.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoResolveMergedBranchesUseCase } from '@/application/use-cases/features/auto-resolve-merged-branches.use-case.js';
import type { UpdateFeatureLifecycleUseCase } from '@/application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { GitPrService } from '@/infrastructure/services/git/git-pr.service.js';
import { GitCommitHistoryService } from '@/infrastructure/services/git/git-commit-history.service.js';
import { BuildMode, SdlcLifecycle, type Feature } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';

const execFileAsync = promisify(execFileCb);
const exec = (file: string, args: string[], options?: object) =>
  execFileAsync(file, args, options) as Promise<{ stdout: string; stderr: string }>;

const BASE_COMMITTED = '2026-10-28T10:00:00Z';
const FEATURES_CREATED = new Date('2026-10-28T11:00:00Z');
const WORK_COMMITTED = '2026-10-28T12:00:00Z';

let repo: string;

async function git(args: string[], date?: string): Promise<void> {
  const env = date
    ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : process.env;
  await execFileAsync('git', args, { cwd: repo, env });
}

function feature(id: string, branch: string): Feature {
  return {
    id,
    name: id,
    userQuery: id,
    slug: id,
    description: id,
    repositoryPath: repo,
    branch,
    lifecycle: SdlcLifecycle.Review,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Fast,
    fast: true,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: false,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: FEATURES_CREATED,
    updatedAt: FEATURES_CREATED,
  };
}

describe('AutoResolveMergedBranchesUseCase with real git', () => {
  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'shep-auto-resolve-'));
    await git(['init', '-q', '-b', 'main']);
    await git(['config', 'user.email', 'test@example.com']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'core.autocrlf', 'false']);
    writeFileSync(join(repo, 'README.md'), 'base\n');
    await git(['add', '.']);
    await git(['commit', '-q', '-m', 'base'], BASE_COMMITTED);

    // Parked at its gate with nothing committed yet.
    await git(['branch', 'feat/empty']);

    // Work committed after the feature began, then fast-forwarded into main.
    await git(['checkout', '-q', '-b', 'feat/done']);
    writeFileSync(join(repo, 'done.txt'), 'done\n');
    await git(['add', '.']);
    await git(['commit', '-q', '-m', 'feat: done'], WORK_COMMITTED);
    await git(['checkout', '-q', 'main']);
    await git(['merge', '-q', '--ff-only', 'feat/done']);
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('closes the merged feature and leaves the empty one at its gate', async () => {
    const empty = feature('feat-empty', 'feat/empty');
    const done = feature('feat-done', 'feat/done');
    const featureRepo = createMockFeatureRepository();
    vi.mocked(featureRepo.findById).mockImplementation(async (id) =>
      id === empty.id ? empty : id === done.id ? done : null
    );
    const updateLifecycle = { execute: vi.fn() } as unknown as UpdateFeatureLifecycleUseCase;
    const useCase = new AutoResolveMergedBranchesUseCase(
      featureRepo,
      new GitPrService(exec),
      { updateStatus: vi.fn() } as unknown as IAgentRunRepository,
      updateLifecycle,
      new GitCommitHistoryService(exec)
    );

    const result = await useCase.execute([empty, done]);

    expect(result.resolvedFeatureIds).toEqual(['feat-done']);
    expect(updateLifecycle.execute).toHaveBeenCalledTimes(1);
    expect(updateLifecycle.execute).toHaveBeenCalledWith({
      featureId: 'feat-done',
      lifecycle: SdlcLifecycle.Maintain,
    });
  });
});
