'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, MoreHorizontal, Play, Square, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { deleteApplication } from '@/app/actions/delete-application';
import { DeploymentState } from '@shepai/core/domain/generated/output';

export interface ApplicationRowActionsProps {
  applicationId: string;
  applicationName: string;
  repositoryPath: string;
  cloudUrl?: string;
}

export function ApplicationRowActions({
  applicationId,
  applicationName,
  repositoryPath,
  cloudUrl,
}: ApplicationRowActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deploy = useDeployAction({
    targetId: applicationId,
    targetType: 'application',
    repositoryPath,
  });

  const isLocalRunning = deploy.status === DeploymentState.Ready && Boolean(deploy.url);
  const isBooting = deploy.status === DeploymentState.Booting || deploy.deployLoading;

  function handleOpen() {
    setMenuOpen(false);
    router.push(`/application/${applicationId}`);
  }

  function handleStart() {
    setMenuOpen(false);
    void deploy.deploy();
  }

  function handleStop() {
    setMenuOpen(false);
    void deploy.stop();
  }

  function handleOpenLive() {
    setMenuOpen(false);
    const target = deploy.url ?? cloudUrl;
    if (!target) return;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  function handleDeleteRequest() {
    setMenuOpen(false);
    setConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    setConfirmOpen(false);
    const result = await deleteApplication(applicationId);
    if (result.error) {
      toast.error('Failed to delete', { description: result.error });
    } else {
      toast.success('Application deleted');
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      router.refresh();
    }
  }

  const livePreviewUrl = deploy.url ?? cloudUrl ?? null;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isBooting || deploy.stopLoading}
            aria-label="Application actions"
            onClick={(e) => e.stopPropagation()}
          >
            {isBooting || deploy.stopLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleOpen}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>
          {isLocalRunning ? (
            <DropdownMenuItem onClick={handleStop}>
              <Square className="mr-2 h-4 w-4" />
              Stop server
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleStart}>
              <Play className="mr-2 h-4 w-4" />
              Start server
            </DropdownMenuItem>
          )}
          {livePreviewUrl ? (
            <DropdownMenuItem onClick={handleOpenLive}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open live preview
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={handleDeleteRequest}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{applicationName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
