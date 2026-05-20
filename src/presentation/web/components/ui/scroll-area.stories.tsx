import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea, ScrollBar } from './scroll-area';

const meta = {
  title: 'Primitives/ScrollArea',
  component: ScrollArea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const items = Array.from({ length: 24 }, (_, index) => `Activity event ${index + 1}`);

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-64 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm leading-none font-medium">Recent activity</h4>
        {items.map((item) => (
          <div key={item} className="border-t py-2 text-sm">
            {item}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-80 rounded-md border whitespace-nowrap">
      <div className="flex w-max gap-4 p-4">
        {items.slice(0, 10).map((item) => (
          <div key={item} className="bg-muted h-24 w-36 rounded-md p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

export const BothAxes: Story = {
  render: () => (
    <ScrollArea className="h-64 w-80 rounded-md border">
      <div className="grid w-[560px] grid-cols-4 gap-3 p-4">
        {items.map((item) => (
          <div key={item} className="bg-muted rounded-md p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
