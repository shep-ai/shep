'use client';

import { useState } from 'react';
import { ChevronRight, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Decision, DecisionResponse } from '@shepai/core/domain/generated/output';
import { answersByQuestionText, summariseResponses } from '@shepai/core/domain/shared/decision';
import { cn } from '@/lib/utils';

export interface AnsweredDecisionRowProps {
  decision: Decision;
  responses: DecisionResponse[];
  className?: string;
}

/** A decision once answered: one "Answered questions" line that expands to each answer. */
export function AnsweredDecisionRow({ decision, responses, className }: AnsweredDecisionRowProps) {
  const { t } = useTranslation('web');
  const [open, setOpen] = useState(false);
  const answers = answersByQuestionText(decision, responses);
  return (
    <div data-testid="answered-decision-row" className={cn('text-xs', className)}>
      <button
        type="button"
        data-testid="answered-decision-row-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 py-1 text-start"
      >
        <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="shrink-0 font-medium">{t('decision.answeredQuestions')}</span>
        <span className="text-foreground/80 min-w-0 flex-1 truncate">
          {summariseResponses(decision, responses)}
        </span>
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open ? (
        <dl data-testid="answered-decision-row-details" className="ms-5 space-y-1 pb-1">
          {decision.questions.map((q) => (
            <div key={q.id}>
              <dt className="text-muted-foreground">{q.question}</dt>
              <dd className="text-foreground">{answers[q.question]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
