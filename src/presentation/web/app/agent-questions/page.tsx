import { notFound } from 'next/navigation';
import { resolve } from '@/lib/server-container';
import type { ListAgentQuestionInboxUseCase } from '@shepai/core/application/use-cases/agents/list-agent-question-inbox.use-case';
import { AgentQuestionStatus, type AgentQuestion } from '@shepai/core/domain/generated/output';
import { getFeatureFlags } from '@/lib/feature-flags';
import { AgentQuestionsInbox } from '@/components/agent-questions/agent-questions-inbox';

/** DI-backed page; never pre-render. */
export const dynamic = 'force-dynamic';

interface RouteProps {
  searchParams: Promise<{
    app?: string;
    status?: string;
    feature?: string;
  }>;
}

export default async function AgentQuestionsRoute({ searchParams }: RouteProps) {
  const flags = getFeatureFlags();
  if (!flags.collaboration) {
    notFound();
  }

  const search = await searchParams;
  const requestedApp = search.app?.trim() ? search.app : undefined;
  const featureFilter = search.feature?.trim() ? search.feature : undefined;
  const statusFilter = parseStatus(search.status);

  // Every scope a question was written under — including repositories with
  // no Application, where gate and chat questions fall back to the path.
  const questions = await resolve<ListAgentQuestionInboxUseCase>('ListAgentQuestionInboxUseCase')
    .execute({ appId: requestedApp, featureId: featureFilter, status: statusFilter })
    .catch(() => [] as AgentQuestion[]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Agent questions</h1>
        <p className="text-muted-foreground text-sm">
          Unified inbox for questions raised by agents during interactive and background runs.
        </p>
      </header>
      <AgentQuestionsInbox
        initialQuestions={questions}
        initialStatusFilter={statusFilter ?? AgentQuestionStatus.pending}
      />
    </div>
  );
}

function parseStatus(value: string | undefined): AgentQuestionStatus | undefined {
  if (!value) return undefined;
  const allowed: AgentQuestionStatus[] = [
    AgentQuestionStatus.pending,
    AgentQuestionStatus.answered,
    AgentQuestionStatus.cancelled,
    AgentQuestionStatus.expired,
  ];
  return allowed.find((s) => s === value);
}
