import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ViewSwitcher } from './view-switcher';

const meta: Meta<typeof ViewSwitcher> = {
  title: 'PM/ViewSwitcher',
  component: ViewSwitcher,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onViewChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ListActive: Story = {
  args: {
    activeView: 'list',
  },
};

export const BoardActive: Story = {
  args: {
    activeView: 'board',
  },
};

export const TableActive: Story = {
  args: {
    activeView: 'table',
  },
};

export const CalendarActive: Story = {
  args: {
    activeView: 'calendar',
  },
};
