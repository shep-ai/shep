'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link2, X, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';
import type { WorkItem } from '@shepai/core/domain/generated/output';
import { RelationType } from '@shepai/core/domain/generated/output';
import { listWorkItemRelations } from '@/app/actions/list-work-item-relations';
import { deleteWorkItemRelation } from '@/app/actions/delete-work-item-relation';
import { AddRelationDialog } from './add-relation-dialog';

const RELATION_TYPE_LABELS: Record<string, string> = {
  [RelationType.Blocking]: 'Blocking',
  [RelationType.RelatesTo]: 'Relates to',
  [RelationType.Duplicate]: 'Duplicate of',
  [RelationType.StartsBefore]: 'Starts before',
  [RelationType.FinishesBefore]: 'Finishes before',
};

export interface WorkItemRelationsPanelProps {
  workItemId: string;
  /** Map of work item ID to WorkItem for displaying linked item details */
  workItemsMap: Map<string, WorkItem>;
  /** Project prefix for displaying identifiers (e.g., 'FE') */
  projectPrefix: string;
  /** Optional pre-loaded relations to avoid an initial fetch */
  initialRelations?: WorkItemRelation[];
  className?: string;
}

export function WorkItemRelationsPanel({
  workItemId,
  workItemsMap,
  projectPrefix,
  initialRelations,
  className,
}: WorkItemRelationsPanelProps) {
  const [relations, setRelations] = useState<WorkItemRelation[]>(initialRelations ?? []);
  const [loading, setLoading] = useState(!initialRelations);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRelations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listWorkItemRelations(workItemId);
    if (result.error) {
      setError(result.error);
    } else if (result.relations) {
      setRelations(result.relations);
    }
    setLoading(false);
  }, [workItemId]);

  useEffect(() => {
    if (!initialRelations) {
      void fetchRelations();
    }
  }, [fetchRelations, initialRelations]);

  const handleDelete = async (relationId: string) => {
    setDeletingId(relationId);
    const result = await deleteWorkItemRelation(relationId);
    if (result.error) {
      setError(result.error);
    } else {
      setRelations((prev) => prev.filter((r) => r.id !== relationId));
    }
    setDeletingId(null);
  };

  const handleRelationCreated = (relation: WorkItemRelation) => {
    setRelations((prev) => [...prev, relation]);
    setShowAddDialog(false);
  };

  const grouped = groupRelationsByType(relations);

  const getLinkedItemIdentifier = (relation: WorkItemRelation): string => {
    const linkedId =
      relation.sourceWorkItemId === workItemId
        ? relation.targetWorkItemId
        : relation.sourceWorkItemId;
    const item = workItemsMap.get(linkedId);
    if (item) {
      return `${projectPrefix}-${item.sequenceId}`;
    }
    return linkedId.substring(0, 8);
  };

  const getLinkedItemTitle = (relation: WorkItemRelation): string => {
    const linkedId =
      relation.sourceWorkItemId === workItemId
        ? relation.targetWorkItemId
        : relation.sourceWorkItemId;
    const item = workItemsMap.get(linkedId);
    return item?.title ?? 'Unknown item';
  };

  return (
    <div data-testid="work-item-relations-panel" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-xs font-medium">Relations</span>
          {relations.length > 0 && (
            <span className="text-muted-foreground text-[10px]">{relations.length}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => setShowAddDialog(true)}
          data-testid="add-relation-btn"
        >
          <Plus className="mr-0.5 h-3 w-3" />
          Add
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4" data-testid="relations-loading">
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-[10px]" data-testid="relations-error">
          {error}
        </p>
      ) : null}

      {!loading && relations.length === 0 && !error && (
        <p
          className="text-muted-foreground py-2 text-center text-[10px]"
          data-testid="relations-empty"
        >
          No relations yet.
        </p>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-2" data-testid="relations-list">
          {grouped.map(({ type, items }) => (
            <div key={type} data-testid={`relation-group-${type}`}>
              <span className="text-muted-foreground mb-1 block text-[10px] font-medium">
                {RELATION_TYPE_LABELS[type] ?? type}
              </span>
              <div className="space-y-1">
                {items.map((relation) => (
                  <div
                    key={relation.id}
                    data-testid={`relation-item-${relation.id}`}
                    className="hover:bg-accent/50 flex items-center gap-2 rounded px-2 py-1 transition-colors"
                  >
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {getLinkedItemIdentifier(relation)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[11px]">
                      {getLinkedItemTitle(relation)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 shrink-0 p-0"
                      onClick={() => handleDelete(relation.id)}
                      disabled={deletingId === relation.id}
                      data-testid={`delete-relation-${relation.id}`}
                    >
                      {deletingId === relation.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRelationDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        sourceWorkItemId={workItemId}
        onCreated={handleRelationCreated}
      />
    </div>
  );
}

interface GroupedRelations {
  type: string;
  items: WorkItemRelation[];
}

function groupRelationsByType(relations: WorkItemRelation[]): GroupedRelations[] {
  const map = new Map<string, WorkItemRelation[]>();
  for (const relation of relations) {
    const arr = map.get(relation.relationType) ?? [];
    arr.push(relation);
    map.set(relation.relationType, arr);
  }
  return Array.from(map.entries()).map(([type, items]) => ({ type, items }));
}
