/**
 * The single definition of "what you can do to a repository" in the web UI.
 *
 * Two surfaces offer these actions — the canvas repository card and the
 * Control Center session-tree row — and they must stay in lockstep: an action
 * added here appears on both. Only the *rendering* differs (icon toolbar vs
 * dropdown menu), so this module returns descriptors and takes no view
 * decisions of its own.
 *
 * Pure on purpose: it receives already-resolved hook state and a translate
 * function, so the whole action matrix (labels, tones, disabled/loading rules)
 * is unit-testable without React, routers, or providers.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Code2,
  FolderOpen,
  MessageSquare,
  PanelRightOpen,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { RepositoryActionsState } from './use-repository-actions';
import type { WebhookActionState } from '@/hooks/use-webhook-action';

/** Stable identity for each action, so surfaces can pick and order subsets. */
export const RepositoryActionKey = {
  Open: 'open',
  NewFeature: 'newFeature',
  Chat: 'chat',
  OpenInIde: 'openInIde',
  OpenInShell: 'openInShell',
  OpenFolder: 'openFolder',
  Webhook: 'webhook',
  DevServer: 'devServer',
  Delete: 'delete',
} as const;

export type RepositoryActionKey = (typeof RepositoryActionKey)[keyof typeof RepositoryActionKey];

/**
 * Semantic emphasis, not a colour. Each surface maps a tone to its own
 * classes — the canvas tints an icon button, the menu tints a row.
 */
export const RepositoryActionTone = {
  Default: 'default',
  /** The capability is currently on, or starting it is the encouraged move. */
  Positive: 'positive',
  /** Brand-accented entry point (agent chat). */
  Accent: 'accent',
  /** Removes data. */
  Destructive: 'destructive',
} as const;

export type RepositoryActionTone = (typeof RepositoryActionTone)[keyof typeof RepositoryActionTone];

export interface RepositoryAction {
  key: RepositoryActionKey;
  /** Already-translated, human-readable label. Doubles as the aria-label. */
  label: string;
  icon: LucideIcon;
  run: () => void;
  loading: boolean;
  error: boolean;
  disabled: boolean;
  tone: RepositoryActionTone;
}

/**
 * The actions the canvas card renders inline, in the order it renders them.
 * The canvas ordering is deliberate (least to most destructive) and differs
 * from the canonical order below, so it lives here rather than being derived.
 */
export const REPOSITORY_TOOLBAR_ACTION_KEYS = [
  RepositoryActionKey.OpenInIde,
  RepositoryActionKey.OpenInShell,
  RepositoryActionKey.OpenFolder,
  RepositoryActionKey.Webhook,
  RepositoryActionKey.Chat,
] as const;

/** i18n keys, kept together so both surfaces read identical copy. */
const KEYS = {
  open: 'repositoryNode.openRepository',
  newFeature: 'repositoryNode.newFeature',
  chat: 'repositoryNode.chatWithAgent',
  openInIde: 'repositoryNode.openInIde',
  openInShell: 'repositoryNode.openInShell',
  openFolder: 'repositoryNode.openFolder',
  webhookEnable: 'repositoryNode.webhookEnable',
  webhookDisable: 'repositoryNode.webhookDisable',
  webhookUnavailable: 'repositoryNode.webhookUnavailable',
  startDevServer: 'repositoryNode.startDevServer',
  stopDevServer: 'repositoryNode.stopDevServer',
  retryDevServer: 'repositoryNode.retry',
  delete: 'repositoryNode.removeRepository',
} as const;

/** Minimal translate contract — satisfied by i18next's `t`. */
export type TranslateFn = (key: string) => string;

/**
 * Dev-server state reduced to what an action needs. `null` upstream means the
 * surface cannot offer the action at all (feature flag off, or no path).
 */
export interface RepositoryDeploymentSource {
  active: boolean;
  hasError: boolean;
  loading: boolean;
  start: () => void;
  stop: () => void;
}

export interface BuildRepositoryActionsInput {
  t: TranslateFn;
  files: RepositoryActionsState;
  webhook: WebhookActionState;
  deployment: RepositoryDeploymentSource | null;
  /** Open the repository's own view. Omitted when the repository has no id. */
  onOpen?: () => void;
  onNewFeature?: () => void;
  onChat?: () => void;
  /** Request deletion — the surface owns the confirmation dialog. */
  onDelete?: () => void;
}

