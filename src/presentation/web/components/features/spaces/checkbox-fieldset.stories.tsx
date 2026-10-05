import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CheckboxFieldset, toggled } from './checkbox-fieldset';

const CHOICES = [
  { value: 'Restart', label: 'Restart' },
  { value: 'Rollback', label: 'Roll back' },
  { value: 'Scale', label: 'Scale' },
] as const;

type Choice = (typeof CHOICES)[number]['value'];

function Interactive({ initial }: { initial: Choice[] }) {
  const [selected, setSelected] = useState<Choice[]>(initial);
  return (
    <CheckboxFieldset
      legend="Run without asking"
      hint="Shep runs these on an incident's workload without waiting for approval."
      choices={CHOICES}
      selected={selected}
      onToggle={(value) => setSelected((current) => toggled(current, value))}
      testIdPrefix="story-choice"
    />
  );
}

const meta: Meta<typeof Interactive> = {
  title: 'Features/Spaces/CheckboxFieldset',
  component: Interactive,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NoneChosen: Story = { args: { initial: [] } };

export const SomeChosen: Story = { args: { initial: ['Restart', 'Scale'] } };
