import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ALL_SPACES, MemorySpaceFilter } from './memory-space-filter';
import type { MemorySpaceOption } from './memory-space-option';

const SPACES: MemorySpaceOption[] = [
  { id: 'space-default', name: 'Personal', productLines: [] },
  { id: 'space-acme', name: 'Acme', color: '#3456c4', productLines: [] },
  { id: 'space-globex', name: 'Globex', color: '#c4572f', productLines: [] },
];

const meta: Meta<typeof MemorySpaceFilter> = {
  title: 'Features/ProjectMemory/MemorySpaceFilter',
  component: MemorySpaceFilter,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaces: SPACES, value: ALL_SPACES, onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllSpaces: Story = {};

export const OneSpaceSelected: Story = {
  args: { value: 'space-acme' },
};

/** With a single space there is nothing to filter, so nothing renders. */
export const SingleSpace: Story = {
  args: { spaces: [SPACES[0]] },
};

export const Interactive: Story = {
  render: function InteractiveFilter(args) {
    const [value, setValue] = useState(ALL_SPACES);
    return <MemorySpaceFilter spaces={args.spaces ?? SPACES} value={value} onChange={setValue} />;
  },
};
