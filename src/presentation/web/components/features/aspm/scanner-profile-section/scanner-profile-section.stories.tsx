import type { Meta, StoryObj } from '@storybook/react';
import { ScannerProfileSection } from './scanner-profile-section';

const meta: Meta<typeof ScannerProfileSection> = {
  title: 'Features/Aspm/ScannerProfileSection',
  component: ScannerProfileSection,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialProfile: {
      enabledStages: ['sbom', 'sca', 'secrets', 'sast', 'container', 'iac'] as never,
      pathExcludes: [],
      autoRescan: true,
    },
    lastScanSummary: 'Last scanned 12 minutes ago — 7 findings',
    onSave: async () => ({ ok: true }),
  },
};

export const Loading: Story = {
  args: {
    initialProfile: {
      enabledStages: ['sbom', 'secrets'] as never,
      pathExcludes: ['**/fixtures/**'],
      autoRescan: false,
    },
    onSave: () => new Promise(() => undefined),
  },
};

export const Error: Story = {
  args: {
    initialProfile: {
      enabledStages: ['sbom'] as never,
      pathExcludes: [],
      autoRescan: true,
    },
    onSave: async () => ({ ok: false, error: 'Save failed: settings.json locked' }),
  },
};
