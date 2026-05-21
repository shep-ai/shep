/**
 * AspmRowActionsManager — discovers the [data-application-id] portal
 * targets FeatureTreeTable's `actionsColumnFormatter` injects into each
 * application row, then portals an AspmRowActions trigger into each one.
 *
 * Mirrors the existing ApplicationRowActionsManager but scoped to the
 * ASPM Inventory page — the /features version renders delete / sync /
 * deploy actions; this one renders the Scan-now / Re-scan trigger.
 */

'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FeatureTreeRow } from '@/components/features/feature-tree-table';
import { AspmRowActions } from './aspm-row-actions';

export interface AspmRowActionsManagerProps {
  tableContainer: HTMLDivElement | null;
  renderTick: number;
  rows: FeatureTreeRow[];
}

export function AspmRowActionsManager({
  tableContainer,
  renderTick,
  rows,
}: AspmRowActionsManagerProps) {
  const [portalContainers, setPortalContainers] = useState<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!tableContainer) {
      setPortalContainers(new Map());
      return;
    }
    const elements = tableContainer.querySelectorAll<HTMLElement>('[data-application-id]');
    const nextMap = new Map<string, HTMLElement>();
    elements.forEach((el) => {
      const id = el.getAttribute('data-application-id');
      if (id) nextMap.set(id, el);
    });
    setPortalContainers((prev) => {
      if (prev.size !== nextMap.size) return nextMap;
      for (const [id, el] of nextMap) {
        if (prev.get(id) !== el) return nextMap;
      }
      return prev;
    });
  }, [tableContainer, renderTick]);

  const rowsByAppId = new Map<string, FeatureTreeRow>();
  function collect(input: FeatureTreeRow[]) {
    for (const row of input) {
      if (row._isApplication && row._applicationId) {
        rowsByAppId.set(row._applicationId, row);
      }
      if (row._children) collect(row._children);
    }
  }
  collect(rows);

  const portals: JSX.Element[] = [];
  for (const [appId, container] of portalContainers) {
    const row = rowsByAppId.get(appId);
    if (!row) continue;
    portals.push(
      createPortal(
        <AspmRowActions
          applicationId={appId}
          hasBeenScanned={row._aspmLastScannedAt !== null && row._aspmLastScannedAt !== undefined}
        />,
        container,
        appId
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
