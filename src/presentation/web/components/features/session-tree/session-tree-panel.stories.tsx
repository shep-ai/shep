import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SessionTreePanel } from './session-tree-panel';

type Scenario = 'default' | 'loading' | 'error' | 'empty' | 'archived';

const meta: Meta<typeof SessionTreePanel> = {
  title: 'Features/SessionTreePanel',
  component: SessionTreePanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof SessionTreePanel>;

/** Renders the panel at its real sidenav width with a pinned mock scenario. */
function Harness({ scenario }: { scenario: Scenario }) {
  useEffect(() => {
    (globalThis as { __storybookSessionTreeScenario?: Scenario }).__storybookSessionTreeScenario =
      scenario;
  }, [scenario]);

  return (
    <div className="h-dvh w-72">
      <SessionTreePanel />
    </div>
  );
}

/** Default — repos expanded, one adopted session nested under its feature. */
export const Default: Story = {
  render: () => <Harness scenario="default" />,
};

/** Loading — the tree is still being assembled. */
export const Loading: Story = {
  render: () => <Harness scenario="loading" />,
};

/** Error — transcripts could not be read. */
export const ErrorState: Story = {
  render: () => <Harness scenario="error" />,
};

/** Empty — no repositories tracked yet. */
export const Empty: Story = {
  render: () => <Harness scenario="empty" />,
};
