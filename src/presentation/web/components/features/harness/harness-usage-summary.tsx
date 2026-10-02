'use client';

import { useTranslation } from 'react-i18next';
import type { HarnessUsageSummary } from '@shepai/core/application/use-cases/harness/harness-metrics';
import { formatCost, formatTokens } from './harness-format';

export interface HarnessUsageSummaryProps {
  usage: HarnessUsageSummary;
}

/** Turns, tokens, cost and how much raw tool output the model actually saw. */
export function HarnessUsageSummaryView({ usage }: HarnessUsageSummaryProps) {
  const { t } = useTranslation('web');
  const ratio =
    usage.rawToolTokens > 0
      ? Math.round((usage.visibleToolTokens / usage.rawToolTokens) * 100)
      : undefined;
  const stats: { label: string; value: string }[] = [
    { label: t('harness.usage.turns'), value: String(usage.turns) },
    { label: t('harness.usage.input'), value: formatTokens(usage.inputTokens) },
    { label: t('harness.usage.output'), value: formatTokens(usage.outputTokens) },
    { label: t('harness.usage.cost'), value: formatCost(usage.costUsd) },
    { label: t('harness.usage.toolOutputSeen'), value: ratio === undefined ? '–' : `${ratio}%` },
    { label: t('harness.usage.denied'), value: String(usage.deniedToolCalls) },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="harness-usage-summary">
      {stats.map((s) => (
        <div key={s.label} className="rounded border px-2 py-1">
          <dt className="text-muted-foreground text-[10px]">{s.label}</dt>
          <dd className="text-sm tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
