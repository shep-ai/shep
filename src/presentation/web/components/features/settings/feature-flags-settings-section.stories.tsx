import type { Meta, StoryObj } from '@storybook/react';
import { FeatureFlagsSettingsSection } from './feature-flags-settings-section';

const meta = {
  title: 'Features/Settings/FeatureFlagsSettingsSection',
  component: FeatureFlagsSettingsSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof FeatureFlagsSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    featureFlags: {
      skills: false,
      envDeploy: false,
      debug: false,
      githubImport: false,
      adoptBranch: false,
      gitRebaseSync: false,
      reactFileManager: false,
      coastsDevServer: false,
    },
  },
};

export const AllEnabled: Story = {
  args: {
    featureFlags: {
      skills: true,
      envDeploy: true,
      debug: true,
      githubImport: true,
      adoptBranch: true,
      gitRebaseSync: true,
      reactFileManager: true,
      coastsDevServer: true,
    },
  },
};

export const AllDisabled: Story = {
  args: {
    featureFlags: {
      skills: false,
      envDeploy: false,
      debug: false,
      githubImport: false,
      adoptBranch: false,
      gitRebaseSync: false,
      reactFileManager: false,
      coastsDevServer: false,
    },
  },
};
