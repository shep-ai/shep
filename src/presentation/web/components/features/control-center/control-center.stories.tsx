import type { Meta, StoryObj } from '@storybook/react';
import type { Edge } from '@xyflow/react';
import { ControlCenter } from './control-center';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeType } from '@/components/common/feature-node';
import type { RepositoryNodeType } from '@/components/common/repository-node';
import { layoutWithDagre } from '@/lib/layout-with-dagre';
import { AgentEventsProvider } from '@/hooks/agent-events-provider';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';
import { SidebarFeaturesProvider } from '@/hooks/sidebar-features-context';
import { DeploymentState, PrStatus, CiStatus } from '@shepai/core/domain/generated/output';

// eslint-disable-next-line @typescript-eslint/no-empty-function -- storybook noop callbacks
const noop = () => {};
// eslint-disable-next-line @typescript-eslint/no-empty-function -- storybook noop callbacks
const noopId = (_id: string) => {};

const meta: Meta<typeof ControlCenter> = {
  title: 'Features/ControlCenter',
  component: ControlCenter,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <AgentEventsProvider>
        <SidebarFeaturesProvider>
          <DrawerCloseGuardProvider>
            <div style={{ height: '100vh' }}>
              <Story />
            </div>
          </DrawerCloseGuardProvider>
        </SidebarFeaturesProvider>
      </AgentEventsProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dashedEdge = { style: { strokeDasharray: '5 5' } };

// ---------------------------------------------------------------------------
// FullSpectrum — realistic multi-repo workspace with every state represented
// ---------------------------------------------------------------------------

const fullSpectrumRepos: RepositoryNodeType[] = [
  {
    id: 'repo-backend',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'acme/backend' },
  },
  {
    id: 'repo-frontend',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'acme/frontend' },
  },
  {
    id: 'repo-infra',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'acme/infra' },
  },
];

