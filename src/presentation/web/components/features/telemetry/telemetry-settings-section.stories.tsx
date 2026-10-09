import type { Meta, StoryObj } from '@storybook/react';
import { TelemetrySettingsSection } from './telemetry-settings-section';

/**
 * Loads its status through the `telemetry` server action, which Storybook
 * replaces with `.storybook/mocks/app/actions/telemetry.ts` (metrics on,
 * 12 events queued).
 */
const meta: Meta<typeof TelemetrySettingsSection> = {
  title: 'Features/Telemetry/TelemetrySettingsSection',
  component: TelemetrySettingsSection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { className: 'max-w-xl' },
};

export default meta;
type Story = StoryObj<typeof TelemetrySettingsSection>;

export const Default: Story = {};
