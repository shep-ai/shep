import { ApplicationsPageClient } from '@/components/features/applications/applications-page-client';

export default function ApplicationsPage() {
  return (
    <div className="dark:bg-background flex h-full flex-col overflow-y-auto bg-[#f6f7f8] p-6">
      <ApplicationsPageClient />
    </div>
  );
}
