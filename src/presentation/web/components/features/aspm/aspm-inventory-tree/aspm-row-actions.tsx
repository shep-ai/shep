/**
 * AspmRowActions — inline trigger that opens the AspmScanDialog with the
 * row's application pre-selected. The actions cell in FeatureTreeTable
 * is a portal target (`[data-application-id]`), so this component just
 * renders a small icon button — the dialog manages stage selection and
 * the server-action plumbing.
 */

'use client';

import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AspmScanDialog } from '@/components/features/aspm/aspm-scan-dialog/aspm-scan-dialog';

export interface AspmRowActionsProps {
  applicationId: string;
  hasBeenScanned: boolean;
}

export function AspmRowActions({ applicationId, hasBeenScanned }: AspmRowActionsProps) {
  return (
    <AspmScanDialog
      defaultApplicationId={applicationId}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          data-testid={`aspm-inventory-scan-${applicationId}`}
          aria-label={hasBeenScanned ? 'Re-scan application' : 'Scan application'}
          title={hasBeenScanned ? 'Re-scan' : 'Scan now'}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{hasBeenScanned ? 'Re-scan' : 'Scan now'}</span>
        </Button>
      }
    />
  );
}
