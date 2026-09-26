import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { OverviewTab } from '@/components/common/feature-drawer-tabs/overview-tab';
import type { FeatureNodeData } from '@/components/common/feature-node';

vi.mock('@/components/features/settings/AgentModelPicker', () => ({
  AgentModelPicker: ({
    initialAgentType,
    initialModel,
    agentType,
    model,
    saveError,
    saving,
  }: {
    initialAgentType: string;
    initialModel: string;
    agentType?: string;
    model?: string;
    saveError?: string | null;
    saving?: boolean;
  }) => (
    <div
      data-testid="agent-model-picker"
      data-agent-type={agentType ?? initialAgentType}
      data-model-id={model ?? initialModel}
      data-saving={saving ? 'true' : 'false'}
    >
      {saveError ? <p>{saveError}</p> : null}
    </div>
  ),
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), isPlaying: false })),
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

vi.mock('@/components/common/deployment-status-badge', () => ({
  DeploymentStatusBadge: ({ status }: { status: string | null }) =>
    status ? <div data-testid="deployment-status-badge" data-status={status} /> : null,
}));

const defaultData: FeatureNodeData = {
  name: 'Auth Module',
  description: 'Implement OAuth2 authentication flow',
  featureId: '#f1',
  lifecycle: 'implementation',
  state: 'running',
  progress: 45,
  agentType: 'claude-code',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/auth-module',
};

function renderOverviewTab(data: FeatureNodeData = defaultData) {
  return render(<OverviewTab data={data} />);
}

