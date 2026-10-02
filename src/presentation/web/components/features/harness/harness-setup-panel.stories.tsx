import type { Meta, StoryObj } from '@storybook/react';
import { HarnessSetupPanel } from './harness-setup-panel';

const meta: Meta<typeof HarnessSetupPanel> = {
  title: 'Harness/HarnessSetupPanel',
  component: HarnessSetupPanel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSetupPanel>;

/** Pick a repository, preview the files, then write them. */
export const Default: Story = { args: { repositories: ['/home/dev/acme-api'] } };
