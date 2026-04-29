import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { Edge } from '@xyflow/react';
import { DeploymentState, PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { FeaturesCanvas } from './features-canvas';
import type { CanvasNodeType } from './features-canvas';
import type { FeatureNodeType } from '@/components/common/feature-node';
import type { RepositoryNodeType } from '@/components/common/repository-node';
import { layoutWithDagre } from '@/lib/layout-with-dagre';
import { DEFAULT_VIEWPORT } from '@/hooks/use-viewport-persistence';

const meta: Meta<typeof FeaturesCanvas> = {
  title: 'Features/FeaturesCanvas',
  component: FeaturesCanvas,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const singleNode: FeatureNodeType = {
  id: 'node-1',
  type: 'featureNode',
  position: { x: 200, y: 150 },
  data: {
    name: 'Auth Module',
    description: 'Implement OAuth2 authentication flow',
    featureId: '#f1',
    lifecycle: 'requirements',
    state: 'running',
    progress: 45,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/auth-module',
  },
};

const multipleNodes: FeatureNodeType[] = [
  {
    id: 'node-1',
    type: 'featureNode',
    position: { x: 50, y: 50 },
    data: {
      name: 'Auth Module',
      description: 'OAuth2 authentication flow with SSO support',
      featureId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      lifecycle: 'implementation',
      state: 'running',
      progress: 65,
      repositoryPath: '/home/user/my-repo',
      repositoryName: 'my-repo',
      branch: 'feat/auth-module',
      worktreePath: '/home/user/.shep/repos/abc123/wt/feat-auth-module',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      hasAgentRun: true,
      hasPlan: true,
      deployment: { status: DeploymentState.Ready, url: 'http://localhost:3001' },
    },
  },
  {
    id: 'node-2',
    type: 'featureNode',
    position: { x: 450, y: 50 },
    data: {
      name: 'User Dashboard',
      description: 'Main user dashboard view with analytics widgets',
      featureId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      lifecycle: 'research',
      state: 'action-required',
      progress: 20,
      repositoryPath: '/home/user/my-repo',
      repositoryName: 'my-repo',
      branch: 'feat/user-dashboard',
      worktreePath: '/home/user/.shep/repos/abc123/wt/feat-user-dashboard',
      agentType: 'cursor',
      modelId: 'claude-opus-4-6',
      hasAgentRun: true,
      hasPlan: false,
    },
  },
  {
    id: 'node-3',
    type: 'featureNode',
    position: { x: 50, y: 280 },
    data: {
      name: 'API Gateway',
      description: 'Rate limiting and routing',
      featureId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      runtime: '1h 42m',
      repositoryPath: '/home/user/my-repo',
      repositoryName: 'my-repo',
      branch: 'feat/api-gateway',
      worktreePath: '/home/user/.shep/repos/abc123/wt/feat-api-gateway',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      fastMode: true,
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/user/my-repo/pull/42',
        number: 42,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
      deployment: { status: DeploymentState.Ready, url: 'http://localhost:3002' },
    },
  },
  {
    id: 'node-4',
    type: 'featureNode',
    position: { x: 450, y: 280 },
    data: {
      name: 'Payment Integration',
      description: 'Stripe payment processing',
      featureId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
      lifecycle: 'review',
      state: 'action-required',
      progress: 85,
      repositoryPath: '/home/user/my-repo',
      repositoryName: 'my-repo',
      branch: 'feat/payment-integration',
      worktreePath: '/home/user/.shep/repos/abc123/wt/feat-payment-integration',
      agentType: 'gemini-cli',
      modelId: 'gemini-2.5-pro',
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/user/my-repo/pull/43',
        number: 43,
        status: PrStatus.Open,
        ciStatus: CiStatus.Pending,
        mergeable: true,
      },
    },
  },
  {
    id: 'node-5',
    type: 'featureNode',
    position: { x: 850, y: 165 },
    data: {
      name: 'Email Service',
      description: 'Transactional email delivery with SendGrid',
      featureId: 'e5f6a7b8-c9d0-1234-efab-345678901234',
      lifecycle: 'implementation',
      state: 'error',
      progress: 30,
      repositoryPath: '/home/user/my-repo',
      repositoryName: 'my-repo',
      branch: 'feat/email-service',
      worktreePath: '/home/user/.shep/repos/abc123/wt/feat-email-service',
      agentType: 'aider',
      modelId: 'claude-sonnet-4-6',
      hasAgentRun: true,
      hasPlan: true,
      errorMessage: 'Build failed: Cannot find module @sendgrid/mail',
      onRetry: fn(),
    },
  },
];

const connectedNodes: FeatureNodeType[] = [
  {
    id: 'node-1',
    type: 'featureNode',
    position: { x: 50, y: 120 },
    data: {
      name: 'Auth Module',
      description: 'OAuth2 authentication',
      featureId: '#f1',
      lifecycle: 'implementation',
      state: 'running',
      progress: 65,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/auth-module',
    },
  },
  {
    id: 'node-2',
    type: 'featureNode',
    position: { x: 450, y: 0 },
    data: {
      name: 'User Dashboard',
      description: 'Depends on auth module',
      featureId: '#f2',
      lifecycle: 'research',
      state: 'blocked',
      progress: 10,
      blockedBy: 'Auth Module',
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/user-dashboard',
    },
  },
  {
    id: 'node-3',
    type: 'featureNode',
    position: { x: 450, y: 240 },
    data: {
      name: 'API Gateway',
      description: 'Depends on auth module',
      featureId: '#f3',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 5,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/api-gateway',
    },
  },
  {
    id: 'node-4',
    type: 'featureNode',
    position: { x: 850, y: 120 },
    data: {
      name: 'Admin Panel',
      description: 'Depends on dashboard and API',
      featureId: '#f4',
      lifecycle: 'requirements',
      state: 'blocked',
      progress: 0,
      blockedBy: 'User Dashboard',
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/admin-panel',
    },
  },
];

const connectedEdges: Edge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2' },
  { id: 'e1-3', source: 'node-1', target: 'node-3' },
  { id: 'e2-4', source: 'node-2', target: 'node-4' },
  { id: 'e3-4', source: 'node-3', target: 'node-4' },
];

