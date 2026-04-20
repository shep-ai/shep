'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { Application } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { useApplicationUpdate } from '@/hooks/agent-events-provider';
import { ApplicationPage } from './application-page';
import type { InitialDeploymentSnapshot } from './application-page';

interface AppData {
  application: Application;
  initialChatState?: ChatState;
  deployment?: { state: string; url: string | null };
}

export function ApplicationPageLoader({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AppData>({
    queryKey: ['application', applicationId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${applicationId}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('Failed to fetch application');
      return res.json();
    },
    staleTime: 60_000,
    retry: (count, err) => {
      if (err instanceof Error && err.message === 'not-found') return false;
      return count < 2;
    },
  });

  // Merge typed `ApplicationUpdated` deltas into the cached AppData
  // in-place — no HTTP refetch, no blanket invalidation. The backend
  // emits a payload whenever server-owned fields flip; we patch the
  // cache so `setupComplete`, `status`, `gitRemoteUrl`, and
  // `cloudDeploymentProvider` update the moment the event arrives.
  const applicationUpdate = useApplicationUpdate(applicationId);
  useEffect(() => {
    if (!applicationUpdate) return;
    queryClient.setQueryData<AppData>(['application', applicationId], (old) => {
      if (!old) return old;
      return {
        ...old,
        application: { ...old.application, ...applicationUpdate },
      };
    });
  }, [applicationUpdate, queryClient, applicationId]);

  if (error?.message === 'not-found') {
    notFound();
  }

  if (isLoading || !data) {
    return (
      <div className="bg-background flex h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  const { application, initialChatState, deployment } = data;

  const initialDeployment: InitialDeploymentSnapshot | undefined = deployment
    ? { state: deployment.state as InitialDeploymentSnapshot['state'], url: deployment.url }
    : undefined;

  const initialDeployments: DeploymentStatusEntry[] = initialDeployment
    ? [
        {
          targetId: application.id,
          targetType: 'application',
          state: initialDeployment.state,
          url: initialDeployment.url,
        },
      ]
    : [];

  return (
    <DeploymentStatusProvider initialDeployments={initialDeployments}>
      <ApplicationPage
        application={application}
        initialChatState={initialChatState}
        initialDeployment={initialDeployment}
      />
    </DeploymentStatusProvider>
  );
}
