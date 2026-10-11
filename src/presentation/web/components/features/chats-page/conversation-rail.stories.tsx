import type { Meta, StoryObj } from '@storybook/react';
import { ConversationRail } from './conversation-rail';
import { sampleConversations } from './chats-page-fixtures';

const meta: Meta<typeof ConversationRail> = {
  title: 'Features/Chats/ConversationRail',
  component: ConversationRail,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { conversations: sampleConversations, selectedScope: 'global' },
  decorators: [
    (Story) => (
      <div className="w-72 border-e p-3">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Shep first, then repositories, features and applications. */
export const Default: Story = {};

export const FeatureSelected: Story = {
  args: { selectedScope: 'f1' },
};

/** A fresh install: only the Shep-wide conversation. */
export const OnlyShep: Story = {
  args: { conversations: sampleConversations.slice(0, 1) },
};
