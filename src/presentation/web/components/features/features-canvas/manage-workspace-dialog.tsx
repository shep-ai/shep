'use client';

import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { Workspace } from '@/hooks/use-workspaces';

export interface ManageWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  /** All nodes currently on the canvas (unfiltered). */
  allNodes: CanvasNodeType[];
  onSave: (members: { repoIds: string[]; featureIds: string[] }) => void;
}

interface RepoEntry {
  nodeId: string;
  name: string;
  features: { nodeId: string; name: string }[];
}

export function ManageWorkspaceDialog({
  open,
  onOpenChange,
  workspace,
  allNodes,
  onSave,
}: ManageWorkspaceDialogProps) {
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());

  // Reset selection state whenever the dialog opens for a (possibly different) workspace.
  useEffect(() => {
    if (open) {
      setSelectedRepoIds(new Set(workspace.repoIds));
      setSelectedFeatureIds(new Set(workspace.featureIds));
    }
  }, [open, workspace]);

  // Group features under their parent repo by repositoryPath.
  const repoEntries = useMemo<RepoEntry[]>(() => {
    const repos: RepoEntry[] = [];
    const byPath = new Map<string, RepoEntry>();

    for (const node of allNodes) {
      if (node.type !== 'repositoryNode') continue;
      const data = node.data as RepositoryNodeData;
      const path = data.repositoryPath ?? '';
      const entry: RepoEntry = {
        nodeId: node.id,
        name: data.name ?? path.split('/').filter(Boolean).pop() ?? path,
        features: [],
      };
      repos.push(entry);
      byPath.set(path, entry);
    }

    for (const node of allNodes) {
      if (node.type !== 'featureNode') continue;
      const data = node.data as FeatureNodeData;
      const repo = byPath.get(data.repositoryPath ?? '');
      if (repo) {
        repo.features.push({ nodeId: node.id, name: data.name });
      }
    }

    return repos;
  }, [allNodes]);

  const toggleRepo = (id: string) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      repoIds: Array.from(selectedRepoIds),
      featureIds: Array.from(selectedFeatureIds),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage workspace: {workspace.name}</DialogTitle>
          <DialogDescription>
            Select the repositories and features that should appear on this workspace's canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 max-h-[50vh] overflow-y-auto px-6">
          {repoEntries.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No repositories on the canvas yet.
            </p>
          ) : (
            <ul className="space-y-3 py-2">
              {repoEntries.map((repo) => (
                <li key={repo.nodeId}>
                  <label className="hover:bg-accent/30 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5">
                    <Checkbox
                      checked={selectedRepoIds.has(repo.nodeId)}
                      onCheckedChange={() => toggleRepo(repo.nodeId)}
                    />
                    <GitBranch className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-medium">{repo.name}</span>
                  </label>
                  {repo.features.length > 0 ? (
                    <ul className="mt-1 ml-7 space-y-0.5">
                      {repo.features.map((feat) => (
                        <li key={feat.nodeId}>
                          <label className="hover:bg-accent/30 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1">
                            <Checkbox
                              checked={selectedFeatureIds.has(feat.nodeId)}
                              onCheckedChange={() => toggleFeature(feat.nodeId)}
                            />
                            <Sparkles className="text-muted-foreground h-3.5 w-3.5" />
                            <span className="text-muted-foreground text-xs">{feat.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
