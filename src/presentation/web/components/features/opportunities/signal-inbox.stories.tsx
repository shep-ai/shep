import type { Meta, StoryObj } from '@storybook/react';
import { SignalInbox } from './signal-inbox';
import { BOARD, LOOSE_SIGNALS, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof SignalInbox> = {
  title: 'Features/Opportunities/SignalInbox',
  component: SignalInbox,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { opportunities: BOARD.ranked.map(({ opportunity }) => opportunity), run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { signals: LOOSE_SIGNALS } };

export const Empty: Story = { args: { signals: [] } };
