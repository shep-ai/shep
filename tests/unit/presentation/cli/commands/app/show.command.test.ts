/**
 * App Show Command Unit Tests
 *
 * Tests for the app show command that displays details of an
 * application using renderDetailView.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application } from '@/domain/generated/output.js';
import { ApplicationStatus } from '@/domain/generated/output.js';

const { mockResolveApplication } = vi.hoisted(() => ({
  mockResolveApplication: vi.fn(),
}));

vi.mock('../../../../../../src/presentation/cli/commands/app/resolve-application.js', () => ({
  resolveApplication: mockResolveApplication,
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

import { createShowCommand } from '../../../../../../src/presentation/cli/commands/app/show.command.js';

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
    updatedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

describe('app show command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });

  it('should create a command named "show" with argument <id>', () => {
    const cmd = createShowCommand();
    expect(cmd.name()).toBe('show');
    expect(cmd.description()).toBe('Display details of an application');
  });

  it('should render application details when resolved successfully', async () => {
    const app = makeApplication();
    mockResolveApplication.mockResolvedValue({ application: app });

    const cmd = createShowCommand();
    await cmd.parseAsync(['a1b2c3d4'], { from: 'user' });

    expect(mockResolveApplication).toHaveBeenCalledWith('a1b2c3d4');
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(output).toContain('Todo App');
    expect(output).toContain('todo-app-f3a2c1');
  });

  it('should display timestamps section', async () => {
    const app = makeApplication();
    mockResolveApplication.mockResolvedValue({ application: app });

    const cmd = createShowCommand();
    await cmd.parseAsync(['a1b2c3d4'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Timestamps');
    expect(output).toContain('Created');
    expect(output).toContain('Updated');
  });

  it('should display configuration section', async () => {
    const app = makeApplication({ agentType: 'claude-code', modelOverride: 'claude-opus-4-6' });
    mockResolveApplication.mockResolvedValue({ application: app });

    const cmd = createShowCommand();
    await cmd.parseAsync(['a1b2c3d4'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Configuration');
    expect(output).toContain('claude-code');
    expect(output).toContain('claude-opus-4-6');
  });

  it('should show error and set exitCode when application not found', async () => {
    mockResolveApplication.mockResolvedValue({ error: 'Application not found: xyz123' });

    const cmd = createShowCommand();
    await cmd.parseAsync(['xyz123'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Application not found: xyz123');
  });

  it('should handle unexpected errors with try/catch', async () => {
    mockResolveApplication.mockRejectedValue(new Error('Unexpected DB failure'));

    const cmd = createShowCommand();
    await cmd.parseAsync(['a1b2c3d4'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Failed to show application');
  });

  it('should show deletedAt when present', async () => {
    const app = makeApplication({ deletedAt: new Date('2025-02-01') });
    mockResolveApplication.mockResolvedValue({ application: app });

    const cmd = createShowCommand();
    await cmd.parseAsync(['a1b2c3d4'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Deleted');
  });
});
