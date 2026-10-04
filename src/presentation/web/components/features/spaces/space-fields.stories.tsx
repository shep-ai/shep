import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SpaceFields, type SpaceFieldValues } from './space-fields';

const meta: Meta<typeof SpaceFields> = {
  title: 'Features/Spaces/SpaceFields',
  component: SpaceFields,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { idPrefix: 'story', onChange: fn() },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-end gap-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { values: { name: '', description: '', color: '' } },
};

export const Filled: Story = {
  args: { values: { name: 'Acme', description: 'Client work for Acme Corp', color: '#3456c4' } },
};

export const Interactive: Story = {
  args: { values: { name: '', description: '', color: '' } },
  render: function InteractiveFields(args) {
    const [values, setValues] = useState<SpaceFieldValues>(args.values);
    return <SpaceFields idPrefix={args.idPrefix} values={values} onChange={setValues} />;
  },
};
