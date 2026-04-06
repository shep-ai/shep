'use client';

import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LayoutGrid, Trash2 } from 'lucide-react';
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
import type { ApplicationNodeData } from './application-node-config';

const STATUS_DOT_CLASSES: Record<string, string> = {
  Active: 'bg-green-500',
  Error: 'bg-red-500',
};
const STATUS_DOT_DEFAULT = 'bg-muted-foreground/40';

export function ApplicationNode({
  data,
  selected,
}: {
  data: ApplicationNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const { i18n } = useTranslation('web');
  const isRtl = i18n.dir() === 'rtl';
  const targetHandlePos = isRtl ? Position.Right : Position.Left;
  const sourceHandlePos = isRtl ? Position.Left : Position.Right;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalRepoCount = 1 + data.additionalPathCount;
  const repoCountLabel = totalRepoCount === 1 ? '1 repository' : `${totalRepoCount} repositories`;

  const statusDotClass = STATUS_DOT_CLASSES[data.status] ?? STATUS_DOT_DEFAULT;

  return (
    <div
      className={cn('group relative', data.onDelete && data.id && 'ps-10')}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      {data.showHandles ? (
        <Handle
          type="target"
          position={targetHandlePos}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: 70 }}
        />
      ) : null}

      {/* Delete button — visible on hover, positioned to the left */}
      {data.onDelete && data.id ? (
        <>
          <div className="absolute -start-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Remove application"
                    data-testid="application-node-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(true);
                    }}
                    className="bg-card text-muted-foreground hover:border-destructive hover:text-destructive flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove application</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>Remove application?</DialogTitle>
                <DialogDescription>
                  This will remove <strong>{data.name}</strong> from your workspace.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false);
                    data.onDelete?.(data.id);
                  }}
                >
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        data-testid="application-node-card"
        data-app-name={data.name}
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
          'nodrag bg-card flex w-[26rem] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-neutral-800/80',
          selected && 'border-blue-400 dark:border-amber-500/60'
        )}
      >
        {/* Row 1: Header — icon, name, status */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <LayoutGrid className="h-4 w-4 text-white" />
          </div>
          <span
            data-testid="application-node-name"
            className="min-w-0 truncate text-sm font-medium"
          >
            {data.name}
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            <span
              data-testid="application-node-status-dot"
              className={cn('h-2 w-2 rounded-full', statusDotClass)}
            />
            <span
              data-testid="application-node-status-text"
              className="text-muted-foreground text-xs"
            >
              {data.status}
            </span>
          </span>
        </div>

        {/* Row 2: Screenshot placeholder */}
        <div className="px-3 pb-2">
          <div className="bg-muted h-[120px] overflow-hidden rounded-lg">
            {/* Wireframe skeleton mimicking a web app */}
            <div
              className="flex h-6 items-center gap-2 px-2"
              style={{ background: 'var(--muted)' }}
            >
              <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
              <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
              <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
              <div className="bg-muted-foreground/10 ms-2 h-2 w-16 rounded" />
            </div>
            <div className="flex h-[calc(120px-1.5rem)]">
              {/* Sidebar */}
              <div className="border-muted-foreground/5 flex w-[50px] flex-col gap-2 border-e p-2">
                <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                <div className="bg-muted-foreground/10 h-2 w-3/4 rounded" />
                <div className="bg-muted-foreground/10 h-2 w-full rounded" />
              </div>
              {/* Main content */}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="bg-muted-foreground/10 h-2.5 w-2/3 rounded" />
                <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                <div className="bg-muted-foreground/10 h-2 w-5/6 rounded" />
                <div className="bg-muted-foreground/10 h-2 w-3/4 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Bottom — repository count */}
        <div className="px-4 pb-3">
          <span data-testid="application-node-repo-count" className="text-muted-foreground text-xs">
            {repoCountLabel}
          </span>
        </div>
      </div>

      {/* Source handle — invisible, for edge connections */}
      {data.showHandles ? (
        <Handle
          type="source"
          position={sourceHandlePos}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: 70 }}
        />
      ) : null}
    </div>
  );
}
