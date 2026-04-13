import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { EpicPanel } from './epic-panel';
import { EpicStatus } from '@shepai/core/domain/generated/output';
import type { Epic } from '@shepai/core/domain/generated/output';

const NOW = new Date();

const mockEpics: Epic[] = [
  {
    id: 'e1',
    projectId: 'proj-1',
    name: 'User Authentication',
    description: 'Login, signup, password reset, and OAuth',
    status: EpicStatus.Completed,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-02-15'),
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: undefined,
  },
  {
    id: 'e2',
    projectId: 'proj-1',
    name: 'Dashboard',
    status: EpicStatus.InProgress,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: undefined,
  },
  {
    id: 'e3',
    projectId: 'proj-1',
    name: 'Reporting Engine',
    description: 'Analytics, charts, and data export',
    status: EpicStatus.Planned,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: undefined,
  },
  {
    id: 'e4',
    projectId: 'proj-1',
    name: 'API v2',
    status: EpicStatus.Backlog,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: undefined,
  },
];

const meta: Meta<typeof EpicPanel> = {
  title: 'PM/EpicPanel',
  component: EpicPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    onEpicsChange: fn(),
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
    epics: mockEpics,
  },
};

export const SingleEpic: Story = {
  args: {
    projectId: 'proj-1',
    epics: [mockEpics[0]],
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    epics: [],
  },
};
