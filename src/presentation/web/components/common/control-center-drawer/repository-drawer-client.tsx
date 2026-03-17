'use client';

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Code2, Terminal, FolderOpen, RefreshCw } from 'lucide-react';
import { BaseDrawer } from '@/components/common/base-drawer';
import { ActionButton } from '@/components/common/action-button';
import { DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';
import { useRepositoryActions } from '@/components/common/repository-node/use-repository-actions';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { InitRemoteSection } from '@/components/common/repository-node/init-remote-section';
import type { RepositoryNodeData } from '@/components/common/repository-node';

export interface RepositoryDrawerClientProps {
  data: RepositoryNodeData;
}

export function RepositoryDrawerClient({ data }: RepositoryDrawerClientProps) {
  const featureFlags = useFeatureFlags();
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = pathname.startsWith('/repository/');
  const repoActions = useRepositoryActions(
    data.repositoryPath ? { repositoryId: data.id, repositoryPath: data.repositoryPath } : null
  );

  const onClose = useCallback(() => {
    router.push('/');
  }, [router]);

  const repoDeployTarget = data.repositoryPath
    ? {
        targetId: data.repositoryPath,
        targetType: 'repository' as const,
        repositoryPath: data.repositoryPath,
      }
    : undefined;

  const header = (
    <div data-testid="repository-drawer-header">
      <DrawerTitle>{data.name}</DrawerTitle>
      {data.repositoryPath ? (
        <DrawerDescription className="truncate font-mono text-xs">
          {data.repositoryPath}
        </DrawerDescription>
      ) : null}
    </div>
  );

  return (
    <BaseDrawer
      open={isOpen}
      onClose={onClose}
      size="md"
      modal={false}
      header={header}
      deployTarget={featureFlags.envDeploy ? repoDeployTarget : undefined}
      data-testid="repository-drawer"
    >
      {data.repositoryPath ? (
        <div className="flex-1 overflow-y-auto">
          <Separator />
          <div className="flex flex-col gap-3 p-4">
            <div className="text-muted-foreground text-xs font-semibold tracking-wider">
              OPEN WITH
            </div>
            <div className="flex flex-col gap-2">
              <ActionButton
                label="Open in IDE"
                onClick={repoActions.openInIde}
                loading={repoActions.ideLoading}
                error={!!repoActions.ideError}
                icon={Code2}
                variant="outline"
                size="sm"
              />
              <ActionButton
                label="Open in Shell"
                onClick={repoActions.openInShell}
                loading={repoActions.shellLoading}
                error={!!repoActions.shellError}
                icon={Terminal}
                variant="outline"
                size="sm"
              />
              <ActionButton
                label="Open Folder"
                onClick={repoActions.openFolder}
                loading={repoActions.folderLoading}
                error={!!repoActions.folderError}
                icon={FolderOpen}
                variant="outline"
                size="sm"
              />
            </div>
          </div>
          {data.id && featureFlags.gitRebaseSync ? (
            <>
              <Separator />
              <div className="flex flex-col gap-3 p-4">
                <div className="text-muted-foreground text-xs font-semibold tracking-wider">
                  GIT OPERATIONS
                </div>
                <div className="flex flex-col gap-2">
                  <ActionButton
                    label="Sync Main"
                    onClick={repoActions.syncMain}
                    loading={repoActions.syncLoading}
                    error={!!repoActions.syncError}
                    icon={RefreshCw}
                    variant="outline"
                    size="sm"
                  />
                  {repoActions.syncError ? (
                    <p className="text-destructive text-xs">{repoActions.syncError}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
          {data.gitInfoStatus === 'ready' &&
            data.hasRemote === false &&
            !!data.repositoryPath &&
            !!data.id && (
              <InitRemoteSection repositoryId={data.id} repositoryPath={data.repositoryPath} />
            )}
        </div>
      ) : null}
    </BaseDrawer>
  );
}
