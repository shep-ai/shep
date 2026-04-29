import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';

interface DecoratorContext {
  parameters?: { sidebar?: { defaultOpen?: boolean } };
}

const defaultFeatureFlags = {
  envDeploy: true,
  debug: false,
  reactFileManager: false,
  projects: false,
  codeReview: false,
};

const meta: Meta<typeof AppSidebar> = {
  title: 'Layout/AppSidebar',
  component: AppSidebar,
  args: {
    featureFlags: defaultFeatureFlags,
  },
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story, context: DecoratorContext) => {
      const defaultOpen = context.parameters?.sidebar?.defaultOpen ?? true;
      return (
        <SidebarProvider defaultOpen={defaultOpen}>
          <Story />
          <SidebarInset aria-label="Main content">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="text-muted-foreground text-sm">Content area</span>
            </div>
          </SidebarInset>
        </SidebarProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockFeatures = [
  {
    featureId: 'feat-auth-001',
    name: 'Auth Module',
    status: 'action-needed' as const,
    agentType: 'claude-code',
    modelId: 'claude-sonnet-4-6',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
  {
    featureId: 'feat-payment-002',
    name: 'Payment Flow',
    status: 'action-needed' as const,
    agentType: 'cursor',
    modelId: 'claude-opus-4-6',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
  {
    featureId: 'feat-dashboard-003',
    name: 'Dashboard',
    status: 'in-progress' as const,
    startedAt: Date.now() - 330_000,
    agentType: 'gemini-cli',
    modelId: 'gemini-2.5-pro',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
  {
    featureId: 'feat-api-004',
    name: 'API Gateway',
    status: 'in-progress' as const,
    startedAt: Date.now() - 60_000,
    agentType: 'claude-code',
    modelId: 'claude-haiku-4-5',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
  {
    featureId: 'feat-settings-005',
    name: 'Settings Page',
    status: 'done' as const,
    duration: '2h',
    agentType: 'claude-code',
    modelId: 'claude-sonnet-4-6',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
  {
    featureId: 'feat-profile-006',
    name: 'User Profile',
    status: 'done' as const,
    duration: '1h',
    agentType: 'dev',
    modelId: 'gpt-8',
    repositoryPath: '/home/user/projects/my-app',
    repositoryName: 'my-app',
  },
];

export const Default: Story = {
  args: {
    features: mockFeatures,
  },
};

export const WithNewFeatureButton: Story = {
  args: {
    features: mockFeatures,
    onAddFeature: fn(),
  },
};

export const Collapsed: Story = {
  args: {
    features: mockFeatures,
  },
  parameters: {
    sidebar: { defaultOpen: false },
  },
};

export const Empty: Story = {
  args: {
    features: [],
  },
};

export const AllInProgress: Story = {
  args: {
    features: [
      {
        featureId: 'feat-a-001',
        name: 'Feature A',
        status: 'in-progress' as const,
        startedAt: Date.now() - 120_000,
        repositoryPath: '/home/user/projects/my-app',
        repositoryName: 'my-app',
      },
      {
        featureId: 'feat-b-002',
        name: 'Feature B',
        status: 'in-progress' as const,
        startedAt: Date.now() - 600_000,
        repositoryPath: '/home/user/projects/my-app',
        repositoryName: 'my-app',
      },
    ],
  },
};

export const AllDone: Story = {
  args: {
    features: [
      {
        featureId: 'feat-a-001',
        name: 'Feature A',
        status: 'done' as const,
        duration: '30m',
        repositoryPath: '/home/user/projects/my-app',
        repositoryName: 'my-app',
      },
      {
        featureId: 'feat-b-002',
        name: 'Feature B',
        status: 'done' as const,
        duration: '1h',
        repositoryPath: '/home/user/projects/my-app',
        repositoryName: 'my-app',
      },
      {
        featureId: 'feat-c-003',
        name: 'Feature C',
        status: 'done' as const,
        duration: '3h',
        repositoryPath: '/home/user/projects/my-app',
        repositoryName: 'my-app',
      },
    ],
  },
};

export const MultipleRepositories: Story = {
  args: {
    features: [
      {
        featureId: 'feat-auth-001',
        name: 'Auth Module',
        status: 'action-needed' as const,
        agentType: 'claude-code',
        modelId: 'claude-sonnet-4-6',
        repositoryPath: '/home/user/projects/frontend',
        repositoryName: 'frontend',
      },
      {
        featureId: 'feat-dashboard-002',
        name: 'Dashboard',
        status: 'in-progress' as const,
        startedAt: Date.now() - 330_000,
        agentType: 'gemini-cli',
        modelId: 'gemini-2.5-pro',
        repositoryPath: '/home/user/projects/frontend',
        repositoryName: 'frontend',
      },
      {
        featureId: 'feat-settings-003',
        name: 'Settings Page',
        status: 'done' as const,
        duration: '2h',
        repositoryPath: '/home/user/projects/frontend',
        repositoryName: 'frontend',
      },
      {
        featureId: 'feat-api-004',
        name: 'API Gateway',
        status: 'in-progress' as const,
        startedAt: Date.now() - 60_000,
        agentType: 'claude-code',
        modelId: 'claude-haiku-4-5',
        repositoryPath: '/home/user/projects/backend',
        repositoryName: 'backend',
      },
      {
        featureId: 'feat-payment-005',
        name: 'Payment Service',
        status: 'action-needed' as const,
        agentType: 'cursor',
        modelId: 'claude-opus-4-6',
        repositoryPath: '/home/user/projects/backend',
        repositoryName: 'backend',
      },
      {
        featureId: 'feat-deploy-006',
        name: 'CI/CD Pipeline',
        status: 'done' as const,
        duration: '45m',
        repositoryPath: '/home/user/projects/infra',
        repositoryName: 'infra',
      },
      {
        featureId: 'feat-monitor-007',
        name: 'Monitoring Setup',
        status: 'in-progress' as const,
        startedAt: Date.now() - 180_000,
        repositoryPath: '/home/user/projects/infra',
        repositoryName: 'infra',
      },
    ],
  },
};
