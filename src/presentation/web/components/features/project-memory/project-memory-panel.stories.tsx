import type { Meta, StoryObj } from '@storybook/react';
import {
  MemoryCategory,
  MemoryScope,
  type ProjectMemory,
} from '@shepai/core/domain/generated/output';
import { ProjectMemoryPanel } from './project-memory-panel';
import type { MemorySpaceOption } from './memory-space-option';

const meta: Meta<typeof ProjectMemoryPanel> = {
  title: 'Features/ProjectMemoryPanel',
  component: ProjectMemoryPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = new Date('2026-06-01T10:00:00Z');

const SPACES: MemorySpaceOption[] = [
  { id: 'space-default', name: 'Personal', productLines: [] },
  {
    id: 'space-acme',
    name: 'Acme',
    color: '#3456c4',
    productLines: [{ id: 'line-platform', name: 'Platform' }],
  },
];

function entry(over: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: 'm-1',
    repositoryPath: '/home/user/shep',
    category: MemoryCategory.Convention,
    entryKey: 'k-1',
    content: 'Presentation layers must call core logic through use-case classes.',
    sourceFeatureId: 'feat-102-shep-brain',
    spaceId: 'space-acme',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const mockEntries: ProjectMemory[] = [
  entry({ id: 'c1', category: MemoryCategory.Convention, entryKey: 'use-cases-only' }),
  entry({
    id: 'a1',
    category: MemoryCategory.ArchitectureDecision,
    entryKey: 'agent-executor-provider',
    content: 'All agent calls flow through IAgentExecutorProvider — never hardcode an agent type.',
    scope: MemoryScope.Space,
  }),
  entry({
    id: 'l1',
    category: MemoryCategory.Library,
    entryKey: 'preferred-db',
    content: 'Use better-sqlite3 for persistence behind the repository pattern.',
    sourceFeatureId: undefined,
  }),
  entry({
    id: 'ci1',
    category: MemoryCategory.CiFixResolution,
    entryKey: 'npm-trusted-publish',
    content: 'npm trusted publishing needs npm >= 11.5 on the release runner.',
    repositoryPath: '/home/user/other-repo',
    spaceId: 'space-default',
  }),
  entry({
    id: 'n1',
    category: MemoryCategory.NamingPattern,
    entryKey: 'use-case-suffix',
    content: 'Use-case classes end in UseCase and live under application/use-cases.',
    scope: MemoryScope.ProductLine,
    productLineId: 'line-platform',
  }),
];

export const WithEntries: Story = {
  args: { entries: mockEntries, spaces: SPACES },
};

/** One space only: no space filter is shown. */
export const SingleSpace: Story = {
  args: { entries: mockEntries, spaces: [SPACES[1]] },
};

export const SingleCategory: Story = {
  args: { entries: [mockEntries[0]] },
};

export const Empty: Story = {
  args: { entries: [] },
};
