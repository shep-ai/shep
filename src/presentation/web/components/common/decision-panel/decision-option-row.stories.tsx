import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DecisionOptionRow } from './decision-option-row';

const meta: Meta<typeof DecisionOptionRow> = {
  title: 'Composed/DecisionOptionRow',
  component: DecisionOptionRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    option: { id: 'grid', label: 'Grid', description: 'Two columns on desktop' },
    index: 0,
    selected: false,
    disabled: false,
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Recommended: Story = {
  args: {
    option: { id: 'grid', label: 'Grid', description: 'Two columns', recommended: true },
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const NoShortcut: Story = { args: { index: 11 } };
