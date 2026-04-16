import { describe, it, expect } from 'vitest';
import {
  ClusterAgentAnnotation,
  type ClusterAgentState,
} from '@/infrastructure/services/agents/cluster-agent/cluster-agent-state.js';

describe('ClusterAgentAnnotation', () => {
  describe('structure', () => {
    it('should be a valid LangGraph Annotation root', () => {
      expect(ClusterAgentAnnotation).toBeDefined();
      expect(ClusterAgentAnnotation.spec).toBeDefined();
    });

    it('should define all 10 expected state channels', () => {
      const channelNames = Object.keys(ClusterAgentAnnotation.spec);

      expect(channelNames).toContain('clusterId');
      expect(channelNames).toContain('clusterName');
      expect(channelNames).toContain('status');
      expect(channelNames).toContain('kubeconfigPath');
      expect(channelNames).toContain('argoCdEnabled');
      expect(channelNames).toContain('argoCdNamespace');
      expect(channelNames).toContain('currentNode');
      expect(channelNames).toContain('error');
      expect(channelNames).toContain('completedPhases');
      expect(channelNames).toContain('messages');
      expect(channelNames.length).toBe(10);
    });
  });

  describe('initial defaults', () => {
    it('error defaults to null', () => {
      const channel = ClusterAgentAnnotation.spec.error as unknown as {
        initialValueFactory: () => string | null;
      };
      expect(channel.initialValueFactory()).toBeNull();
    });

    it('completedPhases defaults to empty array', () => {
      const channel = ClusterAgentAnnotation.spec.completedPhases as unknown as {
        initialValueFactory: () => string[];
      };
      expect(channel.initialValueFactory()).toEqual([]);
    });

    it('messages defaults to empty array', () => {
      const channel = ClusterAgentAnnotation.spec.messages as unknown as {
        initialValueFactory: () => string[];
      };
      expect(channel.initialValueFactory()).toEqual([]);
    });

    it('argoCdEnabled defaults to false', () => {
      const channel = ClusterAgentAnnotation.spec.argoCdEnabled as unknown as {
        initialValueFactory: () => boolean;
      };
      expect(channel.initialValueFactory()).toBe(false);
    });

    it('argoCdNamespace defaults to argocd', () => {
      const channel = ClusterAgentAnnotation.spec.argoCdNamespace as unknown as {
        initialValueFactory: () => string;
      };
      expect(channel.initialValueFactory()).toBe('argocd');
    });

    it('kubeconfigPath defaults to null', () => {
      const channel = ClusterAgentAnnotation.spec.kubeconfigPath as unknown as {
        initialValueFactory: () => string | null;
      };
      expect(channel.initialValueFactory()).toBeNull();
    });
  });

  describe('completedPhases reducer — append (accumulating)', () => {
    const getOperator = () =>
      (
        ClusterAgentAnnotation.spec.completedPhases as unknown as {
          operator: (prev: string[], next: string[]) => string[];
        }
      ).operator;

    it('accumulates phase names across state updates', () => {
      const op = getOperator();

      const after1 = op([], ['prerequisite-check']);
      expect(after1).toEqual(['prerequisite-check']);

      const after2 = op(after1, ['provision']);
      expect(after2).toEqual(['prerequisite-check', 'provision']);

      const after3 = op(after2, ['configure-kubectl']);
      expect(after3).toEqual(['prerequisite-check', 'provision', 'configure-kubectl']);
    });

    it('produces [...prev, ...next] — not a replace', () => {
      const op = getOperator();
      const prev = ['prerequisite-check'];
      const next = ['provision'];
      expect(op(prev, next)).toEqual([...prev, ...next]);
    });
  });

  describe('messages reducer — append (accumulating)', () => {
    const getOperator = () =>
      (
        ClusterAgentAnnotation.spec.messages as unknown as {
          operator: (prev: string[], next: string[]) => string[];
        }
      ).operator;

    it('accumulates messages across node executions', () => {
      const op = getOperator();
      const after1 = op([], ['[prerequisite-check] Docker available']);
      const after2 = op(after1, ['[provision] Cluster created']);
      expect(after2).toEqual([
        '[prerequisite-check] Docker available',
        '[provision] Cluster created',
      ]);
    });
  });

  describe('error reducer — replace-on-update', () => {
    const getOperator = () =>
      (
        ClusterAgentAnnotation.spec.error as unknown as {
          operator: (prev: string | null, next: string | null) => string | null;
        }
      ).operator;

    it('replaces error value on update', () => {
      const op = getOperator();
      expect(op(null, 'Docker not available')).toBe('Docker not available');
    });

    it('clears error with null', () => {
      const op = getOperator();
      expect(op('Docker not available', null)).toBeNull();
    });

    it('keeps previous when next is undefined', () => {
      const op = getOperator();
      expect(op('Some error', undefined as unknown as string | null)).toBe('Some error');
    });
  });

  describe('type export', () => {
    it('ClusterAgentState type is usable', () => {
      const mockState: ClusterAgentState = {
        clusterId: 'test-id',
        clusterName: 'test-cluster',
        status: 'Provisioning',
        kubeconfigPath: null,
        argoCdEnabled: false,
        argoCdNamespace: 'argocd',
        currentNode: 'prerequisite-check',
        error: null,
        completedPhases: [],
        messages: [],
      };

      expect(mockState.clusterId).toBe('test-id');
      expect(mockState.completedPhases).toEqual([]);
    });
  });
});
