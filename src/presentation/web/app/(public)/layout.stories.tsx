import type { Meta, StoryObj } from '@storybook/react';
import PublicLayout from './layout';

const meta: Meta<typeof PublicLayout> = {
  title: 'Landing/PublicLayout',
  component: PublicLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">Page content goes here</p>
      </div>
    ),
  },
};
