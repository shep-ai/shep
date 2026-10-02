import { redirect } from 'next/navigation';
import { getFeatureFlags } from '@/lib/feature-flags';
import {
  getHarnessPolicies,
  listHarnessCapabilities,
  listHarnessPermissions,
  listHarnessRepositoryPaths,
  listHarnessSessions,
} from '@/app/actions/harness-queries';
import { HarnessPageClient } from '@/components/features/harness/harness-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function HarnessPage() {
  if (!getFeatureFlags().queryAwareHarness) redirect('/');

  const [sessions, approvals, capabilities, repositories] = await Promise.all([
    listHarnessSessions(),
    listHarnessPermissions(),
    listHarnessCapabilities(),
    listHarnessRepositoryPaths(),
  ]);
  const repoPaths = repositories.ok ? repositories.data : [];
  const policies = await getHarnessPolicies(repoPaths[0] ?? '');
  const error = [sessions, approvals, capabilities, policies].find((r) => !r.ok);
  if (error && !error.ok) {
    return (
      <div className="flex h-full flex-col p-6">
        <p className="text-destructive text-sm">{error.error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <HarnessPageClient
        sessions={sessions.ok ? sessions.data : []}
        approvals={approvals.ok ? approvals.data : []}
        capabilities={capabilities.ok ? capabilities.data : []}
        policies={policies.ok ? policies.data : { rules: [], issues: [] }}
        repositories={repoPaths}
      />
    </div>
  );
}
