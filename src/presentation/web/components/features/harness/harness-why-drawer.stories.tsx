import type { Meta, StoryObj } from '@storybook/react';
import { HarnessWhyDrawer } from './harness-why-drawer';

const meta: Meta<typeof HarnessWhyDrawer> = {
  title: 'Harness/HarnessWhyDrawer',
  component: HarnessWhyDrawer,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessWhyDrawer>;

/** Why a search result was shown long: its relevance on the visibility bands. */
export const Open: Story = {
  args: { target: { planId: 'plan-3', chunkId: 'c-search' }, onClose: () => undefined },
};

/** Closed (renders nothing). */
export const Closed: Story = { args: { target: null, onClose: () => undefined } };
