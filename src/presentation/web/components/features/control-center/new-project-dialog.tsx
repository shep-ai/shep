'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createProjectFolder } from '@/app/actions/create-project-folder';

export interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the absolute path of the newly-created project folder. */
  onCreated: (path: string) => void;
}

export function NewProjectDialog({ open, onOpenChange, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    const result = await createProjectFolder(trimmed);
    if (!result.ok || !result.path) {
      setError(result.error ?? 'Failed to create project.');
      setBusy(false);
      return;
    }

    // Hand the new path off to the empty state's existing add-repo flow.
    onCreated(result.path);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Create an empty project folder inside your Shep home directory. Git will be
              initialised automatically when the project is added.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="my-prototype"
              disabled={busy}
              data-testid="new-project-name-input"
            />
            {error ? (
              <p className="text-destructive mt-2 text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create project'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
