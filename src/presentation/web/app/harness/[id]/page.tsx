import { redirect } from 'next/navigation';
import { getFeatureFlags } from '@/lib/feature-flags';
import { getHarnessSession } from '@/app/actions/harness-queries';
import { HarnessSessionPageClient } from '@/components/features/harness/harness-session-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function HarnessSessionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!getFeatureFlags().queryAwareHarness) redirect('/');
  const { id } = await params;
  const result = await getHarnessSession(id);
  if (!result.ok) {
    return (
      <div className="flex h-full flex-col p-6">
        <p className="text-destructive text-sm">{result.error}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <HarnessSessionPageClient detail={result.data} />
    </div>
  );
}
