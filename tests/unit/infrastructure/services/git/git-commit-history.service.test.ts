/**
 * GitCommitHistoryService: when the commit a branch points at was made.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { GitCommitHistoryService } from '@/infrastructure/services/git/git-commit-history.service.js';

const CWD = '/work/acme';
const EPOCH_SECONDS = 1_793_000_000;

function exec(answers: Record<string, string | Error>) {
  return vi.fn(async (_file: string, args: string[]) => {
    const ref = args.at(-2) ?? '';
    const answer = answers[ref];
    if (answer === undefined || answer instanceof Error) throw answer ?? new Error('unknown ref');
    return { stdout: answer, stderr: '' };
  });
}

describe('GitCommitHistoryService.getCommitDate', () => {
  it('reads the committer date of the commit a ref points at', async () => {
    const execFile = exec({ 'feat/login': `${EPOCH_SECONDS}\n` });
    const service = new GitCommitHistoryService(execFile);

    const date = await service.getCommitDate(CWD, 'feat/login');

    expect(date).toEqual(new Date(EPOCH_SECONDS * 1000));
    expect(execFile).toHaveBeenCalledWith(
      'git',
      ['log', '-1', '--format=%ct', 'feat/login', '--'],
      { cwd: CWD }
    );
  });

  it('falls back to the remote-tracking branch when the local one is gone', async () => {
    const service = new GitCommitHistoryService(
      exec({ 'feat/login': new Error('unknown revision'), 'origin/feat/login': `${EPOCH_SECONDS}` })
    );

    expect(await service.getCommitDate(CWD, 'feat/login')).toEqual(new Date(EPOCH_SECONDS * 1000));
  });

  it('returns null when neither ref resolves or git prints no date', async () => {
    expect(await new GitCommitHistoryService(exec({})).getCommitDate(CWD, 'feat/x')).toBeNull();
    expect(
      await new GitCommitHistoryService(exec({ 'feat/x': '\n' })).getCommitDate(CWD, 'feat/x')
    ).toBeNull();
  });

  it('refuses a ref that git would read as an option', async () => {
    const execFile = exec({});
    await expect(
      new GitCommitHistoryService(execFile).getCommitDate(CWD, '--output=/tmp/x')
    ).rejects.toThrow();
    expect(execFile).not.toHaveBeenCalled();
  });
});
