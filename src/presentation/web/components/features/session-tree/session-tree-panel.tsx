'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Archive, ArchiveX, ListTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { loadSessionTree } from '@/app/actions/session-tree';
import type { SessionTreeRepository } from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';
import {
  SessionTreeFeatureRow,
  SessionTreeRepositoryRow,
  SessionTreeSessionRow,
} from './session-tree-node';
import { SessionTreeActions } from './session-tree-actions';

/**
 * The Control Center's second sidenav: a Repository → feature → session tree.
 *
 * All joining and the adopted/unadopted determination happen in
 * BuildSessionTreeUseCase — this component renders what it returns and owns
 * only expand/collapse state.
 */
export function SessionTreePanel({ className }: { className?: string }) {
  const { t } = useTranslation('web');
  const router = useRouter();

  const [repositories, setRepositories] = useState<SessionTreeRepository[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  // Repositories start expanded — the tree is open by default.
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());
  const [openFeatures, setOpenFeatures] = useState<Set<string>>(new Set());

  const load = useCallback(async (includeArchived: boolean) => {
    setLoading(true);
    setError('');
    const result = await loadSessionTree({ includeArchived });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setRepositories([]);
      return;
    }
    const repos = result.repositories ?? [];
    setRepositories(repos);
    setArchivedCount(result.archivedCount ?? 0);
    // Features with adopted sessions start expanded so the nesting is visible.
    setOpenFeatures(
      new Set(
        repos.flatMap((repo) => repo.features.filter((f) => f.sessions.length > 0).map((f) => f.id))
      )
    );
  }, []);

  useEffect(() => {
    void load(showArchived);
  }, [load, showArchived]);

  function toggleRepo(path: string) {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleFeature(id: string) {
    setOpenFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const archivedLabel = showArchived
    ? t('sessionTree.hideArchived')
    : t('sessionTree.showArchived');

  return (
    <div
      className={cn('bg-sidebar flex h-full min-h-0 flex-col border-e', className)}
      data-testid="session-tree-panel"
    >
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <ListTree className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-sm font-semibold">{t('sessionTree.title')}</span>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={archivedLabel}
          title={archivedLabel}
          onClick={() => setShowArchived((v) => !v)}
          data-testid="session-tree-toggle-archived"
        >
          {showArchived ? (
            <ArchiveX className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={t('sessionTree.refresh')}
          title={t('sessionTree.refresh')}
          onClick={() => void load(showArchived)}
          data-testid="session-tree-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div
          className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs"
          data-testid="session-tree-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('sessionTree.loading')}
        </div>
      ) : error ? (
        <div
          className="text-destructive flex-1 px-3 py-4 text-center text-xs"
          data-testid="session-tree-error"
        >
          {error}
        </div>
      ) : repositories.length === 0 ? (
        <div
          className="text-muted-foreground flex-1 px-3 py-4 text-center text-xs"
          data-testid="session-tree-empty"
        >
          {t('sessionTree.empty')}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {repositories.map((repo) => {
              const open = !collapsedRepos.has(repo.path);

              return (
                <div key={repo.path} className="flex flex-col">
                  <SessionTreeRepositoryRow
                    repository={repo}
                    open={open}
                    onToggle={() => toggleRepo(repo.path)}
                  />

                  {open ? (
                    <>
                      {repo.features.map((feature) => (
                        <div key={feature.id} className="flex flex-col">
                          <SessionTreeFeatureRow
                            feature={feature}
                            level={1}
                            open={openFeatures.has(feature.id)}
                            onToggle={() => toggleFeature(feature.id)}
                            onSelect={(id) => router.push(`/features/${id}`)}
                          />
                          {openFeatures.has(feature.id)
                            ? feature.sessions.map((session) => (
                                <SessionTreeSessionRow
                                  key={session.id}
                                  session={session}
                                  level={2}
                                  actions={
                                    <SessionTreeActions
                                      session={session}
                                      onChanged={() => void load(showArchived)}
                                    />
                                  }
                                />
                              ))
                            : null}
                        </div>
                      ))}

                      {repo.unadoptedSessions.length > 0 ? (
                        <>
                          <span className="text-muted-foreground ps-4 pt-1 text-[10px] uppercase">
                            {t('sessionTree.notConverted')}
                          </span>
                          {repo.unadoptedSessions.map((session) => (
                            <SessionTreeSessionRow
                              key={session.id}
                              session={session}
                              level={1}
                              actions={
                                <SessionTreeActions
                                  session={session}
                                  onChanged={() => void load(showArchived)}
                                />
                              }
                            />
                          ))}
                        </>
                      ) : null}

                      {repo.sessionCount === 0 ? (
                        <span className="text-muted-foreground py-1 ps-4 text-[10px]">
                          {t('sessionTree.noSessions')}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {!loading && !error && archivedCount > 0 && !showArchived ? (
        <div className="text-muted-foreground border-t px-3 py-1.5 text-[10px]">
          {t('sessionTree.archivedHidden', { count: archivedCount })}
        </div>
      ) : null}
    </div>
  );
}
