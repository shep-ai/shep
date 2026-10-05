import type { Meta, StoryObj } from '@storybook/react';
import { IncidentsPageClient } from './incidents-page-client';
import { CHECKOUT, DETAIL, RESOLVED, SEARCH, SPACES } from './incidents-fixtures';

const meta: Meta<typeof IncidentsPageClient> = {
  title: 'Features/Incidents/IncidentsPageClient',
  component: IncidentsPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: { spaces: SPACES },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { space: SPACES[0], incidents: [CHECKOUT, SEARCH, RESOLVED], selected: DETAIL },
};

export const Empty: Story = { args: { space: SPACES[0], incidents: [] } };

export const LoadError: Story = { args: { loadError: 'No space "acme".' } };
