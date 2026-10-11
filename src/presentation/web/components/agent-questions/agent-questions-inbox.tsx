'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AgentQuestionKind,
  AgentQuestionStatus,
  InlineBlockType,
  type AgentQuestion,
  type DecisionResponse,
} from '@shepai/core/domain/generated/output';
import { summariseResponses } from '@shepai/core/domain/shared/decision';
import { decisionForQuestion } from '@shepai/core/domain/shared/decision-builders';
import { InlineBlockView } from '@/components/common/inline-blocks';
import { answerAgentQuestion, cancelAgentQuestion } from '@/app/actions/agent-questions';

const KIND_VARIANT: Record<AgentQuestionKind, 'default' | 'destructive' | 'secondary'> = {
  [AgentQuestionKind.info]: 'secondary',
  [AgentQuestionKind.question]: 'default',
  [AgentQuestionKind.blocking]: 'destructive',
};

const STATUS_VARIANT: Record<
  AgentQuestionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  [AgentQuestionStatus.pending]: 'default',
  [AgentQuestionStatus.answered]: 'secondary',
  [AgentQuestionStatus.cancelled]: 'outline',
  [AgentQuestionStatus.expired]: 'outline',
};

export interface AgentQuestionsInboxProps {
  /** Questions returned by ListAgentQuestionsUseCase. */
  initialQuestions: AgentQuestion[];
  /** Default status filter applied at first render (e.g. 'pending'). */
  initialStatusFilter?: AgentQuestionStatus | 'all';
  /** Default urgency filter applied at first render. */
  initialKindFilter?: AgentQuestionKind | 'all';
  /** Storybook escape hatch — render inline error banner. */
  errorMessage?: string | null;
  /** Override answer/cancel handlers (Storybook + tests). */
  answerOverride?: (input: {
    appId: string;
    questionId: string;
    responses: DecisionResponse[];
    answeredBy: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  cancelOverride?: (input: {
    appId: string;
    questionId: string;
    cancelledBy: string;
    reason?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Identity of the current user — used as `answeredBy`/`cancelledBy`. */
  currentActor?: string;
}

export function AgentQuestionsInbox({
  initialQuestions,
  initialStatusFilter = AgentQuestionStatus.pending,
  initialKindFilter = 'all',
  errorMessage = null,
  answerOverride,
  cancelOverride,
  currentActor = 'user:web',
}: AgentQuestionsInboxProps) {
  const [statusFilter, setStatusFilter] = useState<AgentQuestionStatus | 'all'>(
    initialStatusFilter
  );
  const [kindFilter, setKindFilter] = useState<AgentQuestionKind | 'all'>(initialKindFilter);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(errorMessage);
  const [questions, setQuestions] = useState<AgentQuestion[]>(initialQuestions);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (kindFilter !== 'all' && q.kind !== kindFilter) return false;
      return true;
    });
  }, [questions, statusFilter, kindFilter]);

