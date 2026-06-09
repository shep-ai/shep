import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowList } from './workflow-list';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

const now = new Date();

const mockWorkflows: ScheduledWorkflow[] = [
  {
    id: 'wf-001',
    name: 'issue-triage',
    description: 'Scan open GitHub issues and close resolved ones with evidence',
    prompt: 'Scan all open issues...',
    cronExpression: '0 9 * * MON',
    timezone: 'America/New_York',
    enabled: true,
    lastRunAt: new Date(now.getTime() - 3_600_000),
    nextRunAt: new Date(now.getTime() + 86_400_000),
    repositoryPath: '/Users/dev/my-project',
    createdAt: new Date(now.getTime() - 604_800_000),
    updatedAt: now,
  },
  {
    id: 'wf-002',
    name: 'branch-rebase',
    description: 'Rebase all tracked feature branches on main',
    prompt: 'Rebase all feature branches...',
    cronExpression: '0 2 * * *',
    timezone: 'UTC',
    enabled: false,
    lastRunAt: new Date(now.getTime() - 172_800_000),
    repositoryPath: '/Users/dev/my-project',
    createdAt: new Date(now.getTime() - 1_209_600_000),
    updatedAt: new Date(now.getTime() - 172_800_000),
  },
  {
    id: 'wf-003',
    name: 'deploy-staging',
    description: 'Deploy current branch to staging environment',
    prompt: 'Deploy the current branch to staging...',
    enabled: true,
    repositoryPath: '/Users/dev/my-project',
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
  },
  {
    id: 'wf-004',
    name: 'dependency-audit',
    description: 'Check for outdated or vulnerable dependencies',
    prompt: 'Audit all dependencies...',
    cronExpression: '0 0 * * SUN',
    enabled: true,
    repositoryPath: '/Users/dev/my-project',
    createdAt: now,
    updatedAt: now,
  },
];

const meta: Meta<typeof WorkflowList> = {
  title: 'Features/Workflows/WorkflowList',
  component: WorkflowList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workflows: mockWorkflows,
  },
};

export const Empty: Story = {
  args: {
    workflows: [],
  },
};

export const SingleWorkflow: Story = {
  args: {
    workflows: [mockWorkflows[0]],
  },
};

export const AllDisabled: Story = {
  args: {
    workflows: mockWorkflows.map((w) => ({ ...w, enabled: false })),
  },
};

export const AllEnabled: Story = {
  args: {
    workflows: mockWorkflows.map((w) => ({ ...w, enabled: true })),
  },
};
