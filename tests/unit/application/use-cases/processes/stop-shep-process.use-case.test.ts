/**
 * StopShepProcessUseCase Unit Tests (spec 144)
 *
 * `shep ps stop <id>` takes the ids `shep ps` shows — a run id, a feature id,
 * or a prefix of either — and stops that agent run through the existing
 * StopAgentRunUseCase. It never stops the daemon.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StopShepProcessUseCase } from '@/application/use-cases/processes/stop-shep-process.use-case.js';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';

function run(id: string, status: AgentRunStatus, featureId?: string): AgentRun {
  return { id, status, ...(featureId && { featureId }) } as AgentRun;
}

describe('StopShepProcessUseCase', () => {
  let runs: AgentRun[];
  let stop: { execute: ReturnType<typeof vi.fn> };
  let useCase: StopShepProcessUseCase;

  beforeEach(() => {
    runs = [
      run('run-aaaa1111', AgentRunStatus.running, 'feat-billing-0001'),
      run('run-aaaa2222', AgentRunStatus.completed, 'feat-billing-0001'),
      run('run-bbbb3333', AgentRunStatus.running, 'feat-darkmode-02'),
    ];
    stop = { execute: vi.fn(async () => ({ stopped: true, reason: 'Agent stopped' })) };
    useCase = new StopShepProcessUseCase(
      { execute: async () => runs } as never,
      stop as never,
      { read: async () => ({ pid: 900, port: 4050, startedAt: '' }) } as never
    );
  });

  it('stops a run by its full id or a prefix', async () => {
    expect(await useCase.execute('run-bbbb3333')).toEqual({
      stopped: true,
      message: 'Agent stopped',
      runId: 'run-bbbb3333',
    });
    await useCase.execute('run-bbbb');
    expect(stop.execute).toHaveBeenLastCalledWith('run-bbbb3333');
  });

  it("stops a feature's active run by feature id or prefix", async () => {
    await useCase.execute('feat-billing');
    expect(stop.execute).toHaveBeenCalledWith('run-aaaa1111');
  });

  it('refuses an ambiguous prefix and lists the matches', async () => {
    const result = await useCase.execute('run-aaaa');
    expect(result.stopped).toBe(false);
    expect(result.message).toContain('run-aaaa1111');
    expect(result.message).toContain('run-aaaa2222');
    expect(stop.execute).not.toHaveBeenCalled();
  });

  it('says when a feature has no running agent', async () => {
    runs = [run('run-old', AgentRunStatus.completed, 'feat-quiet-01')];
    expect(await useCase.execute('feat-quiet')).toEqual({
      stopped: false,
      message: 'feat-quiet has no running agent.',
    });
  });

  it('reports an unknown id', async () => {
    expect(await useCase.execute('nope')).toEqual({
      stopped: false,
      message: 'No agent run or feature matches nope.',
    });
  });

  it('never stops the daemon, and points to shep stop', async () => {
    for (const id of ['daemon', '900']) {
      const result = await useCase.execute(id);
      expect(result.stopped).toBe(false);
      expect(result.message).toContain('shep stop');
    }
    expect(stop.execute).not.toHaveBeenCalled();
  });

  it('refuses to stop the agent run it is called from, unless forced', async () => {
    const environment = { SHEP_AGENT_RUN_ID: 'run-bbbb3333', SHEP_FEATURE_ID: 'feat-darkmode-02' };

    const refused = await useCase.execute('feat-darkmode', { environment });
    expect(refused.stopped).toBe(false);
    expect(refused.message).toContain('Refusing to stop');
    expect(stop.execute).not.toHaveBeenCalled();

    await useCase.execute('feat-darkmode', { environment, force: true });
    expect(stop.execute).toHaveBeenCalledWith('run-bbbb3333');
  });

  it('passes the stop result through', async () => {
    stop.execute.mockResolvedValue({ stopped: false, reason: 'Agent run is not running' });
    expect(await useCase.execute('run-bbbb3333')).toEqual({
      stopped: false,
      message: 'Agent run is not running',
      runId: 'run-bbbb3333',
    });
  });
});
