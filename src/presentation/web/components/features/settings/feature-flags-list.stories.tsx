import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FeatureFlagGroup } from '@shepai/core/domain/generated/output';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';
import { listFeatureFlagDescriptors } from '@shepai/core/domain/shared/feature-flag-catalog';
import { FeatureFlagsList, type FeatureFlagListItem } from './feature-flags-list';

const DEFAULTS = createDefaultSettings().featureFlags!;

const ITEMS: FeatureFlagListItem[] = listFeatureFlagDescriptors().map(({ key, group }) => ({
  key,
  group,
  enabled: DEFAULTS[key],
  defaultEnabled: DEFAULTS[key],
}));

const meta: Meta<typeof FeatureFlagsList> = {
  title: 'Settings/FeatureFlagsList',
  component: FeatureFlagsList,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-lg border px-4 py-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FeatureFlagsList>;

function Interactive({
  initial,
  showDefaults,
}: {
  initial: FeatureFlagListItem[];
  showDefaults: boolean;
}) {
  const [items, setItems] = useState(initial);
  return (
    <FeatureFlagsList
      items={items.map((item) =>
        showDefaults ? item : { key: item.key, group: item.group, enabled: item.enabled }
      )}
      onToggle={(key, enabled) =>
        setItems((current) =>
          current.map((item) => (item.key === key ? { ...item, enabled } : item))
        )
      }
    />
  );
}

/** Every flag at its default, with the "default on/off" badge (the dedicated view). */
export const Default: Story = {
  render: () => <Interactive initial={ITEMS} showDefaults />,
};

/** Without default badges, as the Settings page section shows it. */
export const WithoutDefaults: Story = {
  render: () => <Interactive initial={ITEMS} showDefaults={false} />,
};

/** Every software-factory area turned off. */
export const SoftwareFactoryOff: Story = {
  render: () => (
    <Interactive
      initial={ITEMS.map((item) =>
        item.group === FeatureFlagGroup.SoftwareFactory ? { ...item, enabled: false } : item
      )}
      showDefaults
    />
  ),
};

/** Read-only while a save is in flight. */
export const Disabled: Story = {
  args: { items: ITEMS, onToggle: () => undefined, disabled: true },
};
