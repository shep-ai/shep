/**
 * Apply-Feedback Prompt Builder Tests
 */

import { describe, it, expect } from 'vitest';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import { buildApplyFeedbackContext } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/apply-feedback.prompt.js';

function createState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-explore-1',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/082-explore',
    worktreePath: '/test/worktree',
    currentNode: 'apply-feedback',
    error: null,
    approvalGates: undefined,
    messages: [],
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    _approvalAction: null,
    _rejectionFeedback: null,
    _needsReexecution: false,
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: false,
    openPr: false,
    ciFixAttempts: 0,
    ciFixHistory: [],
    ciFixStatus: 'idle',
    evidence: [],
    evidenceRetries: 0,
    model: undefined,
    resumeReason: undefined,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: 'applying-feedback',
    ...overrides,
  };
}

describe('buildApplyFeedbackContext', () => {
  it('includes current feedback text', () => {
    const state = createState();
    const result = buildApplyFeedbackContext(state, 'make the button bigger');

    expect(result).toContain('make the button bigger');
  });

  it('includes iteration count', () => {
    const state = createState({ iterationCount: 3 });
    const result = buildApplyFeedbackContext(state, 'change colors');

    expect(result).toContain('Iteration 4');
  });

  it('shows prior feedback count when history exists', () => {
    const state = createState({
      iterationCount: 2,
      feedbackHistory: ['make it blue', 'add a header'],
    });
    const result = buildApplyFeedbackContext(state, 'now add a footer');

    expect(result).toContain('Prior feedback rounds:** 2');
    expect(result).toContain('make it blue');
    expect(result).toContain('add a header');
  });

  it('omits prior feedback section when no history', () => {
    const state = createState({ feedbackHistory: [] });
    const result = buildApplyFeedbackContext(state, 'first feedback');

    expect(result).not.toContain('Prior feedback rounds');
  });

  it('truncates long prior feedback entries', () => {
    const longFeedback = 'x'.repeat(200);
    const state = createState({
      iterationCount: 1,
      feedbackHistory: [longFeedback],
    });
    const result = buildApplyFeedbackContext(state, 'second round');

    expect(result).toContain('...');
  });
});
