'use client';

/**
 * HypothesisCard — one ranked root cause from an investigation: its
 * confidence, cause, the code that supports it, the failing test that would
 * prove it and the fix, with the button that turns it into a fix feature.
 */

import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { HypothesisConfidence, type Hypothesis } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const CONFIDENCE_VARIANT: Record<HypothesisConfidence, 'default' | 'secondary' | 'outline'> = {
  [HypothesisConfidence.High]: 'default',
  [HypothesisConfidence.Medium]: 'secondary',
  [HypothesisConfidence.Low]: 'outline',
};

export interface HypothesisCardProps {
  hypothesis: Hypothesis;
  /** Show the fix button (the investigation is completed and nothing is approved yet). */
  canFix: boolean;
  /** This hypothesis is the one being fixed. */
  approved: boolean;
  /** A fix is being started from this card. */
  fixing?: boolean;
  /** Another action is in flight. */
  disabled?: boolean;
  onFix?: () => void;
}

export function HypothesisCard({
  hypothesis,
  canFix,
  approved,
  fixing = false,
  disabled = false,
  onFix,
}: HypothesisCardProps) {
  const { t } = useTranslation('web');
  return (
    <article
      data-testid={`hypothesis-${hypothesis.number}`}
      className="bg-card space-y-2 rounded-md border p-3"
    >
      <header className="flex items-start gap-2">
        <span className="text-muted-foreground text-xs font-semibold tabular-nums">
          {hypothesis.number}.
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{hypothesis.title}</h3>
        <Badge variant={CONFIDENCE_VARIANT[hypothesis.confidence]} className="text-[10px]">
          {t(`bugLoop.confidence.${hypothesis.confidence}`)}
        </Badge>
        {approved ? (
          <Badge variant="secondary" className="text-[10px]">
            {t('bugLoop.hypothesis.approved')}
          </Badge>
        ) : null}
      </header>
      <p className="text-sm">{hypothesis.rootCause}</p>
      {hypothesis.evidence.length > 0 ? (
        <ul className="space-y-0.5 text-xs" aria-label={t('bugLoop.hypothesis.evidence')}>
          {hypothesis.evidence.map((evidence) => (
            <li
              key={`${evidence.file}:${evidence.line ?? ''}:${evidence.note}`}
              className="flex gap-2"
            >
              <code className="text-muted-foreground shrink-0 break-all">
                {evidence.file}
                {evidence.line === undefined ? '' : `:${evidence.line}`}
              </code>
              <span>{evidence.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
        <dt className="text-muted-foreground">{t('bugLoop.hypothesis.test')}</dt>
        <dd>{hypothesis.testPlan}</dd>
        <dt className="text-muted-foreground">{t('bugLoop.hypothesis.fix')}</dt>
        <dd>{hypothesis.fixPlan}</dd>
      </dl>
      {canFix ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={onFix} disabled={fixing || disabled}>
            <Wrench className="size-3.5" />
            {t(fixing ? 'bugLoop.hypothesis.fixing' : 'bugLoop.hypothesis.fixThis')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
