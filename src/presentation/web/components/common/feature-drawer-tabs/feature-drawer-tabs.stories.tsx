import type { Meta, StoryObj } from '@storybook/react';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { FeatureDrawerTabs } from './feature-drawer-tabs';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { PrdQuestionnaireData } from '@/components/common/prd-questionnaire';
import type { TechDecisionsReviewData } from '@/components/common/tech-decisions-review';
import type { ProductDecisionsSummaryData } from '@/components/common/product-decisions-summary';
import type { MergeReviewData } from '@/components/common/merge-review';

const meta: Meta<typeof FeatureDrawerTabs> = {
  title: 'Drawers/Feature/Tabs/FeatureDrawerTabs',
  component: FeatureDrawerTabs,
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
type Story = StoryObj<typeof FeatureDrawerTabs>;

/* ---------------------------------------------------------------------------
 * Data fixtures
 * ------------------------------------------------------------------------- */

const runningFeature: FeatureNodeData = {
  name: 'Auth Module',
  description: 'Implement OAuth2 authentication flow with multiple providers',
  featureId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  lifecycle: 'implementation',
  state: 'running',
  progress: 65,
  agentType: 'claude-code',
  runtime: '2h 15m',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/auth-module',
  oneLiner: 'implement oauth2 authentication flow with google and github providers',
  userQuery: 'add oauth2 authentication with google and github',
  summary:
    'Implement OAuth2 authentication flow with multiple providers including Google, GitHub, and custom OIDC',
  createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
  hasPlan: true,
  pr: {
    url: 'https://github.com/org/repo/pull/42',
    number: 42,
    status: PrStatus.Open,
    ciStatus: CiStatus.Pending,
    commitHash: 'abc1234567890def',
  },
};

const doneFeature: FeatureNodeData = {
  name: 'Payment Gateway',
  description: 'Stripe integration for subscriptions',
  featureId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
  lifecycle: 'deploy',
  state: 'done',
  progress: 100,
  runtime: '1h 42m',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/payment-gateway',
  oneLiner: 'stripe payment gateway integration for subscriptions and one-time purchases',
  userQuery: 'integrate stripe for payments',
  summary: 'Stripe integration for subscriptions and one-time payments',
  createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
  hasPlan: true,
  pr: {
    url: 'https://github.com/org/repo/pull/55',
    number: 55,
    status: PrStatus.Merged,
    ciStatus: CiStatus.Success,
    commitHash: 'def4567890abc123',
  },
};

const requirementsFeature: FeatureNodeData = {
  name: 'API Rate Limiting',
  description: 'Implement sliding window rate limiting for public endpoints',
  featureId: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
  lifecycle: 'requirements',
  state: 'action-required',
  progress: 0,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/api-rate-limiting',
  oneLiner: 'sliding window rate limiter for all public-facing api endpoints',
  userQuery: 'add rate limiting to public api endpoints',
  summary: 'Implement sliding window rate limiting for public endpoints',
  createdAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
};

const techReviewFeature: FeatureNodeData = {
  name: 'Agent Executor',
  description: 'Abstraction layer for multiple AI agent backends',
  featureId: 'd4e5f6a7-b8c9-0123-defa-456789012345',
  lifecycle: 'implementation',
  state: 'action-required',
  progress: 25,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/agent-executor',
  oneLiner: 'agent executor abstraction layer supporting multiple ai backends',
  userQuery: 'abstract agent executors for multi-backend support',
  summary: 'Abstraction layer for multiple AI agent backends',
  createdAt: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
  repositoryName: 'my-repo',
  baseBranch: 'develop',
};

const mergeReviewFeature: FeatureNodeData = {
  name: 'Auth Module',
  description: 'OAuth2 authentication flow',
  featureId: 'e5f6a7b8-c9d0-1234-efab-567890123456',
  lifecycle: 'review',
  state: 'action-required',
  progress: 90,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/auth-module',
  oneLiner: 'oauth2 login flow with google and github identity providers',
  userQuery: 'add oauth2 login flow',
  summary: 'OAuth2 authentication flow with Google and GitHub providers',
  createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
  hasPlan: true,
  pr: {
    url: 'https://github.com/shep-ai/shep/pull/42',
    number: 42,
    status: PrStatus.Open,
    ciStatus: CiStatus.Success,
    commitHash: 'a1b2c3d4e5f6789',
  },
};

const errorFeature: FeatureNodeData = {
  name: 'Email Service',
  description: 'Transactional email with SendGrid',
  featureId: 'f6a7b8c9-d0e1-2345-fabc-678901234567',
  lifecycle: 'review',
  state: 'error',
  progress: 30,
  errorMessage: 'Build failed: type mismatch in EmailHandler',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/email-service',
  oneLiner: 'sendgrid-based transactional email service for notifications and alerts',
  userQuery: 'set up sendgrid for transactional emails',
  summary: 'Transactional email with SendGrid for notifications and alerts',
  createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 1 week ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
  hasPlan: true,
};

/* ---------------------------------------------------------------------------
 * Review data fixtures
 * ------------------------------------------------------------------------- */

const prdFixture: PrdQuestionnaireData = {
  question: 'Review Feature Requirements',
  context: 'Please review the AI-generated requirements below.',
  questions: [
    {
      id: 'problem',
      question: 'What specific problem does this feature solve?',
      type: 'select',
      options: [
        {
          id: 'user_pain',
          label: 'User Pain Point',
          rationale: 'Addresses a recurring user complaint',
          recommended: true,
        },
        { id: 'market_gap', label: 'Market Gap', rationale: 'Fills a gap vs competitors' },
        {
          id: 'tech_debt',
          label: 'Technical Debt',
          rationale: 'Reduces accumulated technical debt',
        },
      ],
    },
    {
      id: 'priority',
      question: 'What is the business priority level?',
      type: 'select',
      options: [
        { id: 'p0', label: 'P0 - Critical', rationale: 'Blocking issue, must fix immediately' },
        {
          id: 'p1',
          label: 'P1 - High',
          rationale: 'Important for next release',
          recommended: true,
        },
        { id: 'p2', label: 'P2 - Medium', rationale: 'Nice to have' },
      ],
    },
  ],
  finalAction: {
    id: 'approve-reqs',
    label: 'Approve Requirements',
    description: 'Finalize and lock the requirements for implementation',
  },
};

const techFixture: TechDecisionsReviewData = {
  name: 'Agent Executor Abstraction',
  summary: 'Research into the best approach for abstracting agent executors.',
  technologies: ['TypeScript', 'tsyringe', 'LangGraph'],
  decisions: [
    {
      title: 'Agent Execution Framework',
      chosen: 'LangGraph',
      rejected: ['Custom state machine', 'Temporal.io'],
      rationale: 'LangGraph provides built-in checkpointing and human-in-the-loop support.',
    },
    {
      title: 'Dependency Injection',
      chosen: 'tsyringe',
      rejected: ['InversifyJS', 'Manual DI'],
      rationale: 'Lightweight, uses standard decorators, minimal overhead.',
    },
  ],
};

const productFixture: ProductDecisionsSummaryData = {
  question: 'Goal',
  context: 'Add user authentication to the application',
  questions: [
    {
      question: 'Which authentication strategy should we use?',
      selectedOption: 'OAuth 2.0',
      rationale: 'Industry standard with broad provider support.',
      wasRecommended: true,
    },
    {
      question: 'How should we handle session management?',
      selectedOption: 'JWT tokens',
      rationale: 'Stateless and scalable across services.',
      wasRecommended: false,
    },
  ],
};

const mergeFixture: MergeReviewData = {
  pr: {
    url: 'https://github.com/shep-ai/shep/pull/42',
    number: 42,
    status: PrStatus.Open,
    commitHash: 'a1b2c3d4e5f6789',
    ciStatus: CiStatus.Success,
  },
  branch: { source: 'feat/add-auth', target: 'main' },
  diffSummary: { filesChanged: 12, additions: 340, deletions: 85, commitCount: 5 },
};

/* ---------------------------------------------------------------------------
 * Stories
 *
 * Note: In Storybook, server actions are mocked and return error states.
 * The Overview tab renders fully since it uses FeatureNodeData (no server action).
 * Activity and Plan tabs show error states from the mocked actions.
 * The Log tab shows empty/disconnected state (no EventSource in Storybook).
 * See individual tab stories (ActivityTab, LogTab, PlanTab) for populated states.
 * ------------------------------------------------------------------------- */

/** Default — running feature with full data. Overview tab active. */
export const Default: Story = {
  args: {
    featureNode: runningFeature,
    featureId: runningFeature.featureId,
  },
};

/** Completed feature in deploy phase with merged PR. */
export const CompletedFeature: Story = {
  args: {
    featureNode: doneFeature,
    featureId: doneFeature.featureId,
  },
};

/** Early-stage feature in requirements phase, no progress. */
export const RequirementsPhase: Story = {
  args: {
    featureNode: requirementsFeature,
    featureId: requirementsFeature.featureId,
  },
};

/** Feature in error state. */
export const ErrorState: Story = {
  args: {
    featureNode: errorFeature,
    featureId: errorFeature.featureId,
  },
};

/* ---------------------------------------------------------------------------
 * Fast mode stories
 * ------------------------------------------------------------------------- */

const fastModeFeature: FeatureNodeData = {
  name: 'Quick Fix',
  description: 'Fast mode feature — skipping SDLC phases',
  featureId: 'fast-mode-123',
  lifecycle: 'implementation',
  state: 'running',
  progress: 50,
  fastMode: true,
  agentType: 'claude-code',
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/quick-fix',
  oneLiner: 'quick fix for the login bug',
  userQuery: 'fix the login bug',
  summary: 'Quick fix applied directly from prompt via fast mode',
  createdAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
  repositoryName: 'my-repo',
  baseBranch: 'main',
};

/**
 * Fast mode feature — shows lightning icon in overview details.
 * Tech Decisions and Product tabs are hidden because fast-mode features
 * skip the spec phases entirely.
 */
export const FastModeFeature: Story = {
  args: {
    featureNode: fastModeFeature,
    featureId: fastModeFeature.featureId,
  },
};

/* ---------------------------------------------------------------------------
 * Review tab stories
 * ------------------------------------------------------------------------- */

/** PRD Review tab active — requirements lifecycle, action-required state. */
export const PrdReviewActive: Story = {
  args: {
    featureNode: requirementsFeature,
    featureId: requirementsFeature.featureId,
    initialTab: 'prd-review',
    prdData: prdFixture,
    prdSelections: { problem: 'user_pain', priority: 'p1' },
    onPrdSelect: () => undefined,
    onPrdApprove: () => undefined,
    onPrdReject: () => undefined,
  },
};

/** Tech Decisions tab active — implementation lifecycle, action-required state. */
export const TechReviewActive: Story = {
  args: {
    featureNode: techReviewFeature,
    featureId: techReviewFeature.featureId,
    initialTab: 'tech-decisions',
    techData: techFixture,
    productData: productFixture,
    onTechApprove: () => undefined,
    onTechReject: () => undefined,
  },
};

/**
 * Tech Decisions tab visible while implementation is in `running` state —
 * users can review the locked-in technical specs without an action bar.
 */
export const TechSpecsDuringImplementation: Story = {
  args: {
    featureNode: runningFeature,
    featureId: runningFeature.featureId,
    initialTab: 'tech-decisions',
    techData: techFixture,
    productData: productFixture,
  },
};

/**
 * Product Decisions tab visible while implementation is in `running` state —
 * users can review the locked-in product decisions without an action bar.
 */
export const ProductSpecsDuringImplementation: Story = {
  args: {
    featureNode: runningFeature,
    featureId: runningFeature.featureId,
    initialTab: 'product-decisions',
    techData: techFixture,
    productData: productFixture,
  },
};

/** Merge Review tab active — review lifecycle, action-required state. */
export const MergeReviewActive: Story = {
  args: {
    featureNode: mergeReviewFeature,
    featureId: mergeReviewFeature.featureId,
    initialTab: 'merge-review',
    mergeData: mergeFixture,
    onMergeApprove: () => undefined,
    onMergeReject: () => undefined,
  },
};
