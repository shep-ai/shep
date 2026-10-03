import type { Meta, StoryObj } from '@storybook/react';
import { fixtureEvalListing } from './harness-fixtures';
import { HarnessEvalsPanel } from './harness-evals-panel';

const meta: Meta<typeof HarnessEvalsPanel> = {
  title: 'Harness/HarnessEvalsPanel',
  component: HarnessEvalsPanel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessEvalsPanel>;

/** A finished smoke run: baseline vs query-aware side by side. */
export const Default: Story = { args: { initial: fixtureEvalListing } };

/** No runs yet. */
export const Empty: Story = { args: { initial: { ...fixtureEvalListing, runs: [] } } };
