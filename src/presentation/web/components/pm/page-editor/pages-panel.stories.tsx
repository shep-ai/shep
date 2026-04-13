import type { Meta, StoryObj } from '@storybook/react';
import { PagesPanel } from './pages-panel';
import type { Page } from '@shepai/core/domain/generated/output';

const mockPages: Page[] = [
  {
    id: 'page-1',
    projectId: 'proj-1',
    title: 'Getting Started',
    content: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Getting Started' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Welcome to the project wiki.' }],
        },
      ],
    }),
    sortOrder: 0,
    isFavorite: true,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  },
  {
    id: 'page-2',
    projectId: 'proj-1',
    title: 'Architecture',
    content: '',
    sortOrder: 1,
    isFavorite: false,
    createdAt: new Date('2025-01-16'),
    updatedAt: new Date('2025-01-16'),
  },
  {
    id: 'page-3',
    projectId: 'proj-1',
    title: 'Backend Design',
    content: '',
    parentId: 'page-2',
    sortOrder: 0,
    isFavorite: false,
    createdAt: new Date('2025-01-17'),
    updatedAt: new Date('2025-01-17'),
  },
  {
    id: 'page-4',
    projectId: 'proj-1',
    title: 'Frontend Design',
    content: '',
    parentId: 'page-2',
    sortOrder: 1,
    isFavorite: false,
    createdAt: new Date('2025-01-17'),
    updatedAt: new Date('2025-01-17'),
  },
];

const meta: Meta<typeof PagesPanel> = {
  title: 'PM/PagesPanel',
  component: PagesPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '500px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPages: Story = {
  args: {
    projectId: 'proj-1',
    pages: mockPages,
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    pages: [],
  },
};
