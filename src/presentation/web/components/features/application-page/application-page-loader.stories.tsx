import type { Meta, StoryObj } from '@storybook/react';
import type { FC } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import type { Application } from '@shepai/core/domain/generated/output';
import { ApplicationPageLoader } from './application-page-loader';

/**
 * `ApplicationPageLoader` fetches an application via TanStack Query. In
 * Storybook there is no `/api/applications/:id` endpoint, so we seed the
 * query cache with a fixture and let the component render the inner
 * `ApplicationPage`. A separate story does NOT seed the cache so the
 * loading spinner can be snapshotted directly.
 */

const baseApp: Application = {
  id: 'app-loader-001',
  name: 'Todo App',
  slug: 'todo-app',
  description: 'A full-stack todo application with authentication and real-time sync',
  repositoryPath: '/home/user/projects/todo-app',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: false,
  bedrockEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function withSeededClient(seed: unknown | null) {
  return function Decorator(Story: FC) {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
          gcTime: Number.POSITIVE_INFINITY,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    if (seed !== null) {
      client.setQueryData(['application', baseApp.id], seed);
    }
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

const meta: Meta<typeof ApplicationPageLoader> = {
  title: 'ApplicationPage/ApplicationPageLoader',
  component: ApplicationPageLoader,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ApplicationPageLoader>;

export const Default: Story = {
  args: { applicationId: baseApp.id },
  decorators: [
    withSeededClient({
      application: baseApp,
      deployment: undefined,
    }),
  ],
};

export const Loading: Story = {
  args: { applicationId: baseApp.id },
  // No seeded data → query runs, fetch fails, component stays in the
  // loading spinner state long enough to be captured.
  decorators: [withSeededClient(null)],
};
