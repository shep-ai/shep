'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircleQuestion, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Decision, DecisionResponse } from '@shepai/core/domain/generated/output';
import { isDecisionAnswerable } from '@shepai/core/domain/shared/decision';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnsweredDecisionRow } from './answered-decision-row';
import { DECISION_SHORTCUT_COUNT, DecisionOptionRow } from './decision-option-row';
import {
  buildDecisionResponses,
  deriveDecisionProgress,
  initialDecisionDraft,
  selectDecisionOption,
  setDecisionCustomText,
  type DecisionDraft,
} from './decision-draft';

/** How long a single-select check shows before the panel advances (T3 Code's rhythm). */
export const DECISION_AUTO_ADVANCE_MS = 200;

/**
 * A host text box that acts as the "Other" answer (the chat composer). Its
 * text is the active question's typed answer; text displaced by an option
 * click goes to `stash` so the host can give it back after the decision.
 */
export interface DecisionComposer {
  text: string;
  setText: (text: string) => void;
  stash: (text: string) => void;
}

export interface DecisionPanelProps {
  decision: Decision;
  /** The recorded answer — when present the panel collapses to an answered row. */
  responses?: DecisionResponse[];
  /** Called with one response per question. Absent = read-only. */
  onSubmit?: (responses: DecisionResponse[]) => void;
  /**
   * Selection mode: called on every selection change. Without `onSubmit` the
   * panel has no Submit and every question may be skipped (the host owns the
   * final action — e.g. the PRD questionnaire's Approve).
   */
  onSelect?: (questionId: string, optionIds: string[]) => void;
  /** Start from these selections instead of the recommended options. */
  initialSelections?: Record<string, string[]>;
  /** Called with the new question index on every page change. */
  onNavigate?: (index: number) => void;
  /** Use a host text box as "Other" instead of the panel's own field. */
  composer?: DecisionComposer;
  disabled?: boolean;
  isSubmitting?: boolean;
  className?: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLElement &&
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/**
 * One shared renderer for every "agent asks, user picks" moment (spec 134),
 * following T3 Code's inline-options model: 1–9 select, a single-select check
 * advances after 200 ms, typed text outranks the selection, n/N paging with
 * Previous / Next / Submit, an answered row, and a not-resumable state.
 */
export function DecisionPanel(props: DecisionPanelProps) {
  if (props.responses) {
    return (
      <AnsweredDecisionRow
        decision={props.decision}
        responses={props.responses}
        className={props.className}
      />
    );
  }
  return <PendingDecisionPanel {...props} />;
}

function initialDraftFor(
  decision: Decision,
  initialSelections: Record<string, string[]> | undefined
): DecisionDraft {
  if (!initialSelections) return initialDecisionDraft(decision);
  return Object.fromEntries(
    Object.entries(initialSelections).map(([id, optionIds]) => [
      id,
      { selectedOptionIds: optionIds },
    ])
  );
}

function PendingDecisionPanel({
  decision,
  onSubmit,
  onSelect,
  initialSelections,
  onNavigate,
  composer,
  disabled = false,
  isSubmitting = false,
  className,
}: DecisionPanelProps) {
  const { t } = useTranslation('web');
  const [draft, setDraft] = useState<DecisionDraft>(() =>
    initialDraftFor(decision, initialSelections)
  );
  const [index, setIndex] = useState(0);
  const [stashedText, setStashedText] = useState('');
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answerable =
    isDecisionAnswerable(decision) && (onSubmit !== undefined || onSelect !== undefined);
  // In selection mode every question is optional.
  const requireAnswerToAdvance = onSubmit !== undefined;
  const locked = !answerable || disabled || isSubmitting;
  const progress = deriveDecisionProgress(decision, draft, index);
  const question = progress.question;

  const latest = useRef({ draft, index, composer, onSubmit, onSelect, onNavigate, locked });
  latest.current = { draft, index, composer, onSubmit, onSelect, onNavigate, locked };

  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);
  useEffect(() => cancelAdvance, [cancelAdvance]);
  useEffect(() => {
    if (locked) cancelAdvance();
  }, [locked, cancelAdvance]);

  // Composer as "Other": the host's text is the active question's typed answer.
  const composerText = composer?.text;
  const activeQuestionId = question?.id;
  useEffect(() => {
    if (composerText === undefined || !activeQuestionId) return;
    setDraft((d) =>
      (d[activeQuestionId]?.customText ?? '') === composerText
        ? d
        : { ...d, [activeQuestionId]: setDecisionCustomText(d[activeQuestionId], composerText) }
    );
  }, [composerText, activeQuestionId]);

  const goTo = useCallback(
    (next: number) => {
      cancelAdvance();
      const { draft: current, composer: host } = latest.current;
      const target = decision.questions[next];
      if (!target) return;
      setIndex(next);
      host?.setText(current[target.id]?.customText ?? '');
      latest.current.onNavigate?.(next);
    },
    [cancelAdvance, decision.questions]
  );

  const submit = useCallback(() => {
    const { draft: current, onSubmit: send, locked: isLocked } = latest.current;
    if (isLocked || !send) return;
    const responses = buildDecisionResponses(decision, current);
    if (responses) send(responses);
  }, [decision]);

