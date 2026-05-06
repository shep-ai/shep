'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Github, LayoutGrid, Loader2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';
import { ApplicationCard } from './application-card';
import { listDeployments } from '@/app/actions/list-deployments';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';

export interface ApplicationsPageClientProps {
  className?: string;
}

interface NewApplicationCardProps {
  onDescribe(): void;
  onOpenLocalDirectory?: () => void;
  onImportGitHub?: () => void;
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

  // Live dev-server deployments — seeds the DeploymentStatusProvider so the
  // app cards reflect previews started on /application/[id] (or another tab)
  // instead of resetting every time this page mounts. Without this seed the
  // provider's `fullyHydrated` flag (set by the empty SSR hydrate) blocks
  // each card's `ensureHydrated` from fetching, leaving previews invisible.
  const { data: deployments = [] } = useQuery<DeploymentStatusEntry[]>({
    queryKey: ['deployments', 'all'],
    queryFn: () => listDeployments(),
    staleTime: 0,
    refetchInterval: 3_000,
  });

  const sorted = useMemo(
    () =>
      [...applications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [applications]
  );

  return (
    <DeploymentStatusProvider initialDeployments={deployments}>
      <div
        data-testid="applications-page-client"
        className={cn('relative flex min-h-full flex-col', className)}
      >
        {/* Content sits inside padding; the create-prompt overlay sits
            OUTSIDE this inner padded div so it can cover edge-to-edge. */}
        <div className="flex flex-1 flex-col gap-4 p-6">
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
          ) : sorted.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <ControlCenterEmptyState
                onApplicationCreated={(appId) => {
                  router.push(`/application/${appId}`);
                }}
              />
            </div>
          ) : (
            <div
              data-testid="applications-page-grid"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {/* New application placeholder card — always FIRST so the
                  user can click immediately without scanning past their apps. */}
              <NewApplicationCard
                onDescribe={() => setShowCreatePrompt(true)}
                onOpenLocalDirectory={async () => {
                  const { pickFolder } = await import(
                    '@/components/common/add-repository-button/pick-folder'
                  );
                  const path = await pickFolder();
                  if (!path) return;
                  const { adoptLocalDirectory } = await import(
                    '@/app/actions/adopt-local-directory'
                  );
                  const result = await adoptLocalDirectory({ repositoryPath: path });
                  if (result.applicationId) {
                    router.push(`/application/${result.applicationId}`);
                  }
                }}
                onImportGitHub={() =>
                  window.dispatchEvent(new CustomEvent('shep:open-github-import'))
                }
              />

              {sorted.map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))}
            </div>
          )}
        </div>

        {/* Edge-to-edge create-prompt overlay. `absolute` (not `fixed`)
            so it stays contained within the page's relative root and
            never covers the AppsOnlyShell top bar. Sibling of the padded
            content div so it ignores the list's `p-6`. */}
        {showCreatePrompt ? (
          <div className="absolute inset-0 z-40">
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

/**
 * NewApplicationCard — a placeholder card that lives at the end of the
 * applications grid. At rest it shows a subtle dashed border with a
 * centered + icon and label. On hover the + fades out and a vertical
 * list of creation options slides in so the user can pick a path
 * without the card feeling cluttered at a glance.
 */
function NewApplicationCard({
  onDescribe,
  onOpenLocalDirectory,
  onImportGitHub,
}: NewApplicationCardProps) {
  const options: {
    icon: React.ReactNode;
    label: string;
    description: string;
    onClick(): void;
    accent: string;
  }[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: 'Describe with AI',
      description: 'Tell Shep what to build — it scaffolds + ships',
      onClick: onDescribe,
      accent: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/60',
    },
    ...(onOpenLocalDirectory
      ? [
          {
            icon: <FolderOpen className="h-4 w-4" />,
            label: 'Open local project',
            description: 'Pick an existing folder and continue from there',
            onClick: onOpenLocalDirectory,
            accent: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40',
          },
        ]
      : []),
    ...(onImportGitHub
      ? [
          {
            icon: <Github className="h-4 w-4" />,
            label: 'Import from GitHub',
            description: 'Connect an existing repo to manage here',
            onClick: onImportGitHub,
            accent: 'text-foreground bg-muted',
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-sm border-2',
        'border-dashed border-indigo-200 bg-transparent transition-all duration-200',
        'hover:border-indigo-400 hover:bg-indigo-500/[0.03]',
        'dark:border-indigo-900 dark:hover:border-indigo-700',
        'min-h-[280px]'
      )}
      onClick={onDescribe}
    >
      {/* Rest state — centered + icon. Fades out on hover. */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-3',
          'transition-opacity duration-200 group-hover:opacity-0',
          'pointer-events-none'
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-500 dark:bg-indigo-900/60 dark:text-indigo-400">
          <Plus className="h-5 w-5 stroke-[2]" />
        </div>
        <div className="text-center">
          <p className="text-foreground text-sm font-semibold">New application</p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Click to get started</p>
        </div>
      </div>

      {/* Hover state — vertical option list slides up from invisible. */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-center gap-1.5 px-4',
          'translate-y-3 opacity-0 transition-all duration-200',
          'group-hover:translate-y-0 group-hover:opacity-100'
        )}
      >
        <p className="text-muted-foreground mb-1 px-1 text-[10px] font-medium tracking-wide uppercase">
          How would you like to start?
        </p>
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              opt.onClick();
            }}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left',
              'border-border/60 bg-background/80 border transition-all duration-150',
              'hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40'
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                opt.accent
              )}
            >
              {opt.icon}
            </span>
            <div className="min-w-0">
              <div className="text-foreground text-[12px] font-semibold">{opt.label}</div>
              <div className="text-muted-foreground truncate text-[10px]">{opt.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
