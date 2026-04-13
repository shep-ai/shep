import type { Meta, StoryObj } from '@storybook/react';
import { ModuleProgressChart } from './module-progress-chart';

const meta: Meta<typeof ModuleProgressChart> = {
  title: 'PM/Analytics/ModuleProgressChart',
  component: ModuleProgressChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
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
    modules: [
      {
        moduleId: 'm1',
        moduleName: 'Authentication',
        moduleStatus: 'InProgress',
        totalItems: 10,
        completedItems: 8,
        progressPercent: 80,
      },
      {
        moduleId: 'm2',
        moduleName: 'Dashboard',
        moduleStatus: 'InProgress',
        totalItems: 15,
        completedItems: 6,
        progressPercent: 40,
      },
      {
        moduleId: 'm3',
        moduleName: 'Settings',
        moduleStatus: 'Planned',
        totalItems: 8,
        completedItems: 0,
        progressPercent: 0,
      },
      {
        moduleId: 'm4',
        moduleName: 'Notifications',
        moduleStatus: 'InProgress',
        totalItems: 5,
        completedItems: 5,
        progressPercent: 100,
      },
    ],
  },
};

export const SingleModule: Story = {
  args: {
    modules: [
      {
        moduleId: 'm1',
        moduleName: 'Core API',
        moduleStatus: 'InProgress',
        totalItems: 20,
        completedItems: 14,
        progressPercent: 70,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    modules: [],
  },
};
