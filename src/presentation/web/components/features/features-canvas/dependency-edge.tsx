'use client';

import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';

/**
 * Custom React Flow edge for parent→child feature dependencies.
 * Uses bezier curves and dashed style matching repo→feature edges.
 * Shows a delete button on hover for unparenting.
 */
export function DependencyEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });

  return (
    <>
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          strokeDasharray: '5 5',
          ...(props.selected && { stroke: '#3b82f6', strokeWidth: 2 }),
        }}
      />
      {hovered || props.selected ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Remove dependency"
            data-testid="dependency-edge-delete-button"
            className="nodrag nopan pointer-events-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:bg-neutral-800 dark:text-gray-400 dark:hover:border-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
              e.stopPropagation();
              deleteElements({ edges: [{ id: props.id }] });
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
