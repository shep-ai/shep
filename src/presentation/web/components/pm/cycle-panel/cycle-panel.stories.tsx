import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { CyclePanel } from './cycle-panel';
import { CycleStatus } from '@shepai/core/domain/generated/output';
import type { Cycle } from '@shepai/core/domain/generated/output';

const NOW = new Date();

const mockCycles: Cycle[] = [
  {
    id: 'c1',
    projectId: 'proj-1',
    name: 'Sprint 1',
    status: CycleStatus.Completed,
    startDate: new Date('2026-03-01'),
    endDate: new Date('2026-03-14'),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'c2',
    projectId: 'proj-1',
    name: 'Sprint 2',
    status: CycleStatus.Active,
    startDate: new Date('2026-03-15'),
    endDate: new Date('2026-03-28'),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'c3',
    projectId: 'proj-1',
    name: 'Sprint 3',
    status: CycleStatus.Upcoming,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const meta: Meta<typeof CyclePanel> = {
  title: 'PM/CyclePanel',
  component: CyclePanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onCyclesChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    projectId: 'proj-1',
    cycles: mockCycles,
  },
};

export const SingleActive: Story = {
  args: {
    projectId: 'proj-1',
    cycles: [mockCycles[1]],
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    cycles: [],
  },
};
