import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ChatBlockAction,
  InteractiveMessageRole,
  type InteractiveMessage,
} from '@shepai/core/domain/generated/output';
import {
  formatChatBlockMessage,
  formatChatBlockResponseMessage,
} from '@shepai/core/domain/shared/chat-block';
import {
  htmlPreviewBlock,
  planCardBlock,
  specReviewBlock,
} from '@/components/common/chat-blocks/chat-block-fixtures';
import { ChatBlockMessage } from './ChatBlockMessage';
import { ChatBlocksProvider } from './chat-blocks-context';

function message(id: string, role: InteractiveMessageRole, content: string): InteractiveMessage {
  return { id, featureId: 'global', role, content, createdAt: new Date(), updatedAt: new Date() };
}

const specContent = formatChatBlockMessage(specReviewBlock);
const planContent = formatChatBlockMessage(planCardBlock);

const meta: Meta<typeof ChatBlockMessage> = {
  title: 'Features/Chat/ChatBlockMessage',
  component: ChatBlockMessage,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { content: specContent },
  decorators: [
    (Story, { parameters }) => (
      <QueryClientProvider client={new QueryClient()}>
        <ChatBlocksProvider
          scope="global"
          messages={(parameters.messages as InteractiveMessage[] | undefined) ?? []}
        >
          <div className="max-w-xl">
            <Story />
          </div>
        </ChatBlocksProvider>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A spec posted by the agent, waiting for review. */
export const SpecReview: Story = {
  parameters: { messages: [message('a1', InteractiveMessageRole.assistant, specContent)] },
};

/** The same spec after the user approved it. */
export const Answered: Story = {
  parameters: {
    messages: [
      message('a1', InteractiveMessageRole.assistant, specContent),
      message(
        'u1',
        InteractiveMessageRole.user,
        formatChatBlockResponseMessage({
          blockId: specReviewBlock.id,
          action: ChatBlockAction.Approve,
        })
      ),
    ],
  },
};

export const PlanCard: Story = {
  args: { content: planContent },
  parameters: { messages: [message('a1', InteractiveMessageRole.assistant, planContent)] },
};

export const HtmlPreview: Story = {
  args: { content: formatChatBlockMessage(htmlPreviewBlock) },
};
