import type { Meta, StoryObj } from '@storybook/react';
import { HarnessContextTab } from './harness-context-tab';

const meta: Meta<typeof HarnessContextTab> = {
  title: 'Harness/HarnessContextTab',
  component: HarnessContextTab,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessContextTab>;

/** Feature drawer → Context, loaded through the (mocked) server action. */
export const Default: Story = { args: { featureId: 'feature-1' } };
