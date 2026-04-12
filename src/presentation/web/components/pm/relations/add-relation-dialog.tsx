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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RelationType } from '@shepai/core/domain/generated/output';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';
import { createWorkItemRelation } from '@/app/actions/create-work-item-relation';

const RELATION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: RelationType.Blocking, label: 'Blocking' },
  { value: RelationType.RelatesTo, label: 'Relates to' },
  { value: RelationType.Duplicate, label: 'Duplicate' },
  { value: RelationType.StartsBefore, label: 'Starts before' },
  { value: RelationType.FinishesBefore, label: 'Finishes before' },
];

export interface AddRelationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceWorkItemId: string;
  onCreated: (relation: WorkItemRelation) => void;
}

export function AddRelationDialog({
  open,
  onOpenChange,
  sourceWorkItemId,
  onCreated,
}: AddRelationDialogProps) {
  const [relationType, setRelationType] = useState<string>(RelationType.RelatesTo);
  const [targetWorkItemId, setTargetWorkItemId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!targetWorkItemId.trim()) {
      setError('Target work item ID is required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createWorkItemRelation({
        sourceWorkItemId,
        targetWorkItemId: targetWorkItemId.trim(),
        relationType,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.relation) {
        onCreated(result.relation);
        setTargetWorkItemId('');
        setRelationType(RelationType.RelatesTo);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-relation-dialog">
        <DialogHeader>
          <DialogTitle>Add Relation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="relation-type">Relation Type</Label>
            <Select value={relationType} onValueChange={setRelationType}>
              <SelectTrigger data-testid="relation-type-select">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {RELATION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-work-item">Target Work Item ID</Label>
            <Input
              id="target-work-item"
              value={targetWorkItemId}
              onChange={(e) => setTargetWorkItemId(e.target.value)}
              placeholder="Enter work item ID or identifier"
              data-testid="target-work-item-input"
            />
          </div>
          {error ? (
            <p className="text-destructive text-xs" data-testid="add-relation-error">
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
            disabled={!targetWorkItemId.trim() || submitting}
            data-testid="add-relation-submit"
          >
            {submitting ? 'Adding...' : 'Add Relation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