export const Empty: Story = {
  args: {
    nodes: [],
    edges: [],
    onAddFeature: () => undefined,
  },
};

export const SingleNode: Story = {
  args: {
    nodes: [singleNode],
    edges: [],
  },
};

export const MultipleNodes: Story = {
  args: {
    nodes: multipleNodes,
    edges: [],
  },
};

export const ConnectedNodes: Story = {
  args: {
    nodes: connectedNodes,
    edges: connectedEdges,
  },
};

export const Interactive: Story = {
  args: {
    nodes: multipleNodes,
    edges: [
      { id: 'e1-2', source: 'node-1', target: 'node-2' },
      { id: 'e3-4', source: 'node-3', target: 'node-4' },
    ],
    onAddFeature: () => undefined,
  },
};

const repoNode: RepositoryNodeType = {
  id: 'repo-1',
  type: 'repositoryNode',
  position: { x: 50, y: 162 },
  data: {
    name: 'shep-ai/shep',
  },
};

const repoFeatureNodes: CanvasNodeType[] = [
  repoNode,
  {
    id: 'feat-1',
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
    id: 'feat-2',
    type: 'featureNode',
    position: { x: 400, y: 230 },
    data: {
      name: 'Feature Flow Canvas',
      description: 'React Flow canvas for features',
      featureId: '#f2',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 20,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/feature-flow-canvas',
    },
  },
];

const dashedEdge = { style: { strokeDasharray: '5 5' } };

const repoFeatureEdges: Edge[] = [
  { id: 'e-repo-f1', source: 'repo-1', target: 'feat-1', ...dashedEdge },
  { id: 'e-repo-f2', source: 'repo-1', target: 'feat-2', ...dashedEdge },
];

export const ConnectedRepositoryMultipleFeatures: Story = {
  args: {
    nodes: repoFeatureNodes,
    edges: repoFeatureEdges,
  },
};

