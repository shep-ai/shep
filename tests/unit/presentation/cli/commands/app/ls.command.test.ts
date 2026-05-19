/**
 * App List Command Unit Tests
 *
 * Tests for the app ls command that lists applications
 * in a table view using renderListView.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application } from '@/domain/generated/output.js';
import { ApplicationStatus } from '@/domain/generated/output.js';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/applications/list-applications.use-case.js', () => ({
  ListApplicationsUseCase: class {
    execute = mockExecute;
  },
}));

import { createLsCommand } from '../../../../../../src/presentation/cli/commands/app/ls.command.js';

function makeApplication(overrides?: Partial<Application>): Application {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Todo App',
    slug: 'todo-app-f3a2c1',
    description: 'Build a todo list app',
    repositoryPath: '/home/user/.shep/projects/todo-app-f3a2c1',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    bedrockEnabled: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('app ls command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockReturnValue({ execute: mockExecute });
    process.exitCode = undefined;
  });

  it('should create a command named "ls" with correct description', () => {
    const cmd = createLsCommand();
    expect(cmd.name()).toBe('ls');
    expect(cmd.description()).toBe('List applications');
  });

  it('should resolve ListApplicationsUseCase from container', async () => {
    mockExecute.mockResolvedValue([]);
    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(mockResolve).toHaveBeenCalled();
  });

  it('should render table with application data', async () => {
    const app = makeApplication();
    mockExecute.mockResolvedValue([app]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('a1b2c3d4');
    expect(output).toContain('Todo App');
  });

  it('should show "No applications found" when list is empty', async () => {
    mockExecute.mockResolvedValue([]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No applications found');
  });

  it('should show 8-char ID prefix in table', async () => {
    const app = makeApplication({ id: 'deadbeef-1234-5678-abcd-ef1234567890' });
    mockExecute.mockResolvedValue([app]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('deadbeef');
  });

  it('should set process.exitCode = 1 on error', async () => {
    mockExecute.mockRejectedValue(new Error('DB connection failed'));

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
