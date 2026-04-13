import type { Meta, StoryObj } from '@storybook/react';
import { AttachmentList } from './attachment-list';

const meta: Meta<typeof AttachmentList> = {
  title: 'PM/AttachmentList',
  component: AttachmentList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockAttachments = [
  {
    id: 'att-1',
    workItemId: 'wi-1',
    filename: 'screenshot.png',
    mimeType: 'image/png',
    fileSize: 245760,
    storagePath: '/tmp/screenshot.png',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    deletedAt: undefined,
  },
  {
    id: 'att-2',
    workItemId: 'wi-1',
    filename: 'requirements.pdf',
    mimeType: 'application/pdf',
    fileSize: 1048576,
    storagePath: '/tmp/requirements.pdf',
    createdAt: new Date('2024-01-16'),
    updatedAt: new Date('2024-01-16'),
    deletedAt: undefined,
  },
  {
    id: 'att-3',
    workItemId: 'wi-1',
    filename: 'data-export.csv',
    mimeType: 'text/csv',
    fileSize: 512,
    storagePath: '/tmp/data-export.csv',
    createdAt: new Date('2024-01-17'),
    updatedAt: new Date('2024-01-17'),
    deletedAt: undefined,
  },
];

export const WithAttachments: Story = {
  args: {
    workItemId: 'wi-1',
    attachments: mockAttachments,
  },
};

export const Empty: Story = {
  args: {
    workItemId: 'wi-1',
    attachments: [],
  },
};