// --- Story 1: Single repository connected to a single feature ---

const singleRepoSingleFeatureNodes: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 50, y: 127 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'feat-1',
    type: 'featureNode',
    position: { x: 400, y: 80 },
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
];

export const ConnectedRepositorySingleFeature: Story = {
  args: {
    nodes: singleRepoSingleFeatureNodes,
    edges: [
      { id: 'e-repo-f1', source: 'repo-1', target: 'feat-1', type: 'straight', ...dashedEdge },
    ],
  },
};

// --- Story 2: Single repository connected to multiple features (one-to-many) ---

const singleRepoMultiFeatNodes: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 50, y: 162 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'feat-1',
    type: 'featureNode',
    position: { x: 400, y: 0 },
    data: {
      name: 'SSO Integration',
      description: 'Single sign-on across all services',
      featureId: '#f1',
      lifecycle: 'implementation',
      state: 'running',
      progress: 40,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/sso-integration',
    },
  },
  {
    id: 'feat-2',
    type: 'featureNode',
    position: { x: 400, y: 185 },
    data: {
      name: 'Auth Module',
      description: 'OAuth2 authentication flow',
      featureId: '#f2',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 10,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/auth-module',
    },
  },
  {
    id: 'feat-3',
    type: 'featureNode',
    position: { x: 400, y: 370 },
    data: {
      name: 'API Gateway',
      description: 'Rate limiting and routing',
      featureId: '#f3',
      lifecycle: 'research',
      state: 'running',
      progress: 25,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/api-gateway',
    },
  },
];

export const SingleRepositoryMultipleFeatures: Story = {
  args: {
    nodes: singleRepoMultiFeatNodes,
    edges: [
      { id: 'e-r1-f1', source: 'repo-1', target: 'feat-1', ...dashedEdge },
      { id: 'e-r1-f2', source: 'repo-1', target: 'feat-2', ...dashedEdge },
      { id: 'e-r1-f3', source: 'repo-1', target: 'feat-3', ...dashedEdge },
    ],
  },
};

// --- Story 3: Multiple repositories each with their own features ---

const multiRepoNodes: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 50, y: 86 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'repo-2',
    type: 'repositoryNode',
    position: { x: 50, y: 270 },
    data: { name: 'shep-ai/web' },
  },
  {
    id: 'feat-1',
    type: 'featureNode',
    position: { x: 400, y: 40 },
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
    id: 'feat-2',
    type: 'featureNode',
    position: { x: 400, y: 225 },
    data: {
      name: 'Dashboard UI',
      description: 'Main dashboard layout and widgets',
      featureId: '#f2',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 15,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/dashboard-ui',
    },
  },
];

export const MultipleRepositories: Story = {
  args: {
    nodes: multiRepoNodes,
    edges: [
      { id: 'e-r1-f1', source: 'repo-1', target: 'feat-1', ...dashedEdge },
      { id: 'e-r2-f2', source: 'repo-2', target: 'feat-2', ...dashedEdge },
    ],
  },
};

// --- Story 4: Multiple repositories with mixed feature connections (dagre layout) ---

const mixedRepoFeatureNodesRaw: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'repo-2',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'shep-ai/web' },
  },
  {
    id: 'repo-3',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'shep-ai/api' },
  },
  {
    id: 'feat-1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
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
    id: 'feat-2',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'SSO Integration',
      description: 'Single sign-on across services',
      featureId: '#f2',
      lifecycle: 'research',
      state: 'action-required',
      progress: 20,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/sso-integration',
    },
  },
  {
    id: 'feat-3',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'API Gateway',
      description: 'Rate limiting and routing',
      featureId: '#f3',
      lifecycle: 'requirements',
      state: 'running',
      progress: 10,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/api-gateway',
    },
  },
  {
    id: 'feat-4',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Admin Panel',
      description: 'Internal admin tools',
      featureId: '#f4',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/admin-panel',
    },
  },
];

