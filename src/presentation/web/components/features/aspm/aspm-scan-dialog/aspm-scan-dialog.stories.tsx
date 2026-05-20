import type { Meta, StoryObj } from '@storybook/react';
import { AspmScanDialog } from './aspm-scan-dialog';

const meta: Meta<typeof AspmScanDialog> = {
  title: 'Features/Aspm/AspmScanDialog',
  component: AspmScanDialog,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const baseApps = async () => ({
  ok: true as const,
  applications: [
    { id: 'app-1', name: 'web-frontend' },
    { id: 'app-2', name: 'payments-api' },
  ],
});

export const Default: Story = {
  args: {
    loadApplicationsOverride: baseApps,
    startScanOverride: async () =>
      ({
        ok: true,
        summary: {
          scanRunId: 'sr-1',
          applicationId: 'app-1',
          status: 'Succeeded',
          findingsInserted: 5,
          stages: [
            { name: 'sbom', status: 'Succeeded', componentsCount: 42 },
            { name: 'secrets', status: 'Succeeded', findingsCount: 2 },
            { name: 'sast', status: 'Succeeded', findingsCount: 3 },
          ],
        },
      }) as never,
  },
};

export const Loading: Story = {
  args: {
    loadApplicationsOverride: () => new Promise(() => undefined),
    startScanOverride: async () => ({ ok: true }) as never,
  },
};

export const Error: Story = {
  args: {
    loadApplicationsOverride: async () => ({ ok: false, error: 'Database unavailable' }),
    startScanOverride: async () => ({ ok: false, error: 'Application not found' }),
  },
};

export const PartialFailure: Story = {
  args: {
    loadApplicationsOverride: baseApps,
    startScanOverride: async () =>
      ({
        ok: true,
        summary: {
          scanRunId: 'sr-1',
          applicationId: 'app-1',
          status: 'Partial',
          findingsInserted: 2,
          stages: [
            { name: 'secrets', status: 'Succeeded', findingsCount: 2 },
            {
              name: 'sast',
              status: 'Failed',
              errorMessage: 'agent quota exceeded',
            },
          ],
        },
      }) as never,
  },
};
