import type { Meta, StoryObj } from '@storybook/react';
import { IncidentEventKind } from '@shepai/core/domain/generated/output';
import { IncidentTimeline } from './incident-timeline';
import { EVENTS } from './incidents-fixtures';

const meta: Meta<typeof IncidentTimeline> = {
  title: 'Features/Incidents/IncidentTimeline',
  component: IncidentTimeline,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { events: EVENTS } };

export const WithFailures: Story = {
  args: {
    events: [
      ...EVENTS,
      {
        ...EVENTS[0],
        id: 'ev-9',
        kind: IncidentEventKind.NotRecovered,
        text: 'checkout did not become ready within 180 s.',
      },
    ],
  },
};
