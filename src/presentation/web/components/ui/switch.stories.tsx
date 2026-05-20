import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './label';
import { Switch } from './switch';

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
    size: {
      control: 'select',
      options: ['default', 'sm'],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 'default',
  },
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    defaultChecked: true,
  },
};

export const DisabledWithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="switch-airplane-mode" disabled />
      <Label htmlFor="switch-airplane-mode">Airplane mode</Label>
    </div>
  ),
};
