import type { Meta, StoryObj } from '@storybook/react';
import { FilePlus, FileEdit, FileMinus } from 'lucide-react';
import { Tree } from './file-tree';
import type { TreeViewElement } from './file-tree';

const sampleElements: TreeViewElement[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'src/components',
        name: 'components',
        type: 'folder',
        children: [
          {
            id: 'src/components/button.tsx',
            name: 'button.tsx',
            type: 'file',
            icon: <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-600" />,
            badge: (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="text-green-600">+12</span>
                <span className="text-red-600">-3</span>
              </span>
            ),
          },
          {
            id: 'src/components/input.tsx',
            name: 'input.tsx',
            type: 'file',
            icon: <FilePlus className="h-3.5 w-3.5 shrink-0 text-green-600" />,
            badge: <span className="text-[10px] text-green-600">+45</span>,
          },
        ],
      },
      {
        id: 'src/lib',
        name: 'lib',
        type: 'folder',
        children: [
          {
            id: 'src/lib/utils.ts',
            name: 'utils.ts',
            type: 'file',
            icon: <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-600" />,
            badge: (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="text-green-600">+5</span>
                <span className="text-red-600">-2</span>
              </span>
            ),
          },
        ],
      },
    ],
  },
  {
    id: 'package.json',
    name: 'package.json',
    type: 'file',
    icon: <FileEdit className="h-3.5 w-3.5 shrink-0 text-amber-600" />,
    badge: (
      <span className="flex items-center gap-1 text-[10px]">
        <span className="text-green-600">+1</span>
        <span className="text-red-600">-1</span>
      </span>
    ),
  },
  {
    id: 'old-file.ts',
    name: 'old-file.ts',
    type: 'file',
    icon: <FileMinus className="h-3.5 w-3.5 shrink-0 text-red-600" />,
    badge: <span className="text-[10px] text-red-600">-20</span>,
  },
];

const meta: Meta<typeof Tree> = {
  title: 'Primitives/FileTree',
  component: Tree,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div
        style={{
          width: 280,
          height: 400,
          border: '1px solid var(--color-border)',
          borderRadius: 8,
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tree>;

/** Default — hierarchical file tree with diff badges. */
export const Default: Story = {
  args: {
    elements: sampleElements,
    initialSelectedId: 'src/components/button.tsx',
  },
};

/** Without indicator lines. */
export const NoIndicator: Story = {
  args: {
    elements: sampleElements,
    indicator: false,
  },
};

/** Flat file list (no folders). */
export const FlatList: Story = {
  args: {
    elements: [
      { id: 'README.md', name: 'README.md', type: 'file' },
      { id: 'index.ts', name: 'index.ts', type: 'file' },
      { id: 'package.json', name: 'package.json', type: 'file' },
    ],
  },
};

/** Single file. */
export const SingleFile: Story = {
  args: {
    elements: [
      {
        id: 'app.tsx',
        name: 'app.tsx',
        type: 'file',
        icon: <FilePlus className="h-3.5 w-3.5 shrink-0 text-green-600" />,
        badge: <span className="text-[10px] text-green-600">+100</span>,
      },
    ],
  },
};
