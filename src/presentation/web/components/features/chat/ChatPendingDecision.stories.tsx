import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ChatPendingDecision } from './ChatPendingDecision';

const meta: Meta<typeof ChatPendingDecision> = {
  title: 'Features/Chat/ChatPendingDecision',
  component: ChatPendingDecision,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    onRespond: fn(),
    interaction: {
      toolCallId: 'tu_story',
      questions: [
        {
          question: 'How should the dashboard lay out its cards?',
          header: 'Layout',
          multiSelect: false,
          options: [
            {
              label: 'Grid',
              description: 'Two columns on desktop',
              preview: '┌────┐ ┌────┐\n│card│ │card│\n└────┘ └────┘',
            },
            { label: 'List', description: 'One card per row' },
          ],
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SeveralQuestions: Story = {
  args: {
    interaction: {
      toolCallId: 'tu_story_2',
      questions: [
        {
          question: 'Which auth method?',
          header: 'Auth',
          multiSelect: false,
          options: [
            { label: 'OAuth', description: 'Sign in with GitHub or Google' },
            { label: 'Magic link', description: 'Email a one-time link' },
          ],
        },
        {
          question: 'Which platforms at launch?',
          header: 'Platforms',
          multiSelect: true,
          options: [
            { label: 'Web', description: '' },
            { label: 'iOS', description: '' },
          ],
        },
      ],
    },
  },
};
