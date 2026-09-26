import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react';
import { ApplicationsPageClient } from './applications-page-client';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

const now = new Date().toISOString();

const mockApps: ApplicationWithStatus[] = [
  {
    id: '1',
    name: 'Weather Dashboard',
    slug: 'weather-dashboard',
    description: 'Real-time weather forecasts with interactive maps and alerts',
    repositoryPath: '/home/user/projects/weather-dashboard',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    bedrockEnabled: false,
    effectiveStatus: 'ready',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '2',
    name: 'Task Manager',
    slug: 'task-manager',
    description: 'Kanban-style task management with team collaboration features',
    repositoryPath: '/home/user/projects/task-manager',
    additionalPaths: ['/home/user/projects/shared-ui'],
    status: ApplicationStatus.Active,
    setupComplete: false,
    bedrockEnabled: false,
    effectiveStatus: 'building',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '3',
    name: 'E-Commerce Store',
    slug: 'ecommerce-store',
    description: 'Full-featured online store with payments, inventory, and admin panel',
    repositoryPath: '/home/user/projects/ecommerce',
    additionalPaths: [],
    status: ApplicationStatus.Error,
    setupComplete: false,
    bedrockEnabled: false,
    effectiveStatus: 'failed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '4',
    name: 'Portfolio Site',
    slug: 'portfolio-site',
    description: 'Personal portfolio with blog and project showcase',
    repositoryPath: '/home/user/projects/portfolio',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    bedrockEnabled: false,
    effectiveStatus: 'interrupted',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '5',
    name: 'Chat Application',
    slug: 'chat-app',
    description: 'Real-time messaging app with channels and direct messages',
    repositoryPath: '/home/user/projects/chat-app',
    additionalPaths: ['/home/user/projects/chat-api', '/home/user/projects/shared-types'],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    bedrockEnabled: false,
    effectiveStatus: 'ready',
    createdAt: now,
    updatedAt: now,
  },
];

const meta: Meta<typeof ApplicationsPageClient> = {
  title: 'Features/ApplicationsPageClient',
  component: ApplicationsPageClient,
  args: { specDrivenAvailable: true },
  parameters: {
    layout: 'fullscreen',
    applications: mockApps,
  },
  decorators: [
    (Story, { parameters }) => {
      const client = useMemo(() => {
        const queryClient = new QueryClient({
          defaultOptions: { queries: { enabled: false, retry: false } },
        });
        queryClient.setQueryData(['deployments', 'all'], []);
        if (parameters.queryState === 'loading') {
          void queryClient.fetchQuery({
            queryKey: ['applications'],
            queryFn: () => new Promise<ApplicationWithStatus[]>(() => undefined),
          });
        } else if (parameters.queryState) {
          queryClient
            .getQueryCache()
            .build(queryClient, { queryKey: ['applications'] })
            .setState({
              status: parameters.queryState === 'error' ? 'error' : 'pending',
              fetchStatus: parameters.queryState === 'error' ? 'idle' : 'fetching',
              error: parameters.queryState === 'error' ? new Error('Daemon unavailable') : null,
            });
        } else {
          queryClient.setQueryData(['applications'], parameters.applications);
        }
        return queryClient;
      }, [parameters.applications, parameters.queryState]);
      return (
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <Story />
          </TooltipProvider>
        </QueryClientProvider>
      );
    },
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { applications: mockApps },
};

/** Apps-only (Electron) shell: no spec-driven hand-off, only the App Builder. */
export const AppsOnlyShell: Story = {
  args: { specDrivenAvailable: false },
  parameters: { applications: mockApps },
};

export const Empty: Story = {
  parameters: { applications: [] },
};

export const SingleApp: Story = {
  parameters: { applications: [mockApps[0]] },
};

export const AllActive: Story = {
  parameters: {
    applications: mockApps.map((app) => ({
      ...app,
      status: ApplicationStatus.Active,
      effectiveStatus: 'building',
    })),
  },
};

export const Loading: Story = { parameters: { queryState: 'loading' } };
export const LoadError: Story = { parameters: { queryState: 'error' } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
export const Dark: Story = { parameters: { backgrounds: { default: 'dark' } } };
