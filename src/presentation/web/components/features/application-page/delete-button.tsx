'use client';

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
import { deleteApplication } from '@/app/actions/delete-application';

export interface DeleteButtonProps {
  applicationId: string;
  applicationName: string;
}

export function DeleteButton({ applicationId, applicationName }: DeleteButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmOpen(true)}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 w-7 cursor-pointer transition-colors"
        aria-label="Delete application"
        title="Delete application"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
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
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
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
