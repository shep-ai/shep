/**
 * Apply-Feedback Node Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

import { createApplyFeedbackNode } from '@/infrastructure/services/agents/feature-agent/nodes/apply-feedback.node.js';

function createMockState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-explore-1',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/082-explore',
    worktreePath: '/test/worktree',
    currentNode: '',
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
    iterationCount: 1,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: 'waiting-feedback',
    ...overrides,
  };
}

describe('createApplyFeedbackNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends feedback text to feedbackHistory', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: 'make it blue',
      iterationCount: 1,
    });

    const result = await node(state);

    expect(result.feedbackHistory).toEqual(['make it blue']);
  });

  it('updates explorationStatus to applying-feedback', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: 'change the layout',
    });

    const result = await node(state);

    expect(result.explorationStatus).toBe('applying-feedback');
  });

  it('handles empty feedback string gracefully', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: '',
    });

    const result = await node(state);

    expect(result.feedbackHistory).toEqual(['']);
    expect(result.explorationStatus).toBe('applying-feedback');
  });

  it('handles null feedback gracefully', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: null,
    });

    const result = await node(state);

    expect(result.feedbackHistory).toEqual(['']);
    expect(result.explorationStatus).toBe('applying-feedback');
  });

  it('preserves existing feedbackHistory entries via accumulating reducer', async () => {
    const node = createApplyFeedbackNode();
    // The accumulating reducer in the annotation handles [...prev, ...next]
    // The node itself returns the new feedback as an array to append
    const state = createMockState({
      _rejectionFeedback: 'second change',
      feedbackHistory: ['first change'],
      iterationCount: 2,
    });

    const result = await node(state);

    // The node returns ['second change'] which the reducer appends to existing
    expect(result.feedbackHistory).toEqual(['second change']);
  });

  it('clears _rejectionFeedback after consuming it', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: 'some feedback',
    });

    const result = await node(state);

    expect(result._rejectionFeedback).toBeNull();
    expect(result._approvalAction).toBeNull();
  });

  it('sets currentNode to apply-feedback', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: 'test',
    });

    const result = await node(state);

    expect(result.currentNode).toBe('apply-feedback');
  });

  it('includes feedback summary in messages', async () => {
    const node = createApplyFeedbackNode();
    const state = createMockState({
      _rejectionFeedback: 'add a sidebar navigation',
      iterationCount: 2,
    });

    const result = await node(state);

    expect(result.messages).toBeDefined();
    expect(result.messages!.some((m: string) => m.includes('add a sidebar navigation'))).toBe(true);
  });
});
