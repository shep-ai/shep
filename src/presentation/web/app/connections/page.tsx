import { getTrackerOverview } from '@/app/actions/manage-trackers';
import { TrackersPageClient } from '@/components/features/trackers/trackers-page-client';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const { overview, error } = await getTrackerOverview();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <TrackersPageClient
        overview={overview ?? { connections: [], spaces: [], projects: [] }}
        loadError={error}
      />
    </div>
  );
}
