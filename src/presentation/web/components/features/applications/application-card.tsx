'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FolderGit2,
  Globe,
  LayoutGrid,
  Loader2,
  Play,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { deleteApplication } from '@/app/actions/delete-application';
import { deriveAppLiveStatus } from '@/lib/derive-app-status';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

export interface ApplicationCardProps {
  application: ApplicationWithStatus;
  className?: string;
}

const PREVIEW_HEIGHT_PX = 140;

export function ApplicationCard({ application, className }: ApplicationCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const turnStatus = useTurnStatus(featureIdForApplication(application.id));

  const deploy = useDeployAction({
    targetId: application.id,
    targetType: 'application',
    repositoryPath: application.repositoryPath,
  });

  const effectiveDeploymentUrl = deploy.url;
  const live = deriveAppLiveStatus(
    application.status,
    turnStatus,
    !!effectiveDeploymentUrl,
    application.effectiveStatus
  );

  const repoCount = 1 + (application.additionalPaths?.length ?? 0);
  const repoName = application.repositoryPath.split('/').pop() ?? application.repositoryPath;

  return (
    <>
      <div
        data-testid="application-card"
        onClick={() => router.push(`/application/${application.id}`)}
        className={cn(
          'bg-card group relative cursor-pointer overflow-hidden rounded-xl border shadow-sm transition-[border-color,box-shadow] duration-200 hover:shadow-lg dark:bg-neutral-800/80',
          live.borderClass,
          className
        )}
      >
        {/* Header: gradient icon, name, status pill */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <LayoutGrid className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 data-testid="application-card-name" className="truncate text-sm font-medium">
              {application.name}
            </h3>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {application.description}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'relative flex h-2 w-2 items-center justify-center rounded-full',
                live.dotClass
              )}
            >
              {live.pulse ? (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                    live.dotClass
                  )}
                />
              ) : null}
            </span>
            <span className="text-muted-foreground text-[10px]">{live.label}</span>
          </span>
        </div>

        {/* Preview slot */}
        <div className="px-4">
          <div
            className="bg-muted group/preview relative overflow-hidden rounded-lg"
            style={{ height: PREVIEW_HEIGHT_PX }}
          >
            {effectiveDeploymentUrl ? (
              <iframe
                src={effectiveDeploymentUrl}
                title={`${application.name} live preview`}
                className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
                style={{ width: '250%', height: '250%', transform: 'scale(0.4)' }}
                sandbox="allow-same-origin allow-scripts"
                loading="lazy"
              />
            ) : (
              <PreviewPlaceholder effectiveStatus={application.effectiveStatus} />
            )}

            {/* Live overlay — Stop + Open buttons on hover */}
            {deploy.status === DeploymentState.Ready && effectiveDeploymentUrl ? (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/75 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 dark:bg-neutral-950/80"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deploy.stop();
                  }}
                  disabled={deploy.stopLoading}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-[11px] font-semibold text-neutral-900 shadow-md transition-colors hover:border-red-500 hover:bg-red-50 hover:text-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  {deploy.stopLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Square className="h-3 w-3 fill-current" />
                  )}
                  Stop
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (effectiveDeploymentUrl) {
                      window.open(effectiveDeploymentUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-[11px] font-semibold text-neutral-900 shadow-md transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </button>
              </div>
            ) : null}

            {/* Booting spinner */}
            {deploy.status === DeploymentState.Booting || deploy.deployLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-900">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <span className="text-foreground text-[11px] font-medium">Starting…</span>
              </div>
            ) : null}

            {/* Idle — Start Preview on hover (only when app is ready and offline) */}
            {!live.previewDisabled &&
              !effectiveDeploymentUrl &&
              !deploy.deployLoading &&
              deploy.status !== DeploymentState.Booting &&
              !deploy.deployError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/75 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 dark:bg-neutral-950/80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deploy.deploy();
                    }}
                    className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-violet-400 bg-gradient-to-br from-indigo-500 to-violet-600 px-4 text-[11px] font-semibold text-white shadow-md transition-[filter] hover:brightness-110"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    Start Preview
                  </button>
                </div>
              )}

            {/* Interrupted — Continue button on hover */}
            {application.effectiveStatus === 'interrupted' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-950/60 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void fetch(`/api/applications/${application.id}/resume`, { method: 'POST' });
                  }}
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-amber-400 bg-gradient-to-br from-amber-500 to-orange-500 px-4 text-[11px] font-semibold text-white shadow-md transition-[filter] hover:brightness-110"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Continue Build
                </button>
              </div>
            )}

            {/* Delete — top-right of preview slot, visible on card hover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              className="absolute top-1.5 right-1.5 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white/80 text-neutral-500 opacity-0 shadow-sm backdrop-blur-sm transition-all group-hover:opacity-100 hover:!bg-red-500 hover:!text-white dark:bg-neutral-800/80 dark:text-neutral-400"
              aria-label={`Delete ${application.name}`}
              title="Delete application"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Footer: repo info + created date */}
        <div className="flex items-center justify-between px-4 pt-3 pb-4">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <FolderGit2 className="h-3 w-3" />
            {repoName}
            {repoCount > 1 && <span className="text-muted-foreground/60">+{repoCount - 1}</span>}
          </span>
          <span className="text-muted-foreground/60 text-[10px]">
            {new Date(application.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{application.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmOpen(false);
                const result = await deleteApplication(application.id);
                if (result.error) {
                  toast.error('Failed to delete', { description: result.error });
                } else {
                  toast.success('Application deleted');
                  void queryClient.invalidateQueries({ queryKey: ['applications'] });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview placeholders per state                                     */
/* ------------------------------------------------------------------ */

function PreviewPlaceholder({ effectiveStatus }: { effectiveStatus: string }) {
  if (effectiveStatus === 'failed') {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50 dark:bg-red-950/30">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
          <TriangleAlert className="h-5 w-5 text-red-500" />
        </div>
        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Build failed</span>
        <span className="text-muted-foreground/60 text-[10px]">Open app to retry</span>
      </div>
    );
  }

  if (effectiveStatus === 'interrupted') {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-amber-50 dark:bg-amber-950/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Build interrupted
        </span>
        <span className="text-muted-foreground/60 text-[10px]">Open app to continue</span>
      </div>
    );
  }

  if (effectiveStatus === 'building') {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
          Building…
        </span>
      </div>
    );
  }

  // Ready / offline — clean wireframe with globe icon
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/10">
        <Globe className="text-muted-foreground/30 h-5 w-5" />
      </div>
      {/* Mini wireframe behind the icon */}
      <div className="absolute inset-0 opacity-30">
        <div className="flex h-5 items-center gap-1.5 px-2" style={{ background: 'var(--muted)' }}>
          <div className="bg-muted-foreground/10 h-1.5 w-1.5 rounded-full" />
          <div className="bg-muted-foreground/10 h-1.5 w-1.5 rounded-full" />
          <div className="bg-muted-foreground/10 h-1.5 w-1.5 rounded-full" />
          <div className="bg-muted-foreground/10 ms-1.5 h-1.5 w-12 rounded" />
        </div>
        <div className="flex h-[calc(100%-1.25rem)]">
          <div className="border-muted-foreground/5 flex w-[40px] flex-col gap-1.5 border-e p-1.5">
            <div className="bg-muted-foreground/8 h-1.5 w-full rounded" />
            <div className="bg-muted-foreground/8 h-1.5 w-3/4 rounded" />
            <div className="bg-muted-foreground/8 h-1.5 w-full rounded" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
            <div className="bg-muted-foreground/8 h-2 w-2/3 rounded" />
            <div className="bg-muted-foreground/8 h-1.5 w-full rounded" />
            <div className="bg-muted-foreground/8 h-1.5 w-5/6 rounded" />
            <div className="bg-muted-foreground/8 h-1.5 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
