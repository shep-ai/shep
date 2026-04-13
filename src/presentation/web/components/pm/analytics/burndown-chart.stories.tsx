import type { Meta, StoryObj } from '@storybook/react';
import { BurndownChart } from './burndown-chart';
import type { BurndownDataPoint } from './burndown-chart';

function generateBurndownData(
  totalItems: number,
  days: number,
  completionPattern: number[]
): BurndownDataPoint[] {
  const idealDecrement = totalItems / days;
  const startDate = new Date('2026-04-01');

  return Array.from({ length: days + 1 }, (_, day) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    const completed = completionPattern[day] ?? completionPattern[completionPattern.length - 1];
    return {
      date: date.toISOString().split('T')[0],
      ideal: Math.round(Math.max(0, totalItems - idealDecrement * day) * 10) / 10,
      actual: totalItems - completed,
    };
  });
}

const meta: Meta<typeof BurndownChart> = {
  title: 'PM/Analytics/BurndownChart',
  component: BurndownChart,
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
    cycleName: 'Sprint 1',
    totalItems: 20,
    completedItems: 12,
    dataPoints: generateBurndownData(20, 14, [0, 1, 2, 4, 5, 7, 8, 10, 10, 11, 11, 12, 12, 12, 12]),
  },
};

export const Ahead: Story = {
  args: {
    cycleName: 'Sprint 2',
    totalItems: 15,
    completedItems: 13,
    dataPoints: generateBurndownData(15, 10, [0, 2, 4, 6, 8, 10, 11, 12, 13, 13, 13]),
  },
};

export const Behind: Story = {
  args: {
    cycleName: 'Sprint 3',
    totalItems: 25,
    completedItems: 5,
    dataPoints: generateBurndownData(25, 14, [0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]),
  },
};

export const Empty: Story = {
  args: {
    cycleName: 'Sprint 4',
    totalItems: 0,
    completedItems: 0,
    dataPoints: [],
  },
};
