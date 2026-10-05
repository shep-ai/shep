import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DocsFirstFieldset } from './docs-first-fieldset';

const DEFAULTS = ['docs/', 'README.md'];

function Interactive({
  initialEnabled,
  initialPaths,
}: {
  initialEnabled: boolean;
  initialPaths: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [paths, setPaths] = useState(initialPaths);
  return (
    <DocsFirstFieldset
      enabled={enabled}
      paths={paths}
      defaultPaths={DEFAULTS}
      onEnabledChange={setEnabled}
      onPathsChange={setPaths}
    />
  );
}

const meta: Meta<typeof Interactive> = {
  title: 'Features/Spaces/DocsFirstFieldset',
  component: Interactive,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Off: the paths field is disabled and shows the defaults. */
export const Off: Story = { args: { initialEnabled: false, initialPaths: '' } };

export const OnWithOwnPaths: Story = {
  args: { initialEnabled: true, initialPaths: 'docs/, CHANGES.md' },
};
