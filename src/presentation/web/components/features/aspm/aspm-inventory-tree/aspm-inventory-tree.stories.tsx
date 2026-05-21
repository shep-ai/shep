import type { Meta, StoryObj } from '@storybook/react';

import { AspmInventoryTree } from './aspm-inventory-tree';
import { buildAspmInventoryRows } from './build-aspm-inventory-rows';
import type { InventoryPostureRow } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof AspmInventoryTree> = {
  title: 'Features/Aspm/AspmInventoryTree',
  component: AspmInventoryTree,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function row(
  overrides: Partial<InventoryPostureRow> & { applicationId: string; name: string }
): InventoryPostureRow {
  return {
    repositoryPath: '/repos/example',
    lastScannedAt: null,
    openBySeverity: [],
    totalOpen: 0,
    // The component never reads `application` directly — only the
    // server-side `buildAspmInventoryRows` does — so an opaque cast is
    // safe for story-only fixtures.
    application: {} as InventoryPostureRow['application'],
    ...overrides,
  };
}

const repoByPath = new Map<string, { id: string; name: string; remoteUrl?: string }>([
  ['/repos/cli-platform', { id: 'r-1', name: 'cli-platform' }],
  ['/repos/web-frontend', { id: 'r-2', name: 'web-frontend' }],
]);

export const Default: Story = {
  args: {
    rows: buildAspmInventoryRows({
      postureRows: [
        row({
          applicationId: 'app-1',
          name: 'cli',
          repositoryPath: '/repos/cli-platform',
          lastScannedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
          openBySeverity: [
            { severity: CanonicalSeverity.Critical, count: 2 },
            { severity: CanonicalSeverity.High, count: 5 },
            { severity: CanonicalSeverity.Medium, count: 1 },
          ],
          totalOpen: 8,
        }),
        row({
          applicationId: 'app-2',
          name: 'web',
          repositoryPath: '/repos/web-frontend',
          lastScannedAt: null,
          openBySeverity: [],
          totalOpen: 0,
        }),
      ],
      repoByPath,
    }),
    onApplicationOpen: () => undefined,
  },
};

export const Empty: Story = {
  args: { rows: [] },
};

export const Error: Story = {
  args: { rows: [], error: 'Failed to load inventory (DB unavailable)' },
};
