import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { NotificationCenter } from './notification-center';
import { PmNotificationType } from '@shepai/core/domain/generated/output';
import type { PmNotification } from '@shepai/core/domain/generated/output';

const NOW = new Date();

const mockNotifications: PmNotification[] = [
  {
    id: 'n1',
    projectId: 'proj-1',
    recipientId: 'user-1',
    type: PmNotificationType.Assignment,
    title: 'You were assigned TST-42',
    body: 'Fix login button on mobile',
    isRead: false,
    isArchived: false,
    referenceId: 'wi-42',
    referenceType: 'WorkItem',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n2',
    projectId: 'proj-1',
    recipientId: 'user-1',
    type: PmNotificationType.StateChange,
    title: 'TST-15 moved to Done',
    isRead: false,
    isArchived: false,
    referenceId: 'wi-15',
    referenceType: 'WorkItem',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n3',
    projectId: 'proj-1',
    recipientId: 'user-1',
    type: PmNotificationType.Comment,
    title: 'New comment on TST-7',
    body: 'Can we add a loading state here?',
    isRead: true,
    isArchived: false,
    referenceId: 'wi-7',
    referenceType: 'WorkItem',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'n4',
    projectId: 'proj-1',
    recipientId: 'user-1',
    type: PmNotificationType.DueDateApproaching,
    title: 'TST-3 is due tomorrow',
    isRead: true,
    isArchived: false,
    referenceId: 'wi-3',
    referenceType: 'WorkItem',
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const meta: Meta<typeof NotificationCenter> = {
  title: 'PM/NotificationCenter',
  component: NotificationCenter,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    onNotificationsChange: fn(),
    onUnreadCountChange: fn(),
    onNavigate: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithUnread: Story = {
  args: {
    recipientId: 'user-1',
    notifications: mockNotifications,
    unreadCount: 2,
  },
};

export const AllRead: Story = {
  args: {
    recipientId: 'user-1',
    notifications: mockNotifications.map((n) => ({ ...n, isRead: true })),
    unreadCount: 0,
  },
};

export const Empty: Story = {
  args: {
    recipientId: 'user-1',
    notifications: [],
    unreadCount: 0,
  },
};

export const ManyUnread: Story = {
  args: {
    recipientId: 'user-1',
    notifications: mockNotifications,
    unreadCount: 127,
  },
};
