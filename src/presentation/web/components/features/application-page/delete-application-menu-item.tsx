'use client';

/**
 * DeleteApplicationMenuItem — destructive entry for the AppOverflowMenu.
 *
 * Mirrors the standalone DeleteButton's behavior (confirm dialog + toast +
 * redirect) but renders as a DropdownMenuItem so it sits cleanly inside
 * the `⋯` overflow menu instead of as a free-floating icon button in the
 * top bar.
 */

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { deleteApplication } from '@/app/actions/delete-application';

export interface DeleteApplicationMenuItemProps {
  applicationId: string;
  applicationName: string;
}

export function DeleteApplicationMenuItem({
  applicationId,
  applicationName,
}: DeleteApplicationMenuItemProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          // Stop the menu from closing on select so the dialog can take
          // focus cleanly. Radix re-opens the dialog after the menu
          // dismiss otherwise, leading to a flicker.
          event.preventDefault();
          setConfirmOpen(true);
        }}
        className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
      >
        <Trash2 className="size-3.5" />
        <span>Delete app…</span>
      </DropdownMenuItem>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{applicationName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
            <DialogClose asChild>
              <Button variant="outline" className="cursor-pointer">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                setConfirmOpen(false);
                const result = await deleteApplication(applicationId);
                if (result.error) {
                  toast.error('Failed to delete', { description: result.error });
                } else {
                  toast.success('Application deleted');
                  router.push('/applications');
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
