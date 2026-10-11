import type { Meta, StoryObj } from '@storybook/react';
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InteractiveMessageRole } from '@shepai/core/domain/generated/output';
import { formatChatBlockMessage } from '@shepai/core/domain/shared/chat-block';
import { Thread } from '@/components/assistant-ui/thread';
import {
  htmlPreviewBlock,
  planCardBlock,
  specReviewBlock,
} from '@/components/common/chat-blocks/chat-block-fixtures';
import { ChatBlocksProvider } from '@/components/features/chat/chat-blocks-context';
import { ChatsPage } from './chats-page';
import { sampleConversations } from './chats-page-fixtures';

const conversation = [
  { role: InteractiveMessageRole.user, content: 'Plan a pricing page with a Pro tier' },
  { role: InteractiveMessageRole.assistant, content: 'Here is the spec, a preview and the plan.' },
  { role: InteractiveMessageRole.assistant, content: formatChatBlockMessage(specReviewBlock) },
  { role: InteractiveMessageRole.assistant, content: formatChatBlockMessage(htmlPreviewBlock) },
  { role: InteractiveMessageRole.assistant, content: formatChatBlockMessage(planCardBlock) },
].map((m, i) => ({
  id: `m${i}`,
  featureId: 'global',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...m,
}));

/** The real thread over a fixed conversation, so blocks render as they do live. */
function MockChat() {
  const runtime = useExternalStoreRuntime({
    messages: conversation,
    convertMessage: (m) => ({
      id: m.id,
      role: m.role,
      content: [{ type: 'text', text: m.content }],
      createdAt: m.createdAt,
    }),
    onNew: async () => undefined,
  });
  return (
    <ChatBlocksProvider scope="global" messages={conversation}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread />
      </AssistantRuntimeProvider>
    </ChatBlocksProvider>
  );
}

const meta: Meta<typeof ChatsPage> = {
  title: 'Features/Chats/ChatsPage',
  component: ChatsPage,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    conversations: sampleConversations,
    selected: sampleConversations[0],
    chat: <MockChat />,
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="h-[760px]">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The Shep-wide chat with a spec review, an HTML preview and a plan card inline. */
export const Default: Story = {};

/** A feature conversation: lifecycle badge and a link back to the canvas. */
export const FeatureConversation: Story = {
  args: { selected: sampleConversations[3] },
};
