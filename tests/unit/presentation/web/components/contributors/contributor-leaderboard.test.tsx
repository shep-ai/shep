import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ContributorLeaderboard,
  type LeaderboardEntry,
} from '@/components/contributors/ContributorLeaderboard';
import { ContributorLane, ContributorLevel } from '@shepai/core/domain/generated/output';

const seven: LeaderboardEntry[] = [
  {
    login: 'octocat',
    prCount: 42,
    level: ContributorLevel.Maintainer,
    lane: ContributorLane.Agents,
  },
  { login: 'mona', prCount: 18, level: ContributorLevel.Core, lane: ContributorLane.Cli },
  { login: 'hubot', prCount: 11, level: ContributorLevel.Contributor, lane: ContributorLane.Docs },
  { login: 'ada', prCount: 7, level: ContributorLevel.Contributor, lane: ContributorLane.Ui },
  { login: 'grace', prCount: 4, level: ContributorLevel.Contributor, lane: ContributorLane.Infra },
  { login: 'tim', prCount: 2, level: ContributorLevel.Contributor },
  { login: 'newcomer', prCount: 1, level: ContributorLevel.User },
];

describe('ContributorLeaderboard', () => {
  it('renders default entries with rank, login, prCount, level, lane', () => {
    render(<ContributorLeaderboard scope="month" entries={seven} />);

    expect(screen.getByTestId('contributor-leaderboard')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-list')).toBeInTheDocument();

    for (const e of seven) {
      expect(screen.getByTestId(`leaderboard-row-${e.login}`)).toBeInTheDocument();
      expect(screen.getByTestId(`leaderboard-prs-${e.login}`)).toHaveTextContent(
        `${e.prCount} PR${e.prCount === 1 ? '' : 's'}`
      );
      expect(screen.getByTestId(`leaderboard-level-${e.login}`)).toHaveTextContent(e.level);
    }

    // Rank ordering: octocat is #1, displayed as crown (no "#1" text)
    expect(screen.getByTestId('leaderboard-rank-mona')).toHaveTextContent('#2');
    expect(screen.getByTestId('leaderboard-rank-newcomer')).toHaveTextContent('#7');
  });

  it('renders empty state when entries list is empty', () => {
    render(<ContributorLeaderboard scope="allTime" entries={[]} />);
    expect(screen.getByTestId('leaderboard-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('leaderboard-list')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<ContributorLeaderboard scope="month" entries={[]} loading />);
    expect(screen.getByTestId('leaderboard-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('leaderboard-empty')).not.toBeInTheDocument();
  });

  it('renders error state', () => {
    render(
      <ContributorLeaderboard scope="month" entries={[]} error="Database connection refused" />
    );
    expect(screen.getByTestId('leaderboard-error')).toHaveTextContent(
      'Database connection refused'
    );
  });
});
