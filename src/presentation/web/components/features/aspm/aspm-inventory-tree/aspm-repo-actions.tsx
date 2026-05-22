/**
 * AspmRepoActions — inline trigger portaled into each repository group
 * header in the ASPM Inventory tree. Opens the AspmScanDialog with the
 * repo pre-selected so every Application underneath is checked when the
 * dialog appears.
 */

'use client';

import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AspmScanDialog } from '@/components/features/aspm/aspm-scan-dialog/aspm-scan-dialog';

export interface AspmRepoActionsProps {
  repositoryId: string;
}

export function AspmRepoActions({ repositoryId }: AspmRepoActionsProps) {
  return (
    <AspmScanDialog
      defaultRepositoryId={repositoryId}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          data-testid={`aspm-inventory-scan-repo-${repositoryId}`}
          aria-label="Scan every application in this repository"
          title="Scan all apps in this repo"
          onClick={(e): void => e.stopPropagation()}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Scan all</span>
        </Button>
      }
    />
  );
}
