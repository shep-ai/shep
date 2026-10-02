import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    Promise.resolve([
      {
        agentType: 'claude-code',
        label: 'Claude Code',
        models: [{ id: 'opus-4', displayName: 'Opus 4', description: 'Best' }],
      },
    ])
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
      installCommand: null,
      authCommand: null,
    })
  ),
}));

vi.mock('@/app/actions/check-tool-status', () => ({
  checkToolStatus: vi.fn(() =>
    Promise.resolve({
      git: { installed: true, version: '2.43.0', installCommand: null, installUrl: null },
      gh: { installed: true, version: '2.60.0', installCommand: null, installUrl: null },
    })
  ),
}));

vi.mock('@/app/actions/get-deployment-status', () => ({
  getDeploymentStatus: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/app/actions/create-project-and-feature', () => ({
  createProjectAndFeature: vi.fn(() => Promise.resolve({ error: 'Not available in test' })),
}));

vi.mock('@/app/actions/create-application', () => ({
  createApplication: vi.fn(() => Promise.resolve({ error: 'Not available in test' })),
}));

vi.mock('@/app/actions/check-all-agents-status', () => ({
  checkAllAgentsStatus: vi.fn(() => Promise.resolve({ 'claude-code': true })),
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
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

import { ControlCenter } from '@/components/features/control-center';
import { SidebarFeaturesProvider } from '@/hooks/sidebar-features-context';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import type { FeatureFlagsState } from '@/lib/feature-flags';
import type { CanvasNodeType } from '@/components/features/features-canvas';

const flagsWithCollaboration: FeatureFlagsState = {
  envDeploy: true,
  debug: false,
  reactFileManager: false,
  projects: false,
  codeReview: false,
  collaboration: true,
  bedrockIntegration: true,
  whatsappDispatch: false,
  aspm: false,
  clusters: false,
  scheduledWorkflows: false,
  githubImport: true,
  queryAwareHarness: false,
};

const repoNode = {
  id: 'repo-1',
  type: 'repositoryNode',
  position: { x: 50, y: 50 },
  data: { name: 'my-repo', repositoryPath: '/home/user/my-repo', id: 'repo-1' },
} as CanvasNodeType;

function renderControlCenter(nodes: CanvasNodeType[]) {
  return render(
    <FeatureFlagsProvider flags={flagsWithCollaboration}>
      <SidebarProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <ControlCenter initialNodes={nodes} initialEdges={[]} />
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </SidebarProvider>
    </FeatureFlagsProvider>
  );
}

describe('ControlCenterInner — collaboration onboarding gating', () => {
  it('does not overlay the collaboration card while the first-run setup is on screen', async () => {
    renderControlCenter([]);

    await waitFor(() => {
      expect(screen.getByTestId('control-center-onboarding')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('collaboration-onboarding')).not.toBeInTheDocument();
  });

  it('shows the collaboration card once the canvas has content', async () => {
    renderControlCenter([repoNode]);

    await waitFor(() => {
      expect(screen.getByTestId('collaboration-onboarding')).toBeInTheDocument();
    });
  });
});

describe('ControlCenterInner — create prompt overlay', () => {
  async function openCreatePrompt() {
    const user = userEvent.setup();
    renderControlCenter([repoNode]);

    const trigger = await screen.findByTestId('fab-action-new-application');
    await user.click(trigger);

    return { user, trigger };
  }

  it('mounts the create prompt as an accessible modal dialog', async () => {
    await openCreatePrompt();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
    expect(screen.getByTestId('control-center-empty-state')).toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the control that opened it', async () => {
    const { user, trigger } = await openCreatePrompt();

    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('traps focus inside the dialog while it is open', async () => {
    await openCreatePrompt();

    const dialog = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
