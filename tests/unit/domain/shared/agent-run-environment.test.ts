/**
 * Agent-run environment marker + self-harm guard
 *
 * An agent running inside a feature worktree has a shell, and `shep` is on its
 * PATH. `shep stop` / `restart` / `upgrade`, or `shep agent stop` on its own
 * run, stopped the very agent that typed it. The worker marks its environment
 * (inherited by every agent CLI it spawns); the destructive commands refuse
 * from inside a marked environment unless the caller passes --force.
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_FEATURE_ID_ENV_VAR,
  AGENT_RUN_ID_ENV_VAR,
  agentRunEnvironment,
  readAgentRunEnvironment,
  refuseHostShutdownFromAgent,
  refuseStoppingOwnRun,
} from '@/domain/shared/agent-run-environment.js';

const INSIDE = agentRunEnvironment('run-1', 'feat-1');
const OUTSIDE = {};

describe('agent-run environment', () => {
  it('round-trips the marker the worker sets', () => {
    expect(INSIDE).toEqual({
      [AGENT_RUN_ID_ENV_VAR]: 'run-1',
      [AGENT_FEATURE_ID_ENV_VAR]: 'feat-1',
    });
    expect(readAgentRunEnvironment(INSIDE)).toEqual({ runId: 'run-1', featureId: 'feat-1' });
    expect(readAgentRunEnvironment(OUTSIDE)).toBeUndefined();
  });

  describe('refuseHostShutdownFromAgent', () => {
    it('refuses inside an agent run and says how to override', () => {
      const refusal = refuseHostShutdownFromAgent(INSIDE, false);

      expect(refusal).toContain('run-1');
      expect(refusal).toContain('--force');
    });

    it('allows it with --force', () => {
      expect(refuseHostShutdownFromAgent(INSIDE, true)).toBeUndefined();
    });

    it('allows it from an ordinary terminal', () => {
      expect(refuseHostShutdownFromAgent(OUTSIDE, false)).toBeUndefined();
    });
  });

  describe('refuseStoppingOwnRun', () => {
    it('refuses to stop the run the caller is part of', () => {
      expect(refuseStoppingOwnRun(INSIDE, { runId: 'run-1' }, false)).toContain('--force');
    });

    it("refuses to stop another run of the caller's own feature", () => {
      expect(
        refuseStoppingOwnRun(INSIDE, { runId: 'run-2', featureId: 'feat-1' }, false)
      ).toContain('feat-1');
    });

    it("allows stopping a different feature's run", () => {
      expect(
        refuseStoppingOwnRun(INSIDE, { runId: 'run-9', featureId: 'feat-9' }, false)
      ).toBeUndefined();
    });

    it('allows it with --force or from outside an agent run', () => {
      expect(refuseStoppingOwnRun(INSIDE, { runId: 'run-1' }, true)).toBeUndefined();
      expect(refuseStoppingOwnRun(OUTSIDE, { runId: 'run-1' }, false)).toBeUndefined();
    });
  });
});
