import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureDrawerClient } from '@/components/common/control-center-drawer/feature-drawer-client';
import type { DrawerView } from '@/components/common/control-center-drawer/drawer-view';
import type { FeatureNodeData } from '@/components/common/feature-node';

const mockApproveFeature = vi.fn();
const mockGetFeatureArtifact = vi.fn();
const mockGetMergeReviewData = vi.fn();
const mockGetResearchArtifact = vi.fn();
const mockRejectFeature = vi.fn();
const mockResumeFeature = vi.fn();
const mockRouterPush = vi.fn();
const mockStartFeature = vi.fn();
const mockStopFeature = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUpdateFeaturePinnedConfig = vi.fn();

let mockPathname = '/feature/feat-1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname,
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: vi.fn(),
  },
}));

vi.mock('@/app/actions/approve-feature', () => ({
  approveFeature: (...args: unknown[]) => mockApproveFeature(...args),
}));

vi.mock('@/app/actions/get-feature-artifact', () => ({
  getFeatureArtifact: (...args: unknown[]) => mockGetFeatureArtifact(...args),
}));

vi.mock('@/app/actions/get-merge-review-data', () => ({
  getMergeReviewData: (...args: unknown[]) => mockGetMergeReviewData(...args),
}));

vi.mock('@/app/actions/get-research-artifact', () => ({
  getResearchArtifact: (...args: unknown[]) => mockGetResearchArtifact(...args),
}));

vi.mock('@/app/actions/reject-feature', () => ({
  rejectFeature: (...args: unknown[]) => mockRejectFeature(...args),
}));

vi.mock('@/app/actions/resume-feature', () => ({
  resumeFeature: (...args: unknown[]) => mockResumeFeature(...args),
}));

vi.mock('@/app/actions/start-feature', () => ({
  startFeature: (...args: unknown[]) => mockStartFeature(...args),
}));

vi.mock('@/app/actions/stop-feature', () => ({
  stopFeature: (...args: unknown[]) => mockStopFeature(...args),
}));

vi.mock('@/app/actions/update-feature-pinned-config', () => ({
  updateFeaturePinnedConfig: (...args: unknown[]) => mockUpdateFeaturePinnedConfig(...args),
}));

vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: () => ({
    envDeploy: false,
  }),
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: () => ({ play: vi.fn(), stop: vi.fn(), isPlaying: false }),
}));

vi.mock('@/hooks/drawer-close-guard', () => ({
  useGuardedDrawerClose: () => ({ attemptClose: vi.fn() }),
}));

vi.mock('@/hooks/use-deploy-action', () => ({
  useDeployAction: () => ({
    deploy: vi.fn(),
    stop: vi.fn(),
    deployLoading: false,
    stopLoading: false,
    deployError: null,
    status: null,
    url: null,
  }),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useAgentEventsContext: () => ({ events: [] }),
}));

