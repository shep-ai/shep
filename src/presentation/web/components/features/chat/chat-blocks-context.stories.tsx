import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InteractiveMessageRole } from '@shepai/core/domain/generated/output';
import { formatChatBlockMessage } from '@shepai/core/domain/shared/chat-block';
import { planCardBlock } from '@/components/common/chat-blocks/chat-block-fixtures';
import { ChatBlocksProvider } from './chat-blocks-context';
import { ChatBlockMessage } from './ChatBlockMessage';

const content = formatChatBlockMessage(planCardBlock);

const meta: Meta<typeof ChatBlocksProvider> = {
  title: 'Features/Chat/ChatBlocksProvider',
  component: ChatBlocksProvider,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="max-w-xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    scope: 'global',
    messages: [
      {
        id: 'a1',
        featureId: 'global',
        role: InteractiveMessageRole.assistant,
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    children: <ChatBlockMessage content={content} />,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Inside the provider a block is answerable; outside it is read-only. */
export const Default: Story = {};
