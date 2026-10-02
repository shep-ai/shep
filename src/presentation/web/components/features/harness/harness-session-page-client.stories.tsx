import type { Meta, StoryObj } from '@storybook/react';
import { fixtureSessionDetail } from './harness-fixtures';
import { HarnessSessionPageClient } from './harness-session-page-client';

const meta: Meta<typeof HarnessSessionPageClient> = {
  title: 'Harness/HarnessSessionPageClient',
  component: HarnessSessionPageClient,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSessionPageClient>;

/** A finished standalone session with its outcome actions. */
export const Default: Story = { args: { detail: fixtureSessionDetail } };
