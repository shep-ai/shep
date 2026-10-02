import type { Meta, StoryObj } from '@storybook/react';
import { HarnessPermissionBanner } from './harness-permission-banner';

const meta: Meta<typeof HarnessPermissionBanner> = {
  title: 'Harness/HarnessPermissionBanner',
  component: HarnessPermissionBanner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessPermissionBanner>;

/** Pinned above the drawer tabs while an action waits for approval. */
export const Waiting: Story = { args: { featureId: 'feature-1', onReview: () => undefined } };
