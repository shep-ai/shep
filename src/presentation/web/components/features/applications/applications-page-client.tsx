'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';
import { ApplicationCard } from './application-card';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

export interface ApplicationsPageClientProps {
  className?: string;
}

export function ApplicationsPageClient({ className }: ApplicationsPageClientProps) {
  const router = useRouter();
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);

  const { data: applications = [], isLoading } = useQuery<ApplicationWithStatus[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      if (!res.ok) throw new Error('Failed to fetch applications');
      return res.json();
    },
    staleTime: 30_000,
  });

  const sorted = useMemo(
    () =>
      [...applications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [applications]
  );

  return (
    <DeploymentStatusProvider initialDeployments={[]}>
      <div data-testid="applications-page-client" className={cn('relative space-y-4', className)}>
        {/* Compact header */}
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-muted-foreground h-4 w-4" />
          <h1 className="text-sm font-bold tracking-tight">Applications</h1>
          {!isLoading ? (
            <span className="text-muted-foreground text-[10px]">
              {applications.length} {applications.length === 1 ? 'app' : 'apps'}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : applications.length === 0 ? (
          <div
            data-testid="applications-page-empty"
            className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
          >
            <LayoutGrid className="mb-2 h-6 w-6 opacity-20" />
            <p className="text-xs">No applications yet.</p>
            <p className="mt-1 text-[11px] opacity-70">
              Tap the <Plus className="inline h-3 w-3 align-text-bottom" /> button to create one.
            </p>
          </div>
        ) : (
          <div
            data-testid="applications-page-grid"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {sorted.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        )}

        {/* FAB — new application */}
        <button
          type="button"
          data-testid="applications-fab-new"
          aria-label="New application"
          onClick={() => setShowCreatePrompt(true)}
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-indigo-400 hover:shadow-xl active:scale-95"
        >
          <Plus className="h-7 w-7 stroke-[2.5]" />
        </button>

        {/* Full-screen create prompt overlay */}
        {showCreatePrompt ? (
          <div className="fixed inset-0 z-50">
            <ControlCenterEmptyState
              onApplicationCreated={(appId) => {
                router.push(`/application/${appId}`);
              }}
              onClose={() => setShowCreatePrompt(false)}
              className="bg-background"
            />
          </div>
        ) : null}
      </div>
    </DeploymentStatusProvider>
  );
}
