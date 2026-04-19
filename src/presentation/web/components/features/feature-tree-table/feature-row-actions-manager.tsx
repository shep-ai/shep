'use client';

import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FeatureRowActions } from './feature-row-actions';
import type { FeatureTreeRow } from './feature-tree-table';

export interface FeatureRowActionsManagerProps {
  /** Reference to the Tabulator table container div, provided via onTableRender callback. */
  tableContainer: HTMLDivElement | null;
  /** Monotonic counter incremented on each Tabulator render, forces portal re-discovery. */
  renderTick: number;
  /** Full feature data array (same as what's passed to the table). */
  features: FeatureTreeRow[];
  /** Set of feature IDs currently in-flight (loading). */
  inFlightIds: Set<string>;
  /** Action callbacks. */
  onStart: (featureId: string) => void;
  onStop: (featureId: string) => void;
  onRetry: (featureId: string) => void;
  onReview: (featureId: string) => void;
  onArchive: (featureId: string) => void;
  onUnarchive: (featureId: string) => void;
  onDelete: (featureId: string) => void;
}

/**
 * Manages React portals for FeatureRowActions into Tabulator's action column cells.
 *
 * Discovers portal target containers by querying [data-feature-id] elements within
 * the table container, and renders a FeatureRowActions component into each one via
 * createPortal. Reconciles when the tableContainer reference changes (triggered by
 * Tabulator's renderComplete/tableBuilt events via onTableRender callback).
 */
export function FeatureRowActionsManager({
  tableContainer,
  renderTick,
  features,
  inFlightIds,
  onStart,
  onStop,
  onRetry,
  onReview,
  onArchive,
  onUnarchive,
  onDelete,
}: FeatureRowActionsManagerProps) {
  const [portalContainers, setPortalContainers] = useState<Map<string, HTMLElement>>(new Map());

  // Re-discover portal targets whenever the container changes OR Tabulator re-renders (renderTick).
  // Tabulator destroys and recreates row DOM elements on tree expand/collapse, so the old
  // portal target divs become stale. renderTick is a monotonic counter incremented on every
  // Tabulator renderComplete/tableBuilt event to force re-discovery even when the container
  // element reference stays the same.
  useEffect(() => {
    if (!tableContainer) {
      setPortalContainers(new Map());
      return;
    }

    const elements = tableContainer.querySelectorAll<HTMLElement>('[data-feature-id]');
    const nextMap = new Map<string, HTMLElement>();
    elements.forEach((el) => {
      const featureId = el.getAttribute('data-feature-id');
      if (featureId) {
        nextMap.set(featureId, el);
      }
    });

    setPortalContainers((prev) => {
      if (prev.size !== nextMap.size) return nextMap;
      for (const [id, el] of nextMap) {
        if (prev.get(id) !== el) return nextMap;
      }
      return prev;
    });
  }, [tableContainer, renderTick]);

  // Build a lookup map for feature data by ID
  const featureById = new Map<string, FeatureTreeRow>();
  for (const f of features) {
    featureById.set(f.id, f);
  }
  // Also look through _children for grouped/tree data
  function collectFeatures(rows: FeatureTreeRow[]) {
    for (const row of rows) {
      if (!row._isGroupHeader && !row._isRepoGroup) {
        featureById.set(row.id, row);
      }
      if (row._children) {
        collectFeatures(row._children);
      }
    }
  }
  collectFeatures(features);

  const portals: JSX.Element[] = [];

  for (const [featureId, container] of portalContainers) {
    const feature = featureById.get(featureId);
    if (!feature?.nodeState) continue;

    portals.push(
      createPortal(
        <FeatureRowActions
          featureId={featureId}
          featureName={feature.name}
          nodeState={feature.nodeState}
          hasChildren={feature.hasChildren ?? false}
          hasOpenPr={feature.hasOpenPr ?? false}
          isLoading={inFlightIds.has(featureId)}
          onStart={onStart}
          onStop={onStop}
          onRetry={onRetry}
          onReview={onReview}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
        />,
        container,
        featureId
      ) as unknown as JSX.Element
    );
  }

  if (portals.length === 0) return null;

  return (
    <>
      {null}
      {portals}
    </>
  );
}
