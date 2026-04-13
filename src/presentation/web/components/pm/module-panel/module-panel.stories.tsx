import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ModulePanel } from './module-panel';
import { ModuleStatus } from '@shepai/core/domain/generated/output';
import type { PmModule } from '@shepai/core/domain/generated/output';

const NOW = new Date();

const mockModules: PmModule[] = [
  {
    id: 'm1',
    projectId: 'proj-1',
    name: 'Authentication',
    description: 'User login, signup, and session management',
    status: ModuleStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'm2',
    projectId: 'proj-1',
    name: 'Dashboard',
    status: ModuleStatus.InProgress,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'm3',
    projectId: 'proj-1',
    name: 'Settings',
    description: 'Application configuration and user preferences',
    status: ModuleStatus.Planned,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'm4',
    projectId: 'proj-1',
    name: 'Notifications',
    status: ModuleStatus.Backlog,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const meta: Meta<typeof ModulePanel> = {
  title: 'PM/ModulePanel',
  component: ModulePanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onModulesChange: fn(),
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
    modules: mockModules,
  },
};

export const SingleModule: Story = {
  args: {
    projectId: 'proj-1',
    modules: [mockModules[0]],
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    modules: [],
  },
};
