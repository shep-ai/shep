import { redirect } from 'next/navigation';
import { listWorkflows } from '@/app/actions/list-workflows';
import { WorkflowsPageClient } from '@/components/features/workflows/workflows-page-client';
import { getFeatureFlags } from '@/lib/feature-flags';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const flags = getFeatureFlags();
  if (!flags.scheduledWorkflows) {
    redirect('/');
  }

  const { workflows, error } = await listWorkflows();

  if (error || !workflows) {
    return (
      <div className="flex h-full flex-col p-6">
        <p className="text-destructive text-sm">Failed to load workflows: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <WorkflowsPageClient workflows={workflows} />
    </div>
  );
}