/** Every available action, in canonical order. */
export function buildRepositoryActions({
  t,
  files,
  webhook,
  deployment,
  onOpen,
  onNewFeature,
  onChat,
  onDelete,
}: BuildRepositoryActionsInput): RepositoryAction[] {
  const actions: RepositoryAction[] = [];

  if (onOpen) {
    actions.push(descriptor(RepositoryActionKey.Open, t(KEYS.open), PanelRightOpen, onOpen));
  }

  if (onNewFeature) {
    actions.push(
      descriptor(RepositoryActionKey.NewFeature, t(KEYS.newFeature), Plus, onNewFeature, {
        tone: RepositoryActionTone.Positive,
      })
    );
  }

  if (onChat) {
    actions.push(
      descriptor(RepositoryActionKey.Chat, t(KEYS.chat), MessageSquare, onChat, {
        tone: RepositoryActionTone.Accent,
      })
    );
  }

  actions.push(
    descriptor(RepositoryActionKey.OpenInIde, t(KEYS.openInIde), Code2, files.openInIde, {
      loading: files.ideLoading,
      error: files.ideError !== null,
    }),
    descriptor(RepositoryActionKey.OpenInShell, t(KEYS.openInShell), Terminal, files.openInShell, {
      loading: files.shellLoading,
      error: files.shellError !== null,
    }),
    descriptor(RepositoryActionKey.OpenFolder, t(KEYS.openFolder), FolderOpen, files.openFolder, {
      loading: files.folderLoading,
      error: files.folderError !== null,
    }),
    webhookAction(t, webhook)
  );

  if (deployment) {
    actions.push(devServerAction(t, deployment));
  }

  if (onDelete) {
    actions.push(
      descriptor(RepositoryActionKey.Delete, t(KEYS.delete), Trash2, onDelete, {
        tone: RepositoryActionTone.Destructive,
      })
    );
  }

  return actions;
}

/**
 * The webhook toggle needs the tunnel to be up, so an unreachable tunnel
 * becomes the label rather than a silent no-op button.
 */
function webhookAction(t: TranslateFn, webhook: WebhookActionState): RepositoryAction {
  const hasError = webhook.error !== null;
  const label = !webhook.tunnelConnected
    ? t(KEYS.webhookUnavailable)
    : webhook.enabled
      ? t(KEYS.webhookDisable)
      : t(KEYS.webhookEnable);

  return descriptor(RepositoryActionKey.Webhook, label, Radio, webhook.toggle, {
    loading: webhook.loading,
    error: hasError,
    disabled: !webhook.tunnelConnected,
    // "On" is only meaningful when the last toggle actually succeeded.
    tone:
      webhook.enabled && !hasError ? RepositoryActionTone.Positive : RepositoryActionTone.Default,
  });
}

function devServerAction(t: TranslateFn, deployment: RepositoryDeploymentSource): RepositoryAction {
  const label = deployment.hasError
    ? t(KEYS.retryDevServer)
    : deployment.active
      ? t(KEYS.stopDevServer)
      : t(KEYS.startDevServer);
  const icon = deployment.hasError ? RotateCcw : deployment.active ? Square : Play;

  return descriptor(
    RepositoryActionKey.DevServer,
    label,
    icon,
    deployment.active ? deployment.stop : deployment.start,
    {
      loading: deployment.loading,
      // A failed deploy is offered as a retry, so it is not rendered as an
      // error state — the label already carries that information.
      tone: deployment.active ? RepositoryActionTone.Default : RepositoryActionTone.Positive,
    }
  );
}

function descriptor(
  key: RepositoryActionKey,
  label: string,
  icon: LucideIcon,
  run: () => void,
  overrides: Partial<Pick<RepositoryAction, 'loading' | 'error' | 'disabled' | 'tone'>> = {}
): RepositoryAction {
  return {
    key,
    label,
    icon,
    run,
    loading: false,
    error: false,
    disabled: false,
    tone: RepositoryActionTone.Default,
    ...overrides,
  };
}
