/**
 * Feature Feedback Command Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureMode, SdlcLifecycle } from '@/domain/generated/output.js';

const { mockResolve, mockRejectExecute, mockFindById, mockFindByIdPrefix, mockRunFindById } =
  vi.hoisted(() => ({
    mockResolve: vi.fn(),
    mockRejectExecute: vi.fn(),
    mockFindById: vi.fn(),
    mockFindByIdPrefix: vi.fn(),
    mockRunFindById: vi.fn(),
  }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    brand: (s: string) => s,
  },
  messages: {
    newline: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

import { createFeedbackCommand } from '../../../../../../src/presentation/cli/commands/feat/feedback.command.js';

function makeExplorationFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feat-explore-001',
    name: 'Explore idea',
    mode: FeatureMode.Exploration,
    lifecycle: SdlcLifecycle.Exploring,
    agentRunId: 'run-001',
    ...overrides,
  };
}

describe('createFeedbackCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined as any;
    mockResolve.mockImplementation((token: unknown) => {
      const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
      if (key === 'IFeatureRepository')
        return { findById: mockFindById, findByIdPrefix: mockFindByIdPrefix };
      if (key === 'IAgentRunRepository') return { findById: mockRunFindById };
      if (key === 'RejectAgentRunUseCase') return { execute: mockRejectExecute };
      return {};
    });
  });

  it('should create a command named "feedback"', () => {
    const cmd = createFeedbackCommand();
    expect(cmd.name()).toBe('feedback');
  });

  it('should call RejectAgentRunUseCase with correct feedback text', async () => {
    const feature = makeExplorationFeature();
    mockFindById.mockResolvedValue(feature);
    mockRunFindById.mockResolvedValue({ id: 'run-001', status: 'waiting_approval' });
    mockRejectExecute.mockResolvedValue({
      rejected: true,
      reason: 'Rejected and iterating',
      iteration: 2,
    });

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['feat-explore-001', 'Make the button bigger'], { from: 'user' });

    expect(mockRejectExecute).toHaveBeenCalledWith('run-001', 'Make the button bigger');
  });

  it('should display iteration count after feedback submission', async () => {
    const feature = makeExplorationFeature();
    mockFindById.mockResolvedValue(feature);
    mockRunFindById.mockResolvedValue({ id: 'run-001', status: 'waiting_approval' });
    mockRejectExecute.mockResolvedValue({
      rejected: true,
      reason: 'Rejected and iterating',
      iteration: 3,
    });
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['feat-explore-001', 'Change the color'], { from: 'user' });

    expect(mockMessages.success).toHaveBeenCalledWith(expect.stringContaining('Explore idea'));
    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/3/);
  });

  it('should reject non-exploration features with error', async () => {
    const feature = makeExplorationFeature({
      mode: FeatureMode.Fast,
      lifecycle: SdlcLifecycle.Implementation,
    });
    mockFindById.mockResolvedValue(feature);
    const { messages: mockMessages } = await import(
      '../../../../../../src/presentation/cli/ui/index.js'
    );

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['feat-explore-001', 'Some feedback'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining('not in exploration'));
    expect(mockRejectExecute).not.toHaveBeenCalled();
  });

  it('should resolve feature by ID prefix when direct lookup fails', async () => {
    const feature = makeExplorationFeature();
    mockFindById.mockResolvedValue(null);
    mockFindByIdPrefix.mockResolvedValue(feature);
    mockRunFindById.mockResolvedValue({ id: 'run-001', status: 'waiting_approval' });
    mockRejectExecute.mockResolvedValue({
      rejected: true,
      reason: 'Rejected and iterating',
      iteration: 1,
    });

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['feat-exp', 'Some feedback'], { from: 'user' });

    expect(mockFindByIdPrefix).toHaveBeenCalledWith('feat-exp');
    expect(mockRejectExecute).toHaveBeenCalled();
  });

  it('should set exitCode 1 when feature not found', async () => {
    mockFindById.mockResolvedValue(null);
    mockFindByIdPrefix.mockResolvedValue(null);

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['nonexistent', 'feedback'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('should set exitCode 1 when reject use case fails', async () => {
    const feature = makeExplorationFeature();
    mockFindById.mockResolvedValue(feature);
    mockRunFindById.mockResolvedValue({ id: 'run-001', status: 'waiting_approval' });
    mockRejectExecute.mockResolvedValue({
      rejected: false,
      reason: 'Agent run is not in a rejectable state',
    });

    const cmd = createFeedbackCommand();
    await cmd.parseAsync(['feat-explore-001', 'feedback'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
