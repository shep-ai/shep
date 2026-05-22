/**
 * AspmRepoActions — inline trigger portaled into each repository group
 * header in the ASPM Inventory tree. Exposes a small dropdown so the
 * reviewer can either:
 *
 *   - "Scan main branch"  → open the dialog with every Application in
 *                            the repo pre-selected (apps walk their
 *                            `repositoryPath`, i.e. the main checkout).
 *   - "Scan all branches" → open the dialog with every Application and
 *                            every Feature worktree under the repo
 *                            pre-selected.
 *
 * The AspmScanDialog runs in controlled-open mode so the dropdown can
 * decide both whether the dialog is open and which scope it should seed.
 */

'use client';

import { useState } from 'react';
import { ChevronDown, GitBranch, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AspmScanDialog,
  type AspmScanDialogRepoScope,
} from '@/components/features/aspm/aspm-scan-dialog/aspm-scan-dialog';

export interface AspmRepoActionsProps {
  repositoryId: string;
}

export function AspmRepoActions({ repositoryId }: AspmRepoActionsProps) {
  const [activeScope, setActiveScope] = useState<AspmScanDialogRepoScope | null>(null);

  const handleSelect = (scope: AspmScanDialogRepoScope): void => {
    setActiveScope(scope);
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) setActiveScope(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            data-testid={`aspm-inventory-scan-repo-${repositoryId}`}
            aria-label="Scan this repo"
            title="Scan this repo"
            onClick={(e): void => e.stopPropagation()}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Scan this repo</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e): void => e.stopPropagation()}>
          <DropdownMenuItem
            data-testid={`aspm-inventory-scan-repo-main-${repositoryId}`}
            onSelect={(): void => handleSelect('main-only')}
            className="gap-2"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <div className="flex flex-col">
              <span>Scan main branch</span>
              <span className="text-muted-foreground text-xs">Apps only — main working tree</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`aspm-inventory-scan-repo-all-${repositoryId}`}
            onSelect={(): void => handleSelect('all-branches')}
            className="gap-2"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <div className="flex flex-col">
              <span>Scan all branches</span>
              <span className="text-muted-foreground text-xs">
                Apps + every active feature worktree
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {activeScope !== null ? (
        <AspmScanDialog
          // Remount when the user re-selects a scope so the seeded selection
          // refreshes — otherwise the dialog would carry stale state from
          // the prior open.
          key={activeScope}
          defaultRepositoryId={repositoryId}
          defaultRepositoryScope={activeScope}
          open
          onOpenChange={handleOpenChange}
        />
      ) : null}
    </>
  );
}
