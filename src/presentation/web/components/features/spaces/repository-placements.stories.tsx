import type { Meta, StoryObj } from '@storybook/react';
import { RepositoryPlacements } from './repository-placements';
import { OVERVIEW, runInStory } from './spaces-fixtures';

const meta: Meta<typeof RepositoryPlacements> = {
  title: 'Features/Spaces/RepositoryPlacements',
  component: RepositoryPlacements,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaces: OVERVIEW.spaces, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Pinned, rule-matched and default placements side by side. */
export const Mixed: Story = {
  args: { repositories: OVERVIEW.repositories },
};

export const Empty: Story = {
  args: { repositories: [] },
};
