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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { createWorkItem } from '@/app/actions/create-work-item';

export interface CreateWorkItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  states: WorkItemState[];
  onCreated: (workItem: WorkItem) => void;
  /** Optional parent work item ID for creating sub-items */
  parentId?: string;
}

export function CreateWorkItemDialog({
  open,
  onOpenChange,
  projectId,
  states,
  onCreated,
  parentId,
}: CreateWorkItemDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState<string>('');
  const [priority, setPriority] = useState<string>('None');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createWorkItem({
        projectId,
        title,
        description: description || undefined,
        stateId: stateId || undefined,
        priority: priority || undefined,
        parentId: parentId ?? undefined,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.workItem) {
        onCreated(result.workItem);
        setTitle('');
        setDescription('');
        setStateId('');
        setPriority('None');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-work-item-dialog">
        <DialogHeader>
          <DialogTitle>{parentId ? 'Create Sub-item' : 'Create Work Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="work-item-title">Title</Label>
            <Input
              id="work-item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              data-testid="work-item-title-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-item-desc">Description (optional)</Label>
            <Textarea
              id="work-item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              data-testid="work-item-desc-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={stateId} onValueChange={setStateId}>
                <SelectTrigger data-testid="work-item-state-select">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="work-item-priority-select">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error ? (
            <p className="text-destructive text-xs" data-testid="create-work-item-error">
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
            disabled={!title.trim() || submitting}
            data-testid="create-work-item-submit"
          >
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
