import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatBlockAction, InteractiveMessageRole } from '@shepai/core/domain/generated/output';
import {
  formatChatBlockMessage,
  formatChatBlockResponseMessage,
} from '@shepai/core/domain/shared/chat-block';
import {
  planCardBlock,
  specReviewBlock,
} from '@/components/common/chat-blocks/chat-block-fixtures';
import { ChatBlockResponseRow } from './ChatBlockResponseRow';
import { ChatBlocksProvider } from './chat-blocks-context';

const conversation = [specReviewBlock, planCardBlock].map((block) => ({
  id: block.id,
  featureId: 'global',
  role: InteractiveMessageRole.assistant,
  content: formatChatBlockMessage(block),
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const meta: Meta<typeof ChatBlockResponseRow> = {
  title: 'Features/Chat/ChatBlockResponseRow',
  component: ChatBlockResponseRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <ChatBlocksProvider scope="global" messages={conversation}>
          <Story />
        </ChatBlocksProvider>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Approved: Story = {
  args: {
    content: formatChatBlockResponseMessage({
      blockId: specReviewBlock.id,
      action: ChatBlockAction.Approve,
    }),
  },
};

export const RefinementRequested: Story = {
  args: {
    content: formatChatBlockResponseMessage({
      blockId: planCardBlock.id,
      action: ChatBlockAction.Refine,
      note: 'Skip the persistence step',
    }),
  },
};
