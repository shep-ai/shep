import type { Meta, StoryObj } from '@storybook/react';
import { PageEditor } from './page-editor';

const meta: Meta<typeof PageEditor> = {
  title: 'PM/PageEditor',
  component: PageEditor,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleContent = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Getting Started' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Welcome to the project wiki. This is a ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'rich text editor' },
        { type: 'text', text: ' with support for formatting, lists, and more.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Bold, italic, and strikethrough' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Headings (H1-H3)' }] }],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Code blocks with syntax highlighting' }],
            },
          ],
        },
      ],
    },
  ],
});

const noop = (_content: string) => {
  /* no-op for storybook */
};

export const Default: Story = {
  args: {
    content: sampleContent,
    onUpdate: noop,
  },
};

export const Empty: Story = {
  args: {
    content: '',
    onUpdate: noop,
  },
};

export const ReadOnly: Story = {
  args: {
    content: sampleContent,
    onUpdate: noop,
    editable: false,
  },
};
