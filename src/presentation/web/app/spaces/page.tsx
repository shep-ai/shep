import { getSpacesOverview } from '@/app/actions/manage-spaces';
import { SpacesPageClient } from '@/components/features/spaces/spaces-page-client';

export const dynamic = 'force-dynamic';

export default async function SpacesPage() {
  const { overview, error } = await getSpacesOverview();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <SpacesPageClient overview={overview ?? { spaces: [], repositories: [] }} loadError={error} />
    </div>
  );
}
