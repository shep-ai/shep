/**
 * `shep learn adopt | reject | rollback | reflect` (spec 150): thin commands
 * that act on learned-harness versions through their use cases.
 */

import 'reflect-metadata';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessRefinementStatus } from '@/domain/generated/output.js';
import {
  ADOPTED_ID,
  CANDIDATE_ID,
  REPO,
  createFakeUseCases,
  printed,
  resolveFake,
} from './learn-fixtures.js';

const { fakes } = vi.hoisted(() => ({ fakes: {} as Record<string, unknown> }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) =>
      resolveFake(fakes as ReturnType<typeof createFakeUseCases>, token)
    ),
  },
}));

import { createLearnCommand } from '../../../../../../src/presentation/cli/commands/learn/index.js';

const ACTOR = 'user:cli';
let uc: ReturnType<typeof createFakeUseCases>;

async function run(...args: string[]): Promise<string> {
  await createLearnCommand().parseAsync(args, { from: 'user' });
  return printed();
}

describe('shep learn (decision commands)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uc = createFakeUseCases();
    Object.assign(fakes, uc);
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe('adopt', () => {
    it('adopts a version as the CLI user', async () => {
      uc.AdoptHarnessVersionUseCase.execute.mockResolvedValue({
        adopted: true,
        memoryFactsRecorded: 2,
      });

      const out = await run('adopt', 'bbbb');

      expect(uc.AdoptHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        versionId: 'bbbb',
        actor: ACTOR,
      });
      expect(out).toContain('Adopted bbbb');
      expect(out).toContain('2');
      expect(process.exitCode).toBeUndefined();
    });

    it('prints why a version was not adopted and exits 1', async () => {
      uc.AdoptHarnessVersionUseCase.execute.mockResolvedValue({
        adopted: false,
        reason: 'version bbbb is rejected',
        memoryFactsRecorded: 0,
      });

      const out = await run('adopt', 'bbbb');

      expect(out).toContain('version bbbb is rejected');
      expect(process.exitCode).toBe(1);
    });

    it('imports and adopts a harness directory with --from-dir', async () => {
      uc.ImportHarnessVersionUseCase.execute.mockResolvedValue({
        imported: true,
        adopted: true,
        versionId: CANDIDATE_ID,
        problems: [],
      });

      const out = await run('adopt', '--from-dir', 'my-harness', '--repo', REPO);

      expect(uc.ImportHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: REPO,
        directory: resolve('my-harness'),
        actor: ACTOR,
      });
      expect(out).toContain('bbbbbbbb');
      expect(process.exitCode).toBeUndefined();
    });

    it('lists every problem of a refused import and exits 1', async () => {
      uc.ImportHarnessVersionUseCase.execute.mockResolvedValue({
        imported: false,
        adopted: false,
        problems: ['skills/x/SKILL.md has no frontmatter', 'hooks.json is malformed'],
      });

      const out = await run('adopt', '--from-dir', '/tmp/h', '--repo', REPO);

      expect(out).toContain('skills/x/SKILL.md has no frontmatter');
      expect(out).toContain('hooks.json is malformed');
      expect(process.exitCode).toBe(1);
    });

    it('warns when an import was stored but not adopted', async () => {
      uc.ImportHarnessVersionUseCase.execute.mockResolvedValue({
        imported: true,
        adopted: false,
        versionId: CANDIDATE_ID,
        problems: [],
      });

      const out = await run('adopt', '--from-dir', '/tmp/h', '--repo', REPO);

      expect(out).toContain('not adopted');
      expect(process.exitCode).toBe(1);
    });

    it.each([[['adopt']], [['adopt', 'bbbb', '--from-dir', '/tmp/h']]])(
      'needs exactly one of a version or --from-dir (%j)',
      async (args) => {
        const out = await run(...args);

        expect(uc.AdoptHarnessVersionUseCase.execute).not.toHaveBeenCalled();
        expect(uc.ImportHarnessVersionUseCase.execute).not.toHaveBeenCalled();
        expect(out).toContain('--from-dir');
        expect(process.exitCode).toBe(1);
      }
    );
  });

  describe('reject', () => {
    it('rejects a version with feedback', async () => {
      uc.RejectHarnessVersionUseCase.execute.mockResolvedValue({ rejected: true });

      const out = await run('reject', 'bbbb', '--feedback', 'Too broad');

      expect(uc.RejectHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        versionId: 'bbbb',
        feedback: 'Too broad',
        actor: ACTOR,
      });
      expect(out).toContain('Rejected bbbb');
    });

    it('prints why a version could not be rejected and exits 1', async () => {
      uc.RejectHarnessVersionUseCase.execute.mockResolvedValue({
        rejected: false,
        reason: 'only a candidate can be rejected',
      });

      const out = await run('reject', 'aaaa');

      expect(uc.RejectHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        versionId: 'aaaa',
        actor: ACTOR,
      });
      expect(out).toContain('only a candidate can be rejected');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('rollback', () => {
    it('rolls back and names the version adopted again', async () => {
      uc.RollbackHarnessVersionUseCase.execute.mockResolvedValue({
        rolledBack: true,
        restoredVersionId: ADOPTED_ID,
      });

      const out = await run('rollback', '--repo', REPO, '--reason', 'More CI fixes');

      expect(uc.RollbackHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: REPO,
        reason: 'More CI fixes',
      });
      expect(out).toContain('aaaaaaaa');
    });

    it('says the repository is back on the base harness when there is no parent', async () => {
      uc.RollbackHarnessVersionUseCase.execute.mockResolvedValue({ rolledBack: true });

      const out = await run('rollback', '--repo', REPO);

      expect(uc.RollbackHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: REPO,
      });
      expect(out).toContain('base harness');
    });

    it('prints why nothing was rolled back and exits 1', async () => {
      uc.RollbackHarnessVersionUseCase.execute.mockResolvedValue({
        rolledBack: false,
        reason: 'nothing is adopted for this repository',
      });

      const out = await run('rollback', '--repo', REPO);

      expect(out).toContain('nothing is adopted for this repository');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('reflect', () => {
    it('reflects on a feature and points at the filed candidate', async () => {
      uc.ReflectOnFeatureUseCase.execute.mockResolvedValue({
        skipped: false,
        status: HarnessRefinementStatus.Proposed,
        candidateVersionId: CANDIDATE_ID,
        costUsd: 0.4321,
      });

      const out = await run('reflect', 'feat-12');

      expect(uc.ReflectOnFeatureUseCase.execute).toHaveBeenCalledWith({ featureId: 'feat-12' });
      expect(out).toContain('Proposed');
      expect(out).toContain('0.43');
      expect(out).toContain('shep learn show bbbbbbbb');
      expect(process.exitCode).toBeUndefined();
    });

    it('says when the candidate was adopted automatically', async () => {
      uc.ReflectOnFeatureUseCase.execute.mockResolvedValue({
        skipped: false,
        status: HarnessRefinementStatus.Proposed,
        candidateVersionId: CANDIDATE_ID,
        autoAdopted: true,
        costUsd: 0.1,
      });

      const out = await run('reflect', 'feat-12');

      expect(out).toContain('adopted automatically');
    });

    it('prints why nothing was learned and exits 1', async () => {
      uc.ReflectOnFeatureUseCase.execute.mockResolvedValue({
        skipped: true,
        reason: 'feature feat-12 not found',
        costUsd: 0,
      });

      const out = await run('reflect', 'feat-12');

      expect(out).toContain('feature feat-12 not found');
      expect(process.exitCode).toBe(1);
    });

    it('exits 1 when the reflection failed', async () => {
      uc.ReflectOnFeatureUseCase.execute.mockResolvedValue({
        skipped: false,
        status: HarnessRefinementStatus.Failed,
        reason: 'the composer returned no tree',
        costUsd: 0.2,
      });

      const out = await run('reflect', 'feat-12');

      expect(out).toContain('Failed');
      expect(out).toContain('the composer returned no tree');
      expect(process.exitCode).toBe(1);
    });
  });
});
