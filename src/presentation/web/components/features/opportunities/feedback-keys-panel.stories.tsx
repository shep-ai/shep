import type { Meta, StoryObj } from '@storybook/react';
import { FeedbackKeysPanel } from './feedback-keys-panel';
import { FEEDBACK_KEYS, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof FeedbackKeysPanel> = {
  title: 'Features/Opportunities/FeedbackKeysPanel',
  component: FeedbackKeysPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** An active key and a revoked one; creating a key shows its secret once. */
export const Default: Story = { args: { keys: FEEDBACK_KEYS } };

export const Empty: Story = { args: { keys: [] } };
