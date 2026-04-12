import type { Meta, StoryObj } from '@storybook/react';
import { GlobalSearchDialog } from './global-search-dialog';

const meta = {
  title: 'Features/GlobalSearchDialog',
  component: GlobalSearchDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GlobalSearchDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
