import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import { MergeReview } from '@/components/common/merge-review/merge-review';
import type { MergeReviewProps } from '@/components/common/merge-review/merge-review-config';

const basePr = {
  url: 'https://github.com/org/repo/pull/42',
  number: 42,
  status: PrStatus.Open,
  commitHash: 'abc1234def5678',
  ciStatus: CiStatus.Success,
};

const baseProps: MergeReviewProps = {
  data: {
    pr: basePr,
    diffSummary: {
      filesChanged: 10,
      additions: 200,
      deletions: 50,
      commitCount: 3,
    },
  },
  onApprove: vi.fn(),
  onReject: vi.fn(),
};

describe('MergeReview', () => {
  describe('PR link', () => {
    it('renders PR number as clickable external link with correct href and target', () => {
      render(<MergeReview {...baseProps} />);

      const link = screen.getByRole('link', { name: /PR #42/i });
      expect(link).toHaveAttribute('href', 'https://github.com/org/repo/pull/42');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('PR status', () => {
    it('displays PR status text', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.getByText('Open')).toBeInTheDocument();
    });
  });

  describe('CI status badge', () => {
    it('renders green badge with "Passing" text for CiStatus.Success', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.getByText('Passing')).toBeInTheDocument();
    });

    it('renders yellow badge with "Pending" text for CiStatus.Pending', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          pr: { ...basePr, ciStatus: CiStatus.Pending },
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders red badge with "Failing" text for CiStatus.Failure', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          pr: { ...basePr, ciStatus: CiStatus.Failure },
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.getByText('Failing')).toBeInTheDocument();
    });

    it('omits CI section entirely when ciStatus is undefined', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          pr: { ...basePr, ciStatus: undefined },
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.queryByText('Passing')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending')).not.toBeInTheDocument();
      expect(screen.queryByText('Failing')).not.toBeInTheDocument();
      expect(screen.queryByText('CI Status')).not.toBeInTheDocument();
    });
  });

  describe('diff summary', () => {
    it('renders diff stats with correct formatting when available', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('+200')).toBeInTheDocument();
      expect(screen.getByText('-50')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows warning message when diffSummary is absent and warning is set', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          pr: basePr,
          warning: 'Diff statistics unavailable',
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.getByText('Diff statistics unavailable')).toBeInTheDocument();
      expect(screen.queryByText('+200')).not.toBeInTheDocument();
    });
  });

  describe('commit hash', () => {
    it('displays truncated commit hash (7 chars) when available', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.getByText('abc1234')).toBeInTheDocument();
    });

    it('does not show commit hash section when commitHash is undefined', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          pr: { ...basePr, commitHash: undefined },
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.queryByText('abc1234')).not.toBeInTheDocument();
    });
  });

  describe('branch info', () => {
    it('renders source and target branch names when branch data is provided', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          branch: { source: 'feat/my-feature', target: 'main' },
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.getByText('feat/my-feature')).toBeInTheDocument();
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('does not render branch section when branch is undefined', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.queryByText('feat/my-feature')).not.toBeInTheDocument();
    });
  });

  describe('chat input', () => {
    it('renders the chat input field', () => {
      render(<MergeReview {...baseProps} />);

      expect(
        screen.getByRole('textbox', { name: /ask ai to revise before merging/i })
      ).toBeInTheDocument();
    });

    it('calls onReject with trimmed text on submit', () => {
      const onReject = vi.fn();
      render(<MergeReview {...baseProps} onReject={onReject} />);

      const input = screen.getByRole('textbox', { name: /ask ai to revise before merging/i });
      fireEvent.change(input, { target: { value: '  fix the tests  ' } });
      fireEvent.submit(input.closest('form')!);

      expect(onReject).toHaveBeenCalledWith('fix the tests', []);
    });

    it('does not call onReject when input is empty', () => {
      const onReject = vi.fn();
      render(<MergeReview {...baseProps} onReject={onReject} />);

      const input = screen.getByRole('textbox', { name: /ask ai to revise before merging/i });
      fireEvent.submit(input.closest('form')!);

      expect(onReject).not.toHaveBeenCalled();
    });

    it('disables chat input when isProcessing is true', () => {
      render(<MergeReview {...baseProps} isProcessing />);

      const input = screen.getByRole('textbox', { name: /ask ai to revise before merging/i });
      expect(input).toBeDisabled();
    });
  });

  describe('approve button', () => {
    it('renders "Approve Merge" button that calls onApprove when Ctrl+Shift is held', () => {
      const onApprove = vi.fn();
      render(<MergeReview {...baseProps} onApprove={onApprove} />);

      // Hold Ctrl+Shift to switch the single button into approve mode
      fireEvent.keyDown(window, { key: 'Control' });
      fireEvent.keyDown(window, { key: 'Shift' });
      const button = screen.getByTestId('drawer-action-submit');
      fireEvent.click(button);

      expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it('disables approve button when isProcessing is true', () => {
      render(<MergeReview {...baseProps} isProcessing />);

      const button = screen.getByTestId('drawer-action-submit');
      expect(button).toBeDisabled();
    });
  });

  describe('file diffs', () => {
    it('renders merge diff viewer when fileDiffs are provided', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          fileDiffs: [
            {
              path: 'src/app.ts',
              additions: 5,
              deletions: 2,
              status: 'modified',
              hunks: [{ header: '@@ -1,3 +1,6 @@', lines: [] }],
            },
          ],
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.getByTestId('merge-diff-viewer')).toBeInTheDocument();
      expect(screen.getByText('app.ts')).toBeInTheDocument();
    });

    it('does not render merge diff viewer when fileDiffs is undefined', () => {
      render(<MergeReview {...baseProps} />);

      expect(screen.queryByTestId('merge-diff-viewer')).not.toBeInTheDocument();
    });

    it('does not render merge diff viewer when fileDiffs is empty', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: {
          ...baseProps.data,
          fileDiffs: [],
        },
      };
      render(<MergeReview {...props} />);

      expect(screen.queryByTestId('merge-diff-viewer')).not.toBeInTheDocument();
    });
  });

  describe('no PR', () => {
    it('hides PR card and shows alternate description when pr is undefined', () => {
      const props: MergeReviewProps = {
        ...baseProps,
        data: { branch: { source: 'feat/x', target: 'main' } },
      };
      render(<MergeReview {...props} />);

      expect(screen.queryByRole('link', { name: /PR #/i })).not.toBeInTheDocument();
      expect(screen.getByText('Review the changes and approve to merge.')).toBeInTheDocument();
    });
  });
});
