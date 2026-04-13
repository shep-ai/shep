import type { Meta, StoryObj } from '@storybook/react';
import { TimeEntryList } from './time-entry-list';

const meta: Meta<typeof TimeEntryList> = {
  title: 'PM/TimeEntryList',
  component: TimeEntryList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockEntries = [
  {
    id: 'te-1',
    workItemId: 'wi-1',
    durationMinutes: 120,
    note: 'Implemented feature scaffolding',
    loggedAt: new Date('2024-01-15T10:00:00'),
    createdAt: new Date('2024-01-15T10:00:00'),
    updatedAt: new Date('2024-01-15T10:00:00'),
  },
  {
    id: 'te-2',
    workItemId: 'wi-1',
    durationMinutes: 45,
    note: 'Code review and bug fixes',
    loggedAt: new Date('2024-01-16T14:30:00'),
    createdAt: new Date('2024-01-16T14:30:00'),
    updatedAt: new Date('2024-01-16T14:30:00'),
  },
  {
    id: 'te-3',
    workItemId: 'wi-1',
    durationMinutes: 30,
    loggedAt: new Date('2024-01-17T09:00:00'),
    createdAt: new Date('2024-01-17T09:00:00'),
    updatedAt: new Date('2024-01-17T09:00:00'),
  },
];

export const WithEntries: Story = {
  args: {
    workItemId: 'wi-1',
    timeEntries: mockEntries,
    totalMinutes: 195,
  },
};

export const SingleEntry: Story = {
  args: {
    workItemId: 'wi-1',
    timeEntries: [mockEntries[0]],
    totalMinutes: 120,
  },
};

export const Empty: Story = {
  args: {
    workItemId: 'wi-1',
    timeEntries: [],
    totalMinutes: 0,
  },
};
