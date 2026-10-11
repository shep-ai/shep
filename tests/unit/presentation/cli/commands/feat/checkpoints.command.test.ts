/**
 * shep feat checkpoints / diff / restore (spec 135).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockList, mockDiff, mockRestore, mockConfirm } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockList: vi.fn(),
  mockDiff: vi.fn(),
  mockRestore: vi.fn(),
  mockConfirm: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));
vi.mock('@inquirer/prompts', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

import { createCheckpointsCommand } from '../../../../../../src/presentation/cli/commands/feat/checkpoints.command.js';
import { createDiffCommand } from '../../../../../../src/presentation/cli/commands/feat/diff.command.js';
import { createRestoreCommand } from '../../../../../../src/presentation/cli/commands/feat/restore.command.js';
import { GitCheckpointKind, type GitCheckpoint } from '@/domain/generated/output.js';
import {
  GitCheckpointNotFoundError,
  CheckpointRestoreRefusedError,
} from '@/domain/errors/git-checkpoint-errors.js';

function checkpoint(
  sequence: number,
  node: string,
  extra: Partial<GitCheckpoint> = {}
): GitCheckpoint {
  return {
    id: `cp-${sequence}`,
    featureId: 'feat-0001',
    sequence,
    kind: sequence === 0 ? GitCheckpointKind.Baseline : GitCheckpointKind.Step,
    node,
    ref: `refs/shep/checkpoints/feat-0001/000${sequence}-${node}`,
    commitSha: `abcdef${sequence}0123456789`,
    treeSha: `t${sequence}`,
    filesChanged: sequence * 2,
    additions: sequence * 10,
    deletions: sequence,
    createdAt: new Date('2026-10-11T10:00:00Z'),
    updatedAt: new Date('2026-10-11T10:00:00Z'),
    ...extra,
  };
}

let output: string;

beforeEach(() => {
  vi.clearAllMocks();
  output = '';
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output += `${args.join(' ')}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    output += `${args.join(' ')}\n`;
  });
  process.exitCode = undefined as never;
  mockResolve.mockImplementation((token: unknown) => {
    const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
    if (key === 'ListFeatureCheckpointsUseCase') return { execute: mockList };
    if (key === 'GetFeatureCheckpointDiffUseCase') return { execute: mockDiff };
    if (key === 'RestoreFeatureCheckpointUseCase') return { execute: mockRestore };
    throw new Error(`unexpected token ${String(key)}`);
  });
});

describe('shep feat checkpoints', () => {
  it('lists every checkpoint with its label, change summary and short commit', async () => {
    mockList.mockResolvedValue({
      featureId: 'feat-0001',
      featureName: 'Login page',
      checkpoints: [checkpoint(0, 'baseline'), checkpoint(1, 'implement')],
    });

    await createCheckpointsCommand().parseAsync(['feat-0'], { from: 'user' });

    expect(mockList).toHaveBeenCalledWith('feat-0');
    expect(output).toContain('Login page');
    expect(output).toContain('0000-baseline');
    expect(output).toContain('0001-implement');
    expect(output).toContain('+10');
    expect(output).toContain('abcdef1');
  });

  it('says so when there are none', async () => {
    mockList.mockResolvedValue({ featureId: 'feat-0001', featureName: 'X', checkpoints: [] });
    await createCheckpointsCommand().parseAsync(['feat-0'], { from: 'user' });
    expect(output).toMatch(/no checkpoints/i);
  });

  it('prints errors and sets exit code 1', async () => {
    mockList.mockRejectedValue(new Error('Feature not found: "zzz"'));
    await createCheckpointsCommand().parseAsync(['zzz'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(output).toContain('Feature not found');
  });
});

describe('shep feat diff', () => {
  const diff = {
    from: checkpoint(0, 'baseline'),
    to: checkpoint(1, 'implement'),
    files: [
      {
        path: 'src/login.ts',
        status: 'modified',
        additions: 1,
        deletions: 1,
        hunks: [
          {
            header: '@@ -1,2 +1,2 @@',
            lines: [
              { type: 'removed', content: 'old line', oldNumber: 1 },
              { type: 'added', content: 'new line', newNumber: 1 },
              { type: 'context', content: 'same', oldNumber: 2, newNumber: 2 },
            ],
          },
        ],
      },
    ],
    filesChanged: 1,
    additions: 1,
    deletions: 1,
  };

  it('shows one step against the step before it', async () => {
    mockDiff.mockResolvedValue(diff);
    await createDiffCommand().parseAsync(['feat-0', '--to', 'implement'], { from: 'user' });

    expect(mockDiff).toHaveBeenCalledWith({ featureId: 'feat-0', to: 'implement' });
    expect(output).toContain('0000-baseline');
    expect(output).toContain('0001-implement');
    expect(output).toContain('src/login.ts');
    expect(output).toContain('-old line');
    expect(output).toContain('+new line');
  });

  it('compares any two steps and prints only the summary with --stat', async () => {
    mockDiff.mockResolvedValue(diff);
    await createDiffCommand().parseAsync(['feat-0', '--from', '0', '--to', '1', '--stat'], {
      from: 'user',
    });

    expect(mockDiff).toHaveBeenCalledWith({ featureId: 'feat-0', from: '0', to: '1' });
    expect(output).toContain('src/login.ts');
    expect(output).not.toContain('+new line');
  });

  it('reports an unknown step without a stack', async () => {
    mockDiff.mockRejectedValue(new GitCheckpointNotFoundError('merge'));
    await createDiffCommand().parseAsync(['feat-0', '--to', 'merge'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(output).toContain('No checkpoint matches "merge"');
  });
});

describe('shep feat restore', () => {
  it('restores after confirmation and prints how to undo', async () => {
    mockConfirm.mockResolvedValue(true);
    mockRestore.mockResolvedValue({
      restored: checkpoint(1, 'implement'),
      safety: checkpoint(4, 'pre-restore', { kind: GitCheckpointKind.PreRestore }),
    });

    await createRestoreCommand().parseAsync(['feat-0', 'implement'], { from: 'user' });

    expect(mockRestore).toHaveBeenCalledWith({ featureId: 'feat-0', step: 'implement' });
    expect(output).toContain('0001-implement');
    expect(output).toContain('shep feat restore feat-0001 0004-pre-restore');
  });

  it('does nothing when not confirmed', async () => {
    mockConfirm.mockResolvedValue(false);
    await createRestoreCommand().parseAsync(['feat-0', '1'], { from: 'user' });
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('skips the prompt with --force', async () => {
    mockRestore.mockResolvedValue({ restored: checkpoint(1, 'implement'), safety: null });
    await createRestoreCommand().parseAsync(['feat-0', '1', '--force'], { from: 'user' });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRestore).toHaveBeenCalled();
  });

  it('prints why a restore was refused', async () => {
    mockRestore.mockRejectedValue(
      new CheckpointRestoreRefusedError('an agent is running on this feature.')
    );
    await createRestoreCommand().parseAsync(['feat-0', '1', '--force'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(output).toContain('an agent is running');
  });
});
