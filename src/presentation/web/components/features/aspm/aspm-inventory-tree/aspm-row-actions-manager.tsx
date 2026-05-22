/**
 * AspmRowActionsManager — discovers two kinds of portal targets that
 * FeatureTreeTable injects into the ASPM Inventory page:
 *
 *   - [data-application-id]   on each application row's actions cell
 *   - [data-repo-actions] + [data-repo-id]   on each repository group header
 *
 * Portals an {@link AspmRowActions} trigger into every application cell
 * and an {@link AspmRepoActions} "Scan all" trigger into every repository
 * header so users can scan a single app, a feature worktree, or every app
 * under a repo from the same inventory table.
 */

'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FeatureTreeRow } from '@/components/features/feature-tree-table';
import { AspmRowActions } from './aspm-row-actions';
import { AspmRepoActions } from './aspm-repo-actions';

export interface AspmRowActionsManagerProps {
  tableContainer: HTMLDivElement | null;
  renderTick: number;
  rows: FeatureTreeRow[];
}

interface RepoPortalEntry {
  element: HTMLElement;
  repositoryId: string;
}

export function AspmRowActionsManager({
  tableContainer,
  renderTick,
  rows,
}: AspmRowActionsManagerProps) {
  const [appPortals, setAppPortals] = useState<Map<string, HTMLElement>>(new Map());
  const [repoPortals, setRepoPortals] = useState<RepoPortalEntry[]>([]);

  useEffect(() => {
    if (!tableContainer) {
      setAppPortals(new Map());
      setRepoPortals([]);
      return;
    }

    const appElements = tableContainer.querySelectorAll<HTMLElement>('[data-application-id]');
    const nextAppMap = new Map<string, HTMLElement>();
    appElements.forEach((el) => {
      const id = el.getAttribute('data-application-id');
      if (id) nextAppMap.set(id, el);
    });
    setAppPortals((prev) => {
      if (prev.size !== nextAppMap.size) return nextAppMap;
      for (const [id, el] of nextAppMap) {
        if (prev.get(id) !== el) return nextAppMap;
      }
      return prev;
    });

    const repoElements = tableContainer.querySelectorAll<HTMLElement>('[data-repo-actions]');
    const nextRepos: RepoPortalEntry[] = [];
    repoElements.forEach((el) => {
      const repoId = el.getAttribute('data-repo-id');
      if (!repoId) return;
      nextRepos.push({ element: el, repositoryId: repoId });
    });
    setRepoPortals((prev) => {
      if (prev.length !== nextRepos.length) return nextRepos;
      for (let i = 0; i < nextRepos.length; i++) {
        if (
          prev[i]!.element !== nextRepos[i]!.element ||
          prev[i]!.repositoryId !== nextRepos[i]!.repositoryId
        ) {
          return nextRepos;
        }
      }
      return prev;
    });
  }, [tableContainer, renderTick]);

  const rowsByAppId = new Map<string, FeatureTreeRow>();
  function collect(input: FeatureTreeRow[]): void {
    for (const row of input) {
      if (row._isApplication && row._applicationId) {
        rowsByAppId.set(row._applicationId, row);
      }
      if (row._children) collect(row._children);
    }
  }
  collect(rows);

  const portals: JSX.Element[] = [];
  for (const [appId, container] of appPortals) {
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
  for (const entry of repoPortals) {
    portals.push(
      createPortal(
        <AspmRepoActions repositoryId={entry.repositoryId} />,
        entry.element,
        `repo-${entry.repositoryId}`
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
