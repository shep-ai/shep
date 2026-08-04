import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  SessionTreeSessionRow,
  SessionTreeFeatureRow,
  SessionTreeRepositoryRow,
} from './session-tree-node';

const meta: Meta<typeof SessionTreeSessionRow> = {
  title: 'Features/SessionTreePanel/Nodes',
  component: SessionTreeSessionRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SessionTreeSessionRow>;

const baseSession = {
  id: 'sess-1',
  agentType: 'claude-code',
  preview: 'Refactor the billing module onto the tax service',
  messageCount: 24,
  lastMessageAt: '2026-08-03T16:00:00Z',
  filePath: '/Users/dev/.claude/projects/x/sess-1.jsonl',
  adopted: false,
  archived: false,
};

/** Unadopted — plain agent icon, still a loose conversation. */
export const UnadoptedSession: Story = {
  render: () => (
    <div className="bg-sidebar w-72 p-2">
      <SessionTreeSessionRow session={baseSession} level={1} />
    </div>
  ),
};

/** Adopted — violet spark marks it as already converted to a feature. */
export const AdoptedSession: Story = {
  render: () => (
    <div className="bg-sidebar w-72 p-2">
      <SessionTreeSessionRow session={{ ...baseSession, adopted: true }} level={2} />
    </div>
  ),
};

/** Archived — dimmed, with an archive marker. */
export const ArchivedSession: Story = {
  render: () => (
    <div className="bg-sidebar w-72 p-2">
      <SessionTreeSessionRow session={{ ...baseSession, archived: true }} level={1} />
    </div>
  ),
};

/** A feature row with adopted sessions beneath it. */
export const FeatureRow: Story = {
  render: () => {
    const Wrapper = () => {
      const [open, setOpen] = useState(true);
      return (
        <div className="bg-sidebar w-72 p-2">
          <SessionTreeFeatureRow
            feature={{
              id: 'feat-1',
              name: 'Reliable Feature Log Viewing',
              lifecycle: 'Implementation',
              sessions: [baseSession],
            }}
            level={1}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        </div>
      );
    };
    return <Wrapper />;
  },
};

/** A repository row with its session count. */
export const RepositoryRow: Story = {
  render: () => {
    const Wrapper = () => {
      const [open, setOpen] = useState(true);
      return (
        <div className="bg-sidebar w-72 p-2">
          <SessionTreeRepositoryRow
            repository={{
              id: 'repo-1',
              name: 'shep',
              path: '/Users/dev/Code/shep',
              features: [],
              unadoptedSessions: [],
              sessionCount: 3,
            }}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        </div>
      );
    };
    return <Wrapper />;
  },
};
