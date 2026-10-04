import type { Meta, StoryObj } from '@storybook/react';
import { TrackersPageClient } from './trackers-page-client';
import { OVERVIEW, PROJECTS, SPACES } from './trackers-fixtures';

const meta: Meta<typeof TrackersPageClient> = {
  title: 'Features/Trackers/TrackersPageClient',
  component: TrackersPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const JiraAndLinear: Story = { args: { overview: OVERVIEW } };

export const Empty: Story = {
  args: { overview: { connections: [], spaces: SPACES, projects: PROJECTS } },
};

export const LoadError: Story = {
  args: {
    overview: { connections: [], spaces: [], projects: [] },
    loadError: 'The Shep database could not be opened.',
  },
};
