'use client';

import type { JSX } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Code2, Terminal, FolderOpen, Play, Square, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useFeatureFlags } from '@/hooks/feature-flags-context';

export interface RepoActionCallbacks {
  onOpenIde: (repositoryPath: string) => Promise<void>;
  onOpenShell: (repositoryPath: string) => Promise<void>;
  onOpenFolder: (repositoryPath: string) => Promise<void>;
  onStartServer: (repositoryPath: string) => Promise<void>;
  onStopServer: (repositoryPath: string) => Promise<void>;
  isServerRunning: (repositoryPath: string) => boolean;
}

export interface RepositoryGroupActionsManagerProps {
  tableContainer: HTMLDivElement | null;
  /** Monotonic counter incremented on each Tabulator render, forces portal re-discovery. */
  renderTick: number;
  callbacks: RepoActionCallbacks;
}

interface PortalEntry {
  element: HTMLElement;
  repositoryPath: string;
  repositoryId?: string;
}

function RepoActionButtons({
  repositoryPath,
  callbacks,
}: {
  repositoryPath: string;
  callbacks: RepoActionCallbacks;
}) {
  const { t } = useTranslation('web');
  const featureFlags = useFeatureFlags();
  const [ideLoading, setIdeLoading] = useState(false);
  const [shellLoading, setShellLoading] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const isRunning = callbacks.isServerRunning(repositoryPath);

  const handleIde = useCallback(async () => {
    setIdeLoading(true);
    try {
      await callbacks.onOpenIde(repositoryPath);
    } finally {
      setIdeLoading(false);
    }
  }, [callbacks, repositoryPath]);

  const handleShell = useCallback(async () => {
    setShellLoading(true);
    try {
      await callbacks.onOpenShell(repositoryPath);
    } finally {
      setShellLoading(false);
    }
  }, [callbacks, repositoryPath]);

  const handleFolder = useCallback(async () => {
    setFolderLoading(true);
    try {
      await callbacks.onOpenFolder(repositoryPath);
    } finally {
      setFolderLoading(false);
    }
  }, [callbacks, repositoryPath]);

  const handleServer = useCallback(async () => {
    setServerLoading(true);
    try {
      if (isRunning) {
        await callbacks.onStopServer(repositoryPath);
      } else {
        await callbacks.onStartServer(repositoryPath);
      }
    } finally {
      setServerLoading(false);
    }
  }, [callbacks, repositoryPath, isRunning]);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('repositoryNode.openInIde')}
              disabled={ideLoading}
              onClick={(e) => {
                e.stopPropagation();
                handleIde();
              }}
              className="text-muted-foreground cursor-pointer rounded-full transition-colors hover:text-blue-500"
            >
              {ideLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Code2 className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('repositoryNode.openInIde')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('repositoryNode.openInShell')}
              disabled={shellLoading}
              onClick={(e) => {
                e.stopPropagation();
                handleShell();
              }}
              className="text-muted-foreground cursor-pointer rounded-full transition-colors hover:text-blue-500"
            >
              {shellLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Terminal className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('repositoryNode.openInShell')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('repositoryNode.openFolder')}
              disabled={folderLoading}
              onClick={(e) => {
                e.stopPropagation();
                handleFolder();
              }}
              className="text-muted-foreground cursor-pointer rounded-full transition-colors hover:text-blue-500"
            >
              {folderLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FolderOpen className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('repositoryNode.openFolder')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {featureFlags.envDeploy ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  isRunning ? t('repositoryNode.stopDevServer') : t('repositoryNode.startDevServer')
                }
                disabled={serverLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleServer();
                }}
                className={
                  isRunning
                    ? 'cursor-pointer rounded-full text-green-600 transition-colors hover:text-red-500'
                    : 'text-muted-foreground cursor-pointer rounded-full transition-colors hover:text-green-500'
                }
              >
                {serverLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isRunning ? (
                  <Square className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRunning ? t('repositoryNode.stopDevServer') : t('repositoryNode.startDevServer')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </>
  );
}

export function RepositoryGroupActionsManager({
  tableContainer,
  renderTick,
  callbacks,
}: RepositoryGroupActionsManagerProps) {
  const [portalEntries, setPortalEntries] = useState<PortalEntry[]>([]);

  // Re-discover portal targets whenever the container changes OR Tabulator re-renders (renderTick).
  // Tabulator destroys and recreates group header DOM on tree expand/collapse, so renderTick
  // forces re-discovery even when the container element reference stays the same.
  useEffect(() => {
    if (!tableContainer) {
      setPortalEntries([]);
      return;
    }

    const elements = tableContainer.querySelectorAll<HTMLElement>('[data-repo-actions]');
    const entries: PortalEntry[] = [];
    elements.forEach((el) => {
      const repoPath = el.getAttribute('data-repo-actions');
      if (repoPath) {
        entries.push({
          element: el,
          repositoryPath: repoPath,
          repositoryId: el.getAttribute('data-repo-id') ?? undefined,
        });
      }
    });

    setPortalEntries((prev) => {
      if (prev.length !== entries.length) return entries;
      for (let i = 0; i < entries.length; i++) {
        if (
          prev[i].element !== entries[i].element ||
          prev[i].repositoryPath !== entries[i].repositoryPath
        ) {
          return entries;
        }
      }
      return prev;
    });
  }, [tableContainer, renderTick]);

  const portals: JSX.Element[] = portalEntries.map(
    (entry) =>
      createPortal(
        <RepoActionButtons
          key={entry.repositoryPath}
          repositoryPath={entry.repositoryPath}
          callbacks={callbacks}
        />,
        entry.element,
        `repo-actions-${entry.repositoryPath}`
      ) as unknown as JSX.Element
  );

  if (portals.length === 0) return null;

  return (
    <>
      {null}
      {portals}
    </>
  );
}
