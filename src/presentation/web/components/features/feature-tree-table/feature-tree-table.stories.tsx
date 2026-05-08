import type { Meta, StoryObj } from '@storybook/react';
import { FeatureTreeTable } from './feature-tree-table';
import type { FeatureTreeRow } from './feature-tree-table';

const meta: Meta<typeof FeatureTreeTable> = {
  title: 'Features/FeatureTreeTable',
  component: FeatureTreeTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '500px', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const singleRepoFeatures: FeatureTreeRow[] = [
  {
    id: 'feat-1',
    name: 'Authentication System',
    status: 'done',
    lifecycle: 'Maintain',
    branch: 'feat/auth-system',
    repositoryName: 'my-app',
    remoteUrl: 'https://github.com/acme/my-app',
  },
  {
    id: 'feat-2',
    name: 'OAuth2 Provider',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/oauth2-provider',
    repositoryName: 'my-app',
    remoteUrl: 'https://github.com/acme/my-app',
    parentId: 'feat-1',
  },
  {
    id: 'feat-3',
    name: 'JWT Token Refresh',
    status: 'pending',
    lifecycle: 'Planning',
    branch: 'feat/jwt-refresh',
    repositoryName: 'my-app',
    remoteUrl: 'https://github.com/acme/my-app',
    parentId: 'feat-1',
  },
  {
    id: 'feat-4',
    name: 'Payment Integration',
    status: 'action-needed',
    lifecycle: 'Review',
    branch: 'feat/payments',
    repositoryName: 'my-app',
    remoteUrl: 'https://github.com/acme/my-app',
  },
];

const multiRepoFeatures: FeatureTreeRow[] = [
  ...singleRepoFeatures,
  {
    id: 'feat-5',
    name: 'Dashboard Widgets',
    status: 'blocked',
    lifecycle: 'Blocked',
    branch: 'feat/dashboard-widgets',
    repositoryName: 'admin-portal',
    remoteUrl: 'https://github.com/acme/admin-portal',
  },
  {
    id: 'feat-6',
    name: 'Stripe Checkout',
    status: 'error',
    lifecycle: 'Implementation',
    branch: 'feat/stripe-checkout',
    repositoryName: 'admin-portal',
    remoteUrl: 'https://github.com/acme/admin-portal',
  },
  {
    id: 'feat-7',
    name: 'API Gateway',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/api-gateway',
    repositoryName: 'infrastructure',
    remoteUrl: 'https://gitlab.com/acme/infrastructure',
  },
];

export const Default: Story = {
  args: {
    data: multiRepoFeatures,
  },
};

export const SingleRepository: Story = {
  args: {
    data: singleRepoFeatures,
  },
};

export const Empty: Story = {
  args: {
    data: [],
  },
};

export const WithClickHandler: Story = {
  args: {
    data: multiRepoFeatures,
    onRowClick: (row: FeatureTreeRow) => alert(`Clicked: ${row.id}`),
  },
};

const deeplyNestedFeatures: FeatureTreeRow[] = [
  {
    id: 'root-1',
    name: 'Platform Overhaul',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/platform-overhaul',
    repositoryName: 'platform',
    remoteUrl: 'https://github.com/acme/platform',
  },
  {
    id: 'child-1',
    name: 'API Redesign',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/api-redesign',
    repositoryName: 'platform',
    remoteUrl: 'https://github.com/acme/platform',
    parentId: 'root-1',
  },
  {
    id: 'grandchild-1',
    name: 'REST to GraphQL Migration',
    status: 'pending',
    lifecycle: 'Planning',
    branch: 'feat/graphql-migration',
    repositoryName: 'platform',
    remoteUrl: 'https://github.com/acme/platform',
    parentId: 'child-1',
  },
  {
    id: 'child-2',
    name: 'Database Migration',
    status: 'done',
    lifecycle: 'Maintain',
    branch: 'feat/db-migration',
    repositoryName: 'platform',
    remoteUrl: 'https://github.com/acme/platform',
    parentId: 'root-1',
  },
];

export const DeeplyNested: Story = {
  args: {
    data: deeplyNestedFeatures,
  },
};

const noRemoteFeatures: FeatureTreeRow[] = [
  {
    id: 'feat-local-1',
    name: 'Local Feature',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/local-work',
    repositoryName: 'local-project',
  },
];

export const NoRemoteUrl: Story = {
  args: {
    data: noRemoteFeatures,
  },
};