describe('OverviewTab', () => {
  describe('progress bar', () => {
    it('renders progress bar when progress > 0', () => {
      renderOverviewTab({ ...defaultData, progress: 60 });
      expect(screen.getByTestId('feature-drawer-progress')).toBeInTheDocument();
    });

    it('does not render progress bar when progress is 0', () => {
      renderOverviewTab({ ...defaultData, progress: 0 });
      expect(screen.queryByTestId('feature-drawer-progress')).not.toBeInTheDocument();
    });

    it('does not render progress bar when lifecycle is maintain (completed)', () => {
      renderOverviewTab({ ...defaultData, lifecycle: 'maintain', state: 'done', progress: 100 });
      expect(screen.queryByTestId('feature-drawer-progress')).not.toBeInTheDocument();
    });
  });

  describe('PR info', () => {
    const prData: FeatureNodeData['pr'] = {
      url: 'https://github.com/org/repo/pull/42',
      number: 42,
      status: PrStatus.Merged,
      ciStatus: CiStatus.Success,
      commitHash: 'abc1234567890',
    };

    it('renders PR section when PR exists', () => {
      renderOverviewTab({ ...defaultData, pr: prData });
      expect(screen.getByText('Pull Request')).toBeInTheDocument();
    });

    it('does not render PR section when PR is undefined', () => {
      renderOverviewTab({ ...defaultData, pr: undefined });
      expect(screen.queryByText('Pull Request')).not.toBeInTheDocument();
    });

    it('displays PR number as link', () => {
      renderOverviewTab({ ...defaultData, pr: prData });
      const link = screen.getByRole('link', { name: /#42/i });
      expect(link).toHaveAttribute('href', 'https://github.com/org/repo/pull/42');
    });

    describe('CI status visibility', () => {
      it('shows CI badge when hideCiStatus is false', () => {
        renderOverviewTab({ ...defaultData, pr: prData, hideCiStatus: false });
        expect(screen.getByText('Passing')).toBeInTheDocument();
      });

      it('shows CI badge when hideCiStatus is undefined (default behavior)', () => {
        renderOverviewTab({ ...defaultData, pr: prData, hideCiStatus: undefined });
        expect(screen.getByText('Passing')).toBeInTheDocument();
      });

      it('hides CI badge when hideCiStatus is true', () => {
        renderOverviewTab({ ...defaultData, pr: prData, hideCiStatus: true });
        expect(screen.queryByText('Passing')).not.toBeInTheDocument();
      });

      it('still shows other PR metadata when CI status is hidden', () => {
        renderOverviewTab({
          ...defaultData,
          pr: { ...prData, mergeable: false },
          hideCiStatus: true,
        });
        // PR link should be visible
        expect(screen.getByRole('link', { name: /#42/i })).toBeInTheDocument();
        // Merge conflicts should be visible
        expect(screen.getByText('Conflicts')).toBeInTheDocument();
        // Commit hash should be visible
        expect(screen.getByText('abc1234')).toBeInTheDocument();
        // But CI badge should be hidden
        expect(screen.queryByText('Passing')).not.toBeInTheDocument();
      });
    });

    it('renders PR info inside the overview container regardless of lifecycle', () => {
      renderOverviewTab({
        ...defaultData,
        lifecycle: 'maintain',
        state: 'done',
        progress: 100,
        pr: prData,
      });
      const statusSection = screen.getByTestId('feature-drawer-status');
      expect(statusSection).toBeInTheDocument();
      expect(screen.getByText('Pull Request')).toBeInTheDocument();
    });

    it('renders PR info inside the overview container for non-maintain lifecycle', () => {
      renderOverviewTab({
        ...defaultData,
        lifecycle: 'implementation',
        state: 'running',
        progress: 50,
        pr: prData,
      });
      const statusSection = screen.getByTestId('feature-drawer-status');
      expect(statusSection).toBeInTheDocument();
      expect(screen.getByText('Pull Request')).toBeInTheDocument();
    });

    it('renders merge conflict text when mergeable is false', () => {
      renderOverviewTab({
        ...defaultData,
        pr: { ...prData, mergeable: false },
      });
      expect(screen.getByText('Conflicts')).toBeInTheDocument();
    });

    it('does not render merge conflict text when mergeable is true', () => {
      renderOverviewTab({
        ...defaultData,
        pr: { ...prData, mergeable: true },
      });
      expect(screen.queryByText('Conflicts')).not.toBeInTheDocument();
    });

    it('does not render merge conflict text when mergeable is undefined', () => {
      renderOverviewTab({
        ...defaultData,
        pr: { ...prData, mergeable: undefined },
      });
      expect(screen.queryByText('Conflicts')).not.toBeInTheDocument();
    });
  });

  describe('inline attachments in user query', () => {
    it('renders inline attachment image when userQuery contains @/path reference', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: 'Fix this bug @/home/user/.shep/attachments/pending-abc/screenshot.png',
      });
      expect(screen.getByTestId('inline-attachment-image')).toBeInTheDocument();
    });

    it('renders plain text when userQuery has no attachment references', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: 'Just a simple text query',
      });
      expect(screen.getByText('Just a simple text query')).toBeInTheDocument();
      expect(screen.queryByTestId('inline-attachment-image')).not.toBeInTheDocument();
    });
  });

  describe('duplicate summary hiding', () => {
    it('hides summary when it matches userQuery exactly', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: 'fix the login bug',
        summary: 'fix the login bug',
      });
      expect(screen.getByText('Query')).toBeInTheDocument();
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });

    it('hides summary when it matches userQuery after trimming whitespace', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: '  fix the login bug  ',
        summary: 'fix the login bug',
      });
      expect(screen.getByText('Query')).toBeInTheDocument();
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });

    it('shows summary when it differs from userQuery', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: 'fix the login bug',
        summary: 'Resolved authentication issue in login handler by fixing token validation',
      });
      expect(screen.getByText('Query')).toBeInTheDocument();
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });

    it('shows summary when userQuery is not present', () => {
      renderOverviewTab({
        ...defaultData,
        userQuery: undefined,
        summary: 'Some summary text',
      });
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });
  });

  describe('branch sync section', () => {
    it('renders branch sync when onRebaseOnMain, branch, and onRefreshSync are provided', () => {
      render(
        <OverviewTab
          data={defaultData}
          onRebaseOnMain={vi.fn()}
          onRefreshSync={vi.fn()}
          syncStatus={{
            ahead: 0,
            behind: 0,
            baseBranch: 'main',
            checkedAt: new Date().toISOString(),
          }}
          syncLoading={false}
          syncError={null}
          rebaseLoading={false}
          rebaseError={null}
        />
      );
      expect(screen.getByTestId('branch-sync-status')).toBeInTheDocument();
    });

    it('does not render branch sync when onRebaseOnMain is not provided', () => {
      render(
        <OverviewTab
          data={defaultData}
          onRefreshSync={vi.fn()}
          syncStatus={null}
          syncLoading={false}
          syncError={null}
          rebaseLoading={false}
          rebaseError={null}
        />
      );
      expect(screen.queryByTestId('branch-sync-status')).not.toBeInTheDocument();
    });

    it('does not render branch sync when branch is not set', () => {
      render(
        <OverviewTab
          data={{ ...defaultData, branch: undefined as unknown as string }}
          onRebaseOnMain={vi.fn()}
          onRefreshSync={vi.fn()}
          syncStatus={null}
          syncLoading={false}
          syncError={null}
          rebaseLoading={false}
          rebaseError={null}
        />
      );
      expect(screen.queryByTestId('branch-sync-status')).not.toBeInTheDocument();
    });
  });

  describe('details section', () => {
    it('renders agent type in quick stats', () => {
      renderOverviewTab({ ...defaultData, agentType: 'cursor' });
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Cursor')).toBeInTheDocument();
    });

    it('renders runtime in quick stats', () => {
      renderOverviewTab({ ...defaultData, runtime: '2h 15m' });
      expect(screen.getByText('Runtime')).toBeInTheDocument();
      expect(screen.getByText('2h 15m')).toBeInTheDocument();
    });

    it('renders blocked by info in issues section', () => {
      renderOverviewTab({ ...defaultData, state: 'blocked', blockedBy: 'Payment Service' });
      expect(screen.getByText('Blocked By')).toBeInTheDocument();
      expect(screen.getByText('Payment Service')).toBeInTheDocument();
    });

    it('renders error message in issues section', () => {
      renderOverviewTab({
        ...defaultData,
        state: 'error',
        errorMessage: 'Build failed: type mismatch',
      });
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Build failed: type mismatch')).toBeInTheDocument();
    });

    it('does not render issues section when no blockedBy or errorMessage', () => {
      renderOverviewTab({
        ...defaultData,
        agentType: undefined,
        runtime: undefined,
        blockedBy: undefined,
        errorMessage: undefined,
      });
      expect(screen.queryByText('Issues')).not.toBeInTheDocument();
    });
  });

  describe('settings section', () => {
    const pinnedConfig = {
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      onSave: vi.fn(),
    };

    it('renders settings section when approval gates are provided', () => {
      renderOverviewTab({
        ...defaultData,
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: true },
      });
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('PRD')).toBeInTheDocument();
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Merge')).toBeInTheDocument();
    });

    it('renders git settings when push and openPr are provided', () => {
      renderOverviewTab({
        ...defaultData,
        push: true,
        openPr: false,
      });
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Git')).toBeInTheDocument();
      expect(screen.getByText('Push')).toBeInTheDocument();
      expect(screen.getByText('PR')).toBeInTheDocument();
    });

    it('renders model name in agent card when modelId is provided', () => {
      renderOverviewTab({
        ...defaultData,
        modelId: 'claude-sonnet-4-6',
      });
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('Sonnet 4.6')).toBeInTheDocument();
    });

    it('renders the pinned effort next to the model', () => {
      renderOverviewTab({
        ...defaultData,
        modelId: 'claude-opus-5-5',
        effort: 'high',
      });
      expect(screen.getByTestId('overview-effort')).toHaveTextContent('High effort');
    });

    it('omits the effort badge when the run pinned none', () => {
      renderOverviewTab({ ...defaultData, modelId: 'claude-opus-5-5' });
      expect(screen.queryByTestId('overview-effort')).toBeNull();
    });

    it('renders all settings together', () => {
      renderOverviewTab({
        ...defaultData,
        modelId: 'claude-opus-4-6',
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        push: true,
        openPr: true,
      });
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Opus 4.6')).toBeInTheDocument();
      expect(screen.getByText('PRD')).toBeInTheDocument();
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Merge')).toBeInTheDocument();
      expect(screen.getByText('Push')).toBeInTheDocument();
    });

    it('renders evidence settings when enableEvidence is provided', () => {
      renderOverviewTab({
        ...defaultData,
        enableEvidence: true,
        commitEvidence: false,
      });
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Evidence')).toBeInTheDocument();
      expect(screen.getByText('Collect')).toBeInTheDocument();
      expect(screen.getByText('Add to PR')).toBeInTheDocument();
    });

    it('renders evidence with both badges enabled', () => {
      renderOverviewTab({
        ...defaultData,
        enableEvidence: true,
        commitEvidence: true,
      });
      expect(screen.getByText('Evidence')).toBeInTheDocument();
      expect(screen.getByText('Collect')).toBeInTheDocument();
      expect(screen.getByText('Add to PR')).toBeInTheDocument();
    });

    it('renders evidence with both badges disabled', () => {
      renderOverviewTab({
        ...defaultData,
        enableEvidence: false,
        commitEvidence: false,
      });
      expect(screen.getByText('Evidence')).toBeInTheDocument();
      expect(screen.getByText('Collect')).toBeInTheDocument();
      expect(screen.getByText('Add to PR')).toBeInTheDocument();
    });

    it('hides settings section when no settings fields are provided', () => {
      renderOverviewTab({
        ...defaultData,
        approvalGates: undefined,
        push: undefined,
        openPr: undefined,
        enableEvidence: undefined,
        modelId: undefined,
      });
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it.each(['pending', 'action-required', 'error'] as const)(
      'renders the pinned config switch for eligible "%s" features',
      (state) => {
        render(
          <OverviewTab
            data={{ ...defaultData, state, modelId: 'claude-sonnet-4-6' }}
            pinnedConfig={pinnedConfig}
          />
        );

        expect(screen.getByTestId('agent-model-picker')).toBeInTheDocument();
      }
    );

    it.each([
      ['creating', 'implementation'],
      ['running', 'implementation'],
      ['blocked', 'implementation'],
      ['done', 'maintain'],
    ] as const)(
      'hides the pinned config switch for ineligible "%s" features',
      (state, lifecycle) => {
        render(
          <OverviewTab
            data={{
              ...defaultData,
              state,
              lifecycle,
              modelId: 'claude-sonnet-4-6',
            }}
            pinnedConfig={pinnedConfig}
          />
        );

        expect(screen.queryByTestId('agent-model-picker')).not.toBeInTheDocument();
      }
    );

    it('shows pinned config save errors inline', () => {
      render(
        <OverviewTab
          data={{ ...defaultData, state: 'pending', modelId: 'claude-sonnet-4-6' }}
          pinnedConfig={{
            ...pinnedConfig,
            error: 'Could not save pinned config',
          }}
        />
      );

      expect(screen.getByText('Could not save pinned config')).toBeInTheDocument();
    });
  });
});
