import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { TelemetryNoticeCard, TelemetryNoticeCardView } from './telemetry-notice-card';

const ON = {
  enabled: true,
  reason: null,
  // Identity is opt-in, so the default state leaves it out.
  includeIdentity: false,
  contactConsent: false,
  queuedEvents: 3,
  configured: true,
  destination: 'https://eu.i.posthog.com/batch/',
} as const;

const meta: Meta<typeof TelemetryNoticeCardView> = {
  title: 'Features/Telemetry/TelemetryNoticeCard',
  component: TelemetryNoticeCardView,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    status: { ...ON },
    onTurnOff: fn(),
    onDismiss: fn(),
    onChange: fn(),
    pending: false,
    error: null,
    className: 'max-w-md',
  },
};

export default meta;
type Story = StoryObj<typeof TelemetryNoticeCardView>;

export const Default: Story = {};

export const IdentityIncluded: Story = {
  args: { status: { ...ON, includeIdentity: true } },
};

export const Saving: Story = { args: { pending: true } };

export const SaveFailed: Story = {
  args: { error: 'Could not update usage metrics. Try again from Settings.' },
};

/** The container: loads status from the mocked server action. */
export const Connected: Story = {
  render: () => <TelemetryNoticeCard className="max-w-md" />,
};
