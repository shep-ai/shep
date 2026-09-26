/**
 * App New Command Unit Tests
 *
 * Tests for the app new command that creates a new application.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApplicationStarter,
  ApplicationStatus,
  BuildMode,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type { Application, Feature } from '@/domain/generated/output.js';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/applications/start-application.use-case.js', () => ({
  StartApplicationUseCase: class {
    execute = mockExecute;
  },
}));

import { createNewCommand } from '../../../../../../src/presentation/cli/commands/app/new.command.js';

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

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'f1e2d3c4-0000-4000-8000-000000000001',
    name: 'Todo list',
    slug: 'todo-list',
    description: 'Build a todo list app',
    userQuery: 'Build a todo list app',
    repositoryPath: '/home/user/.shep/projects/todo-app-f3a2c1',
    branch: 'feat/todo-list',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Spec,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('app new command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockReturnValue({ execute: mockExecute });
    process.exitCode = undefined;
  });

  it('should create a command named "new" with correct description', () => {
    const cmd = createNewCommand();
    expect(cmd.name()).toBe('new');
    expect(cmd.description()).toMatch(/any stack/i);
  });

  it('starts a blank app with a spec-driven first feature by default', async () => {
    const app = makeApplication({ setupComplete: true });
    mockExecute.mockResolvedValue({
      application: app,
      repositoryPath: app.repositoryPath,
      feature: makeFeature(),
    });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith({
      description: 'Build a todo list app',
      starter: ApplicationStarter.Blank,
    });
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('f1e2d3c4-0000-4000-8000-000000000001');
    expect(output).toContain('shep feat new');
    expect(output).toContain(app.repositoryPath);
  });

  it('uses the Vite + shadcn template with --starter vite-shadcn', async () => {
    const app = makeApplication();
    mockExecute.mockResolvedValue({ application: app, repositoryPath: app.repositoryPath });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Landing page', '--starter', 'vite-shadcn'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ starter: ApplicationStarter.ViteShadcn })
    );
  });

  it('runs the first feature in fast mode with --fast', async () => {
    const app = makeApplication();
    mockExecute.mockResolvedValue({
      application: app,
      repositoryPath: app.repositoryPath,
      feature: makeFeature({ buildMode: BuildMode.Fast }),
    });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app', '--fast'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ starter: ApplicationStarter.Blank, buildMode: BuildMode.Fast })
    );
  });

  it('rejects an unknown starter without creating anything', async () => {
    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app', '--starter', 'rails'], { from: 'user' });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('should display application details after creation', async () => {
    const app = makeApplication();
    mockExecute.mockResolvedValue({
      application: app,
      repositoryPath: app.repositoryPath,
    });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(output).toContain('Todo App');
    expect(output).toContain('todo-app-f3a2c1');
  });

  it('should pass agent type when --agent is specified', async () => {
    const app = makeApplication({ agentType: 'claude-code' });
    mockExecute.mockResolvedValue({
      application: app,
      repositoryPath: app.repositoryPath,
    });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app', '--agent', 'claude-code'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ agentType: 'claude-code' }));
  });

  it('should pass model when --model is specified', async () => {
    const app = makeApplication({ modelOverride: 'claude-opus-4-6' });
    mockExecute.mockResolvedValue({
      application: app,
      repositoryPath: app.repositoryPath,
    });

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app', '--model', 'claude-opus-4-6'], {
      from: 'user',
    });

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-6' }));
  });

  it('should set process.exitCode = 1 on error', async () => {
    mockExecute.mockRejectedValue(new Error('Slug allocation failed'));

    const cmd = createNewCommand();
    await cmd.parseAsync(['Build a todo list app'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
