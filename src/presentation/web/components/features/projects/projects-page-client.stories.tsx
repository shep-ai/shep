import type { Meta, StoryObj } from '@storybook/react';
import { ProjectsPageClient } from './projects-page-client';
import { EstimateType } from '@shepai/core/domain/generated/output';
import type { PmProject } from '@shepai/core/domain/generated/output';

const mockProjects: PmProject[] = [
  {
    id: '1',
    name: 'Frontend Redesign',
    slug: 'frontend-redesign',
    identifierPrefix: 'FE',
    workItemCounter: 24,
    estimateType: EstimateType.Category,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    description: 'Complete redesign of the user-facing frontend application.',
  },
  {
    id: '2',
    name: 'API Platform',
    slug: 'api-platform',
    identifierPrefix: 'API',
    workItemCounter: 12,
    estimateType: EstimateType.Points,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-10'),
    description: 'Build the core API platform and developer experience.',
  },
  {
    id: '3',
    name: 'Mobile App',
    slug: 'mobile-app',
    identifierPrefix: 'MOB',
    workItemCounter: 0,
    estimateType: EstimateType.Category,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  },
];

const meta: Meta<typeof ProjectsPageClient> = {
  title: 'Features/ProjectsPageClient',
  component: ProjectsPageClient,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    projects: mockProjects,
  },
};

export const EmptyList: Story = {
  args: {
    projects: [],
  },
};

export const SingleProject: Story = {
  args: {
    projects: [mockProjects[0]],
  },
};
