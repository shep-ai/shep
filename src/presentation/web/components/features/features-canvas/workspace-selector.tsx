'use client';

import { useState } from 'react';
import { Layers, Check, Plus, Pencil, Trash2, SlidersHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  DEFAULT_WORKSPACE_ID,
  type UseWorkspacesResult,
  type Workspace,
} from '@/hooks/use-workspaces';

export interface WorkspaceSelectorProps {
  workspaces: UseWorkspacesResult['workspaces'];
  activeWorkspace: Workspace;
  onSelect: (id: string) => void;
  onRequestCreate: () => void;
  onRequestRename: () => void;
  /** Request deletion of a specific workspace by id. */
  onRequestDelete: (id: string) => void;
  onManage: () => void;
}

export function WorkspaceSelector({
  workspaces,
  activeWorkspace,
  onSelect,
  onRequestCreate,
  onRequestRename,
  onRequestDelete,
  onManage,
}: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const isDefault = activeWorkspace.id === DEFAULT_WORKSPACE_ID;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="workspace-selector-trigger"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            isDefault ? 'text-muted-foreground' : 'text-primary bg-primary/10'
          )}
          title="Workspace"
        >
          <Layers className="h-4 w-4" />
          <span className="max-w-[120px] truncate">{activeWorkspace.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => {
          const active = w.id === activeWorkspace.id;
          const canDelete = w.id !== DEFAULT_WORKSPACE_ID;
          return (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => onSelect(w.id)}
              className="group/ws-row flex items-center justify-between gap-2"
            >
              <span className="truncate">{w.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {active ? <Check className="h-3.5 w-3.5" /> : null}
                {canDelete ? (
                  <button
                    type="button"
                    aria-label={`Delete workspace ${w.name}`}
                    title={`Delete workspace ${w.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setOpen(false);
                      onRequestDelete(w.id);
                    }}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-0.5 opacity-0 transition-opacity group-hover/ws-row:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRequestCreate}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New workspace…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onManage} disabled={isDefault}>
          <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
          Manage items…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRequestRename} disabled={isDefault}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
