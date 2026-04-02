import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ModeSelector } from './mode-selector';
import { FeatureMode } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ModeSelector> = {
  title: 'Drawers/Feature/ModeSelector',
  component: ModeSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof ModeSelector>;

function InteractiveModeSelector({ initial = FeatureMode.Fast }: { initial?: FeatureMode }) {
  const [mode, setMode] = useState(initial);
  return <ModeSelector value={mode} onChange={setMode} />;
}

export const Regular: Story = {
  render: () => <InteractiveModeSelector initial={FeatureMode.Regular} />,
};

export const Fast: Story = {
  render: () => <InteractiveModeSelector initial={FeatureMode.Fast} />,
};

export const Exploration: Story = {
  render: () => <InteractiveModeSelector initial={FeatureMode.Exploration} />,
};

export const Disabled: Story = {
  args: {
    value: FeatureMode.Fast,
    onChange: () => undefined,
    disabled: true,
  },
};
