/**
 * Re-fit the React Flow viewport when the active workspace's visible node
 * set changes (switching workspaces, or changing the active workspace's
 * membership via the Manage dialog).
 *
 * Intentionally scoped:
 * - Skips the first run so we don't override the persisted viewport on mount.
 * - Skips the default workspace, which shows everything and owns the
 *   persisted viewport via useViewportPersistence.
 * - Skips empty workspaces — there's nothing to fit.
 * - Defers fitView to the next tick so React Flow has committed the new
 *   node set before measuring.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { useReactFlow } from '@xyflow/react';

import type { CanvasNodeType } from '@/components/features/features-canvas';

type FitViewFn = ReturnType<typeof useReactFlow>['fitView'];

interface ActiveWorkspaceLike {
  id: string;
}

const AUTO_FOCUS_OPTIONS = {
  maxZoom: 1.0,
  padding: 0.5,
  duration: 500,
} as const;

export function useWorkspaceFitView(params: {
  activeWorkspace: ActiveWorkspaceLike;
  isDefaultActive: boolean;
  workspaceFilteredNodes: CanvasNodeType[];
  fitView: FitViewFn;
}): void {
  const { activeWorkspace, isDefaultActive, workspaceFilteredNodes, fitView } = params;

  const fingerprint = useMemo(() => {
    if (isDefaultActive) return 'default';
    const ids = workspaceFilteredNodes
      .map((n) => n.id)
      .sort()
      .join(',');
    return `${activeWorkspace.id}:${ids}`;
  }, [isDefaultActive, activeWorkspace.id, workspaceFilteredNodes]);

  const prevFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevFingerprintRef.current;
    prevFingerprintRef.current = fingerprint;
    if (prev === null) return;
    if (prev === fingerprint) return;
    if (isDefaultActive) return;
    if (workspaceFilteredNodes.length === 0) return;

    const t = setTimeout(() => {
      fitView(AUTO_FOCUS_OPTIONS);
    }, 0);
    return () => clearTimeout(t);
  }, [fingerprint, isDefaultActive, workspaceFilteredNodes.length, fitView]);
}