const mixedEdges: Edge[] = [
  // repo-1 (cli) → Auth Module (1 feature)
  { id: 'e-r1-f1', source: 'repo-1', target: 'feat-1', ...dashedEdge },
  // repo-2 (web) → SSO and Admin Panel (multiple features from one repo)
  { id: 'e-r2-f2', source: 'repo-2', target: 'feat-2', ...dashedEdge },
  { id: 'e-r2-f4', source: 'repo-2', target: 'feat-4', ...dashedEdge },
  // repo-3 (api) → API Gateway (1 feature)
  { id: 'e-r3-f3', source: 'repo-3', target: 'feat-3', ...dashedEdge },
];

const { nodes: mixedLayoutedNodes, edges: mixedLayoutedEdges } = layoutWithDagre(
  mixedRepoFeatureNodesRaw,
  mixedEdges,
  { direction: 'LR' }
);

export const MultipleRepositoriesMixedConnections: Story = {
  args: {
    nodes: mixedLayoutedNodes,
    edges: mixedLayoutedEdges,
  },
};

export const InteractiveWithRepository: Story = {
  args: {
    nodes: repoFeatureNodes,
    edges: repoFeatureEdges,
    onAddFeature: () => undefined,
  },
};

// --- Viewport Persistence Stories ---

export const WithSavedViewport: Story = {
  args: {
    nodes: repoFeatureNodes,
    edges: repoFeatureEdges,
    defaultViewport: { x: 200, y: 150, zoom: 1.0 },
    onResetViewport: () => DEFAULT_VIEWPORT,
  },
};

export const ZoomedOutViewport: Story = {
  args: {
    nodes: mixedLayoutedNodes,
    edges: mixedLayoutedEdges,
    defaultViewport: { x: 0, y: 0, zoom: 0.5 },
    onResetViewport: () => DEFAULT_VIEWPORT,
  },
};

// --- Fast-mode feature scenario ---

const fastModeNodesRaw: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'feat-fast-1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Quick Bug Fix',
      description: 'Fast-mode feature — skips SDLC, starts at implementation',
      featureId: '#ff1',
      lifecycle: 'implementation',
      state: 'running',
      progress: 30,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/quick-bug-fix',
    },
  },
  {
    id: 'feat-full-1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Auth Module',
      description: 'Full-pipeline feature — goes through all SDLC phases',
      featureId: '#ff2',
      lifecycle: 'requirements',
      state: 'running',
      progress: 15,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/auth-module',
    },
  },
  {
    id: 'feat-fast-2',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Update README',
      description: 'Fast-mode feature — already done',
      featureId: '#ff3',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/update-readme',
    },
  },
];

const fastModeEdges: Edge[] = [
  { id: 'e-r1-ff1', source: 'repo-1', target: 'feat-fast-1', ...dashedEdge },
  { id: 'e-r1-ff2', source: 'repo-1', target: 'feat-full-1', ...dashedEdge },
  { id: 'e-r1-ff3', source: 'repo-1', target: 'feat-fast-2', ...dashedEdge },
];

const { nodes: fastModeLayoutedNodes, edges: fastModeLayoutedEdges } = layoutWithDagre(
  fastModeNodesRaw,
  fastModeEdges,
  { direction: 'LR' }
);

export const FastModeFeatures: Story = {
  name: 'Fast Mode Features (Mixed Pipeline)',
  args: {
    nodes: fastModeLayoutedNodes,
    edges: fastModeLayoutedEdges,
  },
};

// --- Full Spectrum: Every real production state in one view ---
// Manually positioned in logical groups, no repository nodes, no dagre.
//
// Layout (4 columns):
//   Col 1: SDLC Pipeline    Col 2: Approval Gates     Col 3: Terminal States    Col 4: Special States
//   creating                 PRD approve               done (deploy&qa)          blocked
//   running (reqs)           plan approve              done (maintain)           error
//   running (research)       merge approve             fast done                 deleting
//   running (impl)                                                               pending
//   running (review)                                                             fast running

const COL = [0, 420, 840, 1260];
const ROW_H = 210;

