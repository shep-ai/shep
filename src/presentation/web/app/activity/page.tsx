import { AgentActivityPageClient } from '@/components/features/agent-activity';

/** Reads live activity from /api/agent-activity; never pre-render. */
export const dynamic = 'force-dynamic';

export default function AgentActivityPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <AgentActivityPageClient />
    </div>
  );
}
