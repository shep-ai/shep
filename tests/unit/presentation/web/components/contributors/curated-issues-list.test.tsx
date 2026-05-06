import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CuratedIssuesList,
  type CuratedIssueView,
} from '@/components/contributors/CuratedIssuesList';
import { ContributionDifficulty, ContributorLane } from '@shepai/core/domain/generated/output';

const fixtures: CuratedIssueView[] = [
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 211,
    title: 'docs: 30-second setup',
    url: 'https://github.com/shep-ai/shep/issues/211',
    lane: ContributorLane.Docs,
    difficulty: ContributionDifficulty.GoodFirst,
    acceptanceCriteria: 'Add the section.',
  },
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 198,
    title: 'cli: doctor --json',
    url: 'https://github.com/shep-ai/shep/issues/198',
    lane: ContributorLane.Cli,
    difficulty: ContributionDifficulty.Easy,
  },
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 173,
    title: 'agents: refuse to invent',
    url: 'https://github.com/shep-ai/shep/issues/173',
    lane: ContributorLane.Agents,
    difficulty: ContributionDifficulty.Medium,
  },
];

describe('CuratedIssuesList', () => {
  it('renders three fixture issues with title, difficulty badge, link', () => {
    render(<CuratedIssuesList issues={fixtures} />);

    expect(screen.getByTestId('curated-issues-list-items')).toBeInTheDocument();
    for (const issue of fixtures) {
      expect(screen.getByTestId(`curated-issue-${issue.issueNumber}`)).toBeInTheDocument();
      expect(screen.getByTestId(`curated-issue-link-${issue.issueNumber}`)).toHaveAttribute(
        'href',
        issue.url
      );
      expect(
        screen.getByTestId(`curated-issue-difficulty-${issue.issueNumber}`)
      ).toBeInTheDocument();
    }

    expect(screen.getByTestId('curated-issue-preview-211')).toHaveTextContent('Add the section.');
  });

  it('renders empty state when no issues', () => {
    render(<CuratedIssuesList issues={[]} />);
    expect(screen.getByTestId('curated-issues-empty')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<CuratedIssuesList issues={[]} loading />);
    expect(screen.getByTestId('curated-issues-loading')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<CuratedIssuesList issues={[]} error="rate limit" />);
    expect(screen.getByTestId('curated-issues-error')).toHaveTextContent('rate limit');
  });
});
