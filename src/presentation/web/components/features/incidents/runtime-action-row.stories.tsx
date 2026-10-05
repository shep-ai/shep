import type { Meta, StoryObj } from '@storybook/react';
import { RuntimeActionKind, RuntimeActionStatus } from '@shepai/core/domain/generated/output';
import { RuntimeActionRow } from './runtime-action-row';
import { PROPOSED, SUCCEEDED, runInStory } from './incidents-fixtures';

const meta: Meta<typeof RuntimeActionRow> = {
  title: 'Features/Incidents/RuntimeActionRow',
  component: RuntimeActionRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
  decorators: [
    (Story) => (
      <ul className="max-w-xl">
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** An agent's proposal waits for approve or reject. */
export const Proposed: Story = { args: { action: PROPOSED } };

/** Done, but the workload did not recover in time. */
export const NotRecovered: Story = { args: { action: SUCCEEDED } };

export const Recovered: Story = {
  args: {
    action: {
      ...SUCCEEDED,
      kind: RuntimeActionKind.Scale,
      replicas: 6,
      recovered: true,
      output: 'deployment.apps/checkout scaled',
    },
  },
};

export const Failed: Story = {
  args: {
    action: {
      ...SUCCEEDED,
      status: RuntimeActionStatus.Failed,
      recovered: undefined,
      output: 'error: deployments.apps "checkout" is forbidden',
    },
  },
};