  const submitAnswer = async (q: AgentQuestion, responses: DecisionResponse[]) => {
    setError(null);
    setPendingId(q.id);
    try {
      const handler = answerOverride ?? answerAgentQuestion;
      const result = await handler({
        appId: q.appId ?? '',
        questionId: q.id,
        responses,
        answeredBy: currentActor,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed to submit answer');
        return;
      }
      setQuestions((prev) =>
        prev.map((row) =>
          row.id === q.id
            ? {
                ...row,
                status: AgentQuestionStatus.answered,
                answer: summariseResponses(decisionForQuestion(row), responses),
                responses,
                answeredBy: currentActor,
                answeredAt: new Date(),
              }
            : row
        )
      );
    } finally {
      setPendingId(null);
    }
  };

  const submitCancel = async (q: AgentQuestion) => {
    setError(null);
    setPendingId(q.id);
    try {
      const handler = cancelOverride ?? cancelAgentQuestion;
      const result = await handler({
        appId: q.appId ?? '',
        questionId: q.id,
        cancelledBy: currentActor,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed to cancel question');
        return;
      }
      setQuestions((prev) =>
        prev.map((row) =>
          row.id === q.id
            ? { ...row, status: AgentQuestionStatus.cancelled, answeredBy: currentActor }
            : row
        )
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section
      data-testid="agent-questions-inbox"
      className="flex flex-col gap-4"
      aria-label="Agent questions inbox"
    >
      <div className="flex flex-wrap items-end gap-3" data-testid="inbox-filters">
        <div className="flex flex-col gap-1">
          <Label htmlFor="status-filter">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as AgentQuestionStatus | 'all')}
          >
            <SelectTrigger id="status-filter" className="w-44" data-testid="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value={AgentQuestionStatus.pending}>Pending</SelectItem>
              <SelectItem value={AgentQuestionStatus.answered}>Answered</SelectItem>
              <SelectItem value={AgentQuestionStatus.cancelled}>Cancelled</SelectItem>
              <SelectItem value={AgentQuestionStatus.expired}>Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="kind-filter">Urgency</Label>
          <Select
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as AgentQuestionKind | 'all')}
          >
            <SelectTrigger id="kind-filter" className="w-44" data-testid="kind-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value={AgentQuestionKind.info}>Info</SelectItem>
              <SelectItem value={AgentQuestionKind.question}>Question</SelectItem>
              <SelectItem value={AgentQuestionKind.blocking}>Blocking</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" data-testid="inbox-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {filtered.length === 0 ? (
        <div
          data-testid="inbox-empty"
          className="text-muted-foreground rounded border border-dashed p-6 text-center text-sm"
        >
          No agent questions match the current filters.
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="inbox-list">
          {filtered.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              busy={pendingId === q.id}
              onSubmitAnswer={(responses) => submitAnswer(q, responses)}
              onCancel={() => submitCancel(q)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface QuestionRowProps {
  question: AgentQuestion;
  busy: boolean;
  onSubmitAnswer: (responses: DecisionResponse[]) => void;
  onCancel: () => void;
}

function QuestionRow({ question, busy, onSubmitAnswer, onCancel }: QuestionRowProps) {
  const decision = decisionForQuestion(question);
  const isPending = question.status === AgentQuestionStatus.pending;
  const settledLabel =
    question.status === AgentQuestionStatus.answered
      ? 'Answered'
      : question.status === AgentQuestionStatus.cancelled
        ? 'Cancelled'
        : 'Resolved';

  return (
    <li
      className="flex flex-col gap-3 rounded border p-4"
      data-testid={`question-row-${question.id}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={KIND_VARIANT[question.kind] ?? 'secondary'} className="capitalize">
            {question.kind}
          </Badge>
          <Badge variant={STATUS_VARIANT[question.status] ?? 'outline'} className="capitalize">
            {question.status}
          </Badge>
          <span className="text-muted-foreground text-xs">
            run {question.agentRunId.slice(0, 8)}
          </span>
        </div>
        {question.featureId ? (
          <span className="text-muted-foreground text-xs">
            feature {question.featureId.slice(0, 8)}
          </span>
        ) : null}
      </header>

      {isPending ? (
        <InlineBlockView
          block={{
            type: InlineBlockType.Decision,
            props: { decision, onSubmit: onSubmitAnswer, isSubmitting: busy },
          }}
        />
      ) : question.responses ? (
        <div data-testid={`question-answer-${question.id}`}>
          <InlineBlockView
            block={{
              type: InlineBlockType.Decision,
              props: { decision, responses: question.responses },
            }}
          />
          {question.answeredBy ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {settledLabel} by {question.answeredBy}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm whitespace-pre-wrap" data-testid={`question-prompt-${question.id}`}>
            {decision.title ?? decision.questions[0]?.question}
          </p>
          {question.answer ? (
            <p
              className="text-muted-foreground text-xs"
              data-testid={`question-answer-${question.id}`}
            >
              {settledLabel}
              {question.answeredBy ? ` by ${question.answeredBy}` : ''}: {question.answer}
            </p>
          ) : null}
        </div>
      )}

      {isPending ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
            data-testid={`question-cancel-${question.id}`}
          >
            Cancel question
          </Button>
        </div>
      ) : null}
    </li>
  );
}
