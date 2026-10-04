'use client';

/**
 * MemoryEntryItem — one row of the memory page: the entry's content (or its
 * edit box), the scope, edit and delete actions, and a footer naming who the
 * entry is shared with (spec 120), its repository and its source feature.
 */

import { useTranslation } from 'react-i18next';
import { Boxes, Layers, Pencil, Trash2 } from 'lucide-react';
import { MemoryScope, type ProjectMemory } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MemoryScopeMenu } from './memory-scope-menu';
import { isSpaceWideScope } from './memory-scope';
import type { MemorySpaceOption } from './memory-space-option';

export interface MemoryEntryItemProps {
  entry: ProjectMemory;
  spaces: MemorySpaceOption[];
  editing: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onScope: (scope: MemoryScope) => void;
}

function ScopeBadge({ entry, spaces }: { entry: ProjectMemory; spaces: MemorySpaceOption[] }) {
  const { t } = useTranslation('web');
  const space = spaces.find((s) => s.id === entry.spaceId);

  if (isSpaceWideScope(entry.scope)) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px]"
        data-testid="project-memory-scope-badge"
      >
        <Boxes className="size-2.5" />
        {space?.name ?? t('memory.scope.space')}
      </Badge>
    );
  }
  if (entry.scope === MemoryScope.ProductLine) {
    const line = space?.productLines.find((l) => l.id === entry.productLineId);
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px]"
        data-testid="project-memory-scope-badge"
      >
        <Layers className="size-2.5" />
        {line?.name ?? t('memory.scope.productLine')}
      </Badge>
    );
  }
  return null;
}

export function MemoryEntryItem({
  entry,
  spaces,
  editing,
  draft,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onScope,
}: MemoryEntryItemProps) {
  const { t } = useTranslation('web');

  return (
    <li data-testid="project-memory-entry" className="group rounded-md border p-3">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            aria-label={t('memory.actions.edit')}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            className="min-h-16 text-sm"
            data-testid="project-memory-edit-input"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('memory.actions.cancel')}
            </Button>
            <Button size="sm" onClick={onSave} data-testid="project-memory-save">
              {t('memory.actions.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm wrap-break-word">{entry.content}</p>
          <div className="flex shrink-0 gap-1">
            <MemoryScopeMenu scope={entry.scope} onSelect={onScope} />
            <Button
              variant="ghost"
              size="icon-xs"
              title={t('memory.actions.edit')}
              onClick={onEdit}
              data-testid="project-memory-edit"
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title={t('memory.actions.delete')}
              onClick={onDelete}
              data-testid="project-memory-delete"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <ScopeBadge entry={entry} spaces={spaces} />
        <span className="font-mono break-all">{entry.repositoryPath}</span>
        {entry.sourceFeatureId ? (
          <Badge variant="outline" className="text-[10px]">
            {entry.sourceFeatureId}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}
