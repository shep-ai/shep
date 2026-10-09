import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SettingsRow, SwitchRow } from './settings-rows';

const meta: Meta<typeof SwitchRow> = {
  title: 'Features/Settings/SettingsRows',
  component: SwitchRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    label: 'Send usage metrics',
    description: 'Turning this off also deletes events that have not been sent yet.',
    id: 'story-switch',
    testId: 'story-switch',
    checked: true,
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof SwitchRow>;

export const Default: Story = {};

export const Off: Story = { args: { checked: false } };

export const Disabled: Story = { args: { disabled: true } };

export const WithoutDescription: Story = { args: { description: undefined } };

/** A plain row holding any control. */
export const PlainRow: Story = {
  render: () => (
    <SettingsRow label="Database location" description="Where Shep keeps its data.">
      <span className="text-muted-foreground font-mono text-xs">~/.shep</span>
    </SettingsRow>
  ),
};
