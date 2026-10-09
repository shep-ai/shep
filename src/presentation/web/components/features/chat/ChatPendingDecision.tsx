'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { DecisionResponseMode, type DecisionResponse } from '@shepai/core/domain/generated/output';
import { answersByQuestionText } from '@shepai/core/domain/shared/decision';
import { decisionFromUserQuestions } from '@shepai/core/domain/shared/decision-builders';
import { DecisionPanel, type DecisionComposer } from '@/components/common/decision-panel';
import { carryDisplacedText } from '@/components/common/decision-panel/decision-draft';
import { cn } from '@/lib/utils';
import type { InteractionData } from './useChatRuntime';

export type ChatInteraction = InteractionData;

export interface ChatPendingDecisionProps {
  /** The agent's pending AskUserQuestion call. */
  interaction: ChatInteraction;
  /** Answers keyed by question text — the shape AskUserQuestion returns to the agent. */
  onRespond: (answers: Record<string, string>) => void;
  /** The chat composer acting as "Other". */
  composer?: DecisionComposer;
  /** Called after a submit so the host can give displaced text back to the composer. */
  onAnswered?: () => void;
  className?: string;
}

/**
 * Layer 3 card for a pending chat AskUserQuestion (spec 134): the shared
 * DecisionPanel, rendered inside the turn that asked.
 */
export function ChatPendingDecision({
  interaction,
  onRespond,
  composer,
  onAnswered,
  className,
}: ChatPendingDecisionProps) {
  const decision = useMemo(
    () =>
      decisionFromUserQuestions(
        interaction.toolCallId,
        interaction.questions,
        DecisionResponseMode.Live
      ),
    [interaction]
  );
  const handleSubmit = useCallback(
    (responses: DecisionResponse[]) => {
      onRespond(answersByQuestionText(decision, responses));
      onAnswered?.();
    },
    [decision, onRespond, onAnswered]
  );
  return (
    <div data-testid="chat-pending-decision" className={cn('px-1', className)}>
      <DecisionPanel
        key={interaction.toolCallId}
        decision={decision}
        onSubmit={handleSubmit}
        composer={composer}
      />
    </div>
  );
}

/**
 * {@link ChatPendingDecision} wired to the thread composer, so typing in the
 * message box answers the question in your own words (T3's composer-as-Other).
 * Must render inside the chat's AssistantRuntimeProvider.
 */
export function ThreadPendingDecision(props: Omit<ChatPendingDecisionProps, 'composer'>) {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const stashed = useRef('');
  const composer = useMemo<DecisionComposer>(
    () => ({
      text,
      setText: (next) => aui.composer().setText(next),
      stash: (displaced) => {
        stashed.current = carryDisplacedText(stashed.current, displaced);
      },
    }),
    [aui, text]
  );
  const giveBackStash = useCallback(() => {
    aui.composer().setText(stashed.current);
    stashed.current = '';
    props.onAnswered?.();
  }, [aui, props]);
  return <ChatPendingDecision {...props} composer={composer} onAnswered={giveBackStash} />;
}
