import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrStatus } from '@shepai/core/domain/generated/output';
import { MergeReview } from '@/components/common/merge-review/merge-review';
import type {
  MergeReviewProps,
  MergeReviewEvidence,
} from '@/components/common/merge-review/merge-review-config';

function createEvidence(overrides: Partial<MergeReviewEvidence> = {}): MergeReviewEvidence {
  return {
    type: 'Screenshot',
    capturedAt: '2024-01-01T00:00:00Z',
    description: 'Test screenshot',
    relativePath: '/home/user/.shep/repos/abc/evidence/screenshot.png',
    ...overrides,
  };
}

const imageEvidence: MergeReviewEvidence[] = [
  createEvidence({ description: 'Login page', relativePath: '/evidence/login.png' }),
  createEvidence({ description: 'Dashboard view', relativePath: '/evidence/dashboard.jpg' }),
  createEvidence({ description: 'Settings panel', relativePath: '/evidence/settings.webp' }),
];

const nonImageEvidence: MergeReviewEvidence[] = [
  createEvidence({
    type: 'TestOutput',
    description: 'Unit test results',
    relativePath: '/evidence/test-output.txt',
  }),
  createEvidence({
    type: 'TerminalRecording',
    description: 'Build terminal log',
    relativePath: '/evidence/build.log',
  }),
];

const mixedEvidence: MergeReviewEvidence[] = [...imageEvidence, ...nonImageEvidence];

const baseProps: MergeReviewProps = {
  data: {
    pr: {
      url: 'https://github.com/org/repo/pull/42',
      number: 42,
      status: PrStatus.Open,
    },
  },
  onApprove: vi.fn(),
  onReject: vi.fn(),
};

describe('EvidenceList gallery integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('thumbnail gallery grid', () => {
    it('renders image evidence as thumbnails in a grid', () => {
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      const thumbnails = screen.getAllByRole('img');
      expect(thumbnails).toHaveLength(3);
    });

    it('renders thumbnails with alt text from evidence description', () => {
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      expect(screen.getByAltText('Login page')).toBeInTheDocument();
      expect(screen.getByAltText('Dashboard view')).toBeInTheDocument();
      expect(screen.getByAltText('Settings panel')).toBeInTheDocument();
    });

    it('renders thumbnails with correct evidence API URLs', () => {
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      const loginImg = screen.getByAltText('Login page');
      expect(loginImg).toHaveAttribute(
        'src',
        `/api/evidence?path=${encodeURIComponent('/evidence/login.png')}`
      );
    });

    it('renders thumbnails with loading="lazy"', () => {
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      const thumbnails = screen.getAllByRole('img');
      for (const thumb of thumbnails) {
        expect(thumb).toHaveAttribute('loading', 'lazy');
      }
    });
  });

  describe('mixed evidence types', () => {
    it('renders image thumbnails and non-image items separately', () => {
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: mixedEvidence }} />);

      // 3 image thumbnails
      const thumbnails = screen.getAllByRole('img');
      expect(thumbnails).toHaveLength(3);

      // Non-image evidence descriptions should appear in expandable list
      expect(screen.getByText('Unit test results')).toBeInTheDocument();
      expect(screen.getByText('Build terminal log')).toBeInTheDocument();
    });
  });

  describe('non-image only evidence', () => {
    it('renders no thumbnail grid when all evidence is non-image', () => {
      render(
        <MergeReview {...baseProps} data={{ ...baseProps.data, evidence: nonImageEvidence }} />
      );

      // No img elements for thumbnails
      expect(screen.queryAllByRole('img')).toHaveLength(0);

      // Non-image evidence should still be rendered
      expect(screen.getByText('Unit test results')).toBeInTheDocument();
      expect(screen.getByText('Build terminal log')).toBeInTheDocument();
    });
  });

  describe('lightbox integration', () => {
    it('opens lightbox when a thumbnail is clicked', async () => {
      const user = userEvent.setup();
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      // Click the first thumbnail
      const loginImg = screen.getByAltText('Login page');
      await user.click(loginImg);

      // Lightbox dialog should be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens lightbox at the correct index when a specific thumbnail is clicked', async () => {
      const user = userEvent.setup();
      render(<MergeReview {...baseProps} data={{ ...baseProps.data, evidence: imageEvidence }} />);

      // Click the second thumbnail (Dashboard view)
      const dashboardImg = screen.getByAltText('Dashboard view');
      await user.click(dashboardImg);

      // Lightbox should show "2 / 3" counter
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });
  });
});
