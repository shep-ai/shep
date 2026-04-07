/**
 * Build the action list for the (+) FloatingActionButton on the control
 * center. Extracted from control-center-inner.tsx so the parent component
 * stays focused on graph state + rendering.
 */

import { useMemo } from 'react';
import { FolderOpen, FolderPlus, GitBranch, Github, Sparkles } from 'lucide-react';
import type { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import type { FloatingActionButtonAction } from '@/components/common/floating-action-button';
import type { useFeatureFlags } from '@/hooks/feature-flags-context';

type RouterPushParam = Parameters<ReturnType<typeof useRouter>['push']>[0];

interface UseFabActionsParams {
  router: ReturnType<typeof useRouter>;
  clickSound: { play: () => void };
  guardedNavigate: (fn: () => void) => void;
  handlePickFolder: () => void;
  onNewProject: () => void;
  featureFlags: ReturnType<typeof useFeatureFlags>;
}

export function useFabActions({
  router,
  clickSound,
  guardedNavigate,
  handlePickFolder,
  onNewProject,
  featureFlags,
}: UseFabActionsParams): FloatingActionButtonAction[] {
  const { t } = useTranslation('web');

  return useMemo<FloatingActionButtonAction[]>(() => {
    const actions: FloatingActionButtonAction[] = [
      {
        id: 'new-project',
        label: 'New project',
        icon: <FolderPlus className="h-4 w-4" />,
        onClick: () => {
          clickSound.play();
          onNewProject();
        },
      },
      {
        id: 'new-feature',
        label: t('fab.newFeature'),
        icon: <Sparkles className="h-4 w-4" />,
        onClick: () => {
          clickSound.play();
          guardedNavigate(() => router.push('/create'));
        },
      },
      {
        id: 'add-local-repo',
        label: t('fab.localFolder'),
        icon: <FolderOpen className="h-4 w-4" />,
        onClick: handlePickFolder,
      },
    ];
    if (featureFlags.adoptBranch) {
      actions.push({
        id: 'adopt-branch',
        label: t('fab.adoptBranch'),
        icon: <GitBranch className="h-4 w-4" />,
        onClick: () => {
          guardedNavigate(() => router.push('/adopt' as RouterPushParam));
        },
      });
    }
    if (featureFlags.githubImport) {
      actions.push({
        id: 'add-github-repo',
        label: t('fab.fromGithub'),
        icon: <Github className="h-4 w-4" />,
        onClick: () => {
          window.dispatchEvent(new CustomEvent('shep:open-github-import'));
        },
      });
    }
    return actions;
  }, [
    t,
    clickSound,
    guardedNavigate,
    router,
    handlePickFolder,
    onNewProject,
    featureFlags.adoptBranch,
    featureFlags.githubImport,
  ]);
}
