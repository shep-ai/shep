import type { Meta, StoryObj } from '@storybook/react';
import type { SessionTreeRepository } from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';
import { SessionTreeRepositoryActions } from './session-tree-repository-actions';

const meta: Meta<typeof SessionTreeRepositoryActions> = {
  title: 'Features/SessionTreeRepositoryActions',
  component: SessionTreeRepositoryActions,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SessionTreeRepositoryActions>;

const repository: SessionTreeRepository = {
  id: 'repo-1',
  name: 'shep-ai/shep',
  path: '/Users/dev/code/shep',
  features: [],
  unadoptedSessions: [],
  sessionCount: 12,
};

/**
 * Renders the trigger inside a tree-row-sized container, since the menu's
 * placement only makes sense against the 288px sub-nav it belongs to.
 */
function Row({ repo }: { repo: SessionTreeRepository }) {
  return (
    <div className="bg-sidebar w-72 border p-2">
      <div className="flex items-center gap-1.5 rounded px-1 py-1 text-xs font-semibold">
        <span className="min-w-0 flex-1 truncate">{repo.name}</span>
        <span className="text-muted-foreground text-[10px] font-normal">{repo.sessionCount}</span>
        <SessionTreeRepositoryActions repository={repo} />
      </div>
    </div>
  );
}

/** Default — a tracked repository with both an id and a path, so every action is offered. */
export const Default: Story = {
  render: () => <Row repo={repository} />,
};

/**
 * Loading — the webhook probe and dev-server hydration are in flight on mount,
 * which is what the menu looks like immediately after the tree loads.
 */
export const Loading: Story = {
  render: () => <Row repo={{ ...repository, id: 'repo-loading' }} />,
};

/**
 * Path only — a repository shep knows by path but not by id (an optimistic row).
 * Identity-based actions (open, chat, remove) are withheld rather than shown broken.
 */
export const PathOnly: Story = {
  render: () => <Row repo={{ ...repository, id: undefined }} />,
};

/**
 * Error — the repository path no longer resolves, so the file actions fail and
 * report it in place on the menu row instead of closing silently.
 */
export const ErrorState: Story = {
  render: () => <Row repo={{ ...repository, path: '/Users/dev/code/deleted-repo' }} />,
};
