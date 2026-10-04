'use client';

/**
 * ProjectMemoryPanel — management UI for persistent project memory ("Shep Brain").
 *
 * Lists every memory entry grouped by category, with inline content editing and
 * confirmed deletion. Each entry belongs to a repository and can be shared with
 * its product line or whole space (spec 120); the page can be narrowed to one
 * space.
 *
 * Thin presentation: all logic lives in ManageProjectMemoryUseCase, reached via
 * the manage-project-memory server actions. Local state mirrors the server
 * after each successful mutation.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import type { MemoryScope, ProjectMemory } from '@shepai/core/domain/generated/output';
import { MemoryCategory } from '@shepai/core/domain/generated/output';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  updateProjectMemory,
  deleteProjectMemory,
  setProjectMemoryScope,
} from '@/app/actions/manage-project-memory';
import { MemoryEntryItem } from './memory-entry-item';
import { ALL_SPACES, MemorySpaceFilter } from './memory-space-filter';
import type { MemorySpaceOption } from './memory-space-option';

export interface ProjectMemoryPanelProps {
  entries: ProjectMemory[];
  /** Spaces for scope labels and the space filter (spec 120). */
  spaces?: MemorySpaceOption[];
}

/** Fixed render order + UI labels for the memory categories. */
const CATEGORY_ORDER: readonly MemoryCategory[] = [
  MemoryCategory.Convention,
  MemoryCategory.ArchitectureDecision,
  MemoryCategory.Library,
  MemoryCategory.NamingPattern,
  MemoryCategory.CiFixResolution,
];

const CATEGORY_LABEL_KEY: Record<MemoryCategory, string> = {
  [MemoryCategory.Convention]: 'memory.categories.convention',
  [MemoryCategory.ArchitectureDecision]: 'memory.categories.architectureDecision',
  [MemoryCategory.Library]: 'memory.categories.library',
  [MemoryCategory.NamingPattern]: 'memory.categories.namingPattern',
  [MemoryCategory.CiFixResolution]: 'memory.categories.ciFixResolution',
};

export function ProjectMemoryPanel({
  entries: initialEntries,
  spaces = [],
}: ProjectMemoryPanelProps) {
  const { t } = useTranslation('web');
  const [entries, setEntries] = useState<ProjectMemory[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spaceFilter, setSpaceFilter] = useState<string>(ALL_SPACES);

  const grouped = useMemo(() => {
    const visible =
      spaceFilter === ALL_SPACES ? entries : entries.filter((e) => e.spaceId === spaceFilter);
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: visible.filter((e) => e.category === category),
    })).filter((g) => g.items.length > 0);
  }, [entries, spaceFilter]);

  const startEdit = useCallback((entry: ProjectMemory) => {
    setError(null);
    setEditingId(entry.id);
    setDraft(entry.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft('');
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      const content = draft.trim();
      if (!content) {
        setError(t('memory.errors.emptyContent'));
        return;
      }
      setError(null);
      const result = await updateProjectMemory(id, content).catch((cause: unknown) => ({
        memory: undefined,
        error: cause instanceof Error ? cause.message : t('memory.errors.updateFailed'),
      }));
      if (result.error || !result.memory) {
        setError(result.error ?? t('memory.errors.updateFailed'));
        return;
      }
      const updated = result.memory;
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
      setDraft('');
    },
    [draft, t]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setError(null);
    const result = await deleteProjectMemory(id).catch((cause: unknown) => ({
      error: cause instanceof Error ? cause.message : 'Unable to delete memory. Try again.',
    }));
    setPendingDelete(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, [pendingDelete]);

  const changeScope = useCallback(
    async (entry: ProjectMemory, scope: MemoryScope) => {
      setError(null);
      const result = await setProjectMemoryScope(entry.id, scope).catch((cause: unknown) => ({
        memory: undefined,
        error: cause instanceof Error ? cause.message : t('memory.errors.scopeFailed'),
      }));
      if (result.error || !result.memory) {
        setError(result.error ?? t('memory.errors.scopeFailed'));
        return;
      }
      const updated = result.memory;
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    },
    [t]
  );

  return (
    <div data-testid="project-memory-panel" className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Brain className="size-5" />
        <div>
          <h1 className="text-lg font-semibold">{t('memory.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('memory.subtitle')}</p>
        </div>
      </header>

      <MemorySpaceFilter spaces={spaces} value={spaceFilter} onChange={setSpaceFilter} />

      {entries.length === 0 ? (
        <div
          data-testid="project-memory-empty"
          className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16 text-center"
        >
          <Brain aria-hidden="true" className="size-8" />
          <div className="space-y-1">
            <h2 className="text-foreground text-sm font-medium">{t('memory.empty.title')}</h2>
            <p className="text-sm">{t('memory.empty.description')}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" data-testid="project-memory-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {grouped.map(({ category, items }) => (
        <section key={category} className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t(CATEGORY_LABEL_KEY[category])}
          </h2>
          <ul className="space-y-2">
            {items.map((entry) => (
              <MemoryEntryItem
                key={entry.id}
                entry={entry}
                spaces={spaces}
                editing={editingId === entry.id}
                draft={draft}
                onDraftChange={setDraft}
                onEdit={() => startEdit(entry)}
                onCancel={cancelEdit}
                onSave={() => saveEdit(entry.id)}
                onDelete={() => setPendingDelete(entry)}
                onScope={(scope) => changeScope(entry, scope)}
              />
            ))}
          </ul>
        </section>
      ))}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('memory.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('memory.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('memory.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              data-testid="project-memory-delete-confirm"
            >
              {t('memory.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
