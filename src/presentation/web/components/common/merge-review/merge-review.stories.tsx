import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { MergeReview } from './merge-review';
import type { MergeReviewData, MergeReviewFileDiff } from './merge-review-config';
import { PrCommentsSection } from '@/components/features/pr-comments/pr-comments-section';
import { PENDING_STATE } from '@/components/features/pr-comments/pr-comments-fixtures';

const fullPr = {
  url: 'https://github.com/shep-ai/shep/pull/42',
  number: 42,
  status: PrStatus.Open,
  commitHash: 'a1b2c3d4e5f6789',
  ciStatus: CiStatus.Success,
} as const;

const sampleBranch = { source: 'feat/add-auth', target: 'main' };

const sampleFileDiffs: MergeReviewFileDiff[] = [
  {
    path: 'src/components/auth/login-form.tsx',
    additions: 8,
    deletions: 2,
    status: 'modified',
    hunks: [
      {
        header: '@@ -1,5 +1,8 @@',
        lines: [
          {
            type: 'context',
            content: "import { useState } from 'react';",
            oldNumber: 1,
            newNumber: 1,
          },
          {
            type: 'added',
            content: "import { Input } from '@/components/ui/input';",
            newNumber: 2,
          },
          { type: 'context', content: '', oldNumber: 2, newNumber: 3 },
          { type: 'removed', content: 'export function LoginForm() {', oldNumber: 3 },
          {
            type: 'added',
            content: 'export function LoginForm({ onSubmit }: Props) {',
            newNumber: 4,
          },
          {
            type: 'context',
            content: "  const [email, setEmail] = useState('');",
            oldNumber: 4,
            newNumber: 5,
          },
        ],
      },
    ],
  },
  {
    path: 'src/lib/auth.ts',
    additions: 12,
    deletions: 0,
    status: 'added',
    hunks: [
      {
        header: '@@ -0,0 +1,4 @@',
        lines: [
          {
            type: 'added',
            content: 'export async function hashPassword(pw: string) {',
            newNumber: 1,
          },
          { type: 'added', content: '  return hash(pw, 10);', newNumber: 2 },
          { type: 'added', content: '}', newNumber: 3 },
        ],
      },
    ],
  },
];

const fullData: MergeReviewData = {
  pr: fullPr,
  branch: sampleBranch,
  diffSummary: {
    filesChanged: 12,
    additions: 340,
    deletions: 85,
    commitCount: 5,
  },
};

const defaultActions = {
  onApprove: fn().mockName('onApprove'),
  onReject: fn().mockName('onReject'),
};

/* ─── Standalone MergeReview ─── */

