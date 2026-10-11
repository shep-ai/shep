import type { Meta, StoryObj } from '@storybook/react';
import { HtmlPreviewChatBlock } from './html-preview-chat-block';
import { htmlPreviewBlock } from './chat-block-fixtures';

const meta: Meta<typeof HtmlPreviewChatBlock> = {
  title: 'Composed/ChatBlocks/HtmlPreviewChatBlock',
  component: HtmlPreviewChatBlock,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { block: htmlPreviewBlock },
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

/** A component preview in the sandboxed frame; toggle Source or open full screen. */
export const Default: Story = {};

export const Chart: Story = {
  args: {
    block: {
      ...htmlPreviewBlock,
      id: 'block-chart',
      title: 'Weekly sign-ups',
      html: `<svg viewBox="0 0 320 140" width="100%" style="font-family:system-ui;padding:12px">
  ${[40, 70, 55, 90, 120, 100, 130]
    .map(
      (v, i) =>
        `<rect x="${i * 44 + 8}" y="${130 - v}" width="30" height="${v}" rx="4" fill="#7c3aed"/>`
    )
    .join('')}
</svg>`,
    },
  },
};
