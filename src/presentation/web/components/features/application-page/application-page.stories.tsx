import type { Meta, StoryObj } from '@storybook/react';
import { ApplicationPage } from './application-page';
import type { Application } from '@shepai/core/domain/generated/output';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';

const baseApp: Application = {
  id: 'app-001',
  name: 'My Todo App',
  slug: 'my-todo-app',
  description: 'A full-stack todo application with authentication and real-time sync',
  repositoryPath: '/home/user/projects/my-todo-app',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: false,
  bedrockEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const meta: Meta<typeof ApplicationPage> = {
  title: 'Features/ApplicationPage',
  component: ApplicationPage,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    application: baseApp,
  },
};

export const Active: Story = {
  args: {
    application: {
      ...baseApp,
      id: 'app-002',
      name: 'E-Commerce Dashboard',
      slug: 'e-commerce-dashboard',
      description: 'Admin dashboard for managing products and orders',
      status: ApplicationStatus.Active,
    },
  },
};

export const ErrorState: Story = {
  args: {
    application: {
      ...baseApp,
      id: 'app-003',
      name: 'Weather API Service',
      slug: 'weather-api-service',
      description: 'Microservice for fetching and caching weather data',
      status: ApplicationStatus.Error,
    },
  },
};
