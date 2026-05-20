import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Skeleton className="h-4 w-40" />,
};

export const TextBlock: Story = {
  render: () => (
    <div className="w-80 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ),
};

export const CardLoading: Story = {
  render: () => (
    <div className="w-80 space-y-4 rounded-md border p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  ),
};
