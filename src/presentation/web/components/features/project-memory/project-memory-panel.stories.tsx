import type { Meta, StoryObj } from '@storybook/react';
import {
  MemoryCategory,
  MemoryScope,
  type ProjectMemory,
} from '@shepai/core/domain/generated/output';
import { ProjectMemoryPanel } from './project-memory-panel';

const meta: Meta<typeof ProjectMemoryPanel> = {
  title: 'Features/ProjectMemoryPanel',
  component: ProjectMemoryPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = new Date('2026-06-01T10:00:00Z');

function entry(over: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: 'm-1',
    repositoryPath: '/home/user/shep',
    category: MemoryCategory.Convention,
    entryKey: 'k-1',
    content: 'Presentation layers must call core logic through use-case classes.',
    sourceFeatureId: 'feat-102-shep-brain',
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
    scope: MemoryScope.Organization,
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
  }),
];

export const WithEntries: Story = {
  args: { entries: mockEntries },
};

export const SingleCategory: Story = {
  args: { entries: [mockEntries[0]] },
};

export const Empty: Story = {
  args: { entries: [] },
};
