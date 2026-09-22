import type { Meta, StoryObj } from '@storybook/react';
import { OperationRunCard } from './operation-bubble';

const APP_ID = 'app-storybook';
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

type RunEntry = Parameters<typeof OperationRunCard>[0]['entries'][number];

/** Log entries timestamped relative to "now", oldest first. */
function entries(rows: { message: string; level?: string; agoMs: number; detail?: string }[]) {
  return rows.map<RunEntry>((row, index) => ({
    id: `entry-${index}`,
    operationKind: 'CloudDeploy',
    operationId: APP_ID,
    level: row.level ?? 'Info',
    message: row.message,
    detail: row.detail,
    createdAt: new Date(Date.now() - row.agoMs).toISOString(),
  }));
}

const meta: Meta<typeof OperationRunCard> = {
  title: 'Features/Chat/OperationRunCard',
  component: OperationRunCard,
  parameters: { layout: 'padded' },
  args: { applicationId: APP_ID, kind: 'deploy', runIndex: 0 },
  decorators: [
    (Story) => (
      <div className="w-[520px] rounded-xl border py-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OperationRunCard>;

/** Last entry is seconds old: spinning chip and live title. */
export const InProgress: Story = {
  args: {
    entries: entries([
      { message: 'Starting deploy to cloudflare', agoMs: 8 * SECOND_MS },
      { message: 'Uploading 42 files', agoMs: 2 * SECOND_MS },
    ]),
  },
};

export const Succeeded: Story = {
  args: {
    entries: entries([
      { message: 'Starting deploy to cloudflare', agoMs: 5 * MINUTE_MS },
      { message: 'Deployed to https://example.pages.dev', agoMs: 4 * MINUTE_MS },
    ]),
  },
};

export const FinishedWithWarning: Story = {
  args: {
    kind: 'publish',
    entries: entries([
      { message: 'Starting GitHub repository creation', agoMs: 3 * MINUTE_MS },
      { message: 'Branch protection could not be enabled', level: 'Warn', agoMs: 2 * MINUTE_MS },
    ]),
  },
};

export const Failed: Story = {
  args: {
    kind: 'sync',
    entries: entries([
      { message: 'Starting save & backup', agoMs: 10 * MINUTE_MS },
      {
        message: 'Push rejected',
        level: 'Error',
        agoMs: 9 * MINUTE_MS,
        detail: '! [rejected] main -> main (fetch first)',
      },
    ]),
  },
};