vi.mock('@/hooks/use-branch-sync-status', () => ({
  useBranchSyncStatus: () => ({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/common/base-drawer', () => ({
  BaseDrawer: ({
    open,
    children,
    modal: _modal,
    ...props
  }: {
    open: boolean;
    children: React.ReactNode;
    modal?: boolean;
    [key: string]: unknown;
  }) => (open ? <div {...props}>{children}</div> : null),
}));

vi.mock('@/components/common/deployment-status-badge', () => ({
  DeploymentStatusBadge: () => null,
}));

vi.mock('@/components/common/delete-feature-dialog', () => ({
  DeleteFeatureDialog: () => null,
}));

vi.mock('@/components/common/open-action-menu', () => ({
  OpenActionMenu: () => null,
}));

vi.mock('@/components/common/feature-drawer/use-feature-actions', () => ({
  useFeatureActions: () => ({
    rebaseOnMain: vi.fn(),
    rebaseLoading: false,
    rebaseError: null,
  }),
}));

vi.mock('@/components/common/feature-node/derive-feature-state', () => ({
  resolveSseEventUpdates: () => [],
}));

vi.mock('@/components/common/feature-drawer-tabs', () => ({
  FeatureDrawerTabs: (props: {
    featureId: string;
    featureNode: FeatureNodeData;
    onStart?: (featureId: string) => void;
    onRetry?: (featureId: string) => void;
    continuationActionsDisabled?: boolean;
    pinnedConfig?: {
      agentType: string;
      modelId: string;
      saving?: boolean;
      error?: string | null;
      onSave: (agentType: string, modelId: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }) => (
    <div data-testid="feature-drawer-tabs">
      <div data-testid="node-agent">{props.featureNode.agentType}</div>
      <div data-testid="node-model">{props.featureNode.modelId}</div>
      <div data-testid="selection-agent">{props.pinnedConfig?.agentType ?? ''}</div>
      <div data-testid="selection-model">{props.pinnedConfig?.modelId ?? ''}</div>
      <div data-testid="continuation-actions-disabled">
        {String(Boolean(props.continuationActionsDisabled))}
      </div>
      {props.pinnedConfig?.error ? <div>{props.pinnedConfig.error}</div> : null}
      {props.pinnedConfig ? (
        <button
          type="button"
          onClick={() => void props.pinnedConfig?.onSave('codex-cli', 'gpt-5.4')}
          disabled={props.pinnedConfig.saving}
        >
          Save pinned config
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => props.onStart?.(props.featureId)}
        disabled={props.continuationActionsDisabled}
      >
        Start feature
      </button>
      <button
        type="button"
        onClick={() => props.onRetry?.(props.featureId)}
        disabled={props.continuationActionsDisabled}
      >
        Retry feature
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/common/control-center-drawer/use-artifact-fetch', () => ({
  useArtifactFetch: () => false,
}));

vi.mock('@/components/common/control-center-drawer/use-drawer-sync', () => ({
  useDrawerSync: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const baseNode: FeatureNodeData = {
  name: 'Pinned Config Feature',
  featureId: 'feat-1',
  lifecycle: 'implementation',
  state: 'pending',
  progress: 0,
  repositoryPath: '/tmp/repo',
  branch: '',
  agentType: 'claude-code',
  modelId: 'claude-sonnet-4-6',
};

function createView(overrides: Partial<FeatureNodeData> = {}): DrawerView {
  return {
    type: 'feature',
    initialTab: 'overview',
    node: { ...baseNode, ...overrides },
  };
}

describe('FeatureDrawerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/feature/feat-1';
    mockApproveFeature.mockResolvedValue({ approved: true });
    mockGetFeatureArtifact.mockResolvedValue({});
    mockGetMergeReviewData.mockResolvedValue({});
    mockGetResearchArtifact.mockResolvedValue({});
    mockRejectFeature.mockResolvedValue({ rejected: true, iteration: 1 });
    mockResumeFeature.mockResolvedValue({});
    mockStartFeature.mockResolvedValue({});
    mockStopFeature.mockResolvedValue({ stopped: true });
    mockUpdateFeaturePinnedConfig.mockResolvedValue({ ok: true });
  });

  it('blocks continuation actions while the pinned config save is in flight and patches local node data after success', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ ok: boolean; error?: string }>();
    mockUpdateFeaturePinnedConfig.mockReturnValueOnce(deferred.promise);

    render(<FeatureDrawerClient view={createView()} />);

    expect(screen.getByTestId('node-agent')).toHaveTextContent('claude-code');
    expect(screen.getByTestId('node-model')).toHaveTextContent('claude-sonnet-4-6');

    await user.click(screen.getByRole('button', { name: 'Save pinned config' }));

    await waitFor(() => {
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('gpt-5.4');
      expect(screen.getByRole('button', { name: 'Start feature' })).toBeDisabled();
      expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('true');
    });

    await user.click(screen.getByRole('button', { name: 'Start feature' }));
    expect(mockStartFeature).not.toHaveBeenCalled();

    deferred.resolve({ ok: true });

    await waitFor(() => {
      expect(screen.getByTestId('node-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('node-model')).toHaveTextContent('gpt-5.4');
      expect(screen.getByRole('button', { name: 'Start feature' })).toBeEnabled();
      expect(screen.getByTestId('continuation-actions-disabled')).toHaveTextContent('false');
    });

    expect(mockUpdateFeaturePinnedConfig).toHaveBeenCalledWith('feat-1', 'codex-cli', 'gpt-5.4');
  });

  it('rolls back to the last saved pinned config and shows the save error when persistence fails', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ ok: boolean; error?: string }>();
    mockUpdateFeaturePinnedConfig.mockReturnValueOnce(deferred.promise);

    render(<FeatureDrawerClient view={createView()} />);

    await user.click(screen.getByRole('button', { name: 'Save pinned config' }));

    await waitFor(() => {
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('codex-cli');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('gpt-5.4');
    });

    deferred.resolve({ ok: false, error: 'Could not save pinned config' });

    await waitFor(() => {
      expect(screen.getByTestId('node-agent')).toHaveTextContent('claude-code');
      expect(screen.getByTestId('node-model')).toHaveTextContent('claude-sonnet-4-6');
      expect(screen.getByTestId('selection-agent')).toHaveTextContent('claude-code');
      expect(screen.getByTestId('selection-model')).toHaveTextContent('claude-sonnet-4-6');
      expect(screen.getByText('Could not save pinned config')).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith('Could not save pinned config');
  });
});
