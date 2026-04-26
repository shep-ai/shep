'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { adoptBranch } from '@/app/actions/adopt-branch';
import { listBranches } from '@/app/actions/list-branches';
import { AdoptBranchDrawer } from './adopt-branch-drawer';
import type { RepositoryOption } from '@/components/common/feature-create-drawer/feature-create-drawer';

export interface AdoptDrawerClientProps {
  repositoryPath: string;
  repositories: RepositoryOption[];
}

export function AdoptDrawerClient({ repositoryPath, repositories }: AdoptDrawerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedRepoPath, setSelectedRepoPath] = useState(repositoryPath);

  const isOnAdoptRoute = pathname.startsWith('/adopt');
  const isOpen = !isSubmitting && isOnAdoptRoute;

  // Reset isSubmitting once the route has actually changed away from /adopt
  useEffect(() => {
    if (!isOnAdoptRoute && isSubmitting) {
      setIsSubmitting(false);
    }
  }, [isOnAdoptRoute, isSubmitting]);

  // Clear error when drawer reopens and reset selected repo to default
  useEffect(() => {
    if (isOnAdoptRoute) {
      setError(undefined);
      setSelectedRepoPath(repositoryPath);
    }
  }, [isOnAdoptRoute, repositoryPath]);

  // Fetch branches when drawer opens AND a repository is selected
  useEffect(() => {
    if (isOnAdoptRoute && selectedRepoPath) {
      setBranchesLoading(true);
      setBranches([]);
      listBranches(selectedRepoPath)
        .then(setBranches)
        .catch(() => setBranches([]))
        .finally(() => setBranchesLoading(false));
    } else {
      setBranches([]);
    }
  }, [isOnAdoptRoute, selectedRepoPath]);

  const onClose = useCallback(() => {
    router.push('/control-center');
  }, [router]);

  const handleRepositoryChange = useCallback((path: string) => {
    setSelectedRepoPath(path);
  }, []);

  const onSubmit = useCallback(
    (branchName: string, repoPath: string) => {
      setError(undefined);
      setIsSubmitting(true);
      router.push('/control-center');

      adoptBranch({ branchName, repositoryPath: repoPath })
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
            return;
          }
          window.dispatchEvent(
            new CustomEvent('shep:feature-created', {
              detail: {
                featureId: result.feature!.id,
                name: result.feature!.name,
                description: result.feature!.description,
                repositoryPath: result.feature!.repositoryPath,
              },
            })
          );
          toast.success(`Branch adopted as "${result.feature!.name}"`);
        })
        .catch(() => {
          toast.error('Failed to adopt branch');
          setIsSubmitting(false);
        });
    },
    [router]
  );

  return (
    <AdoptBranchDrawer
      open={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      error={error}
      repositories={repositories}
      selectedRepositoryPath={selectedRepoPath}
      onRepositoryChange={handleRepositoryChange}
      branches={branches}
      branchesLoading={branchesLoading}
    />
  );
}
