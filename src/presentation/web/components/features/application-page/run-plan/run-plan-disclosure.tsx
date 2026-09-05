'use client';

/**
 * Collapsed-by-default "Run plan" disclosure inside the preview tab.
 *
 * Placed here, beside the streamed logs and the status badge, because "this
 * started the wrong thing" and "fix what it starts" should be one scroll
 * apart rather than one navigation apart. Collapsed it costs nothing visually
 * for the common case where the plan is simply correct, and it needs no new
 * route and no change to the shared status badge's compact contract.
 *
 * The plan is fetched on first expand rather than on mount — a user who never
 * opens it should not pay a query for it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Pencil, RefreshCw } from 'lucide-react';

import type { DeploymentTargetType } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { RunPlanEditor, type RunPlanEditorValues } from './run-plan-editor';
import { RunPlanSummary } from './run-plan-summary';
import { useRunPlan } from './use-run-plan';

export interface RunPlanDisclosureProps {
  targetType: DeploymentTargetType;
  targetId: string;
  /** Expanded from the start — used by stories and deep links, not by default. */
  defaultOpen?: boolean;
  /** Opens straight into the editor. Stories use it to pin the editing state. */
  defaultEditing?: boolean;
}

export function RunPlanDisclosure({
  targetType,
  targetId,
  defaultOpen = false,
  defaultEditing = false,
}: RunPlanDisclosureProps) {
  const { t } = useTranslation('web');
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(defaultEditing);

  const runPlan = useRunPlan(
    { targetType, targetId },
    {
      loadFailed: t('runPlan.errors.loadFailed'),
      saveFailed: t('runPlan.errors.saveFailed'),
      reanalyzeFailed: t('runPlan.errors.reanalyzeFailed'),
    }
  );

  const { load, loaded, loading } = runPlan;

  // Fetch on the first expand, not on mount: a user who never opens the
  // disclosure should not pay a query for it. Re-expanding reuses what we
  // already have — Re-analyze is the explicit way to ask again.
  useEffect(() => {
    if (open && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  const toggle = useCallback(() => setOpen((wasOpen) => !wasOpen), []);

  const handleSubmit = useCallback(
    async (values: RunPlanEditorValues) => {
      const accepted = await runPlan.save(values);
      if (accepted) setEditing(false);
    },
    [runPlan]
  );

  const handleCancel = useCallback(() => {
    runPlan.clearSaveErrors();
    setEditing(false);
  }, [runPlan]);

  const handleReanalyze = useCallback(async () => {
    await runPlan.reanalyze();
    setEditing(false);
  }, [runPlan]);

  return (
    <section
      data-testid="run-plan-disclosure"
      className="border-border bg-background shrink-0 border-t"
    >
      <button
        type="button"
        onClick={toggle}
        data-testid="run-plan-toggle"
        aria-expanded={open}
        aria-label={open ? t('runPlan.hide') : t('runPlan.show')}
        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-xs font-medium transition-colors"
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        <span>{t('runPlan.title')}</span>
        <span className="text-muted-foreground/70 truncate font-normal">
          {t('runPlan.description')}
        </span>
      </button>

      {open ? (
        <div data-testid="run-plan-body" className="flex flex-col gap-3 px-3 pb-3">
          {loading ? (
            <p
              data-testid="run-plan-loading"
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <Loader2 className="size-3 animate-spin" />
              {t('runPlan.loading')}
            </p>
          ) : runPlan.loadError ? (
            <p data-testid="run-plan-load-error" className="text-destructive text-xs">
              {runPlan.loadError}
            </p>
          ) : editing ? (
            <RunPlanEditor
              plan={runPlan.plan}
              repoConfigControlled={runPlan.repoConfigControlled}
              submitting={runPlan.saving}
              errors={runPlan.validationErrors}
              errorMessage={runPlan.saveError}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          ) : (
            <>
              <RunPlanSummary
                plan={runPlan.plan}
                repoConfigControlled={runPlan.repoConfigControlled}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleReanalyze}
                  disabled={runPlan.reanalyzing}
                  data-testid="run-plan-reanalyze"
                >
                  {runPlan.reanalyzing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {runPlan.reanalyzing
                    ? t('runPlan.actions.reanalyzing')
                    : t('runPlan.actions.reanalyze')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setEditing(true)}
                  disabled={runPlan.repoConfigControlled}
                  data-testid="run-plan-edit"
                >
                  <Pencil className="size-3" />
                  {t('runPlan.actions.edit')}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
