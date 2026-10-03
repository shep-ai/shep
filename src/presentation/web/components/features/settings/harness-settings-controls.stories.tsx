import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '@/components/ui/input';
import {
  HarnessEnumSelect,
  HarnessNumberInput,
  HarnessSettingRow,
} from './harness-settings-controls';

const meta: Meta<typeof HarnessSettingRow> = {
  title: 'Settings/HarnessSettingsControls',
  component: HarnessSettingRow,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSettingRow>;

/** A row with a free-text control. */
export const WithInput: Story = {
  args: {
    id: 'demo-input',
    label: 'Backend model',
    description: 'Model id on the backend; empty uses its default',
    children: (
      <Input id="demo-input" className="w-48 text-xs" placeholder="anthropic/claude-sonnet-4.5" />
    ),
  },
};

/** A row with an enum select. */
export const WithSelect: Story = {
  args: {
    id: 'demo-select',
    label: 'Context mode',
    description: 'Query-aware projection or transcript baseline',
    children: (
      <HarnessEnumSelect
        id="demo-select"
        value="query_aware"
        options={['query_aware', 'baseline']}
        label={(v) => v}
        onChange={() => undefined}
      />
    ),
  },
};

/** A row with a whole-number field that saves on blur. */
export const WithNumberInput: Story = {
  args: {
    id: 'demo-number',
    label: 'Model call timeout (seconds)',
    description: 'How long one model call may take; raise it for slow local models',
    children: (
      <HarnessNumberInput
        id="demo-number"
        value="300"
        onChange={() => undefined}
        onCommit={() => undefined}
      />
    ),
  },
};