const fullSpectrumFeatures: FeatureNodeType[] = [
  // --- backend features ---
  {
    id: 'feat-payment',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Payment Processing',
      description:
        'Stripe integration with webhook handling, idempotency keys, and retry logic for failed charges',
      featureId: 'e2c8d4',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 15,
      repositoryPath: '/home/user/acme/backend',
      branch: 'feat/payment-processing',
      agentType: 'claude-code',
      startedAt: Date.now() - 12 * 60_000,
      showHandles: true,
      onDelete: noop,
      onAction: noop,
      hasAgentRun: true,
      pr: undefined,
    },
  },
  {
    id: 'feat-graphql',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'GraphQL API Layer',
      description:
        'Replace REST endpoints with GraphQL schema, resolvers, and client-side codegen for type-safe queries',
      featureId: 'c4a6b8',
      lifecycle: 'implementation',
      state: 'running',
      progress: 47,
      repositoryPath: '/home/user/acme/backend',
      branch: 'feat/graphql-api',
      agentType: 'claude-code',
      startedAt: Date.now() - 38 * 60_000,
      showHandles: true,
      onDelete: noop,
      onAction: noop,
      hasAgentRun: true,
      hasPlan: true,
    },
  },
  {
    id: 'feat-rate-limiter',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Rate Limiter',
      description: 'Sliding window rate limiting with Redis backing store and per-tenant quotas',
      featureId: '3b5d7f',
      lifecycle: 'review',
      state: 'action-required',
      progress: 92,
      repositoryPath: '/home/user/acme/backend',
      branch: 'feat/rate-limiter',
      agentType: 'claude-code',
      showHandles: true,
      onDelete: noop,
      onAction: noop,
      hasAgentRun: true,
      hasPlan: true,
      deployment: {
        status: DeploymentState.Ready,
        url: 'https://feat-rate-limiter.preview.acme.dev',
      },
      pr: {
        url: 'https://github.com/acme/backend/pull/142',
        number: 142,
        status: PrStatus.Open,
        ciStatus: CiStatus.Success,
        mergeable: true,
      },
    },
  },
  {
    id: 'feat-webhooks',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Webhook Delivery System',
      description:
        'Reliable webhook delivery with exponential backoff, dead letter queue, and delivery dashboard',
      featureId: 'a1f3c9',
      lifecycle: 'implementation',
      state: 'blocked',
      progress: 30,
      blockedBy: 'GraphQL API Layer',
      repositoryPath: '/home/user/acme/backend',
      branch: 'feat/webhooks',
      agentType: 'cursor',
      showHandles: true,
      onDelete: noop,
      hasAgentRun: true,
      hasPlan: true,
    },
  },
  {
    id: 'feat-audit-log',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Audit Log',
      description:
        'Immutable audit trail for all mutations with structured event schema and compliance export',
      featureId: 'd8e2a1',
      lifecycle: 'research',
      state: 'running',
      progress: 22,
      repositoryPath: '/home/user/acme/backend',
      branch: 'feat/audit-log',
      agentType: 'gemini-cli',
      startedAt: Date.now() - 5 * 60_000,
      showHandles: true,
      onDelete: noop,
      onAction: noop,
      hasAgentRun: true,
    },
  },

  // --- frontend features ---
  {
    id: 'feat-dashboard',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'User Dashboard',
      description:
        'Analytics dashboard with real-time charts, filterable data tables, and CSV export',
      featureId: '5e7a9c',
      lifecycle: 'maintain',
      state: 'done',
      progress: 100,
      runtime: '2h 15m',
      repositoryPath: '/home/user/acme/frontend',
      branch: 'feat/user-dashboard',
      agentType: 'claude-code',
      showHandles: true,
      onDelete: noop,
      hasAgentRun: true,
      hasPlan: true,
      deployment: { status: DeploymentState.Ready, url: 'https://feat-dashboard.preview.acme.dev' },
      pr: {
        url: 'https://github.com/acme/frontend/pull/87',
        number: 87,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
    },
  },
  {
    id: 'feat-onboarding',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Onboarding Flow',
      description:
        'Multi-step wizard with progress tracking, field validation, and email verification',
      featureId: 'b4c6d2',
      lifecycle: 'implementation',
      state: 'error',
      progress: 55,
      errorMessage: 'Build failed: Cannot find module @acme/shared-ui',
      repositoryPath: '/home/user/acme/frontend',
      branch: 'feat/onboarding',
      agentType: 'claude-code',
      showHandles: true,
      onDelete: noop,
      onRetry: noopId,
      hasAgentRun: true,
      hasPlan: true,
    },
  },
  {
    id: 'feat-notifications',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Push Notifications',
      description:
        'Browser push notifications with service worker, permission prompts, and preference center',
      featureId: 'f2a8e5',
      lifecycle: 'pending',
      state: 'pending',
      progress: 0,
      repositoryPath: '/home/user/acme/frontend',
      branch: 'feat/push-notifications',
      showHandles: true,
      onDelete: noop,
      onStart: noopId,
    },
  },
  {
    id: 'feat-readme',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Update README',
      description:
        'Rewrite developer docs with setup guide, API reference, and architecture diagrams',
      featureId: '1a3b5c',
      lifecycle: 'maintain',
      state: 'done',
      progress: 100,
      runtime: '8m',
      repositoryPath: '/home/user/acme/frontend',
      branch: 'feat/update-readme',
      agentType: 'claude-code',
      fastMode: true,
      showHandles: true,
      onDelete: noop,
      hasAgentRun: true,
      deployment: { status: DeploymentState.Ready, url: 'https://feat-readme.preview.acme.dev' },
      pr: {
        url: 'https://github.com/acme/frontend/pull/91',
        number: 91,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
    },
  },

  // --- infra features ---
  {
    id: 'feat-ci',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'CI Pipeline Setup',
      description:
        'GitHub Actions CI/CD with matrix builds, caching, and automatic preview deployments',
      featureId: '7c9e1a',
      lifecycle: 'maintain',
      state: 'done',
      progress: 100,
      runtime: '45m',
      repositoryPath: '/home/user/acme/infra',
      branch: 'feat/ci-pipeline',
      agentType: 'claude-code',
      showHandles: true,
      onDelete: noop,
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/acme/infra/pull/34',
        number: 34,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
    },
  },
  {
    id: 'feat-terraform',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Terraform Modules',
      description:
        'Reusable Terraform modules for VPC, ECS, RDS, and ElastiCache with multi-region support',
      featureId: '9d1f3b',
      lifecycle: 'implementation',
      state: 'running',
      progress: 71,
      repositoryPath: '/home/user/acme/infra',
      branch: 'feat/terraform-modules',
      agentType: 'cline',
      startedAt: Date.now() - 22 * 60_000,
      showHandles: true,
      onDelete: noop,
      onAction: noop,
      hasAgentRun: true,
      hasPlan: true,
      deployment: { status: DeploymentState.Booting },
    },
  },
];

