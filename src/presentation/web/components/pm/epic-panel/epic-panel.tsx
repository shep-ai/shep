'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Epic, EpicStatus } from '@shepai/core/domain/generated/output';
import { createEpic, updateEpic, deleteEpic } from '@/app/actions/manage-epics';

export interface EpicPanelProps {
  projectId: string;
  epics: Epic[];
  onEpicsChange?: (epics: Epic[]) => void;
  className?: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  InProgress: 'default',
  Planned: 'secondary',
  Completed: 'outline',
  Backlog: 'outline',
  Cancelled: 'destructive',
};

const EPIC_STATUSES: EpicStatus[] = [
  'Backlog' as EpicStatus,
  'Planned' as EpicStatus,
  'InProgress' as EpicStatus,
  'Completed' as EpicStatus,
  'Cancelled' as EpicStatus,
];

export function EpicPanel({ projectId, epics, onEpicsChange, className }: EpicPanelProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const result = await createEpic({
      projectId,
      name: newName.trim(),
      description: newDescription.trim() || undefined,
    });
    setLoading(false);
    if (result.epic) {
      onEpicsChange?.([...epics, result.epic]);
      setShowCreateDialog(false);
      setNewName('');
      setNewDescription('');
    }
  }, [newName, newDescription, projectId, epics, onEpicsChange]);

  const handleStatusChange = useCallback(
    async (epicId: string, status: EpicStatus) => {
      const result = await updateEpic(epicId, { status });
      if (result.epic) {
        onEpicsChange?.(epics.map((e) => (e.id === result.epic!.id ? result.epic! : e)));
      }
    },
    [epics, onEpicsChange]
  );

  const handleDelete = useCallback(
    async (epicId: string) => {
      const result = await deleteEpic(epicId);
      if (!result.error) {
        onEpicsChange?.(epics.filter((e) => e.id !== epicId));
      }
    },
    [epics, onEpicsChange]
  );

  return (
    <div data-testid="epic-panel" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Epics</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px]"
          onClick={() => setShowCreateDialog(true)}
          data-testid="create-epic-btn"
        >
          <Plus className="mr-1 h-3 w-3" />
          New Epic
        </Button>
      </div>

      {epics.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-xs">
          No epics yet. Create an epic to group related work items.
        </div>
      ) : (
        <div className="space-y-2">
          {epics.map((epic) => (
            <div
              key={epic.id}
              data-testid={`epic-${epic.id}`}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <Layers className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-xs font-medium">{epic.name}</span>
                <Select
                  value={epic.status}
                  onValueChange={(v) => handleStatusChange(epic.id, v as EpicStatus)}
                >
                  <SelectTrigger className="h-5 w-auto gap-1 border-none p-0 text-[10px]">
                    <Badge
                      variant={STATUS_VARIANT[epic.status] ?? 'outline'}
                      className="text-[10px]"
                    >
                      <SelectValue />
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {EPIC_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {epic.description ? (
                  <span className="text-muted-foreground max-w-[200px] truncate text-[10px]">
                    {epic.description}
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-6 px-2 text-[10px]"
                onClick={() => handleDelete(epic.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Epic</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="User Authentication"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="All auth-related work items"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={loading}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
