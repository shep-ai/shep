import type { Meta, StoryObj } from '@storybook/react';
import { ContributorLeaderboard, type LeaderboardEntry } from './ContributorLeaderboard';
import { ContributorLane, ContributorLevel } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ContributorLeaderboard> = {
  title: 'Contributors/ContributorLeaderboard',
  component: ContributorLeaderboard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ContributorLeaderboard>;

const entries: LeaderboardEntry[] = [
  {
    login: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    prCount: 42,
    level: ContributorLevel.Maintainer,
    lane: ContributorLane.Agents,
  },
  {
    login: 'mona',
    displayName: 'Mona Lisa',
    prCount: 18,
    level: ContributorLevel.Core,
    lane: ContributorLane.Cli,
  },
  {
    login: 'hubot',
    prCount: 11,
    level: ContributorLevel.Contributor,
    lane: ContributorLane.Docs,
  },
  {
    login: 'ada',
    displayName: 'Ada Lovelace',
    prCount: 7,
    level: ContributorLevel.Contributor,
    lane: ContributorLane.Ui,
  },
  {
    login: 'grace',
    prCount: 4,
    level: ContributorLevel.Contributor,
    lane: ContributorLane.Infra,
  },
  {
    login: 'tim',
    prCount: 2,
    level: ContributorLevel.Contributor,
  },
  {
    login: 'newcomer',
    prCount: 1,
    level: ContributorLevel.User,
  },
];

export const Default: Story = {
  args: {
    scope: 'month',
    entries,
  },
};

export const AllTime: Story = {
  args: {
    scope: 'allTime',
    entries,
  },
};

export const Loading: Story = {
  args: {
    scope: 'month',
    entries: [],
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    scope: 'month',
    entries: [],
  },
};

export const ErrorState: Story = {
  args: {
    scope: 'month',
    entries: [],
    error: 'Database connection refused',
  },
};
