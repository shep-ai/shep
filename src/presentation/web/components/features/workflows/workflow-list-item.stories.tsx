import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowListItem } from './workflow-list-item';
import type { ScheduledWorkflow } from '@shepai/core/domain/generated/output';

const now = new Date();

const enabledScheduledWorkflow: ScheduledWorkflow = {
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
};

const disabledWorkflow: ScheduledWorkflow = {
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
};

const manualOnlyWorkflow: ScheduledWorkflow = {
  id: 'wf-003',
  name: 'deploy-staging',
  description: 'Deploy current branch to staging environment',
  prompt: 'Deploy the current branch to staging...',
  enabled: true,
  repositoryPath: '/Users/dev/my-project',
  createdAt: new Date(now.getTime() - 86_400_000),
  updatedAt: now,
};

const neverRunWorkflow: ScheduledWorkflow = {
  id: 'wf-004',
  name: 'dependency-audit',
  description: 'Check for outdated or vulnerable dependencies',
  prompt: 'Audit all dependencies...',
  cronExpression: '0 0 * * SUN',
  enabled: true,
  repositoryPath: '/Users/dev/my-project',
  createdAt: now,
  updatedAt: now,
};

const meta: Meta<typeof WorkflowListItem> = {
  title: 'Features/Workflows/WorkflowListItem',
  component: WorkflowListItem,
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

export const EnabledScheduled: Story = {
  args: {
    workflow: enabledScheduledWorkflow,
  },
};

export const Disabled: Story = {
  args: {
    workflow: disabledWorkflow,
  },
};

export const ManualOnly: Story = {
  args: {
    workflow: manualOnlyWorkflow,
  },
};

export const NeverRun: Story = {
  args: {
    workflow: neverRunWorkflow,
  },
};

export const AllStates: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-3xl space-y-2">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <WorkflowListItem workflow={enabledScheduledWorkflow} />
      <WorkflowListItem workflow={disabledWorkflow} />
      <WorkflowListItem workflow={manualOnlyWorkflow} />
      <WorkflowListItem workflow={neverRunWorkflow} />
    </>
  ),
};
