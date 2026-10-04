import type { Meta, StoryObj } from '@storybook/react';
import { FeedbackThemes } from './feedback-themes';
import { THEMES, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof FeedbackThemes> = {
  title: 'Features/Opportunities/FeedbackThemes',
  component: FeedbackThemes,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { themes: THEMES } };

export const Empty: Story = { args: { themes: [] } };
