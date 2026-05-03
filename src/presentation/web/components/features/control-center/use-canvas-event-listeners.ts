/**
 * Wire global window events used by the control center canvas to the
 * appropriate handlers. The canvas listens for cross-component requests
 * dispatched as CustomEvents:
 *
 *   - shep:add-repository           → addRepoAndFocus(path)
 *   - shep:feature-created          → createFeatureNode(...)
 *   - shep:feature-delete-requested → handleDeleteFeature(...)
 *   - shep:feature-archive-requested → handleArchiveFeature(...)
 *   - shep:feature-unarchive-requested → handleUnarchiveFeature(...)
 *
 * Extracted from control-center-inner.tsx so the parent component stays
 * focused on graph state + rendering, not event-bus plumbing.
 */

import { useEffect } from 'react';

import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';

export type CreateFeatureNodeFn = (
  sourceNodeId: string | null,
  dataOverride?: Partial<FeatureNodeData>,
  edgeType?: string
) => string;

export interface CanvasEventListenerHandlers {
  addRepoAndFocus: (path: string) => void;
  createFeatureNode: CreateFeatureNodeFn;
  nodes: CanvasNodeType[];
  handleDeleteFeature: (
    featureId: string,
    cleanup?: boolean,
    cascadeDelete?: boolean,
    closePr?: boolean
  ) => void;
  handleArchiveFeature: (featureId: string) => void;
  handleUnarchiveFeature: (featureId: string) => void;
}

export function useCanvasEventListeners(handlers: CanvasEventListenerHandlers): void {
  const {
    addRepoAndFocus,
    createFeatureNode,
    nodes,
    handleDeleteFeature,
    handleArchiveFeature,
    handleUnarchiveFeature,
  } = handlers;

  // shep:add-repository — top-bar "add folder" button
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail.path;
      addRepoAndFocus(path);
    };
    window.addEventListener('shep:add-repository', handler);
    return () => window.removeEventListener('shep:add-repository', handler);
  }, [addRepoAndFocus]);

  // shep:feature-created — fired by the create drawer with the real server feature ID
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          featureId: string;
          name: string;
          description?: string;
          repositoryPath: string;
          parentId?: string;
          applicationId?: string;
        }>
      ).detail;

      // When parentId is provided, attach to the parent feature node via a
      // dependency edge instead of the repo node.
      if (detail.parentId) {
        const parentNodeId = `feat-${detail.parentId}`;
        createFeatureNode(
          parentNodeId,
          {
            state: 'creating',
            featureId: detail.featureId,
            name: detail.name,
            description: detail.description,
            repositoryPath: detail.repositoryPath,
          },
          'dependencyEdge'
        );
        return;
      }

      // When applicationId is provided, attach to the matching application
      // node via a dependency edge so the optimistic feature renders as a
      // child of its application — never as a sibling of a virtual repo.
      // The `applicationId` data field also lets `derive-graph` keep the
      // app→feature edge stable across reconciliation.
      if (detail.applicationId) {
        const appNodeId = `app-${detail.applicationId}`;
        const appNode = nodes.find((n) => n.id === appNodeId && n.type === 'applicationNode');
        if (appNode) {
          createFeatureNode(
            appNodeId,
            {
              state: 'running',
              featureId: detail.featureId,
              name: detail.name,
              description: detail.description,
              repositoryPath: detail.repositoryPath,
              applicationId: detail.applicationId,
            },
            'dependencyEdge'
          );
          return;
        }
      }

      const repoNode = nodes.find(
        (n) =>
          n.type === 'repositoryNode' &&
          (n.data as { repositoryPath?: string }).repositoryPath === detail.repositoryPath
      );

      createFeatureNode(repoNode?.id ?? null, {
        state: 'running',
        featureId: detail.featureId,
        name: detail.name,
        description: detail.description,
        repositoryPath: detail.repositoryPath,
      });
    };
    window.addEventListener('shep:feature-created', handler);
    return () => window.removeEventListener('shep:feature-created', handler);
  }, [nodes, createFeatureNode]);

  // shep:feature-delete-requested — fired from the feature drawer
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId, cleanup, cascadeDelete, closePr } = (
        e as CustomEvent<{
          featureId: string;
          cleanup?: boolean;
          cascadeDelete?: boolean;
          closePr?: boolean;
        }>
      ).detail;
      handleDeleteFeature(featureId, cleanup, cascadeDelete, closePr);
    };
    window.addEventListener('shep:feature-delete-requested', handler);
    return () => window.removeEventListener('shep:feature-delete-requested', handler);
  }, [handleDeleteFeature]);

  // shep:feature-archive-requested — fired from the feature drawer
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId } = (e as CustomEvent<{ featureId: string }>).detail;
      handleArchiveFeature(featureId);
    };
    window.addEventListener('shep:feature-archive-requested', handler);
    return () => window.removeEventListener('shep:feature-archive-requested', handler);
  }, [handleArchiveFeature]);

  // shep:feature-unarchive-requested — fired from the feature drawer
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId } = (e as CustomEvent<{ featureId: string }>).detail;
      handleUnarchiveFeature(featureId);
    };
    window.addEventListener('shep:feature-unarchive-requested', handler);
    return () => window.removeEventListener('shep:feature-unarchive-requested', handler);
  }, [handleUnarchiveFeature]);
}
