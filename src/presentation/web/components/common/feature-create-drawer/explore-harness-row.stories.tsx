import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ExploreHarnessRow, NO_EXPLORE, type ExploreChoice } from './explore-harness-row';

const meta: Meta<typeof ExploreHarnessRow> = {
  title: 'Drawers/Feature/ExploreHarnessRow',
  component: ExploreHarnessRow,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ExploreHarnessRow>;

function Controlled({ initial, disabled }: { initial: ExploreChoice; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return <ExploreHarnessRow value={value} onChange={setValue} disabled={disabled} />;
}

/** Off by default: one implement attempt, no extra cost. */
export const Default: Story = { render: () => <Controlled initial={NO_EXPLORE} /> };

/** On with k = 2: eight attempts, and the cost note says so. */
export const Enabled: Story = { render: () => <Controlled initial={{ enabled: true, k: 2 }} /> };

/** While the feature is being created the row is read-only. */
export const Loading: Story = {
  render: () => <Controlled initial={{ enabled: true, k: 1 }} disabled />,
};
