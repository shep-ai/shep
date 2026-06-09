import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowExecutionHistory } from './workflow-execution-history';
import {
  WorkflowExecutionStatus,
  WorkflowTriggerType,
  type WorkflowExecution,
} from '@shepai/core/domain/generated/output';

function createExecution(
  overrides: Partial<WorkflowExecution> & { id: string }
): WorkflowExecution {
  const now = new Date();
  return {
    workflowId: 'wf-001',
    triggerType: WorkflowTriggerType.Manual,
    status: WorkflowExecutionStatus.Completed,
    startedAt: new Date(now.getTime() - 3_600_000),
    createdAt: new Date(now.getTime() - 3_600_000),
    updatedAt: now,
    ...overrides,
  };
}

const mockExecutions: WorkflowExecution[] = [
  createExecution({
    id: 'exec-1',
    status: WorkflowExecutionStatus.Completed,
    triggerType: WorkflowTriggerType.Scheduled,
    startedAt: new Date(Date.now() - 1_800_000),
    completedAt: new Date(Date.now() - 1_740_000),
    durationMs: 60_000,
    outputSummary: 'Closed 3 resolved issues',
  }),
  createExecution({
    id: 'exec-2',
    status: WorkflowExecutionStatus.Failed,
    triggerType: WorkflowTriggerType.Manual,
    startedAt: new Date(Date.now() - 7_200_000),
    completedAt: new Date(Date.now() - 7_170_000),
    durationMs: 30_000,
    errorMessage: 'GitHub API rate limit exceeded',
  }),
  createExecution({
    id: 'exec-3',
    status: WorkflowExecutionStatus.Running,
    triggerType: WorkflowTriggerType.Scheduled,
    startedAt: new Date(Date.now() - 120_000),
  }),
  createExecution({
    id: 'exec-4',
    status: WorkflowExecutionStatus.Queued,
    triggerType: WorkflowTriggerType.Manual,
    startedAt: new Date(Date.now() - 30_000),
  }),
  createExecution({
    id: 'exec-5',
    status: WorkflowExecutionStatus.Cancelled,
    triggerType: WorkflowTriggerType.Scheduled,
    startedAt: new Date(Date.now() - 86_400_000),
    completedAt: new Date(Date.now() - 86_390_000),
    durationMs: 10_000,
  }),
];

const meta: Meta<typeof WorkflowExecutionHistory> = {
  title: 'Features/Workflows/WorkflowExecutionHistory',
  component: WorkflowExecutionHistory,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workflowId: 'wf-001',
    executions: mockExecutions,
  },
};

export const AllCompleted: Story = {
  args: {
    workflowId: 'wf-001',
    executions: mockExecutions
      .slice(0, 3)
      .map((e) => ({ ...e, status: WorkflowExecutionStatus.Completed, durationMs: 45_000 })),
  },
};

export const AllFailed: Story = {
  args: {
    workflowId: 'wf-001',
    executions: mockExecutions.slice(0, 3).map((e) => ({
      ...e,
      status: WorkflowExecutionStatus.Failed,
      errorMessage: 'Connection timeout',
      durationMs: 5_000,
    })),
  },
};

export const Empty: Story = {
  args: {
    workflowId: 'wf-001',
    executions: [],
  },
};

export const SingleRunning: Story = {
  args: {
    workflowId: 'wf-001',
    executions: [mockExecutions[2]],
  },
};