const meta: Meta<typeof MergeReview> = {
  title: 'Drawers/Review/MergeReview',
  component: MergeReview,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', width: '400px', border: '1px solid var(--color-border)' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MergeReview>;

/** Default — all data present with CI success. */
export const Default: Story = {
  args: {
    data: fullData,
    ...defaultActions,
  },
};

/** With the PR's review comments below the diff (spec 124). */
export const WithReviewComments: Story = {
  args: {
    data: fullData,
    ...defaultActions,
    children: <PrCommentsSection featureId="feature-1" initial={PENDING_STATE} />,
  },
};

/** Merge conflicts — shows red conflict banner. */
export const MergeConflicts: Story = {
  args: {
    data: {
      ...fullData,
      pr: { ...fullPr, mergeable: false },
    },
    ...defaultActions,
  },
};

/** CI status is Pending — shows yellow badge with spinner. */
export const CIPending: Story = {
  args: {
    data: {
      ...fullData,
      pr: { ...fullPr, ciStatus: CiStatus.Pending },
    },
    ...defaultActions,
  },
};

/** CI status is Failure — shows red badge. */
export const CIFailure: Story = {
  args: {
    data: {
      ...fullData,
      pr: { ...fullPr, ciStatus: CiStatus.Failure },
    },
    ...defaultActions,
  },
};

/** Diff summary unavailable — shows warning message. */
export const NoDiffSummary: Story = {
  args: {
    data: {
      pr: fullPr,
      branch: sampleBranch,
      warning: 'Diff statistics unavailable — worktree may have been removed',
    },
    ...defaultActions,
  },
};

/** CI status undefined — CI section omitted entirely. */
export const NoCIStatus: Story = {
  args: {
    data: {
      ...fullData,
      pr: { ...fullPr, ciStatus: undefined },
    },
    ...defaultActions,
  },
};

/** Processing state — approve button disabled with spinner. */
export const Processing: Story = {
  args: {
    data: fullData,
    ...defaultActions,
    isProcessing: true,
  },
};

/** No PR — merge without a pull request, shows branch direction and diff summary. */
export const NoPrWithDiff: Story = {
  args: {
    data: {
      branch: { source: 'feat/fix-login', target: 'main' },
      diffSummary: fullData.diffSummary,
    },
    ...defaultActions,
  },
};

/** No PR and no diff — bare merge approval with branch info. */
export const NoPrNoDiff: Story = {
  args: {
    data: {
      branch: { source: 'feat/fix-login', target: 'main' },
      warning: 'No PR or diff data available',
    },
    ...defaultActions,
  },
};

/** With file diffs — shows expandable file list with line-level changes. */
export const WithFileDiffs: Story = {
  args: {
    data: {
      ...fullData,
      fileDiffs: sampleFileDiffs,
    },
    ...defaultActions,
  },
};

/** With evidence — shows evidence items captured during implementation. */
export const WithEvidence: Story = {
  args: {
    data: {
      ...fullData,
      evidence: [
        {
          type: 'Screenshot',
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Homepage showing new auth banner',
          relativePath: '.shep/evidence/homepage-banner.png',
          taskRef: 'task-1',
        },
        {
          type: 'TestOutput',
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'Unit tests — all 42 passing',
          relativePath: '.shep/evidence/unit-test-results.txt',
          taskRef: 'task-2',
        },
        {
          type: 'Video',
          capturedAt: '2026-03-09T12:02:00Z',
          description: 'Login flow walkthrough recording',
          relativePath: '.shep/evidence/login-flow.mp4',
        },
        {
          type: 'TerminalRecording',
          capturedAt: '2026-03-09T12:03:00Z',
          description: 'CLI auth command output',
          relativePath: '.shep/evidence/cli-auth.txt',
          taskRef: 'task-3',
        },
      ],
    },
    ...defaultActions,
  },
};

/* ─── Read-Only / History Mode ─── */

const mergedPr = {
  ...fullPr,
  status: PrStatus.Merged,
} as const;

const readOnlyActions = {
  onApprove: fn().mockName('onApprove'),
};

/** Read-only mode with full data — PR, diff summary, evidence, and file diffs. No action bar. */
export const ReadOnlyFullData: Story = {
  args: {
    data: {
      pr: mergedPr,
      branch: sampleBranch,
      diffSummary: fullData.diffSummary,
      fileDiffs: sampleFileDiffs,
      evidence: [
        {
          type: 'Screenshot',
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Homepage showing new auth banner',
          relativePath: '.shep/evidence/homepage-banner.png',
          taskRef: 'task-1',
        },
        {
          type: 'TestOutput',
          capturedAt: '2026-03-09T12:01:00Z',
          description: 'Unit tests — all 42 passing',
          relativePath: '.shep/evidence/unit-test-results.txt',
          taskRef: 'task-2',
        },
      ],
    },
    readOnly: true,
    ...readOnlyActions,
  },
};

/** Read-only mode with evidence but no diffs — warning message shown for unavailable diffs. */
export const ReadOnlyEvidenceNoDiffs: Story = {
  args: {
    data: {
      pr: mergedPr,
      branch: sampleBranch,
      warning: 'Diff statistics unavailable — worktree was removed after merge',
      evidence: [
        {
          type: 'Screenshot',
          capturedAt: '2026-03-09T12:00:00Z',
          description: 'Final state of the feature',
          relativePath: '.shep/evidence/final-state.png',
        },
        {
          type: 'Video',
          capturedAt: '2026-03-09T12:02:00Z',
          description: 'Demo walkthrough recording',
          relativePath: '.shep/evidence/demo.mp4',
        },
      ],
    },
    readOnly: true,
    ...readOnlyActions,
  },
};

/** Read-only mode with PR metadata only — no evidence, no diffs. */
export const ReadOnlyPrOnly: Story = {
  args: {
    data: {
      pr: mergedPr,
      branch: sampleBranch,
    },
    readOnly: true,
    ...readOnlyActions,
  },
};
