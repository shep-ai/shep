'use client';

/**
 * Binds the repository action matrix to live state.
 *
 * Everything a repository surface needs — file/shell handlers, webhook toggle,
 * dev-server control, chat + create navigation, and the chat turn indicator —
 * is assembled once here so the canvas card and the session-tree row cannot
 * drift apart. Which actions come back depends only on what the surface can
 * support: no path means no path-based actions, no id means no id-based ones.
 */

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { isDeploymentActive } from '@/hooks/deployment-status-store';
import { useWebhookAction } from '@/hooks/use-webhook-action';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { buildCreateUrl } from '@/lib/url-params';
import { useRepositoryActions } from './use-repository-actions';
import {
  buildRepositoryActions,
  type RepositoryAction,
  type RepositoryActionKey,
  type RepositoryDeploymentSource,
} from './repository-actions';

/** Deployments for a repository are keyed by its path, not its id. */
const DEPLOY_TARGET_TYPE = 'repository';

export interface RepositoryCardActionsInput {
  /** Repository domain id. Absent for optimistic/pending rows. */
  repositoryId?: string;
  repositoryName: string;
  /** Absolute repository root. Absent means no path-based action can run. */
  repositoryPath?: string;
  /** Open the repository's own view — omit to leave that action out. */
  onOpen?: () => void;
  /** Request deletion; the caller shows the confirmation dialog. */
  onDelete?: () => void;
  /**
   * Start a new feature. Omit to use the default navigation to the scoped
   * create route; pass a handler when the surface needs its own behaviour
   * (the canvas opens the drawer through its own graph callbacks).
   */
  onNewFeature?: () => void;
  /** Leave the new-feature action out entirely. @default false */
  withoutNewFeature?: boolean;
}

export interface RepositoryCardActionsState {
  /** Every offered action, in canonical order. */
  actions: RepositoryAction[];
  /** Lookup for surfaces that place actions individually. */
  byKey: (key: RepositoryActionKey) => RepositoryAction | undefined;
  /** Live dev-server state, for surfaces that also render its URL. */
  deployment: {
    active: boolean;
    url: string | null;
    error: string | null;
  };
  /** Agent turn status for this repository's chat scope. */
  chatTurnStatus: ReturnType<typeof useTurnStatus>;
}

export function useRepositoryCardActions({
  repositoryId,
  repositoryName,
  repositoryPath,
  onOpen,
  onDelete,
  onNewFeature,
  withoutNewFeature = false,
}: RepositoryCardActionsInput): RepositoryCardActionsState {
  const { t } = useTranslation('web');
  const router = useRouter();
  const featureFlags = useFeatureFlags();

  const filesInput = useMemo(
    () =>
      repositoryPath
        ? { ...(repositoryId !== undefined && { repositoryId }), repositoryPath }
        : null,
    [repositoryId, repositoryPath]
  );
  const files = useRepositoryActions(filesInput);
  const webhook = useWebhookAction(repositoryPath ?? null);

  const deployInput = useMemo(
    () =>
      repositoryPath
        ? {
            targetId: repositoryPath,
            targetType: DEPLOY_TARGET_TYPE as typeof DEPLOY_TARGET_TYPE,
            repositoryPath,
          }
        : null,
    [repositoryPath]
  );
  const deploy = useDeployAction(deployInput);
  const deployActive = isDeploymentActive(deploy.status);

  const chatTurnStatus = useTurnStatus(`repo-${repositoryId ?? repositoryName}`);

  const handleChat = useCallback(() => {
    if (!repositoryId) return;
    router.push(`/repository/${repositoryId}/chat` as Parameters<typeof router.push>[0]);
  }, [router, repositoryId]);

  const handleDefaultNewFeature = useCallback(() => {
    if (!repositoryPath) return;
    router.push(buildCreateUrl({ repo: repositoryPath }) as Parameters<typeof router.push>[0]);
  }, [router, repositoryPath]);

  // The dev-server action only exists where local environments are enabled and
  // there is a path to run them in.
  const deployment = useMemo<RepositoryDeploymentSource | null>(() => {
    if (!featureFlags.envDeploy || !repositoryPath) return null;
    return {
      active: deployActive,
      hasError: deploy.deployError !== null,
      loading: deploy.deployLoading || deploy.stopLoading,
      start: () => void deploy.deploy(),
      stop: () => void deploy.stop(),
    };
  }, [featureFlags.envDeploy, repositoryPath, deployActive, deploy]);

  const actions = useMemo(() => {
    if (!repositoryPath) return [];

    const newFeature = withoutNewFeature ? undefined : (onNewFeature ?? handleDefaultNewFeature);

    return buildRepositoryActions({
      t,
      files,
      webhook,
      deployment,
      ...(onOpen && { onOpen }),
      ...(newFeature && { onNewFeature: newFeature }),
      // Chat lives on the repository entity, so it needs an id.
      ...(repositoryId && { onChat: handleChat }),
      ...(onDelete && repositoryId && { onDelete }),
    });
  }, [
    t,
    files,
    webhook,
    deployment,
    repositoryPath,
    repositoryId,
    onOpen,
    onDelete,
    onNewFeature,
    withoutNewFeature,
    handleChat,
    handleDefaultNewFeature,
  ]);

  const byKey = useCallback(
    (key: RepositoryActionKey) => actions.find((action) => action.key === key),
    [actions]
  );

  return {
    actions,
    byKey,
    deployment: { active: deployActive, url: deploy.url, error: deploy.deployError },
    chatTurnStatus,
  };
}
