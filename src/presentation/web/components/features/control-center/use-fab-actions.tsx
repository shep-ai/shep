/**
 * Build the action list for the (+) FloatingActionButton on the control
 * center. Extracted from control-center-inner.tsx so the parent component
 * stays focused on graph state + rendering.
 */

import { useMemo } from 'react';
import {
  ClipboardList,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Github,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import type { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { BuildMode } from '@shepai/core/domain/generated/output';
import type { FloatingActionButtonAction } from '@/components/common/floating-action-button';
import { buildCreateUrl } from '@/lib/url-params';

interface UseFabActionsParams {
  router: ReturnType<typeof useRouter>;
  clickSound: { play: () => void };
  guardedNavigate: (fn: () => void) => void;
  handlePickFolder: () => void;
  onNewProject: () => void;
  onNewApplication: () => void;
  /** Domain UUID of the application currently scoped on the canvas — when
   *  exactly one ApplicationNode is selected/visible, the FAB exposes an
   *  extra "New SDD feature for <app>" item that opens the create drawer
   *  pre-scoped to this application in spec mode. Undefined disables the
   *  action; the rest of the FAB items are unconditional. */
  selectedApplicationId?: string;
  /** Display name of the selected application — used purely for the
   *  i18n interpolation of the FAB item label. */
  selectedApplicationName?: string;
}

export function useFabActions({
  router,
  clickSound,
  guardedNavigate,
  handlePickFolder,
  onNewProject,
  onNewApplication,
  selectedApplicationId,
  selectedApplicationName,
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
      {
        id: 'new-application',
        label: t('fab.newApplication'),
        icon: <LayoutGrid className="h-4 w-4" />,
        onClick: onNewApplication,
      },
    ];
    if (selectedApplicationId) {
      actions.push({
        id: 'new-sdd-feature-for-app',
        label: t('fab.newSddForApp', { appName: selectedApplicationName ?? '' }),
        icon: <ClipboardList className="h-4 w-4" />,
        onClick: () => {
          clickSound.play();
          guardedNavigate(() =>
            router.push(
              buildCreateUrl({
                applicationId: selectedApplicationId,
                mode: BuildMode.Spec,
              })
            )
          );
        },
      });
    }
    actions.push({
      id: 'adopt-branch',
      label: t('fab.adoptBranch'),
      icon: <GitBranch className="h-4 w-4" />,
      onClick: () => {
        guardedNavigate(() => router.push('/adopt'));
      },
    });
    actions.push({
      id: 'add-github-repo',
      label: t('fab.fromGithub'),
      icon: <Github className="h-4 w-4" />,
      onClick: () => {
        window.dispatchEvent(new CustomEvent('shep:open-github-import'));
      },
    });
    return actions;
  }, [
    t,
    clickSound,
    guardedNavigate,
    router,
    handlePickFolder,
    onNewProject,
    onNewApplication,
    selectedApplicationId,
    selectedApplicationName,
  ]);
}
