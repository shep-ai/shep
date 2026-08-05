'use client';

/**
 * Confirmation for removing a repository from shep.
 *
 * Shared by every surface that offers the action, because the choice it
 * presents is the dangerous part: untracking is reversible, deleting the
 * working copy from disk is not. The checkbox resets to "keep the files" every
 * time the dialog opens so a previous decision can never be re-applied by
 * accident.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const DELETE_FROM_DISK_INPUT_ID = 'repository-delete-from-disk';

export interface RepositoryDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryName: string;
  onConfirm: (options: { deleteFromDisk: boolean }) => void;
  /** Message from a failed attempt — keeps the dialog open so it is readable. */
  error?: string;
  /** Deletion in flight. */
  busy?: boolean;
}

export function RepositoryDeleteDialog({
  open,
  onOpenChange,
  repositoryName,
  onConfirm,
  error,
  busy = false,
}: RepositoryDeleteDialogProps) {
  const { t } = useTranslation('web');
  const [deleteFromDisk, setDeleteFromDisk] = useState(false);

  useEffect(() => {
    if (open) setDeleteFromDisk(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('repositoryNode.removeConfirmTitle')}</DialogTitle>
          <DialogDescription>
            <Trans
              t={t}
              i18nKey="repositoryNode.removeConfirmDescription"
              values={{ name: repositoryName }}
              components={{ strong: <strong /> }}
            />{' '}
            {deleteFromDisk
              ? t('repositoryNode.removeConfirmDescriptionDeleteFiles')
              : t('repositoryNode.removeConfirmDescriptionKeepFiles')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Checkbox
            id={DELETE_FROM_DISK_INPUT_ID}
            checked={deleteFromDisk}
            onCheckedChange={(checked) => setDeleteFromDisk(checked === true)}
            data-testid="repository-delete-from-disk-checkbox"
            aria-label={t('repositoryNode.deleteFromDiskLabel')}
            disabled={busy}
          />
          <Label htmlFor={DELETE_FROM_DISK_INPUT_ID} className="cursor-pointer text-sm font-normal">
            {t('repositoryNode.deleteFromDiskLabel')}
          </Label>
        </div>

        {error ? (
          <p className="text-destructive text-xs" data-testid="repository-delete-error">
            {error}
          </p>
        ) : null}

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {t('repositoryNode.cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            data-testid="repository-delete-confirm-button"
            onClick={() => onConfirm({ deleteFromDisk })}
          >
            {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {t('repositoryNode.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
