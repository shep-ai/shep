import type { Meta, StoryObj } from '@storybook/react';
import { IncidentDetail } from './incident-detail';
import { CHECKOUT, DETAIL, RESOLVED, runInStory } from './incidents-fixtures';

const meta: Meta<typeof IncidentDetail> = {
  title: 'Features/Incidents/IncidentDetail',
  component: IncidentDetail,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Triaged: a rollback waits for approval; a restart did not help. */
export const Open: Story = { args: { detail: DETAIL } };

/** No workload named, so runtime actions are off. */
export const NoWorkload: Story = {
  args: {
    detail: {
      incident: { ...CHECKOUT, runtimeWorkload: undefined, runtimeNamespace: undefined },
      events: DETAIL.events.slice(0, 1),
      actions: [],
    },
  },
};

export const Resolved: Story = {
  args: { detail: { incident: RESOLVED, events: DETAIL.events, actions: [] } },
};
