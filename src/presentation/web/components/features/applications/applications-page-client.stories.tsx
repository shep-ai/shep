import type { Meta, StoryObj } from '@storybook/react';
import { ApplicationsPageClient } from './applications-page-client';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
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
    effectiveStatus: 'ready',
    createdAt: now,
    updatedAt: now,
  },
];

const meta: Meta<typeof ApplicationsPageClient> = {
  title: 'Features/ApplicationsPageClient',
  component: ApplicationsPageClient,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { applications: mockApps },
};

export const Empty: Story = {
  args: { applications: [] },
};

export const SingleApp: Story = {
  args: { applications: [mockApps[0]] },
};

export const AllActive: Story = {
  args: {
    applications: mockApps.map((app) => ({ ...app, status: ApplicationStatus.Active })),
  },
};
