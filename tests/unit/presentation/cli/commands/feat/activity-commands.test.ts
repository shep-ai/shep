/**
 * shep feat status / shep feat wait (spec 149): explain a feature's agent
 * activity, and wait until it needs someone or stops.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ActivityWaitOutcome,
  AgentActivityState,
  AgentRunStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type { AgentActivity } from '@/application/use-cases/agent-activity/agent-activity.types.js';

const { mockResolve, mockGet, mockWait } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockGet: vi.fn(),
  mockWait: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

import { createStatusCommand } from '../../../../../../src/presentation/cli/commands/feat/status.command.js';
import {
  WAIT_EXIT_CODE,
  createWaitCommand,
} from '../../../../../../src/presentation/cli/commands/feat/wait.command.js';

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    featureId: 'abcdef12-3456',
    shortId: 'abcdef12',
    name: 'Login page',
    repositoryPath: '/work/acme',
    branch: 'feat/login',
    state: AgentActivityState.Blocked,
    reason: FeatureStateReason.ApprovalGate,
    featureState: FeatureState.ActionRequired,
    lifecycle: SdlcLifecycle.Planning,
    phase: 'plan',
    runId: 'run-1',
    runStatus: AgentRunStatus.waitingApproval,
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
    version: 1_700_000_000_000,
    updatedAt: new Date('2026-10-26T10:00:00Z'),
    ...overrides,
  };
}

let output: string[];

beforeEach(() => {
  vi.clearAllMocks();
  output = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
  process.exitCode = undefined;
  mockResolve.mockImplementation((token: unknown) => {
    const name = typeof token === 'string' ? token : (token as { name?: string }).name;
    if (name === 'GetAgentActivityUseCase') return { execute: mockGet };
    if (name === 'WaitForAgentActivityUseCase') return { execute: mockWait };
    throw new Error(`Unexpected token ${String(name)}`);
  });
});

afterEach(() => {
  process.exitCode = undefined;
});

const text = () => output.join('\n');

describe('shep feat status', () => {
  it('explains the activity in words and says what to do next', async () => {
    mockGet.mockResolvedValue({ activities: [activity()], notFound: false });

    await createStatusCommand().parseAsync(['abcdef'], { from: 'user' });

    expect(mockGet).toHaveBeenCalledWith({ featureId: 'abcdef' });
    expect(text()).toContain('Login page');
    expect(text()).toContain('blocked');
    expect(text()).toMatch(/approval/i);
    expect(text()).toContain('shep feat approve abcdef12');
    expect(process.exitCode).toBeUndefined();
  });

  it('shows the open question and how to answer it', async () => {
    mockGet.mockResolvedValue({
      activities: [
        activity({
          reason: FeatureStateReason.AgentQuestion,
          pendingQuestion: { id: 'q-1', appId: 'app-1', prompt: 'Which database?' },
          pendingQuestions: 1,
        }),
      ],
      notFound: false,
    });

    await createStatusCommand().parseAsync(['abcdef'], { from: 'user' });

    expect(text()).toContain('Which database?');
    expect(text()).toContain('shep agent questions answer q-1 --app app-1');
  });

  it('prints JSON with --json', async () => {
    mockGet.mockResolvedValue({ activities: [activity()], notFound: false });

    await createStatusCommand().parseAsync(['abcdef', '--json'], { from: 'user' });

    const parsed = JSON.parse(output.join('\n')) as AgentActivity;
    expect(parsed.featureId).toBe('abcdef12-3456');
    expect(parsed.state).toBe('blocked');
  });

  it('fails on a missing or ambiguous feature', async () => {
    mockGet.mockResolvedValue({ activities: [], notFound: true });
    await createStatusCommand().parseAsync(['zzz'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(text()).toContain('zzz');

    process.exitCode = undefined;
    mockGet.mockResolvedValue({
      activities: [activity(), activity({ featureId: 'abcdef99' })],
      notFound: false,
    });
    await createStatusCommand().parseAsync(['abcdef'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
});

describe('shep feat wait', () => {
  it('waits with the default targets and no limit, exiting 0 on a match', async () => {
    mockWait.mockResolvedValue({ outcome: ActivityWaitOutcome.Matched, activity: activity() });

    await createWaitCommand().parseAsync(['abcdef'], { from: 'user' });

    expect(mockWait).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: 'abcdef', signal: expect.any(AbortSignal) })
    );
    const input = mockWait.mock.calls[0][0] as { until?: unknown; timeoutMs?: unknown };
    expect(input.until).toBeUndefined();
    expect(input.timeoutMs).toBeUndefined();
    expect(text()).toContain('Login page');
    expect(process.exitCode).toBe(WAIT_EXIT_CODE[ActivityWaitOutcome.Matched]);
  });

  it('parses --until and --timeout', async () => {
    mockWait.mockResolvedValue({
      outcome: ActivityWaitOutcome.Matched,
      activity: activity({ state: AgentActivityState.Done }),
    });

    await createWaitCommand().parseAsync(['abcdef', '--until', 'done, failed', '--timeout', '90'], {
      from: 'user',
    });

    expect(mockWait).toHaveBeenCalledWith(
      expect.objectContaining({
        until: [AgentActivityState.Done, AgentActivityState.Failed],
        timeoutMs: 90_000,
      })
    );
  });

  it('refuses an unknown state or a bad timeout without waiting', async () => {
    await createWaitCommand().parseAsync(['abcdef', '--until', 'sleeping'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(text()).toContain('sleeping');

    process.exitCode = undefined;
    await createWaitCommand().parseAsync(['abcdef', '--timeout', 'soon'], { from: 'user' });
    expect(process.exitCode).toBe(1);

    expect(mockWait).not.toHaveBeenCalled();
  });

  it('exits with a distinct code per outcome', async () => {
    expect(new Set(Object.values(WAIT_EXIT_CODE)).size).toBe(Object.keys(WAIT_EXIT_CODE).length);
    expect(WAIT_EXIT_CODE[ActivityWaitOutcome.Matched]).toBe(0);

    mockWait.mockResolvedValue({ outcome: ActivityWaitOutcome.TimedOut, activity: activity() });
    await createWaitCommand().parseAsync(['abcdef', '--timeout', '1'], { from: 'user' });
    expect(process.exitCode).toBe(WAIT_EXIT_CODE[ActivityWaitOutcome.TimedOut]);
    expect(process.exitCode).not.toBe(0);
  });

  it('prints the result as JSON with --json', async () => {
    mockWait.mockResolvedValue({ outcome: ActivityWaitOutcome.NotFound });

    await createWaitCommand().parseAsync(['zzz', '--json'], { from: 'user' });

    expect(JSON.parse(output.join('\n'))).toEqual({ outcome: 'not-found' });
    expect(process.exitCode).toBe(WAIT_EXIT_CODE[ActivityWaitOutcome.NotFound]);
  });
});
