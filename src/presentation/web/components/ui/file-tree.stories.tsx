import type { Meta, StoryObj } from '@storybook/react';
import { Tree, type TreeViewElement } from './file-tree';

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
          { id: 'src/components/button.tsx', name: 'button.tsx', type: 'file' },
          { id: 'src/components/input.tsx', name: 'input.tsx', type: 'file' },
          { id: 'src/components/dialog.tsx', name: 'dialog.tsx', type: 'file' },
        ],
      },
      {
        id: 'src/lib',
        name: 'lib',
        type: 'folder',
        children: [
          { id: 'src/lib/utils.ts', name: 'utils.ts', type: 'file' },
          { id: 'src/lib/cn.ts', name: 'cn.ts', type: 'file' },
        ],
      },
      { id: 'src/index.ts', name: 'index.ts', type: 'file' },
    ],
  },
  { id: 'package.json', name: 'package.json', type: 'file' },
  { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file' },
];

const meta: Meta<typeof Tree> = {
  title: 'UI/FileTree',
  component: Tree,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '400px', width: '300px', border: '1px solid var(--color-border)' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tree>;

/** Default file tree with folders expanded. */
export const Default: Story = {
  args: {
    elements: sampleElements,
    initialExpandedItems: ['src', 'src/components', 'src/lib'],
  },
};

/** Collapsed tree — no items initially expanded. */
export const Collapsed: Story = {
  args: {
    elements: sampleElements,
  },
};

/** Single file — no folders. */
export const SingleFile: Story = {
  args: {
    elements: [{ id: 'readme.md', name: 'readme.md', type: 'file' }],
  },
};

/** Deeply nested structure. */
export const DeepNesting: Story = {
  args: {
    elements: [
      {
        id: 'a',
        name: 'a',
        type: 'folder',
        children: [
          {
            id: 'a/b',
            name: 'b',
            type: 'folder',
            children: [
              {
                id: 'a/b/c',
                name: 'c',
                type: 'folder',
                children: [{ id: 'a/b/c/file.ts', name: 'file.ts', type: 'file' }],
              },
            ],
          },
        ],
      },
    ],
    initialExpandedItems: ['a', 'a/b', 'a/b/c'],
  },
};
