import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import {
  HarnessAdoptionPolicy,
  HarnessRecursion,
  LearningMode,
} from '@shepai/core/domain/generated/output';
import { SelfLearningSettingsSection } from './self-learning-settings-section';

const meta: Meta<typeof SelfLearningSettingsSection> = {
  title: 'Settings/SelfLearningSettingsSection',
  component: SelfLearningSettingsSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SelfLearningSettingsSection>;

/** Commit a new cost cap so the section starts a save. */
async function changeCostCap(canvasElement: HTMLElement) {
  const input = within(canvasElement).getByTestId('learning-exploreMaxCostUsd');
  await userEvent.clear(input);
  await userEvent.type(input, '35');
  await userEvent.tab();
}

/**
 * Opt-in defaults: mode Off, k = 1, $20 cap, every candidate needs a person.
 * The flag-off state (section absent) is SettingsPageClient › Default; flag on
 * is SettingsPageClient › SelfLearningOn.
 */
export const Default: Story = { args: { learning: undefined } };

/** Explore on every feature, a larger budget and auto-adoption of tested text. */
export const Configured: Story = {
  args: {
    learning: {
      mode: LearningMode.Explore,
      exploreK: 2,
      exploreRecursion: HarnessRecursion.Sequential,
      exploreMaxCostUsd: 40,
      adoptionPolicy: HarnessAdoptionPolicy.AutoTextOnly,
      alwaysOnCharCap: 3000,
      regressionMinSample: 8,
    },
  },
};

/** A save in flight shows the saving indicator. */
export const Loading: Story = {
  args: { saveSettings: () => new Promise(() => undefined) },
  play: async ({ canvasElement }) => changeCostCap(canvasElement),
};

/** A failed save raises an error toast and keeps the new value on screen. */
export const Error: Story = {
  args: { saveSettings: async () => ({ success: false, error: 'Could not write settings' }) },
  play: async ({ canvasElement }) => changeCostCap(canvasElement),
};
