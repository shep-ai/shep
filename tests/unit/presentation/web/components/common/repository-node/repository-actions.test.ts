import { describe, it, expect, vi } from 'vitest';
import {
  buildRepositoryActions,
  RepositoryActionKey,
  RepositoryActionTone,
  REPOSITORY_TOOLBAR_ACTION_KEYS,
  type BuildRepositoryActionsInput,
  type RepositoryDeploymentSource,
} from '@/components/common/repository-node/repository-actions';
import type { RepositoryActionsState } from '@/components/common/repository-node/use-repository-actions';
import type { WebhookActionState } from '@/hooks/use-webhook-action';

/** `t` for tests: echo the key so assertions read as the key that was chosen. */
const echo = (key: string) => key;

function files(overrides: Partial<RepositoryActionsState> = {}): RepositoryActionsState {
  return {
    openInIde: vi.fn(),
    openInShell: vi.fn(),
    openFolder: vi.fn(),
    syncMain: vi.fn(),
    ideLoading: false,
    shellLoading: false,
    folderLoading: false,
    syncLoading: false,
    ideError: null,
    shellError: null,
    folderError: null,
    syncError: null,
    ...overrides,
  } as RepositoryActionsState;
}

function webhook(overrides: Partial<WebhookActionState> = {}): WebhookActionState {
  return {
    toggle: vi.fn(),
    enabled: false,
    loading: false,
    error: null,
    tunnelConnected: true,
    webhookId: undefined,
    repoFullName: undefined,
    initializing: false,
    ...overrides,
  } as WebhookActionState;
}

function deployment(
  overrides: Partial<RepositoryDeploymentSource> = {}
): RepositoryDeploymentSource {
  return {
    active: false,
    hasError: false,
    loading: false,
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function build(overrides: Partial<BuildRepositoryActionsInput> = {}) {
  return buildRepositoryActions({
    t: echo,
    files: files(),
    webhook: webhook(),
    deployment: deployment(),
    onOpen: vi.fn(),
    onNewFeature: vi.fn(),
    onChat: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  });
}

function keys(actions: ReturnType<typeof build>) {
  return actions.map((a) => a.key);
}

describe('buildRepositoryActions', () => {
  it('offers every repository action when all callbacks are supplied', () => {
    expect(keys(build())).toEqual([
      RepositoryActionKey.Open,
      RepositoryActionKey.NewFeature,
      RepositoryActionKey.Chat,
      RepositoryActionKey.OpenInIde,
      RepositoryActionKey.OpenInShell,
      RepositoryActionKey.OpenFolder,
      RepositoryActionKey.Webhook,
      RepositoryActionKey.DevServer,
      RepositoryActionKey.Delete,
    ]);
  });

  it('omits actions whose callback the surface did not supply', () => {
    const actions = build({ onOpen: undefined, onNewFeature: undefined, onDelete: undefined });

    expect(keys(actions)).not.toContain(RepositoryActionKey.Open);
    expect(keys(actions)).not.toContain(RepositoryActionKey.NewFeature);
    expect(keys(actions)).not.toContain(RepositoryActionKey.Delete);
  });

  it('omits the dev-server action when no deployment source is available', () => {
    expect(keys(build({ deployment: null }))).not.toContain(RepositoryActionKey.DevServer);
  });

  // ── Toolbar subset ──────────────────────────────────────────────────

  it('exposes every toolbar key as a buildable action', () => {
    const available = new Set(keys(build()));

    for (const key of REPOSITORY_TOOLBAR_ACTION_KEYS) {
      expect(available.has(key)).toBe(true);
    }
  });

  // ── File actions ────────────────────────────────────────────────────

  it('wires the IDE, shell and folder actions to their handlers', () => {
    const state = files();
    const actions = build({ files: state });

    actions.find((a) => a.key === RepositoryActionKey.OpenInIde)?.run();
    actions.find((a) => a.key === RepositoryActionKey.OpenInShell)?.run();
    actions.find((a) => a.key === RepositoryActionKey.OpenFolder)?.run();

    expect(state.openInIde).toHaveBeenCalledOnce();
    expect(state.openInShell).toHaveBeenCalledOnce();
    expect(state.openFolder).toHaveBeenCalledOnce();
  });

  it('reports per-action loading and error independently', () => {
    const actions = build({ files: files({ ideLoading: true, shellError: 'nope' }) });

    const ide = actions.find((a) => a.key === RepositoryActionKey.OpenInIde);
    const shell = actions.find((a) => a.key === RepositoryActionKey.OpenInShell);
    const folder = actions.find((a) => a.key === RepositoryActionKey.OpenFolder);

    expect(ide).toMatchObject({ loading: true, error: false });
    expect(shell).toMatchObject({ loading: false, error: true });
    expect(folder).toMatchObject({ loading: false, error: false });
  });

  // ── Webhook ─────────────────────────────────────────────────────────

  it('labels the webhook action "enable" when it is off', () => {
    const action = build().find((a) => a.key === RepositoryActionKey.Webhook);

    expect(action?.label).toBe('repositoryNode.webhookEnable');
    expect(action?.tone).toBe(RepositoryActionTone.Default);
  });

  it('labels the webhook action "disable" and marks it on when enabled', () => {
    const action = build({ webhook: webhook({ enabled: true }) }).find(
      (a) => a.key === RepositoryActionKey.Webhook
    );

    expect(action?.label).toBe('repositoryNode.webhookDisable');
    expect(action?.tone).toBe(RepositoryActionTone.Positive);
  });

  it('disables the webhook action while the tunnel is down and says why', () => {
    const action = build({ webhook: webhook({ tunnelConnected: false }) }).find(
      (a) => a.key === RepositoryActionKey.Webhook
    );

    expect(action?.disabled).toBe(true);
    expect(action?.label).toBe('repositoryNode.webhookUnavailable');
  });

  it('does not mark an errored webhook as on', () => {
    const action = build({ webhook: webhook({ enabled: true, error: 'boom' }) }).find(
      (a) => a.key === RepositoryActionKey.Webhook
    );

    expect(action?.tone).toBe(RepositoryActionTone.Default);
    expect(action?.error).toBe(true);
  });

  // ── Dev server ──────────────────────────────────────────────────────

  it('starts the dev server when it is idle', () => {
    const source = deployment();
    const action = build({ deployment: source }).find(
      (a) => a.key === RepositoryActionKey.DevServer
    );
    action?.run();

    expect(source.start).toHaveBeenCalledOnce();
    expect(source.stop).not.toHaveBeenCalled();
    expect(action?.label).toBe('repositoryNode.startDevServer');
    expect(action?.tone).toBe(RepositoryActionTone.Positive);
  });

  it('stops the dev server when it is active', () => {
    const source = deployment({ active: true });
    const action = build({ deployment: source }).find(
      (a) => a.key === RepositoryActionKey.DevServer
    );
    action?.run();

    expect(source.stop).toHaveBeenCalledOnce();
    expect(action?.label).toBe('repositoryNode.stopDevServer');
  });

  it('offers a retry label when the last deploy failed', () => {
    const action = build({ deployment: deployment({ hasError: true }) }).find(
      (a) => a.key === RepositoryActionKey.DevServer
    );

    expect(action?.label).toBe('repositoryNode.retry');
  });

  // ── Destructive action ──────────────────────────────────────────────

  it('marks delete as destructive and routes it through the supplied callback', () => {
    const onDelete = vi.fn();
    const action = build({ onDelete }).find((a) => a.key === RepositoryActionKey.Delete);
    action?.run();

    expect(action?.tone).toBe(RepositoryActionTone.Destructive);
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
