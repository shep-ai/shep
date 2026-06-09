import type { Meta, StoryObj } from '@storybook/react';
import { AspmIngestDialog } from './aspm-ingest-dialog';

const meta: Meta<typeof AspmIngestDialog> = {
  title: 'Features/ASPM/AspmIngestDialog',
  component: AspmIngestDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Default — closed until the user clicks "Ingest data". Open it via the trigger in the story canvas. */
export const Default: Story = {
  args: {
    loadApplicationsOverride: async () => ({
      ok: true,
      applications: [
        { id: 'app-1', name: 'shep-cli' },
        { id: 'app-2', name: 'shep-web' },
        { id: 'app-3', name: 'shep-core' },
      ],
    }),
  },
};

/** Loading state for the application picker. */
export const LoadingApplications: Story = {
  args: {
    loadApplicationsOverride: () =>
      new Promise(() => {
        /* never resolves */
      }),
  },
};

/** No applications available — guides the user toward creating one first. */
export const NoApplications: Story = {
  args: {
    loadApplicationsOverride: async () => ({ ok: true, applications: [] }),
  },
};

/** Application list failed to load. */
export const ApplicationsError: Story = {
  args: {
    loadApplicationsOverride: async () => ({
      ok: false,
      error: 'Failed to reach the application repository',
    }),
  },
};

/** Ingest failed — shown after submit. */
export const IngestError: Story = {
  args: {
    loadApplicationsOverride: async () => ({
      ok: true,
      applications: [{ id: 'app-1', name: 'shep-cli' }],
    }),
    ingestOverride: async () => ({
      ok: false,
      error: 'SARIF parse error at line 12: invalid severity value',
    }),
  },
};