  const advance = useCallback(() => {
    const { draft: current, index: at } = latest.current;
    const now = deriveDecisionProgress(decision, current, at);
    if (!now.canAdvance) return;
    if (now.isLast) submit();
    else goTo(now.index + 1);
  }, [decision, goTo, submit]);

  const select = useCallback(
    (optionId: string) => {
      if (latest.current.locked || !question) return;
      const { draft: current, composer: host } = latest.current;
      const { answer, displacedText } = selectDecisionOption(
        question,
        current[question.id],
        optionId
      );
      if (displacedText) {
        if (host) {
          host.stash(displacedText);
          host.setText('');
        } else {
          setStashedText(displacedText);
        }
      }
      setDraft({ ...current, [question.id]: answer });
      latest.current.onSelect?.(question.id, answer.selectedOptionIds ?? []);
      if (question.multiSelect) return;
      cancelAdvance();
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        advance();
      }, DECISION_AUTO_ADVANCE_MS);
    },
    [advance, cancelAdvance, question]
  );

  useEffect(() => {
    if (locked || !question) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > DECISION_SHORTCUT_COUNT) return;
      const option = question.options[digit - 1];
      if (!option) return;
      event.preventDefault();
      select(option.id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [locked, question, select]);

  if (!question) return null;

  const setOwnText = (text: string) =>
    setDraft((d) => ({ ...d, [question.id]: setDecisionCustomText(d[question.id], text) }));
  const previewOption =
    question.options.find((o) => o.id === focusedOptionId && o.preview) ??
    question.options.find((o) => progress.selectedOptionIds.includes(o.id) && o.preview);

  return (
    <section
      data-testid="decision-panel"
      aria-label={question.header}
      className={cn('bg-background rounded-lg border text-sm', className)}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <MessageCircleQuestion className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
        {question.header !== question.question ? (
          <span className="text-muted-foreground shrink-0 font-medium">{question.header}</span>
        ) : null}
        {decision.title ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {decision.title}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {progress.total > 1 ? (
          <span
            data-testid="decision-panel-progress"
            className="text-muted-foreground text-xs font-medium tabular-nums"
          >
            {progress.index + 1}/{progress.total}
          </span>
        ) : null}
      </header>

      <div className="space-y-2 px-3 py-2">
        <p className="text-foreground/90">{question.question}</p>
        {question.multiSelect ? (
          <p className="text-muted-foreground text-xs">{t('decision.selectMany')}</p>
        ) : null}
        {!isDecisionAnswerable(decision) ? (
          <p
            data-testid="decision-panel-not-resumable"
            className="text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5 text-xs"
          >
            {t('decision.notResumable')}
          </p>
        ) : null}

        <div className="space-y-0.5">
          {question.options.map((option, i) => (
            <DecisionOptionRow
              key={`${question.id}:${option.id}`}
              option={option}
              index={i}
              selected={progress.selectedOptionIds.includes(option.id)}
              disabled={locked}
              onSelect={select}
              onFocusOption={setFocusedOptionId}
            />
          ))}
        </div>

        {previewOption?.preview ? (
          <pre
            data-testid="decision-panel-preview"
            aria-label={t('decision.preview')}
            className="bg-muted max-h-48 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre"
          >
            {previewOption.preview}
          </pre>
        ) : null}

        {question.allowCustom && answerable && !composer ? (
          <Textarea
            data-testid="decision-panel-other-input"
            value={progress.customText}
            onChange={(e) => setOwnText(e.target.value)}
            placeholder={t('decision.otherPlaceholder')}
            disabled={locked}
            rows={2}
            className="text-sm"
          />
        ) : null}
        {question.allowCustom && answerable && composer ? (
          <p className="text-muted-foreground text-xs">{t('decision.composerHint')}</p>
        ) : null}
        {stashedText && !composer ? (
          <button
            type="button"
            data-testid="decision-panel-restore-text"
            onClick={() => {
              setOwnText(stashedText);
              setStashedText('');
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <RotateCcw className="size-3" />
            {t('decision.restoreText')}
          </button>
        ) : null}
        {decision.defaultAfter && answerable ? (
          <p data-testid="decision-panel-deadline" className="text-muted-foreground text-xs">
            {t('decision.defaultsAt', {
              time: new Date(decision.defaultAfter).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        ) : null}
      </div>

      {answerable ? (
        <footer className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="decision-panel-previous"
            disabled={locked || progress.index === 0}
            onClick={() => goTo(progress.index - 1)}
          >
            <ChevronLeft className="me-1 size-4" />
            {t('decision.previous')}
          </Button>
          {progress.isLast && !onSubmit ? (
            <span />
          ) : progress.isLast ? (
            <Button
              type="button"
              size="sm"
              data-testid="decision-panel-submit"
              disabled={locked || !progress.isComplete}
              onClick={submit}
            >
              {isSubmitting ? t('decision.submitting') : t('decision.submit')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="decision-panel-next"
              disabled={locked || (requireAnswerToAdvance && !progress.canAdvance)}
              onClick={() => goTo(progress.index + 1)}
            >
              {t('decision.next')}
              <ChevronRight className="ms-1 size-4" />
            </Button>
          )}
        </footer>
      ) : null}
    </section>
  );
}
