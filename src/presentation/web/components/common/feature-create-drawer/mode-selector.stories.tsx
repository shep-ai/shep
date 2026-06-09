import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ModeSelector } from './mode-selector';
import { BuildMode } from '@shepai/core/domain/generated/output';

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

function InteractiveModeSelector({ initial = BuildMode.Fast }: { initial?: BuildMode }) {
  const [mode, setMode] = useState(initial);
  return <ModeSelector value={mode} onChange={setMode} />;
}

export const Regular: Story = {
  render: () => <InteractiveModeSelector initial={BuildMode.Application} />,
};

export const Fast: Story = {
  render: () => <InteractiveModeSelector initial={BuildMode.Fast} />,
};

export const Exploration: Story = {
  render: () => <InteractiveModeSelector initial={BuildMode.Exploration} />,
};

export const Disabled: Story = {
  args: {
    value: BuildMode.Fast,
    onChange: () => undefined,
    disabled: true,
  },
};
