/**
 * Workflow CLI Command Unit Tests
 *
 * Tests for all workflow subcommands: create, list, show, run, schedule,
 * enable, disable, history, update, delete.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// --- Hoisted mock factories ---
const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
}));

// --- Module mocks ---
vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => `[muted:${s}]`,
    accent: (s: string) => `[accent:${s}]`,
    success: (s: string) => `[success:${s}]`,
    brand: (s: string) => `[brand:${s}]`,
    info: (s: string) => `[info:${s}]`,
    warning: (s: string) => `[warn:${s}]`,
    error: (s: string) => `[error:${s}]`,
  },
  symbols: {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    pointer: '❯',
    dotEmpty: '○',
    dot: '●',
  },
  messages: {
    newline: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  renderListView: vi.fn(),
  renderDetailView: vi.fn(),
}));

// Mock templates
vi.mock('@/application/use-cases/workflows/templates/issue-triage.template.js', () => ({
  getIssueTriageTemplate: vi.fn().mockReturnValue({
    name: 'issue-triage',
    description: 'Triage issues',
    prompt: 'Triage open issues',
    toolConstraints: ['git', 'github'],
  }),
}));

vi.mock('@/application/use-cases/workflows/templates/branch-rebase.template.js', () => ({
  getBranchRebaseTemplate: vi.fn().mockReturnValue({
    name: 'branch-rebase',
    description: 'Rebase branches',
    prompt: 'Rebase feature branches',
    toolConstraints: ['git'],
  }),
}));

// --- Imports (after mocks) ---
import { createWorkflowCommand } from '../../../../../../src/presentation/cli/commands/workflow/index.js';
import { createCreateCommand } from '../../../../../../src/presentation/cli/commands/workflow/create.command.js';
import { createListCommand } from '../../../../../../src/presentation/cli/commands/workflow/list.command.js';
import { createShowCommand } from '../../../../../../src/presentation/cli/commands/workflow/show.command.js';
import { createRunCommand } from '../../../../../../src/presentation/cli/commands/workflow/run.command.js';
import { createScheduleCommand } from '../../../../../../src/presentation/cli/commands/workflow/schedule.command.js';
import { createEnableCommand } from '../../../../../../src/presentation/cli/commands/workflow/enable.command.js';
import { createDisableCommand } from '../../../../../../src/presentation/cli/commands/workflow/disable.command.js';
import { createHistoryCommand } from '../../../../../../src/presentation/cli/commands/workflow/history.command.js';
import { createUpdateCommand } from '../../../../../../src/presentation/cli/commands/workflow/update.command.js';
import { createDeleteCommand } from '../../../../../../src/presentation/cli/commands/workflow/delete.command.js';

// --- Test data factories ---
function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-001-uuid',
    name: 'test-workflow',
    description: 'A test workflow',
    prompt: 'Do something',
    enabled: true,
    repositoryPath: '/repos/myproject',
    createdAt: new Date('2026-03-20T10:00:00Z'),
    updatedAt: new Date('2026-03-20T10:00:00Z'),
    ...overrides,
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-001-uuid',
    workflowId: 'wf-001-uuid',
    triggerType: 'manual',
    status: 'completed',
    startedAt: new Date('2026-03-20T10:00:00Z'),
    completedAt: new Date('2026-03-20T10:01:00Z'),
    durationMs: 60000,
    createdAt: new Date('2026-03-20T10:00:00Z'),
    updatedAt: new Date('2026-03-20T10:01:00Z'),
    ...overrides,
  };
}

// --- Mock use case instances ---
const mockCreateExecute = vi.fn();
const mockListExecute = vi.fn();
const mockGetExecute = vi.fn();
const mockRunExecute = vi.fn();
const mockScheduleExecute = vi.fn();
const mockToggleExecute = vi.fn();
const mockHistoryExecute = vi.fn();
const mockUpdateExecute = vi.fn();
const mockDeleteExecute = vi.fn();

function setupMockResolve() {
  mockResolve.mockImplementation((token: unknown) => {
    const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
    switch (key) {
      case 'CreateWorkflowUseCase':
        return { execute: mockCreateExecute };
      case 'ListWorkflowsUseCase':
        return { execute: mockListExecute };
      case 'GetWorkflowUseCase':
        return { execute: mockGetExecute };
      case 'RunWorkflowUseCase':
        return { execute: mockRunExecute };
      case 'ScheduleWorkflowUseCase':
        return { execute: mockScheduleExecute };
      case 'ToggleWorkflowUseCase':
        return { execute: mockToggleExecute };
      case 'GetWorkflowHistoryUseCase':
        return { execute: mockHistoryExecute };
      case 'UpdateWorkflowUseCase':
        return { execute: mockUpdateExecute };
      case 'DeleteWorkflowUseCase':
        return { execute: mockDeleteExecute };
      default:
        return {};
    }
  });
}

describe('Workflow CLI Commands', () => {
  let messagesMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let renderListViewMock: ReturnType<typeof vi.fn>;
  let renderDetailViewMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined as unknown as number;
    setupMockResolve();

    const ui = await import('../../../../../../src/presentation/cli/ui/index.js');
    messagesMock = ui.messages as unknown as typeof messagesMock;
    renderListViewMock = ui.renderListView as ReturnType<typeof vi.fn>;
    renderDetailViewMock = ui.renderDetailView as ReturnType<typeof vi.fn>;
  });

  // ===== Command Group =====
  describe('createWorkflowCommand()', () => {
    it('returns a Commander Command instance named "workflow"', () => {
      const cmd = createWorkflowCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('workflow');
    });

    it('has all expected subcommands', () => {
      const cmd = createWorkflowCommand();
      const subcommandNames = cmd.commands.map((c) => c.name());
      expect(subcommandNames).toContain('create');
      expect(subcommandNames).toContain('list');
      expect(subcommandNames).toContain('show');
      expect(subcommandNames).toContain('run');
      expect(subcommandNames).toContain('schedule');
      expect(subcommandNames).toContain('enable');
      expect(subcommandNames).toContain('disable');
      expect(subcommandNames).toContain('history');
      expect(subcommandNames).toContain('update');
      expect(subcommandNames).toContain('delete');
    });
  });

  // ===== Create Command =====
  describe('create subcommand', () => {
    it('calls CreateWorkflowUseCase with correct args', async () => {
      const workflow = makeWorkflow();
      mockCreateExecute.mockResolvedValue(workflow);

      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-workflow', '--prompt', 'Do something'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-workflow',
          prompt: 'Do something',
        })
      );
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('creates workflow from template', async () => {
      const workflow = makeWorkflow({ name: 'issue-triage' });
      mockCreateExecute.mockResolvedValue(workflow);

      const cmd = createCreateCommand();
      await cmd.parseAsync(['issue-triage', '--template', 'issue-triage'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'issue-triage',
          prompt: 'Triage open issues',
        })
      );
    });

    it('rejects unknown template', async () => {
      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-wf', '--template', 'unknown'], { from: 'user' });

      expect(mockCreateExecute).not.toHaveBeenCalled();
      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('requires prompt or template', async () => {
      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-workflow'], { from: 'user' });

      expect(mockCreateExecute).not.toHaveBeenCalled();
      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('passes tool constraints correctly', async () => {
      const workflow = makeWorkflow();
      mockCreateExecute.mockResolvedValue(workflow);

      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-wf', '--prompt', 'test', '-t', 'git', '-t', 'github'], {
        from: 'user',
      });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolConstraints: ['git', 'github'],
        })
      );
    });

    it('passes disabled flag correctly', async () => {
      const workflow = makeWorkflow({ enabled: false });
      mockCreateExecute.mockResolvedValue(workflow);

      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-wf', '--prompt', 'test', '--disabled'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });

    it('sets exitCode on error', async () => {
      mockCreateExecute.mockRejectedValue(new Error('Name already exists'));

      const cmd = createCreateCommand();
      await cmd.parseAsync(['my-wf', '--prompt', 'test'], { from: 'user' });

      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ===== List Command =====
  describe('list subcommand', () => {
    it('calls ListWorkflowsUseCase and renders table', async () => {
      const workflows = [makeWorkflow(), makeWorkflow({ name: 'other', id: 'wf-002' })];
      mockListExecute.mockResolvedValue(workflows);

      const cmd = createListCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockListExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: expect.any(String),
        })
      );
      expect(renderListViewMock).toHaveBeenCalledOnce();
      const config = renderListViewMock.mock.calls[0][0];
      expect(config.rows).toHaveLength(2);
    });

    it('shows empty message when no workflows', async () => {
      mockListExecute.mockResolvedValue([]);

      const cmd = createListCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(renderListViewMock).toHaveBeenCalledOnce();
      const config = renderListViewMock.mock.calls[0][0];
      expect(config.rows).toHaveLength(0);
      expect(config.emptyMessage).toBeDefined();
    });

    it('has "ls" alias', () => {
      const cmd = createListCommand();
      expect(cmd.aliases()).toContain('ls');
    });
  });

  // ===== Show Command =====
  describe('show subcommand', () => {
    it('calls GetWorkflowUseCase and renders detail view', async () => {
      const workflow = makeWorkflow();
      mockGetExecute.mockResolvedValue(workflow);

      const cmd = createShowCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockGetExecute).toHaveBeenCalledWith('test-workflow', expect.any(String));
      expect(renderDetailViewMock).toHaveBeenCalledOnce();
      const config = renderDetailViewMock.mock.calls[0][0];
      expect(config.title).toContain('test-workflow');
    });

    it('shows error when workflow not found', async () => {
      mockGetExecute.mockRejectedValue(new Error('Workflow not found'));

      const cmd = createShowCommand();
      await cmd.parseAsync(['nonexistent'], { from: 'user' });

      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ===== Run Command =====
  describe('run subcommand', () => {
    it('calls RunWorkflowUseCase and shows status', async () => {
      const execution = makeExecution({ status: 'queued' });
      mockRunExecute.mockResolvedValue(execution);

      const cmd = createRunCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockRunExecute).toHaveBeenCalledWith('test-workflow', expect.any(String));
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('sets exitCode on error', async () => {
      mockRunExecute.mockRejectedValue(new Error('Workflow not found'));

      const cmd = createRunCommand();
      await cmd.parseAsync(['nonexistent'], { from: 'user' });

      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ===== Schedule Command =====
  describe('schedule subcommand', () => {
    it('calls ScheduleWorkflowUseCase with cron expression', async () => {
      const workflow = makeWorkflow({
        cronExpression: '0 9 * * MON',
        nextRunAt: new Date('2026-03-24T09:00:00Z'),
      });
      mockScheduleExecute.mockResolvedValue(workflow);

      const cmd = createScheduleCommand();
      await cmd.parseAsync(['test-workflow', '--cron', '0 9 * * MON'], { from: 'user' });

      expect(mockScheduleExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          nameOrId: 'test-workflow',
          cronExpression: '0 9 * * MON',
        })
      );
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('passes timezone when specified', async () => {
      const workflow = makeWorkflow({
        cronExpression: '0 9 * * MON',
        timezone: 'America/New_York',
      });
      mockScheduleExecute.mockResolvedValue(workflow);

      const cmd = createScheduleCommand();
      await cmd.parseAsync(
        ['test-workflow', '--cron', '0 9 * * MON', '--timezone', 'America/New_York'],
        { from: 'user' }
      );

      expect(mockScheduleExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'America/New_York',
        })
      );
    });

    it('removes schedule with --remove', async () => {
      const workflow = makeWorkflow({ cronExpression: undefined });
      mockScheduleExecute.mockResolvedValue(workflow);

      const cmd = createScheduleCommand();
      await cmd.parseAsync(['test-workflow', '--remove'], { from: 'user' });

      expect(mockScheduleExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          cronExpression: null,
        })
      );
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('requires --cron or --remove', async () => {
      const cmd = createScheduleCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockScheduleExecute).not.toHaveBeenCalled();
      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ===== Enable Command =====
  describe('enable subcommand', () => {
    it('calls ToggleWorkflowUseCase with enabled=true', async () => {
      const workflow = makeWorkflow({ enabled: true });
      mockToggleExecute.mockResolvedValue(workflow);

      const cmd = createEnableCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockToggleExecute).toHaveBeenCalledWith('test-workflow', true, expect.any(String));
      expect(messagesMock.success).toHaveBeenCalled();
    });
  });

  // ===== Disable Command =====
  describe('disable subcommand', () => {
    it('calls ToggleWorkflowUseCase with enabled=false', async () => {
      const workflow = makeWorkflow({ enabled: false });
      mockToggleExecute.mockResolvedValue(workflow);

      const cmd = createDisableCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockToggleExecute).toHaveBeenCalledWith('test-workflow', false, expect.any(String));
      expect(messagesMock.success).toHaveBeenCalled();
    });
  });

  // ===== History Command =====
  describe('history subcommand', () => {
    it('calls GetWorkflowHistoryUseCase and renders table', async () => {
      const executions = [makeExecution(), makeExecution({ id: 'exec-002', status: 'failed' })];
      mockHistoryExecute.mockResolvedValue(executions);

      const cmd = createHistoryCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockHistoryExecute).toHaveBeenCalledWith(
        'test-workflow',
        expect.any(String),
        undefined
      );
      expect(renderListViewMock).toHaveBeenCalledOnce();
      const config = renderListViewMock.mock.calls[0][0];
      expect(config.rows).toHaveLength(2);
    });

    it('passes limit option', async () => {
      mockHistoryExecute.mockResolvedValue([]);

      const cmd = createHistoryCommand();
      await cmd.parseAsync(['test-workflow', '--limit', '50'], { from: 'user' });

      expect(mockHistoryExecute).toHaveBeenCalledWith('test-workflow', expect.any(String), 50);
    });
  });

  // ===== Update Command =====
  describe('update subcommand', () => {
    it('calls UpdateWorkflowUseCase with partial fields', async () => {
      const existing = makeWorkflow();
      mockGetExecute.mockResolvedValue(existing);
      const updated = makeWorkflow({ name: 'new-name' });
      mockUpdateExecute.mockResolvedValue(updated);

      const cmd = createUpdateCommand();
      await cmd.parseAsync(['test-workflow', '--name', 'new-name'], { from: 'user' });

      expect(mockGetExecute).toHaveBeenCalledWith('test-workflow', expect.any(String));
      expect(mockUpdateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wf-001-uuid',
          name: 'new-name',
        })
      );
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('requires at least one update flag', async () => {
      const cmd = createUpdateCommand();
      await cmd.parseAsync(['test-workflow'], { from: 'user' });

      expect(mockUpdateExecute).not.toHaveBeenCalled();
      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ===== Delete Command =====
  describe('delete subcommand', () => {
    it('calls DeleteWorkflowUseCase with --force', async () => {
      const workflow = makeWorkflow();
      mockDeleteExecute.mockResolvedValue(workflow);

      const cmd = createDeleteCommand();
      await cmd.parseAsync(['test-workflow', '--force'], { from: 'user' });

      expect(mockDeleteExecute).toHaveBeenCalledWith('test-workflow', expect.any(String));
      expect(messagesMock.success).toHaveBeenCalled();
    });

    it('sets exitCode on error', async () => {
      mockDeleteExecute.mockRejectedValue(new Error('Workflow not found'));

      const cmd = createDeleteCommand();
      await cmd.parseAsync(['test-workflow', '--force'], { from: 'user' });

      expect(messagesMock.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });
});
