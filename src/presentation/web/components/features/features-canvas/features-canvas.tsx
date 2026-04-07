'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Panel } from '@xyflow/react';
import type { Connection, Edge, NodeChange, OnMoveEnd, Viewport } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { FeatureNode } from '@/components/common/feature-node';
import type { FeatureNodeType, FeatureNodeData } from '@/components/common/feature-node';
import { RepositoryNode } from '@/components/common/repository-node';
import type { RepositoryNodeType, RepositoryNodeData } from '@/components/common/repository-node';
import { DependencyEdge } from './dependency-edge';

export type CanvasNodeType = FeatureNodeType | RepositoryNodeType;

export interface FeaturesCanvasProps {
  nodes: CanvasNodeType[];
  edges: Edge[];
  selectedFeatureId?: string | null;
  selectedRepository?: { id: string | null; path: string | null };
  defaultViewport?: Viewport;
  onNodesChange?: (changes: NodeChange<CanvasNodeType>[]) => void;
  onAddFeature?: () => void;
  onNodeClick?: (event: React.MouseEvent, node: CanvasNodeType) => void;
  onPaneClick?: (event: React.MouseEvent) => void;
  onConnect?: (connection: Connection) => void;
  onCanvasDrag?: () => void;
  onMoveEnd?: OnMoveEnd;
  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;
}

const FALLBACK_VIEWPORT: Viewport = { x: 30, y: 30, zoom: 0.85 };

export function FeaturesCanvas({
  nodes,
  edges,
  selectedFeatureId,
  selectedRepository,
  defaultViewport,
  onNodesChange,
  onAddFeature,
  onConnect,
  onNodeClick,
  onPaneClick,
  onCanvasDrag,
  onMoveEnd,
  toolbar,
  emptyState,
}: FeaturesCanvasProps) {
  const { t } = useTranslation('web');
  const nodeTypes = useMemo(
    () => ({
      featureNode: FeatureNode,
      repositoryNode: RepositoryNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      dependencyEdge: DependencyEdge,
    }),
    []
  );

  // Callbacks and showHandles are already injected into node.data by deriveGraph.
  // Apply selectedFeatureId and selectedRepository highlighting here.
  const enrichedNodes = useMemo(() => {
    const hasFeatureSel = selectedFeatureId != null;
    const hasRepoSel =
      selectedRepository != null &&
      (selectedRepository.id != null || selectedRepository.path != null);
    if (!hasFeatureSel && !hasRepoSel) return nodes;
    return nodes.map((node) => {
      if (
        hasFeatureSel &&
        node.type === 'featureNode' &&
        (node.data as FeatureNodeData).featureId === selectedFeatureId
      ) {
        return { ...node, selected: true };
      }
      if (hasRepoSel && node.type === 'repositoryNode') {
        const rd = node.data as RepositoryNodeData;
        const matchById =
          selectedRepository!.id != null &&
          (node.id === selectedRepository!.id || rd.id === selectedRepository!.id);
        const matchByPath =
          selectedRepository!.path != null && rd.repositoryPath === selectedRepository!.path;
        if (matchById || matchByPath) return { ...node, selected: true };
      }
      return node;
    }) as CanvasNodeType[];
  }, [nodes, selectedFeatureId, selectedRepository]);

  const isEmpty = nodes.length === 0;

  // Track empty→populated transition for exit animation.
  // When isEmpty flips from true to false, keep the overlay mounted
  // and fade it out before removing it from the DOM.
  const [showOverlay, setShowOverlay] = useState(isEmpty);
  const [overlayExiting, setOverlayExiting] = useState(false);
  const prevEmptyRef = useRef(isEmpty);

  useEffect(() => {
    if (prevEmptyRef.current && !isEmpty) {
      // Was empty, now populated — start exit animation
      setOverlayExiting(true);
      const timer = setTimeout(() => {
        setShowOverlay(false);
        setOverlayExiting(false);
      }, 300);
      prevEmptyRef.current = isEmpty;
      return () => clearTimeout(timer);
    }
    if (!prevEmptyRef.current && isEmpty) {
      // Was populated, now empty — show overlay immediately
      setShowOverlay(true);
    }
    prevEmptyRef.current = isEmpty;
  }, [isEmpty]);

  const fallbackEmptyState =
    isEmpty && !emptyState ? (
      <EmptyState
        title={t('canvas.noFeatures')}
        description={t('canvas.noFeaturesDescription')}
        action={
          <Button onClick={onAddFeature}>
            <Plus className="me-2 h-4 w-4" />
            {t('canvas.newFeature')}
          </Button>
        }
      />
    ) : null;

  const overlayContent = emptyState ?? fallbackEmptyState;

  return (
    <div
      data-testid={isEmpty ? 'features-canvas-empty' : 'features-canvas'}
      data-no-drawer-close
      className="dark:bg-background pointer-events-auto relative h-full w-full bg-[#f6f7f8]"
    >
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveStart={onCanvasDrag}
        onMoveEnd={onMoveEnd}
        defaultViewport={defaultViewport ?? FALLBACK_VIEWPORT}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__pane]:!cursor-default"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#b8bcc4"
          className="dark:[&_circle]:!fill-white/[0.1]"
        />
        {toolbar && !isEmpty ? (
          <Panel position="top-right" className="!me-3 !mt-3">
            {toolbar}
          </Panel>
        ) : null}
      </ReactFlow>
      {showOverlay && overlayContent ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300',
            overlayExiting ? 'opacity-0' : 'animate-in fade-in opacity-100 duration-200'
          )}
        >
          <div className="pointer-events-auto h-full w-full">{overlayContent}</div>
        </div>
      ) : null}
      {/* Toolbar rendered above the empty-state overlay so the workspace
          selector remains usable while an empty workspace is shown. */}
      {toolbar && isEmpty ? (
        <div className="pointer-events-auto absolute end-3 top-3 z-20">{toolbar}</div>
      ) : null}
    </div>
  );
}
