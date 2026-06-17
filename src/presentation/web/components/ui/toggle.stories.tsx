import type { Meta, StoryObj } from '@storybook/react';
import { Bold, Italic, Underline } from 'lucide-react';
import { Toggle } from './toggle';

const meta = {
  title: 'Primitives/Toggle',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Toggle aria-label="Toggle bold">
      <Bold className="size-4" />
    </Toggle>
  ),
};

export const Outline: Story = {
  render: () => (
    <Toggle variant="outline" aria-label="Toggle italic">
      <Italic className="size-4" />
    </Toggle>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Toggle size="sm" aria-label="Toggle bold small">
        <Bold className="size-4" />
      </Toggle>
      <Toggle size="default" aria-label="Toggle bold default">
        <Bold className="size-4" />
      </Toggle>
      <Toggle size="lg" aria-label="Toggle bold large">
        <Bold className="size-4" />
      </Toggle>
    </div>
  ),
};

export const OnState: Story = {
  render: () => (
    <Toggle defaultPressed aria-label="Toggle underline on">
      <Underline className="size-4" />
    </Toggle>
  ),
};
