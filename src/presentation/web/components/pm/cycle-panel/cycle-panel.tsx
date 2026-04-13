'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, ArrowRightLeft, Play, CheckCircle2, Clock } from 'lucide-react';
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
import type { Cycle, CycleStatus } from '@shepai/core/domain/generated/output';
import {
  createCycle,
  updateCycle,
  deleteCycle,
  transferCycleItems,
} from '@/app/actions/manage-cycles';

export interface CyclePanelProps {
  projectId: string;
  cycles: Cycle[];
  onCyclesChange?: (cycles: Cycle[]) => void;
  className?: string;
}

const STATUS_ICON: Record<string, typeof Play> = {
  Upcoming: Clock,
  Active: Play,
  Completed: CheckCircle2,
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  Active: 'default',
  Upcoming: 'secondary',
  Completed: 'outline',
};

export function CyclePanel({ projectId, cycles, onCyclesChange, className }: CyclePanelProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleStartDate, setNewCycleStartDate] = useState('');
  const [newCycleEndDate, setNewCycleEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newCycleName.trim()) return;
    setLoading(true);
    const result = await createCycle({
      projectId,
      name: newCycleName.trim(),
      startDate: newCycleStartDate || undefined,
      endDate: newCycleEndDate || undefined,
    });
    setLoading(false);
    if (result.cycle) {
      onCyclesChange?.([...cycles, result.cycle]);
      setShowCreateDialog(false);
      setNewCycleName('');
      setNewCycleStartDate('');
      setNewCycleEndDate('');
    }
  }, [newCycleName, newCycleStartDate, newCycleEndDate, projectId, cycles, onCyclesChange]);

  const handleStatusChange = useCallback(
    async (cycleId: string, status: CycleStatus) => {
      const result = await updateCycle(cycleId, { status });
      if (result.cycle) {
        onCyclesChange?.(cycles.map((c) => (c.id === cycleId ? result.cycle! : c)));
      }
    },
    [cycles, onCyclesChange]
  );

  const handleDelete = useCallback(
    async (cycleId: string) => {
      const result = await deleteCycle(cycleId);
      if (!result.error) {
        onCyclesChange?.(cycles.filter((c) => c.id !== cycleId));
      }
    },
    [cycles, onCyclesChange]
  );

  const handleTransfer = useCallback(async () => {
    if (!transferSourceId) return;
    setLoading(true);
    await transferCycleItems(transferSourceId, transferTargetId || undefined);
    setLoading(false);
    setShowTransferDialog(false);
    setTransferSourceId(null);
    setTransferTargetId('');
  }, [transferSourceId, transferTargetId]);

  const openTransferDialog = useCallback((cycleId: string) => {
    setTransferSourceId(cycleId);
    setShowTransferDialog(true);
  }, []);

  return (
    <div data-testid="cycle-panel" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Cycles</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px]"
          onClick={() => setShowCreateDialog(true)}
          data-testid="create-cycle-btn"
        >
          <Plus className="mr-1 h-3 w-3" />
          New Cycle
        </Button>
      </div>

      {cycles.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-xs">
          No cycles yet. Create a cycle to organize sprints.
        </div>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const StatusIcon = STATUS_ICON[cycle.status] ?? Clock;
            return (
              <div
                key={cycle.id}
                data-testid={`cycle-${cycle.id}`}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon className="text-muted-foreground h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{cycle.name}</span>
                  <Badge
                    variant={STATUS_VARIANT[cycle.status] ?? 'outline'}
                    className="text-[10px]"
                  >
                    {cycle.status}
                  </Badge>
                  {cycle.startDate && cycle.endDate ? (
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(cycle.startDate).toLocaleDateString()} –{' '}
                      {new Date(cycle.endDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {cycle.status !== 'Active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleStatusChange(cycle.id, 'Active' as CycleStatus)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Start
                    </Button>
                  )}
                  {cycle.status === 'Active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleStatusChange(cycle.id, 'Completed' as CycleStatus)}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Complete
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => openTransferDialog(cycle.id)}
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-6 px-2 text-[10px]"
                    onClick={() => handleDelete(cycle.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Cycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newCycleName}
                onChange={(e) => setNewCycleName(e.target.value)}
                placeholder="Sprint 1"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={newCycleStartDate}
                  onChange={(e) => setNewCycleStartDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={newCycleEndDate}
                  onChange={(e) => setNewCycleEndDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={loading}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Transfer Incomplete Items</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              Move incomplete items to another cycle, or remove them to backlog.
            </p>
            <div>
              <Label className="text-xs">Target Cycle (optional)</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Backlog (no target)" />
                </SelectTrigger>
                <SelectContent>
                  {cycles
                    .filter((c) => c.id !== transferSourceId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-7 text-xs" onClick={handleTransfer} disabled={loading}>
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
