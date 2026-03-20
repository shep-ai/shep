import type { Meta, StoryObj } from '@storybook/react';
import { SettingsPageClient } from './settings-page-client';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';
import { AgentType } from '@shepai/core/domain/generated/output';

const defaultSettings = createDefaultSettings();

const meta = {
  title: 'Features/Settings/SettingsPageClient',
  component: SettingsPageClient,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof SettingsPageClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    settings: defaultSettings,
    shepHome: '/home/user/.shep',
    dbFileSize: '2.4 MB',
  },
};

export const AllSections: Story = {
  args: {
    settings: {
      ...defaultSettings,
      agent: {
        ...defaultSettings.agent,
        type: AgentType.GeminiCli,
      },
      featureFlags: {
        skills: true,
        envDeploy: true,
        debug: false,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        coastsDevServer: false,
      },
    },
    shepHome: '/opt/shep',
    dbFileSize: '12.8 MB',
  },
};

export const EvidenceEnabled: Story = {
  args: {
    settings: {
      ...defaultSettings,
      workflow: {
        ...defaultSettings.workflow,
        enableEvidence: true,
        commitEvidence: true,
      },
    },
    shepHome: '/home/user/.shep',
    dbFileSize: '2.4 MB',
  },
};

export const CustomTimeouts: Story = {
  args: {
    settings: {
      ...defaultSettings,
      workflow: {
        ...defaultSettings.workflow,
        stageTimeouts: {
          analyzeMs: 300000,
          requirementsMs: 600000,
          researchMs: 900000,
          planMs: 600000,
          implementMs: 1800000,
          mergeMs: 600000,
        },
        analyzeRepoTimeouts: {
          analyzeMs: 300000,
        },
      },
    },
    shepHome: '/home/user/.shep',
    dbFileSize: '2.4 MB',
  },
};
