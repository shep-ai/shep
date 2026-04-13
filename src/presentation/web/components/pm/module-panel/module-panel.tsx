'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
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
import type { PmModule } from '@shepai/core/domain/generated/output';
import { createModule, deleteModule } from '@/app/actions/manage-modules';

export interface ModulePanelProps {
  projectId: string;
  modules: PmModule[];
  onModulesChange?: (modules: PmModule[]) => void;
  className?: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  InProgress: 'default',
  Planned: 'secondary',
  Completed: 'outline',
  Backlog: 'outline',
  Paused: 'secondary',
  Cancelled: 'destructive',
};

export function ModulePanel({ projectId, modules, onModulesChange, className }: ModulePanelProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleDescription, setNewModuleDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newModuleName.trim()) return;
    setLoading(true);
    const result = await createModule({
      projectId,
      name: newModuleName.trim(),
      description: newModuleDescription.trim() || undefined,
    });
    setLoading(false);
    if (result.module) {
      onModulesChange?.([...modules, result.module]);
      setShowCreateDialog(false);
      setNewModuleName('');
      setNewModuleDescription('');
    }
  }, [newModuleName, newModuleDescription, projectId, modules, onModulesChange]);

  const handleDelete = useCallback(
    async (moduleId: string) => {
      const result = await deleteModule(moduleId);
      if (!result.error) {
        onModulesChange?.(modules.filter((m) => m.id !== moduleId));
      }
    },
    [modules, onModulesChange]
  );

  return (
    <div data-testid="module-panel" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Modules</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px]"
          onClick={() => setShowCreateDialog(true)}
          data-testid="create-module-btn"
        >
          <Plus className="mr-1 h-3 w-3" />
          New Module
        </Button>
      </div>

      {modules.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-xs">
          No modules yet. Create a module to group related work items.
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => (
            <div
              key={mod.id}
              data-testid={`module-${mod.id}`}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <Package className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-xs font-medium">{mod.name}</span>
                <Badge variant={STATUS_VARIANT[mod.status] ?? 'outline'} className="text-[10px]">
                  {mod.status}
                </Badge>
                {mod.description ? (
                  <span className="text-muted-foreground max-w-[200px] truncate text-[10px]">
                    {mod.description}
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-6 px-2 text-[10px]"
                onClick={() => handleDelete(mod.id)}
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
            <DialogTitle className="text-sm">Create Module</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder="Authentication"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={newModuleDescription}
                onChange={(e) => setNewModuleDescription(e.target.value)}
                placeholder="User login, signup, and session management"
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
