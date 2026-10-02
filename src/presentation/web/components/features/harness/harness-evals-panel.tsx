'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { HarnessEvalRunStatus } from '@shepai/core/domain/generated/output';
import type { HarnessEvalReport } from '@shepai/core/application/use-cases/harness/harness-eval-report.use-cases';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getHarnessEvalReport,
  listHarnessEvals,
  type HarnessEvalListing,
} from '@/app/actions/harness-queries';
import { startHarnessEval } from '@/app/actions/harness-commands';
import { HarnessEnumSelect } from '@/components/features/settings/harness-settings-controls';
import { cn } from '@/lib/utils';

/** How often an unfinished run's report is refreshed. */
const POLL_MS = 3000;
const PERCENT_SCORES = new Set(['success', 'evidenceRecall', 'toolOutputRatio']);

export interface HarnessEvalsPanelProps {
  initial: HarnessEvalListing;
  repoRoot?: string;
}

function formatScore(score: string, value: number | undefined): string {
  if (value === undefined) return '–';
  if (PERCENT_SCORES.has(score)) return `${Math.round(value * 100)}%`;
  if (score === 'costUsd') return `$${value.toFixed(4)}`;
  if (score === 'wallMs') return `${(value / 1000).toFixed(1)}s`;
  return value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(1);
}

/** /harness → Evals (spec 119, F9): run a suite on both modes and compare them. */
export function HarnessEvalsPanel({ initial, repoRoot }: HarnessEvalsPanelProps) {
  const { t } = useTranslation('web');
  const [listing, setListing] = useState(initial);
  const [suite, setSuite] = useState(initial.suites[0]?.id ?? 'smoke');
  const [repeats, setRepeats] = useState('1');
  const [runId, setRunId] = useState<string | null>(initial.runs[0]?.id ?? null);
  const [report, setReport] = useState<HarnessEvalReport | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const [l, r] = await Promise.all([
      listHarnessEvals(repoRoot),
      runId ? getHarnessEvalReport(runId) : null,
    ]);
    if (l.ok) setListing(l.data);
    if (r?.ok) setReport(r.data);
  }, [repoRoot, runId]);

  useEffect(() => {
    void refresh();
    const finished =
      report?.run.status === HarnessEvalRunStatus.Completed ||
      report?.run.status === HarnessEvalRunStatus.Failed;
    if (finished) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, report?.run.status]);

  function start() {
    startTransition(async () => {
      const r = await startHarnessEval({
        suite,
        repeats: Number.parseInt(repeats, 10) || 1,
        ...(repoRoot && { repoRoot }),
      });
      if (!r.ok) return void toast.error(r.error);
      setReport(null);
      setRunId(r.data.runId);
    });
  }

  return (
    <div className="space-y-4" data-testid="harness-evals-panel">
      <p className="text-muted-foreground text-xs">{t('harness.evals.description')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <HarnessEnumSelect
          id="harness-eval-suite"
          value={suite}
          options={listing.suites.map((s) => s.id)}
          label={(id) => `${id} (${listing.suites.find((s) => s.id === id)?.cases ?? 0})`}
          onChange={setSuite}
        />
        <Input
          type="number"
          min={1}
          max={10}
          className="h-9 w-20 text-xs"
          value={repeats}
          onChange={(e) => setRepeats(e.target.value)}
          aria-label={t('harness.evals.repeats')}
        />
        <Button size="sm" disabled={isPending} onClick={start} data-testid="harness-eval-run">
          {t('harness.evals.run')}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ul className="space-y-1">
          {listing.runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setRunId(r.id)}
                className={cn(
                  'w-full rounded border px-2 py-1 text-left text-xs',
                  r.id === runId && 'border-primary bg-primary/5'
                )}
              >
                <span className="font-medium">{r.suite}</span> ·{' '}
                {t(`harness.evals.status.${r.status}`)}
                <span className="text-muted-foreground block">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
          {listing.runs.length === 0 ? (
            <li className="text-muted-foreground text-xs">{t('harness.evals.empty')}</li>
          ) : null}
        </ul>
        {report ? (
          <table className="w-full text-xs" data-testid="harness-eval-report">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="py-1 font-normal">{t('harness.evals.score')}</th>
                <th className="py-1 text-right font-normal">{t('harness.mode.baseline')}</th>
                <th className="py-1 text-right font-normal">{t('harness.mode.query_aware')}</th>
                <th className="py-1 text-right font-normal">{t('harness.evals.change')}</th>
              </tr>
            </thead>
            <tbody>
              {report.comparison.map((c) => (
                <tr key={c.score} className="border-t">
                  <td className="py-1">{t(`harness.evals.scores.${c.score}`)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatScore(c.score, c.baseline)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatScore(c.score, c.queryAware)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {c.relativeChange === undefined
                      ? ''
                      : `${c.relativeChange > 0 ? '+' : ''}${Math.round(c.relativeChange * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
