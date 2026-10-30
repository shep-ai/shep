/**
 * `shep learn status | history | show | diff` (spec 150): thin read commands
 * over the learned-harness use cases.
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessVersionTrend, LearnedHarnessStatus } from '@/domain/generated/output.js';
import {
  ADOPTED_ID,
  CANDIDATE_ID,
  EDIT,
  REPO,
  createFakeUseCases,
  entry,
  printed,
  resolveFake,
  version,
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

let uc: ReturnType<typeof createFakeUseCases>;

async function run(...args: string[]): Promise<string> {
  await createLearnCommand().parseAsync(args, { from: 'user' });
  return printed();
}

const CANDIDATE = version({ id: CANDIDATE_ID, status: LearnedHarnessStatus.Candidate });

describe('shep learn (read commands)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uc = createFakeUseCases();
    Object.assign(fakes, uc);
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('groups the eight subcommands under `learn`', () => {
    const names = createLearnCommand()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual([
      'adopt',
      'diff',
      'history',
      'reflect',
      'reject',
      'rollback',
      'show',
      'status',
    ]);
  });

  it('is gated by the selfLearning flag in the CLI entry point', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../../../../../src/presentation/cli/index.ts'),
      'utf-8'
    );
    expect(source).toContain(
      "program.addCommand(gateByFeatureFlag(createLearnCommand(), 'selfLearning'));"
    );
  });

  describe('status', () => {
    it('shows the adopted version of the repository and the waiting candidates', async () => {
      uc.GetCurrentHarnessUseCase.execute.mockResolvedValue(version());
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({
        repositoryPath: REPO,
        currentVersionId: ADOPTED_ID,
        versions: [entry(CANDIDATE), entry(version())],
        lessons: [],
      });

      const out = await run('status', '--repo', REPO);

      expect(uc.GetCurrentHarnessUseCase.execute).toHaveBeenCalledWith({ repositoryPath: REPO });
      expect(uc.ListHarnessHistoryUseCase.execute).toHaveBeenCalledWith({ repositoryPath: REPO });
      expect(out).toContain('aaaaaaaa');
      expect(out).toContain('Adopted');
      expect(out).toContain('Reflect');
      expect(out).toContain('Candidates waiting for review: 1');
      expect(process.exitCode).toBeUndefined();
    });

    it('defaults the repository to the working directory, as an absolute path', async () => {
      uc.GetCurrentHarnessUseCase.execute.mockResolvedValue(null);
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({
        repositoryPath: process.cwd(),
        versions: [],
        lessons: [],
      });

      const out = await run('status');

      expect(uc.GetCurrentHarnessUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: process.cwd(),
      });
      expect(out).toContain('base harness');
      expect(out).toContain('No candidates are waiting');
    });

    it('prints JSON with --json', async () => {
      uc.GetCurrentHarnessUseCase.execute.mockResolvedValue(version());
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({
        repositoryPath: REPO,
        versions: [entry(CANDIDATE)],
        lessons: [],
      });

      const out = await run('status', '--repo', REPO, '--json');

      const json = JSON.parse(out);
      expect(json.current.id).toBe(ADOPTED_ID);
      expect(json.candidates).toBe(1);
      expect(json.repositoryPath).toBe(REPO);
    });

    it('reports an unexpected failure with exit code 1', async () => {
      uc.GetCurrentHarnessUseCase.execute.mockRejectedValue(new Error('db locked'));
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({ versions: [], lessons: [] });

      const out = await run('status', '--repo', REPO);

      expect(out).toContain('db locked');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('history', () => {
    it('lists versions with status, origin, date, metrics and a regression flag', async () => {
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({
        repositoryPath: REPO,
        currentVersionId: ADOPTED_ID,
        versions: [entry(CANDIDATE), entry(version(), HarnessVersionTrend.Regressed)],
        lessons: [],
      });

      const out = await run('history', '--repo', REPO, '--limit', '5');

      expect(uc.ListHarnessHistoryUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: REPO,
        limit: 5,
      });
      expect(out).toContain('bbbbbbbb');
      expect(out).toContain('Candidate');
      expect(out).toContain('2026-10-01');
      expect(out).toContain('50%');
      expect(out).toContain('Regressed');
      expect(out).toContain('current');
      expect(out).toContain('Regressed versions: 1');
    });

    it('refuses a limit that is not a whole number above zero', async () => {
      const out = await run('history', '--limit', '0');

      expect(uc.ListHarnessHistoryUseCase.execute).not.toHaveBeenCalled();
      expect(out).toContain('--limit');
      expect(process.exitCode).toBe(1);
    });

    it('says so when there is no version yet', async () => {
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue({
        repositoryPath: REPO,
        versions: [],
        lessons: [],
      });

      const out = await run('history', '--repo', REPO);

      expect(out).toContain('No learned-harness versions yet');
    });

    it('prints the use-case result as JSON with --json', async () => {
      const history = { repositoryPath: REPO, versions: [entry(CANDIDATE)], lessons: [] };
      uc.ListHarnessHistoryUseCase.execute.mockResolvedValue(history);

      const out = await run('history', '--repo', REPO, '--json');

      expect(JSON.parse(out).versions[0].version.id).toBe(CANDIDATE_ID);
    });
  });

  describe('show', () => {
    it('shows components, edit verdicts and the diff of a version', async () => {
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue({
        version: { ...CANDIDATE, parentVersionId: ADOPTED_ID },
        base: version(),
        diff: { added: ['skills/run-migrations/SKILL.md'], modified: [], removed: [] },
        diffText: '+ skills/run-migrations/SKILL.md\nRun pnpm db:migrate first.',
        edits: [EDIT],
      });

      const out = await run('show', 'bbbb');

      expect(uc.GetHarnessVersionUseCase.execute).toHaveBeenCalledWith({ versionId: 'bbbb' });
      expect(out).toContain('skills/run-migrations/SKILL.md');
      expect(out).toContain('Skill');
      expect(out).toContain('Helped');
      expect(out).toContain('Added a migration skill');
      expect(out).toContain('CI-fix attempts dropped from 3 to 0');
      expect(out).toContain('Run pnpm db:migrate first.');
      expect(out).toContain('aaaaaaaa');
    });

    it('refuses an unknown version with exit code 1', async () => {
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue(null);

      const out = await run('show', 'zzzz');

      expect(out).toContain('zzzz');
      expect(process.exitCode).toBe(1);
    });

    it('prints JSON with --json', async () => {
      const detail = {
        version: CANDIDATE,
        diff: { added: [], modified: [], removed: [] },
        diffText: '',
        edits: [],
      };
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue(detail);

      const out = await run('show', 'bbbb', '--json');

      expect(JSON.parse(out).version.id).toBe(CANDIDATE_ID);
    });
  });

  describe('diff', () => {
    it('diffs the second version against the first', async () => {
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue({
        version: CANDIDATE,
        base: version(),
        diff: { added: [], modified: ['instructions.md'], removed: [] },
        diffText: '~ instructions.md\nUse the run-migrations skill.',
        edits: [],
      });

      const out = await run('diff', 'aaaa', 'bbbb');

      expect(uc.GetHarnessVersionUseCase.execute).toHaveBeenCalledWith({
        versionId: 'bbbb',
        againstVersionId: 'aaaa',
      });
      expect(out).toContain('~ instructions.md');
    });

    it('says when two versions are the same', async () => {
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue({
        version: CANDIDATE,
        base: version(),
        diff: { added: [], modified: [], removed: [] },
        diffText: '',
        edits: [],
      });

      const out = await run('diff', 'aaaa', 'bbbb');

      expect(out).toContain('No changes');
    });

    it('refuses when either version is unknown', async () => {
      uc.GetHarnessVersionUseCase.execute.mockResolvedValue(null);

      await run('diff', 'aaaa', 'zzzz');

      expect(process.exitCode).toBe(1);
    });
  });
});
