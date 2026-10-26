/**
 * ReportHostActivityUseCase (spec 148): tell a terminal host such as Herdr
 * what shep is doing, only when it changes, and let go of the pane on exit.
 * TDD: RED-GREEN-REFACTOR.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ReportHostActivityUseCase } from '@/application/use-cases/agent-activity/report-host-activity.use-case.js';
import type { IActivityHostReporter } from '@/application/ports/output/services/activity-host-reporter.interface.js';
import { AgentActivityState } from '@/domain/generated/output.js';

describe('ReportHostActivityUseCase', () => {
  let reporter: {
    available: boolean;
    report: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let useCase: ReportHostActivityUseCase;

  beforeEach(() => {
    reporter = { available: true, report: vi.fn(), release: vi.fn(async () => undefined) };
    useCase = new ReportHostActivityUseCase(reporter as IActivityHostReporter);
  });

  it('reports a state and a message', () => {
    useCase.execute({ state: AgentActivityState.Blocked, message: '1 feature needs you' });

    expect(reporter.report).toHaveBeenCalledWith({
      state: AgentActivityState.Blocked,
      message: '1 feature needs you',
    });
  });

  it('reports only when the state or message changes', () => {
    useCase.execute({ state: AgentActivityState.Working });
    useCase.execute({ state: AgentActivityState.Working });
    useCase.execute({ state: AgentActivityState.Blocked, message: '1 feature needs you' });
    useCase.execute({ state: AgentActivityState.Blocked, message: '1 feature needs you' });
    useCase.execute({ state: AgentActivityState.Blocked, message: '2 features need you' });

    expect(reporter.report).toHaveBeenCalledTimes(3);
  });

  it('does nothing outside a host', async () => {
    reporter.available = false;

    useCase.execute({ state: AgentActivityState.Working });
    await useCase.release();

    expect(reporter.report).not.toHaveBeenCalled();
    expect(reporter.release).not.toHaveBeenCalled();
  });

  it('releases the pane once, and only after reporting something', async () => {
    await useCase.release();
    expect(reporter.release).not.toHaveBeenCalled();

    useCase.execute({ state: AgentActivityState.Working });
    await useCase.release();
    await useCase.release();
    expect(reporter.release).toHaveBeenCalledTimes(1);
  });

  it('never throws, whatever the reporter does', async () => {
    reporter.report.mockImplementation(() => {
      throw new Error('boom');
    });
    reporter.release.mockRejectedValue(new Error('gone'));

    expect(() => useCase.execute({ state: AgentActivityState.Working })).not.toThrow();
    await expect(useCase.release()).resolves.toBeUndefined();
  });
});
