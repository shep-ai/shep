import type { Meta, StoryObj } from '@storybook/react';

import { OwnerMap, type OwnerRollup } from './owner-map';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof OwnerMap> = {
  title: 'Features/Aspm/OwnerMap',
  component: OwnerMap,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function row(overrides: Partial<OwnerRollup>): OwnerRollup {
  return {
    ownerId: overrides.ownerId ?? 'owner-?',
    ownerName: 'Owner',
    severityCounts: [
      { severity: CanonicalSeverity.Critical, count: 0 },
      { severity: CanonicalSeverity.High, count: 0 },
      { severity: CanonicalSeverity.Medium, count: 0 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
    openFindingCount: 0,
    ...overrides,
  };
}

const owners: OwnerRollup[] = [
  row({
    ownerId: 'o-1',
    ownerName: 'Alice',
    ownerHandle: 'alice@acme.io',
    teamId: 't-1',
    teamName: 'Payments',
    businessUnitId: 'bu-1',
    businessUnitName: 'Commerce',
    openFindingCount: 12,
    severityCounts: [
      { severity: CanonicalSeverity.Critical, count: 1 },
      { severity: CanonicalSeverity.High, count: 4 },
      { severity: CanonicalSeverity.Medium, count: 7 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
  }),
  row({
    ownerId: 'o-2',
    ownerName: 'Bob',
    ownerHandle: '@bob',
    teamId: 't-1',
    teamName: 'Payments',
    businessUnitId: 'bu-1',
    businessUnitName: 'Commerce',
    openFindingCount: 3,
    severityCounts: [
      { severity: CanonicalSeverity.Critical, count: 0 },
      { severity: CanonicalSeverity.High, count: 1 },
      { severity: CanonicalSeverity.Medium, count: 2 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
  }),
  row({
    ownerId: 'o-3',
    ownerName: 'Platform Security',
    teamId: 't-2',
    teamName: 'Platform',
    businessUnitId: 'bu-2',
    businessUnitName: 'Engineering',
    openFindingCount: 7,
    severityCounts: [
      { severity: CanonicalSeverity.Critical, count: 0 },
      { severity: CanonicalSeverity.High, count: 2 },
      { severity: CanonicalSeverity.Medium, count: 5 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
  }),
];

export const Default: Story = { args: { owners } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { error: 'Cannot load owners' } };
export const Empty: Story = { args: { owners: [] } };
export const NoTeamOrBu: Story = {
  args: {
    owners: [
      row({
        ownerId: 'o-x',
        ownerName: 'Unassigned',
        openFindingCount: 3,
      }),
    ],
  },
};
