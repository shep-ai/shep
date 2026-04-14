import { ApplicationsPageClient } from '@/components/features/applications/applications-page-client';

export default function ApplicationsPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] p-6 dark:bg-[#111113]">
      <ApplicationsPageClient />
    </div>
  );
}
