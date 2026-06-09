/**
 * buildAssetGraphNodes tests (feature 098, phase 7, task-47).
 */

import { describe, expect, it } from 'vitest';

import { buildAssetGraphNodes } from '@/components/features/aspm/asset-risk-graph/build-asset-graph-nodes';

describe('buildAssetGraphNodes', () => {
  it('always emits a fleet-root node', () => {
    const { nodes } = buildAssetGraphNodes({ applications: [], atRisk: [] });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('root');
    expect(nodes[0].data.kind).toBe('fleet');
  });

  it('emits one application node per input plus an edge from root', () => {
    const { nodes, edges } = buildAssetGraphNodes({
      applications: [
        { id: 'app-a', name: 'A' },
        { id: 'app-b', name: 'B' },
      ],
      atRisk: [],
    });
    expect(nodes.filter((n) => n.data.kind === 'application')).toHaveLength(2);
    expect(edges.filter((e) => e.source === 'root')).toHaveLength(2);
  });

  it('merges at-risk rollups onto the matching application node', () => {
    const { nodes } = buildAssetGraphNodes({
      applications: [{ id: 'app-a', name: 'A' }],
      atRisk: [{ applicationId: 'app-a', openFindingCount: 5, riskScoreSum: 200 }],
    });
    const appNode = nodes.find((n) => n.id === 'app:app-a')!;
    expect(appNode.data.openFindingCount).toBe(5);
    expect(appNode.data.riskScoreSum).toBe(200);
  });

  it('deduplicates owner nodes when multiple apps share an owner', () => {
    const { nodes } = buildAssetGraphNodes({
      applications: [
        { id: 'app-a', name: 'A', ownerId: 'owner-1' },
        { id: 'app-b', name: 'B', ownerId: 'owner-1' },
      ],
      atRisk: [],
    });
    expect(nodes.filter((n) => n.data.kind === 'owner')).toHaveLength(1);
  });

  it('uses ownerNames when supplied for the owner node label', () => {
    const { nodes } = buildAssetGraphNodes({
      applications: [{ id: 'app-a', name: 'A', ownerId: 'owner-1' }],
      atRisk: [],
      ownerNames: new Map([['owner-1', '@platform']]),
    });
    expect(nodes.find((n) => n.data.kind === 'owner')!.data.label).toBe('@platform');
  });
});
