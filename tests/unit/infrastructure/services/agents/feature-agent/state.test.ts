import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { FeatureAgentAnnotation } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { CiFixRecord, Evidence } from '@/domain/generated/output.js';
import { EvidenceType } from '@/domain/generated/output.js';

describe('FeatureAgentAnnotation', () => {
  describe('merge state channels exist on type', () => {
    it('should include prUrl, prNumber, commitHash, ciStatus in FeatureAgentState', () => {
      // Verify these fields exist on the Annotation spec (runtime check)
      const spec = FeatureAgentAnnotation.spec;
      expect(spec).toHaveProperty('prUrl');
      expect(spec).toHaveProperty('prNumber');
      expect(spec).toHaveProperty('commitHash');
      expect(spec).toHaveProperty('ciStatus');
    });

    it('should include openPr boolean flag', () => {
      const spec = FeatureAgentAnnotation.spec;
      expect(spec).toHaveProperty('openPr');
    });
  });

  describe('FeatureAgentAnnotation structure', () => {
    it('should be a valid LangGraph Annotation root', () => {
      expect(FeatureAgentAnnotation).toBeDefined();
      expect(FeatureAgentAnnotation.spec).toBeDefined();
    });

    it('should have all 36 channels', () => {
      const channelNames = Object.keys(FeatureAgentAnnotation.spec);
      // Original: featureId, repositoryPath, specDir, worktreePath, currentNode, error,
      //           approvalGates, messages, validationRetries, lastValidationTarget, lastValidationErrors
      // Merge:    prUrl, prNumber, commitHash, ciStatus, push, openPr
      // Approval: _approvalAction, _rejectionFeedback, _needsReexecution
      // CI fix:   ciFixAttempts, ciFixHistory, ciFixStatus
      // Fork:     forkAndPr, commitSpecs
      // Exploration: iterationCount, maxIterations, feedbackHistory, explorationStatus
      expect(channelNames).toContain('prUrl');
      expect(channelNames).toContain('prNumber');
      expect(channelNames).toContain('commitHash');
      expect(channelNames).toContain('ciStatus');
      expect(channelNames).toContain('push');
      expect(channelNames).toContain('openPr');
      expect(channelNames).not.toContain('autoMerge');
      expect(channelNames).not.toContain('allowMerge');
      expect(channelNames).toContain('_approvalAction');
      expect(channelNames).toContain('_rejectionFeedback');
      expect(channelNames).toContain('_needsReexecution');
      expect(channelNames).toContain('ciFixAttempts');
      expect(channelNames).toContain('ciFixHistory');
      expect(channelNames).toContain('ciFixStatus');
      expect(channelNames).toContain('model');
      expect(channelNames).toContain('evidence');
      expect(channelNames).toContain('evidenceRetries');
      expect(channelNames).toContain('resumeReason');
      expect(channelNames).toContain('forkAndPr');
      expect(channelNames).toContain('commitSpecs');
      expect(channelNames).toContain('ciWatchEnabled');
      expect(channelNames).toContain('enableEvidence');
      expect(channelNames).toContain('commitEvidence');
      expect(channelNames).toContain('iterationCount');
      expect(channelNames).toContain('maxIterations');
      expect(channelNames).toContain('feedbackHistory');
      expect(channelNames).toContain('explorationStatus');
      expect(channelNames.length).toBe(36);
    });
  });

  describe('evidence state channel', () => {
    const makeEvidence = (index: number): Evidence => ({
      type: EvidenceType.Screenshot,
      capturedAt: `2026-01-0${index}T00:00:00Z`,
      description: `evidence ${index}`,
      relativePath: `.shep/evidence/screenshot-${index}.png`,
      taskRef: `task-${index}`,
    });

    describe('initial default', () => {
      it('evidence defaults to empty array', () => {
        const channel = FeatureAgentAnnotation.spec.evidence as unknown as {
          initialValueFactory: () => Evidence[];
        };
        expect(channel.initialValueFactory()).toEqual([]);
      });
    });

    describe('evidence reducer — append (accumulating)', () => {
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.evidence as unknown as {
            operator: (prev: Evidence[], next: Evidence[]) => Evidence[];
          }
        ).operator;

      it('accumulates evidence records across two state updates', () => {
        const op = getOperator();
        const evidence1 = makeEvidence(1);
        const evidence2 = makeEvidence(2);

        const afterFirst = op([], [evidence1]);
        expect(afterFirst).toHaveLength(1);
        expect(afterFirst[0]).toEqual(evidence1);

        const afterSecond = op(afterFirst, [evidence2]);
        expect(afterSecond).toHaveLength(2);
        expect(afterSecond[0]).toEqual(evidence1);
        expect(afterSecond[1]).toEqual(evidence2);
      });

      it('does not lose prior records on checkpoint restore (append semantics)', () => {
        const op = getOperator();
        const existing = [makeEvidence(1), makeEvidence(2)];
        const newEvidence = makeEvidence(3);

        const result = op(existing, [newEvidence]);
        expect(result).toHaveLength(3);
        expect(result[2]).toEqual(newEvidence);
      });

      it('produces [...prev, ...next] — not a replace', () => {
        const op = getOperator();
        const prev = [makeEvidence(1)];
        const next = [makeEvidence(2)];
        const result = op(prev, next);
        expect(result).toEqual([...prev, ...next]);
      });
    });
  });

  describe('CI watch/fix loop state channels', () => {
    describe('initial defaults', () => {
      it('ciFixAttempts defaults to 0', () => {
        // LangGraph Annotation spec exposes initialValueFactory (not 'default')
        const channel = FeatureAgentAnnotation.spec.ciFixAttempts as unknown as {
          initialValueFactory: () => number;
        };
        expect(channel.initialValueFactory()).toBe(0);
      });

      it('ciFixHistory defaults to []', () => {
        const channel = FeatureAgentAnnotation.spec.ciFixHistory as unknown as {
          initialValueFactory: () => CiFixRecord[];
        };
        expect(channel.initialValueFactory()).toEqual([]);
      });

      it('ciFixStatus defaults to "idle"', () => {
        const channel = FeatureAgentAnnotation.spec.ciFixStatus as unknown as {
          initialValueFactory: () => string;
        };
        expect(channel.initialValueFactory()).toBe('idle');
      });
    });

    describe('ciFixAttempts reducer — replace', () => {
      // LangGraph Annotation spec exposes operator (not 'reducer')
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.ciFixAttempts as unknown as {
            operator: (prev: number, next: number) => number;
          }
        ).operator;

      it('replaces previous value on each update', () => {
        const op = getOperator();
        expect(op(0, 1)).toBe(1);
        expect(op(1, 2)).toBe(2);
        expect(op(2, 3)).toBe(3);
      });

      it('does not accumulate — keeps only the latest value', () => {
        const op = getOperator();
        let state = op(0, 1);
        state = op(state, 2);
        expect(state).toBe(2);
      });
    });

    describe('ciFixHistory reducer — append', () => {
      const makeRecord = (attempt: number): CiFixRecord => ({
        attempt,
        startedAt: `2026-01-0${attempt}T00:00:00Z`,
        failureSummary: `failure ${attempt}`,
        outcome: 'failed',
      });

      // LangGraph Annotation spec exposes operator (not 'reducer')
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.ciFixHistory as unknown as {
            operator: (prev: CiFixRecord[], next: CiFixRecord[]) => CiFixRecord[];
          }
        ).operator;

      it('accumulates records across two state updates', () => {
        const op = getOperator();
        const record1 = makeRecord(1);
        const record2 = makeRecord(2);

        const afterFirst = op([], [record1]);
        expect(afterFirst).toHaveLength(1);
        expect(afterFirst[0]).toEqual(record1);

        const afterSecond = op(afterFirst, [record2]);
        expect(afterSecond).toHaveLength(2);
        expect(afterSecond[0]).toEqual(record1);
        expect(afterSecond[1]).toEqual(record2);
      });

      it('does not lose prior records on checkpoint restore (append semantics)', () => {
        const op = getOperator();
        const existing = [makeRecord(1), makeRecord(2)];
        const newRecord = makeRecord(3);

        const result = op(existing, [newRecord]);
        expect(result).toHaveLength(3);
        expect(result[2]).toEqual(newRecord);
      });

      it('produces [...prev, ...next] — not a replace', () => {
        const op = getOperator();
        const prev = [makeRecord(1)];
        const next = [makeRecord(2)];
        const result = op(prev, next);
        expect(result).toEqual([...prev, ...next]);
      });
    });

    describe('ciFixStatus reducer — replace', () => {
      // LangGraph Annotation spec exposes operator (not 'reducer')
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.ciFixStatus as unknown as {
            operator: (prev: string, next: string) => string;
          }
        ).operator;

      it('replaces previous status on each update', () => {
        const op = getOperator();
        expect(op('idle', 'watching')).toBe('watching');
        expect(op('watching', 'fixing')).toBe('fixing');
        expect(op('fixing', 'success')).toBe('success');
      });

      it('accepts all valid status values', () => {
        const op = getOperator();
        const statuses = ['idle', 'watching', 'fixing', 'success', 'exhausted', 'timeout'] as const;
        for (const status of statuses) {
          expect(op('idle', status)).toBe(status);
        }
      });
    });
  });

  describe('exploration mode state channels', () => {
    describe('initial defaults', () => {
      it('iterationCount defaults to 0', () => {
        const channel = FeatureAgentAnnotation.spec.iterationCount as unknown as {
          initialValueFactory: () => number;
        };
        expect(channel.initialValueFactory()).toBe(0);
      });

      it('maxIterations defaults to 10', () => {
        const channel = FeatureAgentAnnotation.spec.maxIterations as unknown as {
          initialValueFactory: () => number;
        };
        expect(channel.initialValueFactory()).toBe(10);
      });

      it('feedbackHistory defaults to empty array', () => {
        const channel = FeatureAgentAnnotation.spec.feedbackHistory as unknown as {
          initialValueFactory: () => string[];
        };
        expect(channel.initialValueFactory()).toEqual([]);
      });

      it('explorationStatus defaults to undefined', () => {
        const channel = FeatureAgentAnnotation.spec.explorationStatus as unknown as {
          initialValueFactory: () => string | undefined;
        };
        expect(channel.initialValueFactory()).toBeUndefined();
      });
    });

    describe('iterationCount reducer — replace', () => {
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.iterationCount as unknown as {
            operator: (prev: number, next: number) => number;
          }
        ).operator;

      it('replaces previous value on each update', () => {
        const op = getOperator();
        expect(op(0, 1)).toBe(1);
        expect(op(1, 2)).toBe(2);
        expect(op(2, 3)).toBe(3);
      });

      it('does not accumulate — keeps only the latest value', () => {
        const op = getOperator();
        let state = op(0, 1);
        state = op(state, 5);
        expect(state).toBe(5);
      });
    });

    describe('feedbackHistory reducer — append (accumulating)', () => {
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.feedbackHistory as unknown as {
            operator: (prev: string[], next: string[]) => string[];
          }
        ).operator;

      it('accumulates feedback across two state updates', () => {
        const op = getOperator();
        const afterFirst = op([], ['make it blue']);
        expect(afterFirst).toHaveLength(1);
        expect(afterFirst[0]).toBe('make it blue');

        const afterSecond = op(afterFirst, ['also add a header']);
        expect(afterSecond).toHaveLength(2);
        expect(afterSecond[0]).toBe('make it blue');
        expect(afterSecond[1]).toBe('also add a header');
      });

      it('does not lose prior feedback on checkpoint restore', () => {
        const op = getOperator();
        const existing = ['feedback 1', 'feedback 2'];
        const result = op(existing, ['feedback 3']);
        expect(result).toHaveLength(3);
        expect(result[2]).toBe('feedback 3');
      });

      it('produces [...prev, ...next] — not a replace', () => {
        const op = getOperator();
        const prev = ['first feedback'];
        const next = ['second feedback'];
        const result = op(prev, next);
        expect(result).toEqual([...prev, ...next]);
      });
    });

    describe('explorationStatus reducer — replace', () => {
      const getOperator = () =>
        (
          FeatureAgentAnnotation.spec.explorationStatus as unknown as {
            operator: (prev: string | undefined, next: string | undefined) => string | undefined;
          }
        ).operator;

      it('replaces previous status on each update', () => {
        const op = getOperator();
        expect(op(undefined, 'generating')).toBe('generating');
        expect(op('generating', 'waiting-feedback')).toBe('waiting-feedback');
        expect(op('waiting-feedback', 'applying-feedback')).toBe('applying-feedback');
      });

      it('accepts all valid status values', () => {
        const op = getOperator();
        const statuses = [
          'generating',
          'waiting-feedback',
          'applying-feedback',
          'promoting',
          'discarding',
          undefined,
        ] as const;
        for (const status of statuses) {
          expect(op(undefined, status)).toBe(status);
        }
      });
    });
  });
});