const fullSpectrumNodes: CanvasNodeType[] = [
  // ── Column 1: SDLC Pipeline (running through phases) ──

  {
    id: 'feat-creating',
    type: 'featureNode',
    position: { x: COL[0], y: 0 },
    data: {
      name: 'Dark Mode Theme',
      description: 'System-wide dark mode with theme switching',
      featureId: '',
      lifecycle: 'requirements',
      state: 'creating',
      progress: 0,
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: '',
    },
  },
  {
    id: 'feat-running-reqs',
    type: 'featureNode',
    position: { x: COL[0], y: ROW_H },
    data: {
      name: 'OAuth2 SSO Integration',
      description: 'Enterprise SSO with SAML and OIDC providers',
      featureId: 'f7a3b1c9-4e2d-48f6-9a1b-3c5d7e9f0a2b',
      lifecycle: 'requirements',
      state: 'running',
      progress: 15,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/oauth2-sso',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-oauth2-sso',
      hasAgentRun: true,
    },
  },
  {
    id: 'feat-running-research',
    type: 'featureNode',
    position: { x: COL[0], y: ROW_H * 2 },
    data: {
      name: 'Real-time Notifications',
      description: 'WebSocket push notifications with service worker',
      featureId: 'b9d1e3f5-7a2c-4b6e-8d0f-1a3c5e7b9d2f',
      lifecycle: 'research',
      state: 'running',
      progress: 35,
      agentType: 'cursor',
      modelId: 'claude-opus-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/notifications',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-notifications',
      hasAgentRun: true,
    },
  },
  {
    id: 'feat-running-impl',
    type: 'featureNode',
    position: { x: COL[0], y: ROW_H * 3 },
    data: {
      name: 'Search Engine',
      description: 'Full-text search with Elasticsearch',
      featureId: 'a1e3c5d7-9b2f-4a6e-8c0d-f2a4b6d8e0c3',
      lifecycle: 'implementation',
      state: 'running',
      progress: 60,
      agentType: 'gemini-cli',
      modelId: 'gemini-2.5-pro',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/search',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-search',
      hasAgentRun: true,
      hasPlan: true,
      deployment: { status: DeploymentState.Booting },
    },
  },
  {
    id: 'feat-running-review',
    type: 'featureNode',
    position: { x: COL[0], y: ROW_H * 4 },
    data: {
      name: 'Audit Logging',
      description: 'Comprehensive audit trail for compliance',
      featureId: 'd8f0a2b4-c6e8-4d1f-a3b5-c7e9d1f3a5b7',
      lifecycle: 'review',
      state: 'running',
      progress: 80,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/audit-log',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-audit-log',
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/acme/platform/pull/142',
        number: 142,
        status: PrStatus.Open,
        ciStatus: CiStatus.Pending,
      },
      deployment: { status: DeploymentState.Ready, url: 'http://localhost:4001' },
    },
  },

  // ── Column 2: Approval Gates ──

  {
    id: 'feat-approve-prd',
    type: 'featureNode',
    position: { x: COL[1], y: 0 },
    data: {
      name: 'Payment Processing',
      description: 'Stripe integration — awaiting PRD approval',
      featureId: 'e2c8d4a6-1b3f-47e9-8d5c-a0f2b4e6c8d1',
      lifecycle: 'requirements',
      state: 'action-required',
      progress: 25,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/payments',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-payments',
      hasAgentRun: true,
      hasPlan: false,
    },
  },
  {
    id: 'feat-approve-plan',
    type: 'featureNode',
    position: { x: COL[1], y: ROW_H },
    data: {
      name: 'GraphQL API Layer',
      description:
        'Replace REST endpoints with GraphQL schema, resolvers, and client-side codegen for type-safe queries',
      featureId: 'c4a6b8d0-2e4f-49a1-b3c5-d7e9f1a3b5c7',
      lifecycle: 'implementation',
      state: 'action-required',
      progress: 45,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/graphql',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-graphql',
      hasAgentRun: true,
      hasPlan: true,
    },
  },
  {
    id: 'feat-approve-merge',
    type: 'featureNode',
    position: { x: COL[1], y: ROW_H * 2 },
    data: {
      name: 'Rate Limiter',
      description: 'Sliding window — awaiting merge approval',
      featureId: '3b5d7f9a-1c3e-4a6b-8d0e-f2a4c6e8b0d2',
      lifecycle: 'review',
      state: 'action-required',
      progress: 90,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/rate-limiter',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-rate-limiter',
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/acme/platform/pull/143',
        number: 143,
        status: PrStatus.Open,
        ciStatus: CiStatus.Success,
        mergeable: true,
      },
      deployment: { status: DeploymentState.Ready, url: 'http://localhost:4002' },
    },
  },

  // ── Column 3: Terminal States ──

  {
    id: 'feat-done-deploy',
    type: 'featureNode',
    position: { x: COL[2], y: 0 },
    data: {
      name: 'User Dashboard',
      description: 'Analytics dashboard — merged',
      featureId: '5e7a9c1b-3d5f-4a8c-b0e2-d4f6a8c0e2b4',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      runtime: '2h 15m',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/dashboard',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-dashboard',
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/acme/platform/pull/140',
        number: 140,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
      deployment: { status: DeploymentState.Ready, url: 'http://localhost:4003' },
    },
  },
  {
    id: 'feat-done-maintain',
    type: 'featureNode',
    position: { x: COL[2], y: ROW_H },
    data: {
      name: 'CI Pipeline Setup',
      description: 'GitHub Actions CI/CD — completed',
      featureId: '7c9e1a3b-5d7f-4b9d-c1e3-f5a7b9d1e3c5',
      lifecycle: 'maintain',
      state: 'done',
      progress: 100,
      runtime: '45m',
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/ci-pipeline',
      hasAgentRun: true,
      hasPlan: true,
      pr: {
        url: 'https://github.com/acme/platform/pull/120',
        number: 120,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
    },
  },
  {
    id: 'feat-fast-done',
    type: 'featureNode',
    position: { x: COL[2], y: ROW_H * 2 },
    data: {
      name: 'Update README',
      description: 'Fast mode — completed and merged',
      featureId: '1a3b5c7d-9e1f-4a3b-c5d7-e9f1a3b5c7d9',
      lifecycle: 'deploy',
      state: 'done',
      progress: 100,
      runtime: '8m',
      fastMode: true,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/update-readme',
      hasAgentRun: true,
      pr: {
        url: 'https://github.com/acme/platform/pull/145',
        number: 145,
        status: PrStatus.Merged,
        ciStatus: CiStatus.Success,
      },
    },
  },

  // ── Column 4: Special States ──

  {
    id: 'feat-blocked',
    type: 'featureNode',
    position: { x: COL[3], y: 0 },
    data: {
      name: 'Admin Panel',
      description: 'Blocked — waiting on OAuth2 SSO',
      featureId: '9d1f3a5b-7c9e-4d1f-a3b5-c7e9f1a3b5d7',
      lifecycle: 'requirements',
      state: 'blocked',
      progress: 0,
      blockedBy: 'OAuth2 SSO Integration',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/admin-panel',
    },
  },
  {
    id: 'feat-error',
    type: 'featureNode',
    position: { x: COL[3], y: ROW_H },
    data: {
      name: 'Email Service',
      description: 'Agent crashed during implementation',
      featureId: 'ab3c5e7f-9d1a-4b6c-8e0f-2a4d6c8e0b3f',
      lifecycle: 'implementation',
      state: 'error',
      progress: 55,
      errorMessage: 'ENOMEM — out of memory during test execution',
      agentType: 'aider',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/email-service',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-email-service',
      hasAgentRun: true,
      hasPlan: true,
      onRetry: fn(),
    },
  },
  {
    id: 'feat-deleting',
    type: 'featureNode',
    position: { x: COL[3], y: ROW_H * 2 },
    data: {
      name: 'Legacy REST API',
      description: 'Deletion in progress — cleaning up',
      featureId: 'cd5e7a9b-1d3f-4c8e-a0b2-d4f6a8c0e2d4',
      lifecycle: 'implementation',
      state: 'deleting',
      progress: 0,
      agentType: 'claude-code',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/legacy-rest',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-legacy-rest',
      hasAgentRun: true,
    },
  },
  {
    id: 'feat-pending',
    type: 'featureNode',
    position: { x: COL[3], y: ROW_H * 3 },
    data: {
      name: 'Internationalization',
      description: 'Deferred — waiting for manual start',
      featureId: '00000001-0000-0000-0000-000000000001',
      lifecycle: 'pending',
      state: 'pending',
      progress: 0,
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/i18n',
      onStart: fn(),
    },
  },
  {
    id: 'feat-fast-running',
    type: 'featureNode',
    position: { x: COL[3], y: ROW_H * 4 },
    data: {
      name: 'Fix Login Redirect Bug',
      description: 'Fast mode — direct implementation',
      featureId: 'ef7a9c1b-3e5d-4f8a-b2c4-d6e8f0a2c4b6',
      lifecycle: 'implementation',
      state: 'running',
      progress: 40,
      fastMode: true,
      agentType: 'claude-code',
      modelId: 'claude-sonnet-4-6',
      repositoryPath: '/home/dev/platform',
      repositoryName: 'platform',
      branch: 'feat/fix-login-redirect',
      worktreePath: '/home/dev/.shep/repos/abc/wt/feat-fix-login-redirect',
      hasAgentRun: true,
    },
  },
];

