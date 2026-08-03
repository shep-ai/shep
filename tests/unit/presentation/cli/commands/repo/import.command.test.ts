/**
 * Repo Import Command Unit Tests
 *
 * Tests for the `shep repo import <dir>` CLI command (spec 105).
 *
 * TDD Phase: RED -> GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDiscoverExecute, mockImportExecute, mockCheckbox } = vi.hoisted(() => ({
  mockDiscoverExecute: vi.fn(),
  mockImportExecute: vi.fn(),
  mockCheckbox: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: unknown) => {
      const tokenName = typeof token === 'function' ? token.name : String(token);

      switch (tokenName) {
        case 'DiscoverImportCandidatesUseCase':
          return { execute: mockDiscoverExecute };
        case 'ImportLocalRepositoriesUseCase':
          return { execute: mockImportExecute };
        default:
          return {};
      }
    }),
  },
}));

vi.mock('@inquirer/prompts', () => ({
  checkbox: mockCheckbox,
}));

import { createImportCommand } from '../../../../../../src/presentation/cli/commands/repo/import.command.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'proj',
    path: '/code/proj',
    isGitRepository: true,
    alreadyTracked: false,
    previouslyRemoved: false,
    ...overrides,
  };
}

describe('repo import command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    mockDiscoverExecute.mockResolvedValue({ directoryPath: '/code', candidates: [] });
    mockImportExecute.mockResolvedValue({ results: [], importedCount: 0, failedCount: 0 });
    mockCheckbox.mockResolvedValue([]);
  });

  it('is registered as the "import" subcommand with a <dir> argument', () => {
    const command = createImportCommand();

    expect(command.name()).toBe('import');
    expect(command.usage()).toContain('dir');
  });

  it('discovers candidates for the resolved directory', async () => {
    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code']);

    expect(mockDiscoverExecute).toHaveBeenCalledWith({ directoryPath: '/code' });
  });

  it('imports every selectable candidate when --all is passed', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [
        candidate({ name: 'a', path: '/code/a' }),
        candidate({ name: 'b', path: '/code/b' }),
      ],
    });
    mockImportExecute.mockResolvedValue({
      results: [
        { path: '/code/a', imported: true, repository: { name: 'a' } },
        { path: '/code/b', imported: true, repository: { name: 'b' } },
      ],
      importedCount: 2,
      failedCount: 0,
    });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code', '--all']);

    expect(mockCheckbox).not.toHaveBeenCalled();
    expect(mockImportExecute).toHaveBeenCalledWith({ paths: ['/code/a', '/code/b'] });
  });

  it('excludes already-tracked candidates from an --all import', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [
        candidate({ name: 'tracked', path: '/code/tracked', alreadyTracked: true }),
        candidate({ name: 'fresh', path: '/code/fresh' }),
      ],
    });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code', '--all']);

    expect(mockImportExecute).toHaveBeenCalledWith({ paths: ['/code/fresh'] });
  });

  it('excludes non-git candidates when --git-only is passed', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [
        candidate({ name: 'gitrepo', path: '/code/gitrepo', isGitRepository: true }),
        candidate({ name: 'plain', path: '/code/plain', isGitRepository: false }),
      ],
    });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code', '--all', '--git-only']);

    expect(mockImportExecute).toHaveBeenCalledWith({ paths: ['/code/gitrepo'] });
  });

  it('prompts for selection when --all is not passed', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate({ name: 'a', path: '/code/a' })],
    });
    mockCheckbox.mockResolvedValue(['/code/a']);
    mockImportExecute.mockResolvedValue({
      results: [{ path: '/code/a', imported: true, repository: { name: 'a' } }],
      importedCount: 1,
      failedCount: 0,
    });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code']);

    expect(mockCheckbox).toHaveBeenCalled();
    expect(mockImportExecute).toHaveBeenCalledWith({ paths: ['/code/a'] });
  });

  it('does not import when the selection is empty', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate()],
    });
    mockCheckbox.mockResolvedValue([]);

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code']);

    expect(mockImportExecute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('does not import when the directory has no subfolders', async () => {
    mockDiscoverExecute.mockResolvedValue({ directoryPath: '/code', candidates: [] });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code', '--all']);

    expect(mockImportExecute).not.toHaveBeenCalled();
  });

  it('sets a non-zero exit code when any path fails', async () => {
    mockDiscoverExecute.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate({ name: 'bad', path: '/code/bad' })],
    });
    mockImportExecute.mockResolvedValue({
      results: [{ path: '/code/bad', imported: false, error: 'permission denied' }],
      importedCount: 0,
      failedCount: 1,
    });

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/code', '--all']);

    expect(process.exitCode).toBe(1);
  });

  it('sets a non-zero exit code when discovery throws', async () => {
    mockDiscoverExecute.mockRejectedValue(new Error('ENOENT'));

    const command = createImportCommand();
    await command.parseAsync(['node', 'import', '/nope', '--all']);

    expect(process.exitCode).toBe(1);
  });
});
