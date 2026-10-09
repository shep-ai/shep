'use client';

import { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { decisionFromPrdQuestionnaire } from '@shepai/core/domain/shared/decision-builders';
import { DecisionPanel } from '@/components/common/decision-panel';
import { DrawerActionBar } from '@/components/common/drawer-action-bar';
import { useSoundAction } from '@/hooks/use-sound-action';
import type { PrdQuestionnaireProps } from './prd-questionnaire-config';

/** Decision id for the requirements questionnaire (it is answered locally, not stored). */
const PRD_DECISION_ID = 'prd-questionnaire';

export function PrdQuestionnaire({
  data,
  selections,
  onSelect,
  onApprove,
  onReject,
  isProcessing = false,
  isRejecting = false,
  showHeader = false,
  chatInput,
  onChatInputChange,
}: PrdQuestionnaireProps) {
  const { question, context, questions, finalAction } = data;
  const selectSound = useSoundAction('select');
  const navigateSound = useSoundAction('navigate');

  // Spec 134: the questions render through the shared DecisionPanel.
  const decision = useMemo(() => decisionFromPrdQuestionnaire(PRD_DECISION_ID, data), [data]);
  const initialSelections = useMemo(
    () => Object.fromEntries(Object.entries(selections).map(([id, opt]) => [id, [opt]])),
    // Only the first render seeds the panel; later selections flow from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Remount only when the set of questions changes — a refinement that adds
  // options keeps the user on the question they were reading.
  const questionKey = questions.map((q) => q.id).join('|');

  const handleSelect = useCallback(
    (questionId: string, optionIds: string[]) => {
      const optionId = optionIds[0];
      if (!optionId) return;
      selectSound.play();
      onSelect(questionId, optionId);
    },
    [onSelect, selectSound]
  );

  const total = questions.length;
  const answeredCount = Object.keys(selections).length;

  if (total === 0) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Header */}
        {showHeader ? (
          <div className="border-border flex items-start gap-3 border-b pb-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <div className="flex-1">
              <h3 className="text-foreground mb-1.5 text-sm font-bold">{question}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{context}</p>
            </div>
          </div>
        ) : null}

        <DecisionPanel
          key={questionKey}
          decision={decision}
          initialSelections={initialSelections}
          onSelect={handleSelect}
          onNavigate={() => navigateSound.play()}
          disabled={isProcessing}
        />
      </div>

      <DrawerActionBar
        onReject={onReject}
        onApprove={() => onApprove(finalAction.id)}
        approveLabel={finalAction.label}
        revisionPlaceholder="Ask AI to refine requirements..."
        isProcessing={isProcessing}
        isRejecting={isRejecting}
        chatInput={chatInput}
        onChatInputChange={onChatInputChange}
      >
        <div
          className={cn(
            'bg-muted h-1.5 overflow-hidden',
            (answeredCount > 0 && answeredCount < total) || isProcessing
              ? 'opacity-100'
              : 'opacity-0',
            'transition-opacity duration-200'
          )}
          data-testid="progress-bar-container"
        >
          {isProcessing ? (
            <div className="bg-primary animate-indeterminate-progress h-full w-1/3" />
          ) : (
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${total > 0 ? (answeredCount / total) * 100 : 0}%` }}
              data-testid="progress-bar"
            />
          )}
        </div>
      </DrawerActionBar>
    </div>
  );
}
