import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useAgentEventsContext: () => ({
    events: [],
    lastEvent: null,
    connectionStatus: 'connected' as const,
  }),
}));

const stubUnsubscribe = () => {
  /* stub */
};
const STABLE_EMPTY_ENTRY = {
  status: null,
  url: null,
  targetType: null,
  hydrated: false,
  deployLoading: false,
  stopLoading: false,
  deployError: null,
};
const deploymentStatusStub = {
  store: {
    hydrate: vi.fn(),
    getEntry: vi.fn(() => STABLE_EMPTY_ENTRY),
    update: vi.fn(),
    setStatus: vi.fn(),
    subscribe: vi.fn(() => stubUnsubscribe),
    subscribeAll: vi.fn(() => stubUnsubscribe),
  },
  deploy: vi.fn(),
  stop: vi.fn(),
  ensureHydrated: vi.fn(),
};
vi.mock('@/hooks/deployment-status-provider', () => ({
  useDeploymentStatusContext: () => deploymentStatusStub,
  useDeploymentStatusContextOptional: () => deploymentStatusStub,
}));

vi.mock('@/app/actions/agent-setup-flag', () => ({
  isAgentSetupComplete: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: vi.fn(() =>
    Promise.resolve([{ agentType: 'dev', label: 'Demo', models: [] }])
  ),
}));

vi.mock('@/app/actions/update-agent-and-model', () => ({
  updateAgentAndModel: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('@/app/actions/check-agent-auth', () => ({
  checkAgentAuth: vi.fn(() =>
    Promise.resolve({
      agentType: 'dev',
      installed: true,
      authenticated: true,
      label: 'Demo',
      binaryName: null,
      authCommand: null,
    })
  ),
}));

vi.mock('@/components/common/feature-node/agent-type-icons', () => ({
  getAgentTypeIcon: () => {
    function MockIcon(props: Record<string, unknown>) {
      return <span data-testid="agent-icon" {...props} />;
    }
    return MockIcon;
  },
}));

vi.mock('@/lib/model-metadata', () => ({
  getModelMeta: (id: string) => ({
    displayName: id,
    description: `Description for ${id}`,
  }),
}));

vi.mock('next/image', () => ({
  default: function MockImage(props: Record<string, unknown>) {
    return <img {...props} />;
  },
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useAllTurnStatuses: () => ({}),
}));

import { ControlCenter } from '@/components/features/control-center';
import { SidebarFeaturesProvider } from '@/hooks/sidebar-features-context';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeType } from '@/components/common/feature-node';

const mockFeatureNode: FeatureNodeType = {
  id: 'node-1',
  type: 'featureNode',
  position: { x: 0, y: 0 },
  data: {
    name: 'Test Feature',
    description: 'A test feature',
    featureId: '#f1',
    lifecycle: 'requirements',
    state: 'running',
    progress: 50,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/test-feature',
  },
};

const mockFeatureNode2: FeatureNodeType = {
  id: 'node-2',
  type: 'featureNode',
  position: { x: 400, y: 0 },
  data: {
    name: 'Another Feature',
    description: 'Second feature',
    featureId: '#f2',
    lifecycle: 'implementation',
    state: 'done',
    progress: 100,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/another-feature',
  },
};

describe('ControlCenter', () => {
  it('renders the control-center container', () => {
    render(
      <SidebarProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <ControlCenter initialNodes={[]} initialEdges={[]} />
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </SidebarProvider>
    );
    expect(screen.getByTestId('control-center')).toBeInTheDocument();
  });

  it('shows empty state with agent setup when no nodes provided', async () => {
    render(
      <SidebarProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <ControlCenter initialNodes={[]} initialEdges={[]} />
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </SidebarProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('control-center-empty-state')).toBeInTheDocument();
    });
    // Agent setup wizard is shown first — repo section is gated behind it
    expect(screen.getByTestId('welcome-agent-setup')).toBeInTheDocument();
  });

  it('renders feature nodes when initialNodes has feature nodes', () => {
    const repoNode = {
      id: 'repo-1',
      type: 'repositoryNode',
      position: { x: 50, y: 50 },
      data: { name: 'my-repo', repositoryPath: '/home/user/my-repo', id: 'repo-1' },
    } as CanvasNodeType;

    render(
      <SidebarProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <ControlCenter
              initialNodes={[
                repoNode,
                mockFeatureNode as CanvasNodeType,
                mockFeatureNode2 as CanvasNodeType,
              ]}
              initialEdges={[]}
            />
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </SidebarProvider>
    );
    expect(screen.getByText('Test Feature')).toBeInTheDocument();
    expect(screen.getByText('Another Feature')).toBeInTheDocument();
  });
});
