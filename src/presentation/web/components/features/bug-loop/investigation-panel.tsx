'use client';

/**
 * InvestigationPanel — the bug loop on a work item page (spec 123). Pick a
 * repository and an agent reads it in a throwaway read-only copy, then ranks
 * root-cause hypotheses; "Fix this" turns one into a feature that writes the
 * failing test first.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { SearchCode } from 'lucide-react';
import {
  InvestigationStatus,
  type WorkItemInvestigation,
} from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import { approveHypothesis, startInvestigation } from '@/app/actions/bug-loop';
import { HypothesisCard } from './hypothesis-card';
import { isInvestigationOpen, useInvestigation } from './use-investigation';

export interface RepositoryOption {
  path: string;
  name: string;
}

export interface InvestigationPanelProps {
  workItemId: string;
  repositories: RepositoryOption[];
  initialInvestigation?: WorkItemInvestigation;
}

export function InvestigationPanel({
  workItemId,
  repositories,
  initialInvestigation,
}: InvestigationPanelProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const { investigation, setInvestigation, error, setError, refresh } = useInvestigation(
    workItemId,
    initialInvestigation
  );
  const [repositoryPath, setRepositoryPath] = useState(
    initialInvestigation?.repositoryPath ?? repositories[0]?.path ?? ''
  );
  const [fullSpec, setFullSpec] = useState(false);
  const [busy, setBusy] = useState<'investigate' | number>();

  const open = isInvestigationOpen(investigation);
  const completed = investigation?.status === InvestigationStatus.Completed;
  const canFix = completed && !investigation?.featureId;

  async function investigate() {
    setBusy('investigate');
    setError(undefined);
    const result = await startInvestigation({ workItemId, repositoryPath });
    setBusy(undefined);
    if (result.ok) setInvestigation(result.investigation);
    else setError(result.error);
  }

  async function fix(number: number) {
    if (!investigation) return;
    setBusy(number);
    setError(undefined);
    const result = await approveHypothesis({
      workItemId,
      investigationId: investigation.id,
      hypothesis: number,
      fullSpec,
    });
    setBusy(undefined);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
    router.refresh();
  }

  return (
    <section data-testid="investigation-panel" className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <SearchCode className="text-muted-foreground size-4" />
        <h2 className="text-sm font-semibold">{t('bugLoop.title')}</h2>
        {investigation ? (
          <Badge variant="outline" className="text-[10px]">
            {t(`bugLoop.status.${investigation.status}`)}
          </Badge>
        ) : null}
      </header>

      {open ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {repositories.length > 0 ? (
            <select
              aria-label={t('bugLoop.repository')}
              className={NATIVE_SELECT_CLASS}
              value={repositoryPath}
              onChange={(event) => setRepositoryPath(event.target.value)}
            >
              {repositories.map((repository) => (
                <option key={repository.path} value={repository.path}>
                  {repository.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-muted-foreground text-xs">{t('bugLoop.noRepositories')}</p>
          )}
          <Button
            size="sm"
            variant={investigation ? 'outline' : 'default'}
            disabled={!repositoryPath || busy !== undefined}
            onClick={() => void investigate()}
          >
            {t(investigation ? 'bugLoop.investigateAgain' : 'bugLoop.investigate')}
          </Button>
        </div>
      )}

      {!investigation && !error ? (
        <p className="text-muted-foreground text-xs">{t('bugLoop.intro')}</p>
      ) : null}

      {open && investigation ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Spinner size="sm" />
          {t('bugLoop.running', { repository: investigation.repositoryPath })}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      {investigation?.error ? (
        <p role="alert" className="text-destructive text-xs">
          {investigation.error}
        </p>
      ) : null}
      {investigation?.summary ? <p className="text-sm">{investigation.summary}</p> : null}

      {investigation?.featureId ? (
        <p className="text-xs">
          {t('bugLoop.approved', { number: investigation.approvedHypothesisNumber })}{' '}
          <Link className="underline" href={`/feature/${investigation.featureId}`}>
            {t('bugLoop.openFeature')}
          </Link>
        </p>
      ) : null}

      {canFix ? (
        <label className="flex items-center gap-2 text-xs">
          <Switch size="sm" checked={fullSpec} onCheckedChange={setFullSpec} />
          {t('bugLoop.fullSpec')}
        </label>
      ) : null}

      {investigation && !open
        ? investigation.hypotheses.map((hypothesis) => (
            <HypothesisCard
              key={hypothesis.number}
              hypothesis={hypothesis}
              canFix={canFix}
              approved={investigation.approvedHypothesisNumber === hypothesis.number}
              fixing={busy === hypothesis.number}
              disabled={busy !== undefined}
              onFix={() => void fix(hypothesis.number)}
            />
          ))
        : null}
    </section>
  );
}
