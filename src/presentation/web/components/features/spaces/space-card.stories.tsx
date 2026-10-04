import type { Meta, StoryObj } from '@storybook/react';
import { SpaceCard } from './space-card';
import { OVERVIEW, runInStory } from './spaces-fixtures';

const meta: Meta<typeof SpaceCard> = {
  title: 'Features/Spaces/SpaceCard',
  component: SpaceCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkSpace: Story = {
  args: { overview: OVERVIEW.spaces[1] },
};

/** The default space can be neither re-defaulted nor deleted. */
export const DefaultSpace: Story = {
  args: { overview: OVERVIEW.spaces[0] },
};
