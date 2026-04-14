import type { Meta, StoryObj } from '@storybook/react';

import { ResizableSplit } from './resizable-split';

const meta: Meta<typeof ResizableSplit> = {
  title: 'ApplicationPage/ResizableSplit',
  component: ResizableSplit,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ResizableSplit>;

export const Default: Story = {
  args: {
    left: <div className="bg-muted flex h-full items-center justify-center">Left</div>,
    right: <div className="bg-background flex h-full items-center justify-center">Right</div>,
  },
};

export const RichContent: Story = {
  args: {
    left: <div className="bg-muted flex h-full items-center justify-center p-4">Chat pane</div>,
    right: (
      <div className="bg-background flex h-full items-center justify-center p-4">View pane</div>
    ),
  },
};