export const FullSpectrum: Story = {
  name: 'Full Spectrum (All Real States)',
  args: {
    nodes: fullSpectrumNodes,
    edges: [],
  },
};

// --- Application + Repository + Feature: SDD-mode parent edge ---
//
// Demonstrates that `applicationNode` is registered in the canvas
// nodeTypes map and that an app→feature dependency edge renders
// alongside the existing repo→feature edge.

const appRepoFeatureNodesRaw: CanvasNodeType[] = [
  {
    id: 'repo-1',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { name: 'shep-ai/shep' },
  },
  {
    id: 'app-1',
    type: 'applicationNode',
    position: { x: 0, y: 0 },
    data: {
      id: 'app-uuid-1',
      name: 'Dashboard App',
      description: 'Main web dashboard for analytics',
      status: 'Active',
      repositoryPath: '/home/dev/dashboard-app',
      additionalPathCount: 0,
    },
  },
  {
    id: 'feat-spec-1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'Add password reset flow',
      description: 'SDD-mode feature scoped to Dashboard App',
      featureId: '#fs1',
      lifecycle: 'requirements',
      state: 'running',
      progress: 30,
      repositoryPath: '/home/dev/dashboard-app',
      branch: 'feat/password-reset',
    },
  },
  {
    id: 'feat-plain-1',
    type: 'featureNode',
    position: { x: 0, y: 0 },
    data: {
      name: 'CLI command rename',
      description: 'Repo-scoped feature, no application parent',
      featureId: '#fp1',
      lifecycle: 'implementation',
      state: 'running',
      progress: 55,
      repositoryPath: '/home/user/my-repo',
      branch: 'feat/cli-rename',
    },
  },
];

const appRepoFeatureEdgesRaw: Edge[] = [
  // Existing repo→feature edge for the unrelated, plain feature
  { id: 'e-r1-fp1', source: 'repo-1', target: 'feat-plain-1', ...dashedEdge },
  // App→feature dependency edge (SDD-mode parent edge)
  { id: 'e-app1-fs1', source: 'app-1', target: 'feat-spec-1', type: 'dependencyEdge' },
];

const { nodes: appRepoFeatureLayoutedNodes, edges: appRepoFeatureLayoutedEdges } = layoutWithDagre(
  appRepoFeatureNodesRaw,
  appRepoFeatureEdgesRaw,
  { direction: 'LR' }
);

export const ApplicationWithChildSpecFeature: Story = {
  name: 'Application + Repo + Feature (SDD-mode parent edge)',
  args: {
    nodes: appRepoFeatureLayoutedNodes,
    edges: appRepoFeatureLayoutedEdges,
  },
};
