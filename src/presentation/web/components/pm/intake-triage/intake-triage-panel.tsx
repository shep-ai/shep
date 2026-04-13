'use client';

import { useState, useCallback } from 'react';
import { Plus, Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { IntakeItem, WorkItem } from '@shepai/core/domain/generated/output';
import {
  createIntakeItem,
  acceptIntakeItem,
  declineIntakeItem,
  autoTriageIntakeItem,
} from '@/app/actions/manage-intake';

export interface IntakeTriagePanelProps {
  projectId: string;
  items: IntakeItem[];
  onItemsChange?: (items: IntakeItem[]) => void;
  onWorkItemCreated?: (workItem: WorkItem) => void;
  className?: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  Pending: 'default',
  Accepted: 'secondary',
  Declined: 'destructive',
  Duplicate: 'outline',
};

export function IntakeTriagePanel({
  projectId,
  items,
  onItemsChange,
  onWorkItemCreated,
  className,
}: IntakeTriagePanelProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [triagingId, setTriagingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    setLoading(true);
    const result = await createIntakeItem({
      projectId,
      title: newTitle.trim(),
      source: 'manual',
      description: newDescription.trim() || undefined,
    });
    setLoading(false);
    if (result.intakeItem) {
      onItemsChange?.([result.intakeItem, ...items]);
      setShowCreateDialog(false);
      setNewTitle('');
      setNewDescription('');
    }
  }, [newTitle, newDescription, projectId, items, onItemsChange]);

  const handleAccept = useCallback(
    async (itemId: string) => {
      setLoading(true);
      const result = await acceptIntakeItem(itemId);
      setLoading(false);
      if (result.workItem) {
        onItemsChange?.(items.filter((i) => i.id !== itemId));
        onWorkItemCreated?.(result.workItem);
      }
    },
    [items, onItemsChange, onWorkItemCreated]
  );

  const handleDecline = useCallback(async () => {
    if (!showDeclineDialog || !declineReason.trim()) return;
    setLoading(true);
    const result = await declineIntakeItem(showDeclineDialog, declineReason.trim());
    setLoading(false);
    if (!result.error) {
      onItemsChange?.(items.filter((i) => i.id !== showDeclineDialog));
      setShowDeclineDialog(null);
      setDeclineReason('');
    }
  }, [showDeclineDialog, declineReason, items, onItemsChange]);

  const handleAutoTriage = useCallback(
    async (itemId: string) => {
      setTriagingId(itemId);
      const result = await autoTriageIntakeItem(itemId);
      setTriagingId(null);
      if (result.suggestions) {
        const suggestions = result.suggestions;
        onItemsChange?.(
          items.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  suggestedPriority:
                    (suggestions.suggestedPriority as string) ?? i.suggestedPriority,
                  triageNotes: (suggestions.triageNotes as string) ?? i.triageNotes,
                  suggestedLabels:
                    suggestions.suggestedLabels != null
                      ? JSON.stringify(suggestions.suggestedLabels)
                      : i.suggestedLabels,
                }
              : i
          )
        );
      }
    },
    [items, onItemsChange]
  );

  const pendingItems = items.filter((i) => i.status === 'Pending');

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Intake Triage</h3>
          {pendingItems.length > 0 && (
            <Badge variant="secondary">{pendingItems.length} pending</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {pendingItems.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">No pending intake items</p>
      ) : (
        <div className="space-y-2">
          {pendingItems.map((item) => (
            <div key={item.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.description ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <Badge variant={STATUS_VARIANT[item.status] ?? 'outline'} className="shrink-0">
                  {item.status}
                </Badge>
              </div>

              {item.suggestedPriority || item.triageNotes ? (
                <div className="bg-muted/50 space-y-1 rounded p-2 text-xs">
                  {item.suggestedPriority ? (
                    <p>
                      <span className="font-medium">Priority:</span> {item.suggestedPriority}
                    </p>
                  ) : null}
                  {item.triageNotes ? (
                    <p>
                      <span className="font-medium">Notes:</span> {item.triageNotes}
                    </p>
                  ) : null}
                  {item.suggestedLabels ? (
                    <div className="flex flex-wrap gap-1">
                      {(JSON.parse(item.suggestedLabels) as string[]).map((label) => (
                        <Badge key={label} variant="outline" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  disabled={loading}
                  onClick={() => handleAccept(item.id)}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  disabled={loading}
                  onClick={() => setShowDeclineDialog(item.id)}
                >
                  <X className="mr-1 h-3 w-3" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={triagingId === item.id}
                  onClick={() => handleAutoTriage(item.id)}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {triagingId === item.id ? 'Triaging...' : 'AI Triage'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Intake Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Brief description of the request"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading || !newTitle.trim()}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={!!showDeclineDialog} onOpenChange={() => setShowDeclineDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Intake Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Why is this item being declined?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={loading || !declineReason.trim()}
            >
              {loading ? 'Declining...' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
