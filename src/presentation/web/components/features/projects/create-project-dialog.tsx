'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PmProject } from '@shepai/core/domain/generated/output';
import { createPmProject } from '@/app/actions/create-pm-project';

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: PmProject) => void;
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createPmProject({
        name,
        identifierPrefix: prefix,
        description: description || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.project) {
        onCreated(result.project);
        setName('');
        setPrefix('');
        setDescription('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-project-dialog">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              data-testid="project-name-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-prefix">Identifier Prefix</Label>
            <Input
              id="project-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="PROJ"
              maxLength={5}
              data-testid="project-prefix-input"
            />
            <p className="text-muted-foreground text-[10px]">
              1-5 uppercase letters/numbers, used in work item identifiers (e.g., PROJ-42)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-desc">Description (optional)</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              data-testid="project-desc-input"
            />
          </div>
          {error ? (
            <p className="text-destructive text-xs" data-testid="create-project-error">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !prefix.trim() || submitting}
            data-testid="create-project-submit"
          >
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
