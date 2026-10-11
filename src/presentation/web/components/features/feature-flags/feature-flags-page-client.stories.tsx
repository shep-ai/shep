import type { Meta, StoryObj } from '@storybook/react';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';
import { listFeatureFlagDescriptors } from '@shepai/core/domain/shared/feature-flag-catalog';
import { FeatureFlagGroup } from '@shepai/core/domain/generated/output';
import type { FeatureFlagState } from '@shepai/core/application/use-cases/settings/list-feature-flags.use-case';
import { FeatureFlagsPageClient } from './feature-flags-page-client';

const DEFAULTS = createDefaultSettings().featureFlags!;

const AT_DEFAULTS: FeatureFlagState[] = listFeatureFlagDescriptors().map((descriptor) => ({
  ...descriptor,
  enabled: DEFAULTS[descriptor.key],
  defaultEnabled: DEFAULTS[descriptor.key],
}));

const meta: Meta<typeof FeatureFlagsPageClient> = {
  title: 'Features/FeatureFlagsPageClient',
  component: FeatureFlagsPageClient,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof FeatureFlagsPageClient>;

/** A fresh install: every flag at its default. */
export const Default: Story = { args: { initialFlags: AT_DEFAULTS } };

/** The owner has turned ASPM on and the software factory off. */
export const Customized: Story = {
  args: {
    initialFlags: AT_DEFAULTS.map((flag) =>
      flag.key === 'aspm'
        ? { ...flag, enabled: true }
        : flag.group === FeatureFlagGroup.SoftwareFactory
          ? { ...flag, enabled: false }
          : flag
    ),
  },
};

/** Nothing to show (the use case returned no flags). */
export const Empty: Story = { args: { initialFlags: [] } };
