'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApplicationRowActions } from './application-row-actions';
import type { FeatureTreeRow } from './feature-tree-table';

export interface ApplicationRowActionsManagerProps {
  /** Reference to the Tabulator table container div, provided via onTableRender callback. */
  tableContainer: HTMLDivElement | null;
  /** Monotonic counter incremented on each Tabulator render, forces portal re-discovery. */
  renderTick: number;
  /** Full row data (same as what's passed to the table). */
  rows: FeatureTreeRow[];
}

/**
 * Manages React portals for ApplicationRowActions into Tabulator's action column cells
 * for application rows (identified via the [data-application-id] portal target).
 */
export function ApplicationRowActionsManager({
  tableContainer,
  renderTick,
  rows,
}: ApplicationRowActionsManagerProps) {
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

  const appById = new Map<string, FeatureTreeRow>();
  function collect(input: FeatureTreeRow[]) {
    for (const row of input) {
      if (row._isApplication && row._applicationId) {
        appById.set(row._applicationId, row);
      }
      if (row._children) collect(row._children);
    }
  }
  collect(rows);

  const portals: JSX.Element[] = [];
  for (const [appId, container] of portalContainers) {
    const row = appById.get(appId);
    if (!row) continue;

    portals.push(
      createPortal(
        <ApplicationRowActions
          applicationId={appId}
          applicationName={row.name}
          repositoryPath={row._repositoryPath ?? ''}
          cloudUrl={row._applicationCloudUrl}
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
