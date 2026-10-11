import type { Meta, StoryObj } from '@storybook/react';
import { TelemetryFieldsList } from './telemetry-fields-list';

const meta: Meta<typeof TelemetryFieldsList> = {
  title: 'Features/Telemetry/TelemetryFieldsList',
  component: TelemetryFieldsList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { className: '' },
};

export default meta;
type Story = StoryObj<typeof TelemetryFieldsList>;

export const Default: Story = {};

export const Narrow: Story = {
  args: { className: 'max-w-xs' },
};
