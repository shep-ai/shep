/**
 * build-asset-graph-nodes — derive React Flow nodes + edges for the
 * ASPM asset-risk inventory graph (feature 098, phase 7, task-47).
 *
 * Pure function: given the list of applications + at-risk app rollups +
 * (optional) owner overlays, produce the nodes and edges. Layout (x/y)
 * is computed by a simple radial fan-out so the file stays free of
 * dagre-style layout dependencies.
 */

import type { Node, Edge } from '@xyflow/react';

import type { AtRiskApplication, AssetNodeData } from './asset-node';

export interface BuildAssetGraphInput {
  applications: { id: string; name: string; ownerId?: string }[];
  atRisk: AtRiskApplication[];
  ownerNames?: Map<string, string>;
}

export interface AssetGraphResult {
  nodes: Node<AssetNodeData>[];
  edges: Edge[];
}

const CENTER_X = 0;
const CENTER_Y = 0;
const APP_RADIUS = 260;
const OWNER_RADIUS = 80;

export function buildAssetGraphNodes(input: BuildAssetGraphInput): AssetGraphResult {
  const nodes: Node<AssetNodeData>[] = [];
  const edges: Edge[] = [];

  const atRiskById = new Map(input.atRisk.map((r) => [r.applicationId, r]));

  const root: Node<AssetNodeData> = {
    id: 'root',
    type: 'asset',
    position: { x: CENTER_X, y: CENTER_Y },
    data: {
      label: 'ASPM Fleet',
      kind: 'fleet',
      openFindingCount: input.atRisk.reduce((s, r) => s + r.openFindingCount, 0),
      riskScoreSum: input.atRisk.reduce((s, r) => s + r.riskScoreSum, 0),
    },
  };
  nodes.push(root);

  const count = input.applications.length;
  if (count === 0) {
    return { nodes, edges };
  }

  const ownerSeen = new Set<string>();

  for (let i = 0; i < count; i++) {
    const app = input.applications[i];
    const angle = (i / count) * Math.PI * 2;
    const x = CENTER_X + APP_RADIUS * Math.cos(angle);
    const y = CENTER_Y + APP_RADIUS * Math.sin(angle);
    const risk = atRiskById.get(app.id);
    nodes.push({
      id: `app:${app.id}`,
      type: 'asset',
      position: { x, y },
      data: {
        label: app.name,
        kind: 'application',
        openFindingCount: risk?.openFindingCount ?? 0,
        riskScoreSum: risk?.riskScoreSum ?? 0,
        ownerId: app.ownerId,
      },
    });
    edges.push({
      id: `e:root-${app.id}`,
      source: 'root',
      target: `app:${app.id}`,
    });

    if (app.ownerId !== undefined && !ownerSeen.has(app.ownerId)) {
      ownerSeen.add(app.ownerId);
      nodes.push({
        id: `owner:${app.ownerId}`,
        type: 'asset',
        position: {
          x: x + OWNER_RADIUS * Math.cos(angle),
          y: y + OWNER_RADIUS * Math.sin(angle),
        },
        data: {
          label: input.ownerNames?.get(app.ownerId) ?? app.ownerId,
          kind: 'owner',
          openFindingCount: 0,
          riskScoreSum: 0,
        },
      });
    }
    if (app.ownerId !== undefined) {
      edges.push({
        id: `e:owner-${app.id}`,
        source: `app:${app.id}`,
        target: `owner:${app.ownerId}`,
      });
    }
  }

  return { nodes, edges };
}
