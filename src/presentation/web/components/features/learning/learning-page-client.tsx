'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adoptHarnessVersion, rejectHarnessVersion, rollbackHarness } from '@/app/actions/learning';
import type { ActionOutcome } from '@/lib/action-outcome';
import { HarnessVersionList } from './harness-version-list';
import { HarnessVersionDetailView } from './harness-version-detail';
import { HarnessLessonsList } from './harness-lessons-list';
import {
  learningHref,
  shortId,
  type HarnessHistory,
  type HarnessVersionDetail,
  type LearningRepositoryOption,
} from './learning-types';

export interface LearningPageClientProps {
  repositories: readonly LearningRepositoryOption[];
  history?: HarnessHistory;
  detail?: HarnessVersionDetail;
  loadError?: string;
}

/**
 * The Learning page (spec 150): a repository's learned-harness versions with
 * their outcome metrics and regression flags, one version's diff and edit
 * verdicts, the lessons learned, and adopt / reject / rollback.
 */
export function LearningPageClient({
  repositories,
  history,
  detail,
  loadError,
}: LearningPageClientProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmRollback, setConfirmRollback] = useState(false);
  const repo = history?.repositoryPath;

  function run(action: () => Promise<ActionOutcome>, done: string) {
    startTransition(async () => {
      const outcome = await action();
      if (outcome.ok) {
        toast.success(done);
        router.refresh();
      } else toast.error(outcome.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4" data-testid="learning-page">
      <header className="flex flex-wrap items-center gap-3">
        <GraduationCap className="text-muted-foreground h-5 w-5" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t('learning.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('learning.subtitle')}</p>
        </div>
        {repositories.length > 0 ? (
          <Select value={repo} onValueChange={(path) => router.push(learningHref(path))}>
            <SelectTrigger
              className="ml-auto w-56 text-xs"
              data-testid="learning-repository"
              aria-label={t('learning.repository')}
            >
              <SelectValue placeholder={t('learning.chooseRepository')} />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((r) => (
                <SelectItem key={r.path} value={r.path}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </header>

      {loadError ? (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700" role="alert">
          {t('learning.loadError', { error: loadError })}
        </p>
      ) : null}
      {repositories.length === 0 && !loadError ? (
        <p className="text-muted-foreground text-sm" data-testid="learning-no-repositories">
          {t('learning.noRepositories')}
        </p>
      ) : null}

      {history && repo ? (
        <>
          <div className="bg-background flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
            <span data-testid="learning-current">
              {history.currentVersionId
                ? t('learning.current', { id: shortId(history.currentVersionId) })
                : t('learning.currentNone')}
            </span>
            {history.currentVersionId ? (
              confirmRollback ? (
                <span className="ml-auto flex items-center gap-2 text-xs">
                  {t('learning.rollbackConfirm')}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    data-testid="learning-rollback-confirm"
                    onClick={() => {
                      setConfirmRollback(false);
                      run(() => rollbackHarness(repo), t('learning.rolledBack'));
                    }}
                  >
                    {t('learning.rollback')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRollback(false)}>
                    {t('learning.cancel')}
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={isPending}
                  data-testid="learning-rollback"
                  onClick={() => setConfirmRollback(true)}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                  {t('learning.rollback')}
                </Button>
              )
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="bg-background rounded-lg border">
              <h2 className="border-b px-4 py-2 text-xs font-semibold">{t('learning.versions')}</h2>
              <HarnessVersionList
                versions={history.versions}
                {...(detail ? { selectedId: detail.version.id } : {})}
                hrefFor={(id) => learningHref(repo, id)}
              />
            </div>
            <div className="bg-background rounded-lg border">
              {detail ? (
                <HarnessVersionDetailView
                  detail={detail}
                  busy={isPending}
                  onAdopt={() =>
                    run(() => adoptHarnessVersion(detail.version.id), t('learning.adopted'))
                  }
                  onReject={(feedback) =>
                    run(
                      () => rejectHarnessVersion(detail.version.id, feedback || undefined),
                      t('learning.rejected')
                    )
                  }
                />
              ) : (
                <p className="text-muted-foreground px-4 py-6 text-sm">
                  {t('learning.selectVersion')}
                </p>
              )}
            </div>
          </div>

          <div className="bg-background rounded-lg border">
            <h2 className="border-b px-4 py-2 text-xs font-semibold">{t('learning.lessons')}</h2>
            <HarnessLessonsList lessons={history.lessons} />
          </div>
        </>
      ) : null}
    </div>
  );
}
