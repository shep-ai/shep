// @vitest-environment node

/**
 * Agent-run status groupings.
 *
 * `isAgentRunExecuting` gates checkpoint restore (spec 135): a run that is
 * pending or running may still write to the worktree, a run parked at an
 * approval gate or finished does not.
 */

import { describe, it, expect } from 'vitest';
import { AgentRunStatus } from '@/domain/generated/output.js';
import { isActiveAgentRunStatus, isAgentRunExecuting } from '@/domain/shared/agent-run-status.js';

describe('isAgentRunExecuting', () => {
  it.each([AgentRunStatus.pending, AgentRunStatus.running])('is true for %s', (status) => {
    expect(isAgentRunExecuting(status)).toBe(true);
  });

  it.each([
    AgentRunStatus.waitingApproval,
    AgentRunStatus.completed,
    AgentRunStatus.failed,
    AgentRunStatus.interrupted,
    AgentRunStatus.cancelled,
  ])('is false for %s', (status) => {
    expect(isAgentRunExecuting(status)).toBe(false);
  });

  it('is narrower than "active": a run waiting for approval is active but not executing', () => {
    expect(isActiveAgentRunStatus(AgentRunStatus.waitingApproval)).toBe(true);
    expect(isAgentRunExecuting(AgentRunStatus.waitingApproval)).toBe(false);
  });
});
