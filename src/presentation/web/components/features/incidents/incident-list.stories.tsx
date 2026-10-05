import type { Meta, StoryObj } from '@storybook/react';
import { IncidentList } from './incident-list';
import { CHECKOUT, RESOLVED, SEARCH } from './incidents-fixtures';

const meta: Meta<typeof IncidentList> = {
  title: 'Features/Incidents/IncidentList',
  component: IncidentList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceSlug: 'acme' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { incidents: [CHECKOUT, SEARCH, RESOLVED], selectedId: CHECKOUT.id },
};

export const Empty: Story = { args: { incidents: [] } };
