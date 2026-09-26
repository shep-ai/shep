import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { OverviewTab } from './overview-tab';
import type { FeatureNodeData } from '@/components/common/feature-node';

const meta: Meta<typeof OverviewTab> = {
  title: 'Drawers/Feature/Tabs/OverviewTab',
  component: OverviewTab,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', width: '400px', border: '1px solid var(--color-border)' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OverviewTab>;

/* ---------------------------------------------------------------------------
 * Data fixtures
 * ------------------------------------------------------------------------- */

const fullData: FeatureNodeData = {
  name: 'Auth Module',
  description: 'Implement OAuth2 authentication flow with multiple providers',
  featureId: '#f1',
  lifecycle: 'implementation',
  state: 'running',
  progress: 65,
  agentType: 'claude-code',
  runtime: '2h 15m',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/auth-module',
  pr: {
    url: 'https://github.com/org/repo/pull/42',
    number: 42,
    status: PrStatus.Open,
    ciStatus: CiStatus.Pending,
    commitHash: 'abc1234567890def',
  },
};

const noPrData: FeatureNodeData = {
  name: 'Search Index',
  description: 'Elasticsearch full-text search setup',
  featureId: '#f4',
  lifecycle: 'implementation',
  state: 'running',
  progress: 40,
  agentType: 'claude-code',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/search-index',
};

const noProgressData: FeatureNodeData = {
  name: 'API Rate Limiting',
  description: 'Implement sliding window rate limiting for public endpoints',
  featureId: '#bi1',
  lifecycle: 'requirements',
  state: 'action-required',
  progress: 0,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/api-rate-limiting',
};

const doneData: FeatureNodeData = {
  name: 'Payment Gateway',
  description: 'Stripe integration for subscriptions',
  featureId: '#f3',
  lifecycle: 'deploy',
  state: 'done',
  progress: 100,
  runtime: '1h 42m',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/payment-gateway',
  pr: {
    url: 'https://github.com/org/repo/pull/55',
    number: 55,
    status: PrStatus.Merged,
    ciStatus: CiStatus.Success,
    commitHash: 'def4567890abc123',
  },
};

const blockedData: FeatureNodeData = {
  name: 'Email Service',
  description: 'Transactional email with SendGrid',
  featureId: '#f5',
  lifecycle: 'implementation',
  state: 'blocked',
  progress: 20,
  blockedBy: 'Auth Module',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/email-service',
};

const errorData: FeatureNodeData = {
  name: 'Notification System',
  description: 'Real-time notifications via WebSockets',
  featureId: '#f6',
  lifecycle: 'review',
  state: 'error',
  progress: 30,
  errorMessage: 'Build failed: type mismatch in NotificationHandler',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/notifications',
};

const minimalData: FeatureNodeData = {
  name: 'Minimal Feature',
  featureId: '#f0',
  lifecycle: 'requirements',
  state: 'creating',
  progress: 0,
  repositoryPath: '/home/user/my-repo',
  branch: '',
};

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

/** Default — full data with status, progress, PR card, and details. */
export const Default: Story = {
  args: { data: fullData },
};

/** Run pinned to Opus 5.5 at high effort — effort shown next to the model. */
export const WithPinnedEffort: Story = {
  args: {
    data: { ...fullData, agentType: 'claude-code', modelId: 'claude-opus-5-5', effort: 'high' },
  },
};

/** Feature with no PR — PR card is hidden. */
export const NoPr: Story = {
  args: { data: noPrData },
};

/** Feature with 0% progress — progress bar is hidden. */
export const NoProgress: Story = {
  args: { data: noProgressData },
};

/** Completed feature in deploy phase with merged PR. */
export const DoneWithMergedPr: Story = {
  args: { data: doneData },
};

/** Blocked feature showing blocked-by detail. */
export const Blocked: Story = {
  args: { data: blockedData },
};

/** Error state showing error message detail. */
export const Error: Story = {
  args: { data: errorData },
};

/** Pending feature with the pinned execution switch visible. */
export const PendingWithPinnedConfigSwitch: Story = {
  args: {
    data: {
      ...noProgressData,
      state: 'pending',
      agentType: 'codex-cli',
      modelId: 'gpt-5.4',
    },
    pinnedConfig: {
      agentType: 'codex-cli',
      modelId: 'gpt-5.4',
      onSave: async () => ({ ok: true }),
    },
  },
};

/** Pending feature showing inline save feedback for the pinned execution switch. */
export const PendingWithPinnedConfigError: Story = {
  args: {
    data: {
      ...noProgressData,
      state: 'pending',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
    },
    pinnedConfig: {
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      error: 'Could not save pinned config',
      onSave: async () => ({ ok: false, error: 'Could not save pinned config' }),
    },
  },
};

const errorWithRetryData: FeatureNodeData = {
  ...errorData,
  onRetry: fn(),
};

/** Error state with retry button visible. */
export const ErrorWithRetry: Story = {
  args: { data: errorWithRetryData },
};

/** Running state with stop button visible. */
export const RunningWithStop: Story = {
  args: { data: { ...fullData, onStop: fn() } },
};

/** Minimal data — only required fields, no optional details or PR. */
export const Minimal: Story = {
  args: { data: minimalData },
};

/* ---------------------------------------------------------------------------
 * Fast mode stories
 * ------------------------------------------------------------------------- */

const fastModeData: FeatureNodeData = {
  name: 'Quick Fix',
  description: 'Fast mode feature — skipping SDLC phases',
  featureId: '#fm1',
  lifecycle: 'implementation',
  state: 'running',
  progress: 50,
  fastMode: true,
  agentType: 'claude-code',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/quick-fix',
  userQuery: 'fix the login bug',
  summary: 'Quick fix applied directly from prompt via fast mode',
  createdAt: Date.now() - 10 * 60 * 1000,
  repositoryName: 'my-repo',
  baseBranch: 'main',
};

/** Fast mode feature — shows lightning icon in details section. */
export const FastMode: Story = {
  args: { data: fastModeData },
};

/* ---------------------------------------------------------------------------
 * Lifecycle phase stories
 * ------------------------------------------------------------------------- */

/** Requirements phase. */
export const RequirementsPhase: Story = {
  args: { data: { ...noPrData, lifecycle: 'requirements' as const } },
};

/** Research phase. */
export const ResearchPhase: Story = {
  args: { data: { ...noPrData, lifecycle: 'research' as const } },
};

/** Review phase. */
export const ReviewPhase: Story = {
  args: { data: { ...noPrData, lifecycle: 'review' as const } },
};

/** Maintain phase. */
export const MaintainPhase: Story = {
  args: { data: { ...noPrData, lifecycle: 'maintain' as const } },
};

/** PR with merge conflicts — shows orange "Conflicts" badge. */
export const PrWithMergeConflicts: Story = {
  args: {
    data: {
      ...fullData,
      pr: {
        url: 'https://github.com/org/repo/pull/42',
        number: 42,
        status: PrStatus.Open,
        ciStatus: CiStatus.Failure,
        commitHash: 'abc1234567890def',
        mergeable: false,
      },
    },
  },
};

/* ---------------------------------------------------------------------------
 * Duplicate summary stories
 * ------------------------------------------------------------------------- */

const duplicateSummaryData: FeatureNodeData = {
  name: 'GPT Chat Support',
  description: 'Add support for "gpt chat" experience',
  featureId: '#ds1',
  lifecycle: 'requirements',
  state: 'running',
  progress: 10,
  agentType: 'claude-code',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/gpt-chat',
  userQuery: 'Add support to "gpt chat" experience in the shep app',
  summary: 'Add support to "gpt chat" experience in the shep app',
  createdAt: Date.now() - 5000,
};

/** Summary hidden — userQuery and summary are identical. */
export const DuplicateSummaryHidden: Story = {
  args: { data: duplicateSummaryData },
};

/** Summary visible — userQuery and summary differ. */
export const DifferentSummary: Story = {
  args: {
    data: {
      ...duplicateSummaryData,
      summary: 'Integrate GPT chat experience using prompt-kit components with streaming support',
    },
  },
};

/** Completed feature with PR — progress hidden, PR shown in status section without borders. */
export const CompletedWithPr: Story = {
  args: {
    data: {
      ...fullData,
      lifecycle: 'maintain' as const,
      state: 'done' as const,
      progress: 100,
      pr: {
        url: 'https://github.com/org/repo/pull/55',
        number: 55,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
        commitHash: 'def4567890abc123',
      },
    },
  },
};

/* ---------------------------------------------------------------------------
 * Settings section stories
 * ------------------------------------------------------------------------- */

/** Feature with all settings visible — approval gates, evidence, git, and model. */
export const WithAllSettings: Story = {
  args: {
    data: {
      ...noPrData,
      modelId: 'claude-sonnet-4-6',
      approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
      enableEvidence: true,
      commitEvidence: true,
      push: true,
      openPr: true,
    },
  },
};

/** Feature with no auto-approve gates enabled. */
export const WithSettingsAllDisabled: Story = {
  args: {
    data: {
      ...noPrData,
      modelId: 'gemini-2.5-pro',
      approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      enableEvidence: false,
      commitEvidence: false,
      push: false,
      openPr: false,
    },
  },
};

/** Feature with all auto-approve gates enabled. */
export const WithSettingsAllApproved: Story = {
  args: {
    data: {
      ...noPrData,
      modelId: 'claude-opus-4-6',
      approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
      enableEvidence: true,
      commitEvidence: true,
      push: true,
      openPr: true,
    },
  },
};

/** Feature with settings and fast mode. */
export const FastModeWithSettings: Story = {
  args: {
    data: {
      ...fastModeData,
      modelId: 'claude-sonnet-4-6',
      approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      enableEvidence: true,
      commitEvidence: false,
      push: true,
      openPr: true,
    },
  },
};

/** Feature with evidence enabled but commit to PR disabled. */
export const EvidenceCollectOnly: Story = {
  args: {
    data: {
      ...noPrData,
      enableEvidence: true,
      commitEvidence: false,
    },
  },
};

/* ---------------------------------------------------------------------------
 * Git operations stories
 * ------------------------------------------------------------------------- */

/** Feature with rebase action available — shows "GIT OPERATIONS" section. */
export const WithRebaseAction: Story = {
  args: {
    data: noPrData,
    onRebaseOnMain: fn(),
    onRefreshSync: fn(),
    syncStatus: { ahead: 5, behind: 3, baseBranch: 'main', checkedAt: new Date().toISOString() },
    syncLoading: false,
    syncError: null,
    rebaseLoading: false,
    rebaseError: null,
  },
};

/** Rebase action in loading state. */
export const RebaseLoading: Story = {
  args: {
    data: noPrData,
    onRebaseOnMain: fn(),
    rebaseLoading: true,
    rebaseError: null,
  },
};

/** Rebase action showing error. */
export const RebaseError: Story = {
  args: {
    data: noPrData,
    onRebaseOnMain: fn(),
    rebaseLoading: false,
    rebaseError: 'Rebase failed: unresolvable conflicts in src/index.ts',
  },
};

/* ---------------------------------------------------------------------------
 * Injected skills stories
 * ------------------------------------------------------------------------- */

/** Feature with injected skills displayed in a dedicated section. */
export const WithInjectedSkills: Story = {
  args: {
    data: {
      ...fullData,
      injectedSkills: ['architecture-reviewer', 'cross-validate-artifacts', 'tsp-model'],
    },
  },
};
