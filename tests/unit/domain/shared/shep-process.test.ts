/**
 * Shep process state rules (spec 144)
 *
 * A process is "crashed" only when its record says it should be alive; a run
 * paused at a gate or finished has exited on purpose.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { AgentRunStatus, ShepProcessKind, ShepProcessState } from '@/domain/generated/output.js';
import {
  compareShepProcesses,
  expectsLiveProcess,
  shepProcessState,
} from '@/domain/shared/shep-process.js';

describe('expectsLiveProcess', () => {
  it.each([
    [AgentRunStatus.running, true],
    [AgentRunStatus.pending, true],
    [AgentRunStatus.waitingApproval, false],
    [AgentRunStatus.completed, false],
    [AgentRunStatus.failed, false],
    [AgentRunStatus.interrupted, false],
    [AgentRunStatus.cancelled, false],
  ])('%s → %s', (status, expected) => {
    expect(expectsLiveProcess(status)).toBe(expected);
  });
});

describe('shepProcessState', () => {
  it('is running whenever the process is alive', () => {
    expect(shepProcessState(true, true)).toBe(ShepProcessState.Running);
    expect(shepProcessState(true, false)).toBe(ShepProcessState.Running);
  });

  it('is crashed when it should be alive and is not, exited otherwise', () => {
    expect(shepProcessState(false, true)).toBe(ShepProcessState.Crashed);
    expect(shepProcessState(false, false)).toBe(ShepProcessState.Exited);
  });
});

describe('compareShepProcesses', () => {
  const row = (kind: ShepProcessKind, state: ShepProcessState, startedAt: string, pid = 1) => ({
    kind,
    state,
    startedAt: new Date(startedAt),
    pid,
  });

  it('puts the daemon first, then running, crashed, exited, newest first within each', () => {
    const rows = [
      row(ShepProcessKind.FeatureAgent, ShepProcessState.Exited, '2026-10-24T12:00:00Z', 1),
      row(ShepProcessKind.FeatureAgent, ShepProcessState.Running, '2026-10-24T10:00:00Z', 2),
      row(ShepProcessKind.AgentRun, ShepProcessState.Crashed, '2026-10-24T11:00:00Z', 3),
      row(ShepProcessKind.FeatureAgent, ShepProcessState.Running, '2026-10-24T11:00:00Z', 4),
      row(ShepProcessKind.Daemon, ShepProcessState.Running, '2026-10-20T00:00:00Z', 5),
    ];
    expect([...rows].sort(compareShepProcesses).map((r) => r.pid)).toEqual([5, 4, 2, 3, 1]);
  });
});
