import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

export interface LayoutOptions {
  /** Graph direction: top-bottom, left-right, etc. Default "TB" */
  direction?: LayoutDirection;
  /** Default node size when per-node size is unavailable */
  nodeSize?: { width: number; height: number };
  /** Vertical separation between ranks (default 80) */
  ranksep?: number;
  /** Horizontal separation between nodes in the same rank (default 30) */
  nodesep?: number;
}

/**
 * Canonical layout defaults for the control-center canvas.
 *
 * `nodesep` is the gap between nodes in the SAME rank (vertical
 * gap in the LR layout we use). Bumped from 30 → 48 so the taller
 * application cards (~300px) get obvious breathing room when
 * stacked — 30px looked cramped enough that cards felt touching.
 */
export const CANVAS_LAYOUT_DEFAULTS: LayoutOptions = {
  direction: 'LR',
  ranksep: 200,
  nodesep: 48,
};

/** Returns canvas layout defaults with direction adjusted for text direction. */
export function getCanvasLayoutDefaults(dir: 'ltr' | 'rtl' = 'ltr'): LayoutOptions {
  return { ...CANVAS_LAYOUT_DEFAULTS, direction: dir === 'rtl' ? 'RL' : 'LR' };
}

/**
 * Known node-type dimensions for the canvas node types.
 *
 * Width MUST match the wrapper width on screen, not just the inner
 * card. Both `repositoryNode` and `applicationNode` use a wrapper
 * with `ps-10` (40px) when `onDelete` is wired, so the visible card
 * lives at wrapper-x + 40. Setting both to the same width keeps the
 * cards visually flush in the same column on the canvas.
 *
 * Height for the `applicationNode` tracks the idle layout — header
 * (~52px) + Run row (~38px) ≈ 90px + a bit of padding. When the
 * dev-server iframe is mounted the card grows by `PREVIEW_HEIGHT_PX`
 * (180px); dagre still gives it enough breathing room because of
 * `nodesep`, but bump this number if the card changes size.
 */
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  featureNode: { width: 388, height: 140 },
  repositoryNode: { width: 416, height: 140 },
  applicationNode: { width: 416, height: 110 },
};

function getNodeSize(
  node: Node,
  defaultSize: { width: number; height: number }
): { width: number; height: number } {
  // Prefer per-node size from data, then type-based lookup, then default
  const data = node.data as Record<string, unknown> | undefined;
  if (data && typeof data.width === 'number' && typeof data.height === 'number') {
    return { width: data.width, height: data.height };
  }
  return NODE_DIMENSIONS[node.type ?? ''] ?? defaultSize;
}

function getHandlePositions(direction: LayoutDirection) {
  switch (direction) {
    case 'LR':
      return { targetPosition: 'left' as const, sourcePosition: 'right' as const };
    case 'RL':
      return { targetPosition: 'right' as const, sourcePosition: 'left' as const };
    case 'BT':
      return { targetPosition: 'bottom' as const, sourcePosition: 'top' as const };
    case 'TB':
    default:
      return { targetPosition: 'top' as const, sourcePosition: 'bottom' as const };
  }
}

/**
 * Compute an automatic hierarchical layout for React Flow nodes and edges
 * using Dagre. Returns new node/edge arrays — never mutates the originals.
 *
 * Disconnected nodes (no edges) are interleaved with connected root trees
 * in their original input order, preserving the caller's sort (e.g. createdAt).
 */
