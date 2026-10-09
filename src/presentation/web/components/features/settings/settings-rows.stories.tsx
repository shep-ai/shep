import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '@/components/ui/input';
import { SettingsRow, SwitchRow } from './settings-rows';

const meta: Meta<typeof SwitchRow> = {
  title: 'Settings/SettingsRows',
  component: SwitchRow,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-lg border px-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SwitchRow>;

function ToggleDemo({ disabled = false }: { disabled?: boolean }) {
  const [checked, setChecked] = useState(true);
  return (
    <SwitchRow
      label="Spaces"
      description="Spaces and product lines: /spaces and `shep space`"
      id="demo-spaces"
      testId="switch-demo-spaces"
      checked={checked}
      onChange={setChecked}
      disabled={disabled}
    />
  );
}

/** A switch row the user can toggle. */
export const Default: Story = { render: () => <ToggleDemo /> };

/** A disabled switch row. */
export const Disabled: Story = { render: () => <ToggleDemo disabled /> };

/** A plain row wrapping any control. */
export const WithInput: Story = {
  render: () => (
    <SettingsRow label="Default clone directory" description="Where new repositories go">
      <Input defaultValue="~/repos" className="w-48" />
    </SettingsRow>
  ),
};
