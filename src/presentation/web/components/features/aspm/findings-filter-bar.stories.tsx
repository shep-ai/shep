import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { FindingsFilterBar } from './findings-filter-bar';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type FindingFilter,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof FindingsFilterBar> = {
  title: 'Features/Aspm/FindingsFilterBar',
  component: FindingsFilterBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Wrapper({ initial }: { initial: FindingFilter }) {
  const [filter, setFilter] = useState<FindingFilter>(initial);
  return <FindingsFilterBar filter={filter} onChange={setFilter} />;
}

export const Default: Story = {
  render: () => <Wrapper initial={{}} />,
};

export const Loading: Story = {
  render: () => (
    <div className="pointer-events-none opacity-50" aria-busy="true">
      <Wrapper initial={{}} />
    </div>
  ),
};

export const Error: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
        Failed to load filter options
      </div>
      <Wrapper initial={{}} />
    </div>
  ),
};

export const PreSelected: Story = {
  render: () => (
    <Wrapper
      initial={{
        severities: [CanonicalSeverity.Critical, CanonicalSeverity.High],
        findingDomains: [FindingDomain.Code, FindingDomain.Dependency],
        states: [FindingState.Open],
        kev: true,
      }}
    />
  ),
};
