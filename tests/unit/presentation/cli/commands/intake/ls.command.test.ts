import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockExecute, mockGetProjectExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
  mockGetProjectExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/intake/list-intake-items.use-case.js', () => ({
  ListIntakeItemsUseCase: class {
    execute = mockExecute;
  },
}));

vi.mock('@/application/use-cases/pm-projects/get-pm-project.use-case.js', () => ({
  GetPmProjectUseCase: class {
    execute = mockGetProjectExecute;
  },
}));

import { createLsCommand } from '../../../../../../src/presentation/cli/commands/intake/ls.command.js';

describe('intake ls command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockImplementation(() => ({
      execute: mockExecute,
    }));
    mockGetProjectExecute.mockResolvedValue({
      ok: true,
      project: { id: 'proj-1', name: 'Test', slug: 'test' },
    });
    process.exitCode = undefined;
  });

  it('should create a command named "ls"', () => {
    const cmd = createLsCommand();
    expect(cmd.name()).toBe('ls');
  });

  it('should list pending intake items', async () => {
    mockResolve.mockImplementation((token: unknown) => {
      if (typeof token === 'function' && token.name === 'GetPmProjectUseCase') {
        return { execute: mockGetProjectExecute };
      }
      return {
        execute: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'intake-1',
              title: 'Bug report',
              status: 'Pending',
              source: 'manual',
              projectId: 'proj-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      };
    });

    const cmd = createLsCommand();
    await cmd.parseAsync(['test'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Bug report');
  });

  it('should show empty message when no items', async () => {
    mockResolve.mockImplementation((token: unknown) => {
      if (typeof token === 'function' && token.name === 'GetPmProjectUseCase') {
        return { execute: mockGetProjectExecute };
      }
      return { execute: vi.fn().mockResolvedValue({ items: [] }) };
    });

    const cmd = createLsCommand();
    await cmd.parseAsync(['test'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No intake items');
  });

  it('should set exitCode on error', async () => {
    mockGetProjectExecute.mockResolvedValue({ ok: false, error: 'Not found' });
    mockResolve.mockImplementation(() => ({
      execute: mockGetProjectExecute,
    }));

    const cmd = createLsCommand();
    await cmd.parseAsync(['nonexistent'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
