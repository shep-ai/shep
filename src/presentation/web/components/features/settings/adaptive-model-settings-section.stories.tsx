import type { Meta, StoryObj } from '@storybook/react';
import { AdaptiveModelSettingsSection } from './adaptive-model-settings-section';

const meta: Meta<typeof AdaptiveModelSettingsSection> = {
  title: 'Settings/AdaptiveModelSettingsSection',
  component: AdaptiveModelSettingsSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AdaptiveModelSettingsSection>;

/** Default: adaptive routing off, every tier derived from the pinned model. */
export const Default: Story = {
  args: {
    adaptive: undefined,
  },
};

/** Routing on with derived tiers — the common case after a single click. */
export const Enabled: Story = {
  args: {
    adaptive: { enabled: true },
  },
};

/** A user who pinned one tier explicitly and left the rest derived. */
export const WithTierOverride: Story = {
  args: {
    adaptive: { enabled: true, low: 'claude-haiku-4-5' },
  },
};

/** All three tiers pinned by hand. */
export const FullyOverridden: Story = {
  args: {
    adaptive: {
      enabled: true,
      high: 'claude-opus-5',
      medium: 'claude-sonnet-4-6',
      low: 'claude-haiku-4-5',
    },
  },
};

/**
 * Loading: the tier rows appear only once `getAdaptiveModelPlan` resolves, so
 * this is the section during that first round-trip — the toggle is usable
 * immediately and the resolved-model badges fill in after.
 */
export const Loading: Story = {
  args: {
    adaptive: { enabled: false },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Before the plan action resolves, only the header and toggle render. ' +
          'The Storybook mock resolves immediately, so this matches Default visually.',
      },
    },
  },
};

/**
 * Error: when the plan cannot be resolved (settings not initialized, agent
 * misconfigured) the section still renders the toggle and explains why the
 * tier table is missing instead of showing an empty box.
 */
export const Error: Story = {
  args: {
    adaptive: { enabled: true },
  },
  parameters: {
    docs: {
      description: {
        story:
          'The section degrades to header + toggle + an explanatory line when ' +
          '`getAdaptiveModelPlan` returns an error.',
      },
    },
  },
};
