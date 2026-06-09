'use client';

/**
 * ProjectMemoryPanel — management UI for persistent project memory ("Shep Brain").
 *
 * Lists every memory entry grouped by category, with inline content editing and
 * confirmed deletion. Entries are repository-scoped, so each row shows a muted
 * repository-path label and (when present) the source feature that taught it.
 *
 * Thin presentation: all logic lives in ManageProjectMemoryUseCase, reached via
 * the manage-project-memory server actions. Local state mirrors the server
 * after each successful mutation.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Globe, FolderGit2, Pencil, Trash2 } from 'lucide-react';
import type { ProjectMemory } from '@shepai/core/domain/generated/output';
import { MemoryCategory, MemoryScope } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

export interface ProjectMemoryPanelProps {
  entries: ProjectMemory[];
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

export function ProjectMemoryPanel({ entries: initialEntries }: ProjectMemoryPanelProps) {
  const { t } = useTranslation('web');
  const [entries, setEntries] = useState<ProjectMemory[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectMemory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: entries.filter((e) => e.category === category),
    })).filter((g) => g.items.length > 0);
  }, [entries]);

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
      const result = await updateProjectMemory(id, content);
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
    const result = await deleteProjectMemory(id);
    setPendingDelete(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, [pendingDelete]);

  const toggleScope = useCallback(async (entry: ProjectMemory) => {
    const next =
      entry.scope === MemoryScope.Organization ? MemoryScope.Project : MemoryScope.Organization;
    const result = await setProjectMemoryScope(entry.id, next);
    if (result.error || !result.memory) {
      setError(result.error ?? 'Failed to update scope.');
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, scope: next } : e)));
  }, []);

  if (entries.length === 0) {
    return (
      <div
        data-testid="project-memory-empty"
        className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16 text-center"
      >
        <Brain className="size-8 opacity-50" />
        <div>
          <p className="text-sm font-medium">{t('memory.empty.title')}</p>
          <p className="text-xs">{t('memory.empty.description')}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="project-memory-panel" className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Brain className="size-5" />
        <div>
          <h1 className="text-lg font-semibold">{t('memory.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('memory.subtitle')}</p>
        </div>
      </header>

      {error ? (
        <p data-testid="project-memory-error" className="text-destructive text-xs">
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
              <li
                key={entry.id}
                data-testid="project-memory-entry"
                className="group rounded-md border p-3"
              >
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <Textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="min-h-16 text-sm"
                      data-testid="project-memory-edit-input"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        {t('memory.actions.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(entry.id)}
                        data-testid="project-memory-save"
                      >
                        {t('memory.actions.save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm">{entry.content}</p>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={
                          entry.scope === MemoryScope.Organization
                            ? t('memory.actions.makeProjectOnly')
                            : t('memory.actions.makeOrgWide')
                        }
                        onClick={() => toggleScope(entry)}
                        data-testid="project-memory-scope-toggle"
                      >
                        {entry.scope === MemoryScope.Organization ? <FolderGit2 /> : <Globe />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={t('memory.actions.edit')}
                        onClick={() => startEdit(entry)}
                        data-testid="project-memory-edit"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={t('memory.actions.delete')}
                        onClick={() => setPendingDelete(entry)}
                        data-testid="project-memory-delete"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  {entry.scope === MemoryScope.Organization ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 text-[10px]"
                      data-testid="project-memory-org-badge"
                    >
                      <Globe className="size-2.5" />
                      {t('memory.scope.organization')}
                    </Badge>
                  ) : null}
                  <span className="font-mono">{entry.repositoryPath}</span>
                  {entry.sourceFeatureId ? (
                    <Badge variant="outline" className="text-[10px]">
                      {entry.sourceFeatureId}
                    </Badge>
                  ) : null}
                </div>
              </li>
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
