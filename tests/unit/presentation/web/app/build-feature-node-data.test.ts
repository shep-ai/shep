// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildFeatureNodeData } from '@/app/build-feature-node-data';
import { CoordinationAction, SdlcLifecycle } from '@shepai/core/domain/generated/output';
import type { Feature } from '@shepai/core/domain/generated/output';

const decidedAt = new Date('2026-10-12T10:00:00.000Z');

const feature = {
  id: 'feat-b',
  name: 'Sliding session expiry',
  slug: 'sliding',
  userQuery: 'q',
  description: 'd',
  repositoryPath: '/repo',
  branch: 'feat/b',
  lifecycle: SdlcLifecycle.Blocked,
  parentId: 'feat-a',
  messages: [],
  relatedArtifacts: [],
  approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
  iterationCount: 0,
  coordination: {
    action: CoordinationAction.Defer,
    rationale: 'Both rewrite the session refresh path.',
    peerFeatureId: 'feat-a',
    overlappingPaths: ['src/auth/session.ts'],
    decidedAt,
  },
  createdAt: decidedAt,
  updatedAt: decidedAt,
} as unknown as Feature;

describe('buildFeatureNodeData — agent coordination (spec 141)', () => {
  it('carries the decision with the peer name the caller resolved', () => {
    const data = buildFeatureNodeData(feature, null, {
      coordinationPeerName: 'Rotate refresh tokens',
    });
    expect(data.coordination).toEqual({
      action: CoordinationAction.Defer,
      rationale: 'Both rewrite the session refresh path.',
      peerName: 'Rotate refresh tokens',
      overlappingPaths: ['src/auth/session.ts'],
      decidedAt: decidedAt.getTime(),
    });
  });

  it('omits coordination for a feature no agent has judged', () => {
    const data = buildFeatureNodeData({ ...feature, coordination: undefined }, null);
    expect(data.coordination).toBeUndefined();
  });
});

describe('buildFeatureNodeData — decision tab availability', () => {
  it('carries the decision-tab flags the loader computed', () => {
    const data = buildFeatureNodeData(feature, null, {
      decisionTabs: { hasTechDecisions: false, hasProductDecisions: true },
    });
    expect(data.hasTechDecisions).toBe(false);
    expect(data.hasProductDecisions).toBe(true);
  });

  it('leaves the flags unset when the loader did not read the artifacts', () => {
    // Unset means "unknown" — a drawer sync merge must not overwrite real values.
    const data = buildFeatureNodeData(feature, null);
    expect(data).not.toHaveProperty('hasTechDecisions');
    expect(data).not.toHaveProperty('hasProductDecisions');
  });
});
