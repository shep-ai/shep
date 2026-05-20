import type { Meta, StoryObj } from '@storybook/react';
import { CuratedIssuesList, type CuratedIssueView } from './CuratedIssuesList';
import { ContributionDifficulty, ContributorLane } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof CuratedIssuesList> = {
  title: 'Contributors/CuratedIssuesList',
  component: CuratedIssuesList,
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
type Story = StoryObj<typeof CuratedIssuesList>;

const issues: CuratedIssueView[] = [
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 211,
    title: 'docs: 30-second setup guide for new contributors',
    url: 'https://github.com/shep-ai/shep/issues/211',
    lane: ContributorLane.Docs,
    difficulty: ContributionDifficulty.GoodFirst,
    acceptanceCriteria:
      '- Add a 30-second setup section near the top of CONTRIBUTING.md\n- Document `shep doctor`\n- Link to ROADMAP.md',
  },
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 198,
    title: 'cli: support `shep doctor --json` output mode',
    url: 'https://github.com/shep-ai/shep/issues/198',
    lane: ContributorLane.Cli,
    difficulty: ContributionDifficulty.Easy,
    acceptanceCriteria:
      'When invoked with `--json`, `shep doctor` should print a parseable JSON DoctorReport instead of the human table.',
  },
  {
    owner: 'shep-ai',
    repo: 'shep',
    issueNumber: 173,
    title: 'agents: contributor-onboarding agent — refuse to invent details',
    url: 'https://github.com/shep-ai/shep/issues/173',
    lane: ContributorLane.Agents,
    difficulty: ContributionDifficulty.Medium,
  },
];

export const Default: Story = {
  args: { issues },
};

export const Loading: Story = {
  args: { issues: [], loading: true },
};

export const Empty: Story = {
  args: { issues: [] },
};

export const ErrorState: Story = {
  args: { issues: [], error: 'GitHub rate limit exceeded' },
};
