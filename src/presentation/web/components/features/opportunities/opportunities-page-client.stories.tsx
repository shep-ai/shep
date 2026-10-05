import type { Meta, StoryObj } from '@storybook/react';
import { OpportunitiesPageClient } from './opportunities-page-client';
import { BOARD, DISCOVERY_RUN, FEEDBACK_KEYS, OPTIONS, THEMES } from './opportunities-fixtures';
import { CALIBRATION, PENDING_OUTCOME, SOLVED_OUTCOME } from './outcomes-fixtures';

const meta: Meta<typeof OpportunitiesPageClient> = {
  title: 'Features/Opportunities/OpportunitiesPageClient',
  component: OpportunitiesPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: { options: OPTIONS },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Building work and the best accepted bet fill the week; CSV export waits. */
export const Default: Story = {
  args: {
    board: BOARD,
    themes: THEMES,
    feedbackKeys: FEEDBACK_KEYS,
    latestDiscovery: DISCOVERY_RUN,
    outcomes: { outcomes: [PENDING_OUTCOME, SOLVED_OUTCOME], calibration: CALIBRATION },
  },
};

export const Empty: Story = {
  args: {
    board: {
      ...BOARD,
      ranked: [],
      unlinkedSignals: [],
      line: { inLine: [], waiting: [], usedHours: 0, capacityHours: 16 },
    },
  },
};

export const LoadError: Story = { args: { loadError: 'No space "acme".' } };
