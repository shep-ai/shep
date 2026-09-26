import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { BuildModeMenu } from './build-mode-menu';
import type { ComposerBuildMode } from './build-mode-options';

const meta: Meta<typeof BuildModeMenu> = {
  title: 'Features/ControlCenter/BuildModeMenu',
  component: BuildModeMenu,
  tags: ['autodocs'],
  args: { chordLabel: 'Alt+Shift+M', onSelect: () => undefined },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Spec-driven, the default on surfaces that can start Features. */
export const SpecDriven: Story = {
  args: { mode: BuildMode.Spec },
};

export const Fast: Story = {
  args: { mode: BuildMode.Fast },
};

/** Quick prototype mode — the option names its Vite + shadcn stack. */
export const QuickWebApp: Story = {
  args: { mode: BuildMode.Application },
};

/** Interactive: pick a mode and see the trigger update. */
export const Interactive: Story = {
  render: (args) => {
    function InteractiveMenu() {
      const [mode, setMode] = useState<ComposerBuildMode>(BuildMode.Spec);
      return (
        <BuildModeMenu
          chordLabel={args.chordLabel ?? 'Alt+Shift+M'}
          mode={mode}
          onSelect={setMode}
        />
      );
    }
    return <InteractiveMenu />;
  },
  args: { mode: BuildMode.Spec },
};
