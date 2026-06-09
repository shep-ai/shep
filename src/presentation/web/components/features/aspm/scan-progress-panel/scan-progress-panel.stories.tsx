import type { Meta, StoryObj } from '@storybook/react';
import { ScanProgressPanel } from './scan-progress-panel';
import type { ScanRun } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ScanProgressPanel> = {
  title: 'Features/Aspm/ScanProgressPanel',
  component: ScanProgressPanel,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date('2026-05-20T15:00:00Z');
const later = new Date('2026-05-20T15:01:23Z');

const completed: ScanRun = {
  id: 'sr-1',
  applicationId: 'app-1',
  triggeredBy: 'User' as never,
  status: 'Succeeded' as never,
  startedAt: now,
  finishedAt: later,
  stages: [
    {
      name: 'sbom' as never,
      status: 'Succeeded' as never,
      startedAt: now,
      finishedAt: now,
      componentsCount: 42,
    },
    {
      name: 'sca' as never,
      status: 'Succeeded' as never,
      startedAt: now,
      finishedAt: now,
      findingsCount: 3,
    },
    {
      name: 'secrets' as never,
      status: 'Succeeded' as never,
      startedAt: now,
      finishedAt: now,
      findingsCount: 2,
    },
    {
      name: 'sast' as never,
      status: 'Succeeded' as never,
      startedAt: now,
      finishedAt: now,
      findingsCount: 1,
    },
  ],
  findingsCount: 6,
  createdAt: now,
  updatedAt: later,
};

export const Default: Story = { args: { run: completed } };

export const Loading: Story = {
  args: {
    run: {
      ...completed,
      status: 'Running' as never,
      finishedAt: undefined,
      stages: [
        { name: 'sbom' as never, status: 'Succeeded' as never, startedAt: now, finishedAt: now },
        { name: 'sca' as never, status: 'Running' as never, startedAt: now },
        { name: 'secrets' as never, status: 'Pending' as never },
      ],
    } as ScanRun,
  },
};

export const Empty: Story = { args: { run: null } };

export const PartialFailure: Story = {
  args: {
    run: {
      ...completed,
      status: 'Partial' as never,
      stages: [
        {
          name: 'secrets' as never,
          status: 'Succeeded' as never,
          startedAt: now,
          finishedAt: now,
          findingsCount: 2,
        },
        {
          name: 'sast' as never,
          status: 'Failed' as never,
          startedAt: now,
          finishedAt: now,
          errorMessage: 'agent quota',
        },
      ],
    } as ScanRun,
  },
};