const fullSpectrumEdges: Edge[] = [
  // repo → feature edges
  { id: 'e-be-payment', source: 'repo-backend', target: 'feat-payment', ...dashedEdge },
  { id: 'e-be-graphql', source: 'repo-backend', target: 'feat-graphql', ...dashedEdge },
  { id: 'e-be-rate', source: 'repo-backend', target: 'feat-rate-limiter', ...dashedEdge },
  { id: 'e-be-webhooks', source: 'repo-backend', target: 'feat-webhooks', ...dashedEdge },
  { id: 'e-be-audit', source: 'repo-backend', target: 'feat-audit-log', ...dashedEdge },
  { id: 'e-fe-dash', source: 'repo-frontend', target: 'feat-dashboard', ...dashedEdge },
  { id: 'e-fe-onboard', source: 'repo-frontend', target: 'feat-onboarding', ...dashedEdge },
  { id: 'e-fe-notif', source: 'repo-frontend', target: 'feat-notifications', ...dashedEdge },
  { id: 'e-fe-readme', source: 'repo-frontend', target: 'feat-readme', ...dashedEdge },
  { id: 'e-infra-ci', source: 'repo-infra', target: 'feat-ci', ...dashedEdge },
  { id: 'e-infra-tf', source: 'repo-infra', target: 'feat-terraform', ...dashedEdge },
  // dependency edges
  { id: 'e-graphql-webhooks', source: 'feat-graphql', target: 'feat-webhooks' },
  { id: 'e-graphql-rate', source: 'feat-graphql', target: 'feat-rate-limiter' },
  { id: 'e-payment-dashboard', source: 'feat-payment', target: 'feat-dashboard' },
  { id: 'e-ci-terraform', source: 'feat-ci', target: 'feat-terraform' },
];

const { nodes: fullSpectrumNodes, edges: fullSpectrumLayoutedEdges } = layoutWithDagre(
  [...fullSpectrumRepos, ...fullSpectrumFeatures] as CanvasNodeType[],
  fullSpectrumEdges,
  { direction: 'LR' }
);

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Empty: Story = {
  args: {
    initialNodes: [],
    initialEdges: [],
  },
};

export const WithFeatures: Story = {
  args: {
    initialNodes: fullSpectrumNodes,
    initialEdges: fullSpectrumLayoutedEdges,
  },
};

// --- Archive toggle stories ---

const archiveRepoNode: RepositoryNodeType = {
  id: 'repo-archive',
  type: 'repositoryNode',
  position: { x: 50, y: 115 },
  data: { name: 'shep-ai/shep' },
};

const archivedFeatureNodes: FeatureNodeType[] = [
  {
    id: 'feat-active',
    type: 'featureNode',
    position: { x: 400, y: 0 },
    data: {
      name: 'Auth Module',
      description: 'OAuth2 authentication flow',
      featureId: '#f1',
      lifecycle: 'implementation',
      state: 'running',
      progress: 65,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/auth-module',
    },
  },
  {
    id: 'feat-done',
    type: 'featureNode',
    position: { x: 400, y: 230 },
    data: {
      name: 'Payment Gateway',
      description: 'Stripe integration for subscriptions',
      featureId: '#f2',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      runtime: '1h 42m',
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/payment-gateway',
    },
  },
  {
    id: 'feat-archived',
    type: 'featureNode',
    position: { x: 800, y: 115 },
    data: {
      name: 'Old Dashboard',
      description: 'Previous iteration of the admin dashboard',
      featureId: '#f3',
      lifecycle: 'maintain',
      state: 'archived',
      progress: 100,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/old-dashboard',
    },
  },
];

/**
 * Canvas with active and archived features.
 * The archive toggle button appears in the top-right corner ("Show archived").
 * Click the toggle to reveal the dimmed archived feature node.
 */
export const WithArchivedFeatures: Story = {
  args: {
    initialNodes: [archiveRepoNode, ...archivedFeatureNodes] as CanvasNodeType[],
    initialEdges: [
      { id: 'e-repo-active', source: 'repo-archive', target: 'feat-active', ...dashedEdge },
      { id: 'e-repo-done', source: 'repo-archive', target: 'feat-done', ...dashedEdge },
      { id: 'e-repo-archived', source: 'repo-archive', target: 'feat-archived', ...dashedEdge },
    ] as Edge[],
  },
};