export function layoutWithDagre<N extends Node>(
  nodes: N[],
  edges: Edge[],
  opts: LayoutOptions = {}
): { nodes: N[]; edges: Edge[] } {
  const {
    direction = 'TB',
    nodeSize = { width: 172, height: 36 },
    ranksep = 80,
    nodesep = 30,
  } = opts;

  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep, nodesep });

  // Separate connected from disconnected nodes
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const graphNodes = nodes.filter((n) => connectedIds.has(n.id));
  const disconnectedNodes = nodes.filter((n) => !connectedIds.has(n.id));

  // Add nodes to the dagre graph
  for (const node of graphNodes) {
    const size = getNodeSize(node, nodeSize);
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  // Add edges — use edge.id as key to support multigraph (duplicate source→target)
  for (const edge of edges) {
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(g);

  const { targetPosition, sourcePosition } = getHandlePositions(direction);
  const isHorizontal = direction === 'LR' || direction === 'RL';

  // Collect dagre center positions keyed by node id
  const centerMap = new Map<string, { cx: number; cy: number; w: number; h: number }>();
  for (const node of graphNodes) {
    const dagreNode = g.node(node.id);
    const size = getNodeSize(node, nodeSize);
    centerMap.set(node.id, { cx: dagreNode.x, cy: dagreNode.y, w: size.width, h: size.height });
  }

  // Add disconnected nodes to centerMap so they participate in root positioning.
  // Use the same primary-axis position as connected roots (rank 0) so they align
  // visually with repos that have features attached.
  let rootPrimaryAxis = 0;
  for (const c of centerMap.values()) {
    rootPrimaryAxis = isHorizontal ? c.cx : c.cy;
    break; // Use the first connected node's primary position
  }
  for (const node of disconnectedNodes) {
    const size = getNodeSize(node, nodeSize);
    centerMap.set(node.id, {
      cx: isHorizontal ? rootPrimaryAxis : 0,
      cy: isHorizontal ? 0 : rootPrimaryAxis,
      w: size.width,
      h: size.height,
    });
  }

  // ── Proper tree layout for the secondary axis ──
  // Dagre gives us correct primary-axis (rank/X) positions but its secondary-
  // axis (Y) positioning doesn't respect our tree structure well. Replace it
  // with a bottom-up tree layout:
  //   1. Compute subtree heights (leaves → roots)
  //   2. Position children centered on parent (roots → leaves)
  // This guarantees: no overlaps, parents centered on children, and straight
  // lines for 1-to-1 connections at every depth.

  // Build parent→children map from edges
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!centerMap.has(edge.source) || !centerMap.has(edge.target)) continue;
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push(edge.target);
  }

  // Sort children by input order (preserves caller's ordering, e.g. createdAt)
  const inputIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    inputIndex.set(nodes[i].id, i);
  }
  for (const [, kids] of childrenOf) {
    kids.sort((a, b) => (inputIndex.get(a) ?? 0) - (inputIndex.get(b) ?? 0));
  }

  // Find tree roots: connected nodes that are not children of another node
  const childSet = new Set<string>();
  for (const ids of childrenOf.values()) {
    for (const id of ids) childSet.add(id);
  }
  const connectedRoots = [...connectedIds].filter((id) => centerMap.has(id) && !childSet.has(id));
  // Merge connected roots and disconnected nodes, sorted by input order
  // so repos maintain their original creation-time ordering regardless of
  // whether they have features attached.
  const allRoots = [...connectedRoots, ...disconnectedNodes.map((n) => n.id)];
  allRoots.sort((a, b) => (inputIndex.get(a) ?? 0) - (inputIndex.get(b) ?? 0));

  // Bottom-up: compute the total secondary-axis span each subtree needs
  const subtreeSpan = new Map<string, number>();
  function computeSpan(nodeId: string): number {
    if (subtreeSpan.has(nodeId)) return subtreeSpan.get(nodeId)!;
    const c = centerMap.get(nodeId)!;
    const nodeSpan = isHorizontal ? c.h : c.w;
    const kids = childrenOf.get(nodeId);
    if (!kids || kids.length === 0) {
      subtreeSpan.set(nodeId, nodeSpan);
      return nodeSpan;
    }
    let childrenTotalSpan = 0;
    for (const kid of kids) {
      childrenTotalSpan += computeSpan(kid);
    }
    childrenTotalSpan += (kids.length - 1) * nodesep;
    const span = Math.max(nodeSpan, childrenTotalSpan);
    subtreeSpan.set(nodeId, span);
    return span;
  }

  for (const root of allRoots) computeSpan(root);

  // Top-down: position each node on the secondary axis, centering parent
  // on its children block. For 1-to-1 edges the child gets the same
  // secondary-axis value as its parent (straight line).
  function positionTree(nodeId: string, centerPos: number): void {
    const c = centerMap.get(nodeId)!;
    if (isHorizontal) {
      c.cy = centerPos;
    } else {
      c.cx = centerPos;
    }
    const kids = childrenOf.get(nodeId);
    if (!kids || kids.length === 0) return;

    // Total span occupied by children
    let childrenTotalSpan = 0;
    for (const kid of kids) {
      childrenTotalSpan += subtreeSpan.get(kid) ?? 0;
    }
    childrenTotalSpan += (kids.length - 1) * nodesep;

    // Start from the top of the centered children block
    let cursor = centerPos - childrenTotalSpan / 2;
    for (const kid of kids) {
      const kidSpan = subtreeSpan.get(kid) ?? 0;
      positionTree(kid, cursor + kidSpan / 2);
      cursor += kidSpan + nodesep;
    }
  }

  // Position all root trees (connected and disconnected) in input order.
  let rootCursor = 0;
  for (const root of allRoots) {
    const span = subtreeSpan.get(root) ?? 0;
    positionTree(root, rootCursor + span / 2);
    rootCursor += span + nodesep;
  }

  // Build result array converting center-coords to React Flow top-left
  const result: N[] = [];
  for (const node of nodes) {
    const c = centerMap.get(node.id);
    if (!c) continue;
    result.push({
      ...node,
      targetPosition,
      sourcePosition,
      position: { x: c.cx - c.w / 2, y: c.cy - c.h / 2 },
    } as N);
  }

  return { nodes: result, edges: [...edges] };
}
