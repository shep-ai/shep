'use client';

import { CircleCheck, CircleDashed, CircleSlash, MessageCircleQuestion } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DecisionOutcome, type AgentQuestion } from '@shepai/core/domain/generated/output';
import { decisionForQuestion } from '@shepai/core/domain/shared/decision-builders';
import { decisionOutcomeOf } from '@shepai/core/domain/shared/decision-deadline';
import { cn } from '@/lib/utils';

export interface FeatureDecisionsLogProps {
  /** The feature's agent questions, newest first. */
  decisions: AgentQuestion[];
  className?: string;
}

const OUTCOME_ICON: Record<DecisionOutcome, LucideIcon> = {
  [DecisionOutcome.Pending]: CircleDashed,
  [DecisionOutcome.Answered]: CircleCheck,
  [DecisionOutcome.Defaulted]: MessageCircleQuestion,
  [DecisionOutcome.Cancelled]: CircleSlash,
};

/**
 * What the feature's agents asked and what became of each question (spec 134),
 * including when an agent proceeded with its recommendation after the deadline.
 */
export function FeatureDecisionsLog({ decisions, className }: FeatureDecisionsLogProps) {
  const { t } = useTranslation('web');
  if (decisions.length === 0) return null;

  const outcomeText = (question: AgentQuestion, outcome: DecisionOutcome): string => {
    switch (outcome) {
      case DecisionOutcome.Pending:
        return t('activityTab.decisions.pending');
      case DecisionOutcome.Answered:
        return t('activityTab.decisions.answered', {
          actor: question.answeredBy ?? '',
          answer: question.answer ?? '',
        });
      case DecisionOutcome.Defaulted:
        return t('activityTab.decisions.defaulted', { answer: question.answer ?? '' });
      case DecisionOutcome.Cancelled:
        return t('activityTab.decisions.cancelled');
    }
  };

  return (
    <section data-testid="feature-decisions-log" className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t('activityTab.decisions.title')}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {decisions.map((question) => {
          const decision = decisionForQuestion(question);
          const outcome = decisionOutcomeOf(question);
          const Icon = OUTCOME_ICON[outcome];
          return (
            <li
              key={question.id}
              data-testid={`feature-decision-${question.id}`}
              className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  outcome === DecisionOutcome.Answered && 'text-emerald-600 dark:text-emerald-400',
                  outcome === DecisionOutcome.Defaulted && 'text-amber-600 dark:text-amber-400',
                  outcome === DecisionOutcome.Pending && 'text-violet-600 dark:text-violet-400',
                  outcome === DecisionOutcome.Cancelled && 'text-muted-foreground'
                )}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground">
                  {decision.title ?? decision.questions[0]?.question}
                </span>
                <span className="text-muted-foreground text-xs">
                  {outcomeText(question, outcome)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
