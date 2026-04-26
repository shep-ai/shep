'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { createFeature } from '@/app/actions/create-feature';
import { FeatureCreateDrawer } from '@/components/common/feature-create-drawer';
import type { FeatureCreatePayload } from '@/components/common/feature-create-drawer';
import type { ParentFeatureOption } from '@/components/common/feature-create-drawer/feature-create-drawer';
import type { RepositoryOption } from '@/components/common/feature-create-drawer/feature-create-drawer';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';

export interface CreateDrawerClientProps {
  repositoryPath: string;
  initialParentId?: string;
  initialDescription?: string;
  features: ParentFeatureOption[];
  repositories?: RepositoryOption[];
  workflowDefaults?: WorkflowDefaults;
  currentAgentType?: string;
  currentModel?: string;
  canPushDirectly?: boolean;
}

export function CreateDrawerClient({
  repositoryPath,
  initialParentId,
  initialDescription,
  features,
  repositories,
  workflowDefaults,
  currentAgentType,
  currentModel,
  canPushDirectly,
}: CreateDrawerClientProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive open state from the URL. Next.js parallel routes preserve slot
  // content during soft navigation, so this component is NOT unmounted when
  // navigating to `/`. We watch the pathname and let Vaul handle the close
  // animation when the path no longer matches the create route.
  // When submitting, force the drawer closed immediately — router.push('/control-center')
  // is async and the pathname may not update before the next render.
  const pathname = usePathname();
  const isOnCreateRoute = pathname.startsWith('/create');
  const isOpen = !isSubmitting && isOnCreateRoute;

  // Reset isSubmitting once the route has actually changed away from /create,
  // so the drawer can reopen on future visits. Without this, isSubmitting
  // would stay true forever since parallel routes preserve component state.
  useEffect(() => {
    if (!isOnCreateRoute && isSubmitting) {
      setIsSubmitting(false);
    }
  }, [isOnCreateRoute, isSubmitting]);

  const onClose = useCallback(() => {
    router.push('/control-center');
  }, [router]);

  const onSubmit = useCallback(
    (data: FeatureCreatePayload) => {
      setIsSubmitting(true);

      // Close the drawer immediately for responsive UI
      router.push('/control-center');

      // Server action Phase 1 returns fast with real feature ID (DB record created)
      // Phase 2 (metadata, worktree, agent) runs in background on server
      createFeature(data)
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
            return;
          }
          // Dispatch event with real feature ID so control center adds it to featureMap
          window.dispatchEvent(
            new CustomEvent('shep:feature-created', {
              detail: {
                featureId: result.feature!.id,
                name: result.feature!.name,
                description: result.feature!.description,
                repositoryPath: result.feature!.repositoryPath,
                parentId: data.parentId,
              },
            })
          );
        })
        .catch(() => {
          toast.error('Failed to create feature');
          setIsSubmitting(false);
        });
    },
    [router]
  );

  return (
    <FeatureCreateDrawer
      open={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
      repositoryPath={repositoryPath}
      features={features}
      repositories={repositories}
      workflowDefaults={workflowDefaults}
      initialParentId={initialParentId}
      initialDescription={initialDescription}
      isSubmitting={isSubmitting}
      currentAgentType={currentAgentType}
      currentModel={currentModel}
      canPushDirectly={canPushDirectly}
    />
  );
}
