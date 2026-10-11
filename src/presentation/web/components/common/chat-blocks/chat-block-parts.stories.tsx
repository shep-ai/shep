import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { FileText } from 'lucide-react';
import { ChatBlockAction } from '@shepai/core/domain/generated/output';
import {
  ChatBlockActions,
  ChatBlockMarkdown,
  ChatBlockResolution,
  ChatBlockShell,
} from './chat-block-parts';
import { planCardBlock, specReviewBlock } from './chat-block-fixtures';

const meta: Meta<typeof ChatBlockShell> = {
  title: 'Composed/ChatBlocks/ChatBlockParts',
  component: ChatBlockShell,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    icon: <FileText className="size-4 text-sky-600" />,
    kind: 'Spec review',
    title: 'Login PRD',
    children: <ChatBlockMarkdown markdown={specReviewBlock.markdown ?? ''} />,
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

/** The shared shell with a Markdown body. */
export const Shell: Story = {};

/** Actions in the footer; the note field opens for Refine. */
export const WithActions: Story = {
  args: {
    title: planCardBlock.title,
    kind: 'Plan',
    children: <ChatBlockMarkdown markdown={planCardBlock.markdown ?? ''} />,
    footer: <ChatBlockActions block={planCardBlock} onRespond={fn()} />,
  },
};

/** The resolution line that replaces the actions once answered. */
export const Resolved: Story = {
  args: {
    footer: (
      <ChatBlockResolution
        response={{
          blockId: specReviewBlock.id,
          action: ChatBlockAction.RequestChanges,
          note: 'Add SSO',
        }}
      />
    ),
  },
};
