import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowSettingsSection } from './workflow-settings-section';

const meta = {
  title: 'Features/Settings/WorkflowSettingsSection',
  component: WorkflowSettingsSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof WorkflowSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      ciWatchEnabled: true,
      enableEvidence: false,
      commitEvidence: false,
      defaultMode: 'Fast',
    },
  },
};

export const AllEnabled: Story = {
  args: {
    workflow: {
      openPrOnImplementationComplete: true,
      approvalGateDefaults: {
        allowPrd: true,
        allowPlan: true,
        allowMerge: true,
        pushOnImplementationComplete: true,
      },
      ciMaxFixAttempts: 3,
      ciWatchTimeoutMs: 300000,
      ciLogMaxChars: 50000,
      stageTimeouts: {
        analyzeMs: 600000,
        requirementsMs: 600000,
        researchMs: 600000,
        planMs: 600000,
        implementMs: 600000,
        fastImplementMs: 600000,
        mergeMs: 600000,
      },
      analyzeRepoTimeouts: {
        analyzeMs: 600000,
      },
      ciWatchEnabled: true,
      enableEvidence: true,
      commitEvidence: true,
      defaultMode: 'Fast',
    },
  },
};

export const WithCiSettings: Story = {
  args: {
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      ciMaxFixAttempts: 5,
      ciWatchTimeoutMs: 600000,
      ciLogMaxChars: 100000,
      stageTimeouts: {
        analyzeMs: 1200000,
        requirementsMs: 1200000,
        researchMs: 1200000,
        planMs: 1200000,
        implementMs: 1200000,
        fastImplementMs: 1200000,
        mergeMs: 1200000,
      },
      analyzeRepoTimeouts: {
        analyzeMs: 1200000,
      },
      ciWatchEnabled: true,
      enableEvidence: false,
      commitEvidence: false,
      defaultMode: 'Fast',
    },
  },
};
