import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'Primitives/Tooltip',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>Tooltip content</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const TopSide: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="outline">Top tooltip</Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          Appears above the trigger
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const WithDelay: Story = {
  render: () => (
    <TooltipProvider delayDuration={800}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Delayed tooltip</Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>Shows after an 800ms hover delay</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
