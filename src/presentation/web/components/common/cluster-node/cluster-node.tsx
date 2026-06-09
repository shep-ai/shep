'use client';

import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server, GitBranch, LayoutGrid, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ClusterStatusBadge } from './cluster-status-badge';
import type { ClusterNodeData } from './cluster-node-config';

export function ClusterNode({
  data,
  selected,
}: {
  data: ClusterNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const { t, i18n } = useTranslation('web');
  const isRtl = i18n.dir() === 'rtl';
  const targetHandlePos = isRtl ? Position.Right : Position.Left;
  const sourceHandlePos = isRtl ? Position.Left : Position.Right;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="group relative" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Target handle */}
      {data.showHandles ? (
        <Handle
          type="target"
          position={targetHandlePos}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: 50 }}
        />
      ) : null}

      {/* Delete button — visible on hover */}
      {data.onDelete && data.id ? (
        <>
          <div
            className="absolute -start-14 top-0 bottom-0 flex items-center justify-center ps-4 pe-3 opacity-0 transition-opacity group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label={t('cluster.removeCluster')}
                    data-testid="cluster-node-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(true);
                    }}
                    className="bg-card text-muted-foreground hover:border-destructive hover:text-destructive flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('cluster.removeCluster')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>{t('cluster.removeConfirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('cluster.removeConfirmDescription', { name: data.name })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
                <DialogClose asChild>
                  <Button variant="outline">{t('cluster.cancel')}</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false);
                    data.onDelete?.(data.id);
                  }}
                >
                  {t('cluster.remove')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        data-testid="cluster-node-card"
        data-cluster-name={data.name}
        onClick={(e) => {
          e.stopPropagation();
          data.onClick?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            data.onClick?.();
          }
        }}
        className={cn(
          'nodrag bg-card flex w-[22rem] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-neutral-800/80',
          selected && 'border-blue-400 dark:border-amber-500/60'
        )}
      >
        {/* Header — icon, name, status */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
            <Server className="h-4 w-4 text-white" />
          </div>
          <span data-testid="cluster-node-name" className="min-w-0 truncate text-sm font-medium">
            {data.name}
          </span>
          <span className="ms-auto">
            <ClusterStatusBadge status={data.status} />
          </span>
        </div>

        {/* Footer — linked counts */}
        <div className="border-border/50 border-t px-4 py-2">
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1" data-testid="cluster-node-repo-count">
              <GitBranch className="h-3 w-3 shrink-0" />
              {t('cluster.linkedRepos', { count: data.linkedRepoCount })}
            </span>
            <span className="flex items-center gap-1" data-testid="cluster-node-app-count">
              <LayoutGrid className="h-3 w-3 shrink-0" />
              {t('cluster.linkedApps', { count: data.linkedAppCount })}
            </span>
          </div>
        </div>
      </div>

      {/* Source handle */}
      {data.showHandles ? (
        <Handle
          type="source"
          position={sourceHandlePos}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: 50 }}
        />
      ) : null}
    </div>
  );
}
