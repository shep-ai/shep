import type { Meta, StoryObj } from '@storybook/react';
import { ContributorOnboardingView } from './ContributorOnboardingView';
import {
  ContributorLane,
  ContributorLevel,
  DiagnosticStatus,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ContributorOnboardingView> = {
  title: 'Contributors/ContributorOnboardingView',
  component: ContributorOnboardingView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ContributorOnboardingView>;

export const Default: Story = {
  args: {
    initialLeaderboard: {
      scope: 'month',
      entries: [
        {
          login: 'octocat',
          displayName: 'The Octocat',
          prCount: 42,
          level: ContributorLevel.Maintainer,
          lane: ContributorLane.Agents,
        },
        {
          login: 'mona',
          prCount: 12,
          level: ContributorLevel.Contributor,
          lane: ContributorLane.Cli,
        },
      ],
    },
    initialDoctorReport: {
      overallStatus: DiagnosticStatus.Ok,
      summary: { ok: 3, warn: 0, fail: 0 },
      results: [
        { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'v22.10.0' },
        { name: 'pnpm-installed', status: DiagnosticStatus.Ok, detail: '9.12.0' },
        { name: 'gh-cli-auth', status: DiagnosticStatus.Ok, detail: 'authenticated as octocat' },
      ],
    },
  },
};

export const EmptyLeaderboard: Story = {
  args: {
    initialLeaderboard: { scope: 'month', entries: [] },
  },
};

export const DoctorUnavailable: Story = {
  args: {
    initialLeaderboard: {
      scope: 'allTime',
      entries: [{ login: 'mona', prCount: 1, level: ContributorLevel.User }],
    },
    doctorError: 'DI container not available in this surface',
  },
};
