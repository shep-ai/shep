import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { SessionRow } from './session-row';
import type { SessionSummary } from './session-summary';

const REPO_PATH = '/Users/dev/Code/shep';

const baseSession: SessionSummary = {
  id: '3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34',
  agentType: 'claude-code',
  preview: 'Refactor the billing module onto the new tax service',
  messageCount: 24,
  firstMessageAt: '2026-08-01T10:00:00Z',
  lastMessageAt: '2026-08-02T16:30:00Z',
  createdAt: '2026-08-01T10:00:00Z',
  projectPath: REPO_PATH,
  filePath: `${REPO_PATH}/.jsonl`,
};

const meta: Meta<typeof SessionRow> = {
  title: 'Composed/FeatureSessionsDropdown/SessionRow',
  component: SessionRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SessionRow>;

/** The row lives inside a dropdown, so stories render it in that context. */
function RowInMenu({ session }: { session: SessionSummary }) {
  return (
    <DropdownMenu modal={false} defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Sessions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <SessionRow
          session={session}
          repositoryPath={REPO_PATH}
          onAdopted={fn().mockName('onAdopted')}
          onResumed={fn().mockName('onResumed')}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Default — a Claude Code session; hover to reveal adopt / resume / IDE actions. */
export const Default: Story = {
  render: () => <RowInMenu session={baseSession} />,
};

/** Active — touched within the last five minutes, shown with the green dot. */
export const Active: Story = {
  render: () => <RowInMenu session={{ ...baseSession, lastMessageAt: new Date().toISOString() }} />,
};

/** Cursor session — resumes via `cursor-agent`, not `claude`. */
export const CursorSession: Story = {
  render: () => (
    <RowInMenu
      session={{ ...baseSession, agentType: 'cursor', preview: 'Wire up the settings page' }}
    />
  ),
};

/** No preview text available in the transcript. */
export const NoPreview: Story = {
  render: () => <RowInMenu session={{ ...baseSession, preview: null }} />,
};

/** A long preview, truncated for the row. */
export const LongPreview: Story = {
  render: () => (
    <RowInMenu
      session={{
        ...baseSession,
        preview:
          'Investigate why the nightly build intermittently fails on windows-latest when the worktree path exceeds the default path limit',
      }}
    />
  ),
};
