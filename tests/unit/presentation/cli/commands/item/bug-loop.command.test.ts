/**
 * `shep item investigate / hypotheses / fix` (spec 123): thin commands over
 * the bug loop use cases.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentType,
  HypothesisConfidence,
  InvestigationStatus,
  Priority,
  type WorkItem,
  type WorkItemInvestigation,
} from '@/domain/generated/output.js';

const { investigate, approve, list } = vi.hoisted(() => ({
  investigate: { start: vi.fn(), run: vi.fn() },
  approve: { execute: vi.fn() },
  list: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      if (name === 'InvestigateWorkItemUseCase') return investigate;
      if (name === 'ApproveHypothesisUseCase') return approve;
      if (name === 'GetWorkItemInvestigationsUseCase') return list;
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createItemCommand } from '../../../../../../src/presentation/cli/commands/item/index.js';

const T = new Date('2026-10-04T10:00:00Z');
const WORK_ITEM = {
  id: 'item-1',
  identifierPrefix: 'PAY',
  sequenceId: 42,
  title: 'Refunds fail for guests',
  priority: Priority.High,
} as WorkItem;

const PENDING: WorkItemInvestigation = {
  id: 'inv-1',
  workItemId: 'item-1',
  repositoryPath: '/src/pay',
  status: InvestigationStatus.Pending,
  hypotheses: [],
  agentType: AgentType.ClaudeCode,
  createdAt: T,
  updatedAt: T,
};

const COMPLETED: WorkItemInvestigation = {
  ...PENDING,
  status: InvestigationStatus.Completed,
  commitSha: 'c0ffee1234',
  summary: 'Guest orders have no customer.',
  hypotheses: [
    {
      number: 1,
      title: 'Null customer',
      rootCause: 'refund() reads order.customer.id',
      confidence: HypothesisConfidence.High,
      evidence: [{ file: 'src/refund.ts', line: 18, note: 'reads customer.id' }],
      testPlan: 'Refund a guest order',
      fixPlan: 'Use the order email',
    },
  ],
};

async function run(...args: string[]): Promise<string> {
  await createItemCommand().parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep item investigate / hypotheses / fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('investigate starts, runs and prints the ranked hypotheses', async () => {
    investigate.start.mockResolvedValue({ ok: true, workItem: WORK_ITEM, investigation: PENDING });
    investigate.run.mockResolvedValue(COMPLETED);

    const out = await run('investigate', 'PAY-42', '--repo', '/src/pay', '--agent', 'claude-code');

    expect(investigate.start).toHaveBeenCalledWith({
      workItem: 'PAY-42',
      repositoryPath: expect.stringMatching(/src[\\/]pay$/),
      agentType: AgentType.ClaudeCode,
    });
    expect(investigate.run).toHaveBeenCalledWith('inv-1');
    expect(out).toContain('Null customer');
    expect(out).toContain('src/refund.ts:18');
    expect(out).toContain('Use the order email');
    expect(out).toContain('c0ffee1');
    expect(out).toContain('shep item fix PAY-42');
    expect(process.exitCode).toBeUndefined();
  });

  it('investigate prints a refusal and exits 1 without running', async () => {
    investigate.start.mockResolvedValue({
      ok: false,
      error: 'Pick the repository to investigate PAY-42 in.',
    });
    const out = await run('investigate', 'PAY-42');
    expect(investigate.start).toHaveBeenCalledWith({ workItem: 'PAY-42' });
    expect(investigate.run).not.toHaveBeenCalled();
    expect(out).toContain('Pick the repository');
    expect(process.exitCode).toBe(1);
  });

  it('investigate exits 1 when the investigation fails', async () => {
    investigate.start.mockResolvedValue({ ok: true, workItem: WORK_ITEM, investigation: PENDING });
    investigate.run.mockResolvedValue({
      ...PENDING,
      status: InvestigationStatus.Failed,
      error: 'agent timed out',
    });
    const out = await run('investigate', 'PAY-42', '--repo', '/src/pay');
    expect(out).toContain('agent timed out');
    expect(out).not.toContain('shep item fix');
    expect(process.exitCode).toBe(1);
  });

  it('investigate rejects an unknown agent before calling anything', async () => {
    const command = createItemCommand();
    command.exitOverride();
    for (const sub of command.commands)
      sub.exitOverride().configureOutput({ writeErr: () => undefined });
    await expect(
      command.parseAsync(['investigate', 'PAY-42', '--agent', 'nope'], { from: 'user' })
    ).rejects.toThrow(/not a supported agent/);
    expect(investigate.start).not.toHaveBeenCalled();
  });

  it('hypotheses shows the latest investigation, or how to start one', async () => {
    list.execute.mockResolvedValue({ ok: true, workItem: WORK_ITEM, investigations: [COMPLETED] });
    expect(await run('hypotheses', 'PAY-42')).toContain('refund() reads order.customer.id');

    vi.mocked(console.log).mockClear();
    list.execute.mockResolvedValue({ ok: true, workItem: WORK_ITEM, investigations: [] });
    expect(await run('hypotheses', 'PAY-42')).toContain('shep item investigate PAY-42');
  });

  it('hypotheses says a running investigation is still running', async () => {
    list.execute.mockResolvedValue({
      ok: true,
      workItem: WORK_ITEM,
      investigations: [{ ...PENDING, status: InvestigationStatus.Running }],
    });
    expect(await run('hypotheses', 'PAY-42')).toMatch(/Still running/);
  });

  it('hypotheses names the feature fixing an approved hypothesis', async () => {
    list.execute.mockResolvedValue({
      ok: true,
      workItem: WORK_ITEM,
      investigations: [{ ...COMPLETED, approvedHypothesisNumber: 1, featureId: 'feat-1' }],
    });
    expect(await run('hypotheses', 'PAY-42')).toContain('feat-1');
  });

  it('fix approves the hypothesis and waits for the feature to start', async () => {
    approve.execute.mockResolvedValue({
      ok: true,
      workItem: WORK_ITEM,
      feature: { id: 'feat-1', name: 'Fix PAY-42: Null customer' },
      investigation: COMPLETED,
      started: Promise.resolve({}),
    });
    const out = await run('fix', 'PAY-42', '1', '--spec', '--agent', 'codex-cli');
    expect(approve.execute).toHaveBeenCalledWith({
      workItem: 'PAY-42',
      hypothesis: 1,
      fullSpec: true,
      agentType: AgentType.CodexCli,
    });
    expect(out).toContain('feat-1');
    expect(out).toContain('Fix PAY-42: Null customer');
    expect(process.exitCode).toBeUndefined();
  });

  it('fix reports a feature that was created but did not start', async () => {
    approve.execute.mockResolvedValue({
      ok: true,
      workItem: WORK_ITEM,
      feature: { id: 'feat-1', name: 'n' },
      investigation: COMPLETED,
      started: Promise.resolve({ error: 'worktree exists' }),
    });
    expect(await run('fix', 'PAY-42', '1')).toContain('worktree exists');
    expect(process.exitCode).toBe(1);
  });

  it('fix prints a refusal', async () => {
    approve.execute.mockResolvedValue({ ok: false, error: 'PAY-42 has no hypothesis 3.' });
    expect(await run('fix', 'PAY-42', '3')).toContain('no hypothesis 3');
    expect(process.exitCode).toBe(1);
  });
});
