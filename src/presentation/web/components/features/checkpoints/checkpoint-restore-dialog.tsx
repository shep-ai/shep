'use client';

import { useTranslation } from 'react-i18next';
import type { GitCheckpoint } from '@shepai/core/domain/generated/output';
import { checkpointLabel } from '@shepai/core/domain/shared/git-checkpoint';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface CheckpointRestoreDialogProps {
  /** The checkpoint to restore; null closes the dialog. */
  checkpoint: GitCheckpoint | null;
  pending?: boolean;
  onConfirm: (checkpoint: GitCheckpoint) => void;
  onCancel: () => void;
}

/** Confirms a restore and says what it does (and does not) change. */
export function CheckpointRestoreDialog({
  checkpoint,
  pending,
  onConfirm,
  onCancel,
}: CheckpointRestoreDialogProps) {
  const { t } = useTranslation('web');
  const step = checkpoint ? checkpointLabel(checkpoint) : '';
  return (
    <AlertDialog
      open={checkpoint !== null}
      onOpenChange={(open) => (open ? undefined : onCancel())}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('checkpoints.restoreTitle', { step })}</AlertDialogTitle>
          <AlertDialogDescription>{t('checkpoints.restoreDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('checkpoints.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              // Keep the dialog open until the action settles.
              event.preventDefault();
              if (checkpoint) onConfirm(checkpoint);
            }}
          >
            {t('checkpoints.restoreConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
