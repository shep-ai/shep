import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { TelemetryPreferences } from './telemetry-preferences';

const ON = {
  enabled: true,
  reason: null,
  includeIdentity: true,
  contactConsent: false,
  queuedEvents: 12,
  configured: true,
  destination: 'https://eu.i.posthog.com/batch/',
} as const;

const meta: Meta<typeof TelemetryPreferences> = {
  title: 'Features/Telemetry/TelemetryPreferences',
  component: TelemetryPreferences,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { status: { ...ON }, onChange: fn(), pending: false },
};

export default meta;
type Story = StoryObj<typeof TelemetryPreferences>;

export const Default: Story = {};

export const Anonymous: Story = {
  args: { status: { ...ON, includeIdentity: false } },
};

export const ContactAllowed: Story = {
  args: { status: { ...ON, contactConsent: true } },
};

export const TurnedOff: Story = {
  args: { status: { ...ON, enabled: false, reason: 'user-opt-out' as never } },
};

/** CI / DO_NOT_TRACK: the switches are locked and the reason is shown. */
export const ForcedOffByEnvironment: Story = {
  args: { status: { ...ON, enabled: false, reason: 'do-not-track' as never } },
};

export const Saving: Story = { args: { pending: true } };

export const WithoutMainSwitch: Story = { args: { hideEnabledSwitch: true } };
