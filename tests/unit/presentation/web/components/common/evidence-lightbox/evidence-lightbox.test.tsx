import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceLightbox } from '@/components/common/evidence-lightbox';
import type { MergeReviewEvidence } from '@/components/common/merge-review/merge-review-config';

function createImageEvidence(overrides: Partial<MergeReviewEvidence> = {}): MergeReviewEvidence {
  return {
    type: 'Screenshot',
    capturedAt: '2024-01-01T00:00:00Z',
    description: 'Login page screenshot',
    relativePath: '/home/user/.shep/repos/abc/evidence/screenshot.png',
    ...overrides,
  };
}

function buildEvidenceUrl(absolutePath: string): string {
  return `/api/evidence?path=${encodeURIComponent(absolutePath)}`;
}

const defaultImages: MergeReviewEvidence[] = [
  createImageEvidence({ description: 'Login page', relativePath: '/evidence/login.png' }),
  createImageEvidence({ description: 'Dashboard view', relativePath: '/evidence/dashboard.png' }),
  createImageEvidence({ description: 'Settings panel', relativePath: '/evidence/settings.png' }),
  createImageEvidence({ description: 'Profile page', relativePath: '/evidence/profile.png' }),
  createImageEvidence({ description: 'Logout flow', relativePath: '/evidence/logout.png' }),
];

describe('EvidenceLightbox', () => {
  const defaultProps = {
    images: defaultImages,
    open: true,
    onOpenChange: vi.fn(),
    selectedIndex: 0,
    onSelectedIndexChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dialog rendering', () => {
    it('renders the dialog when open is true', () => {
      render(<EvidenceLightbox {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render the dialog when open is false', () => {
      render(<EvidenceLightbox {...defaultProps} open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the selected image with correct src', () => {
      render(<EvidenceLightbox {...defaultProps} selectedIndex={1} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', buildEvidenceUrl('/evidence/dashboard.png'));
    });

    it('renders image alt text from evidence description', () => {
      render(<EvidenceLightbox {...defaultProps} selectedIndex={1} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'Dashboard view');
    });

    it('has an accessible dialog title via VisuallyHidden', () => {
      render(<EvidenceLightbox {...defaultProps} />);
      // Radix Dialog requires a DialogTitle for accessibility
      expect(screen.getByText('Evidence: Login page')).toBeInTheDocument();
    });
  });

  describe('bottom control bar', () => {
    it('shows counter text in "N / M" format', () => {
      render(<EvidenceLightbox {...defaultProps} selectedIndex={1} />);
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });

    it('shows description from current evidence item', () => {
      render(<EvidenceLightbox {...defaultProps} selectedIndex={2} />);
      expect(screen.getByText('Settings panel')).toBeInTheDocument();
    });

    it('renders download link with correct href', () => {
      render(<EvidenceLightbox {...defaultProps} selectedIndex={0} />);
      const downloadLink = screen.getByLabelText('Download image');
      expect(downloadLink).toHaveAttribute('href', buildEvidenceUrl('/evidence/login.png'));
      expect(downloadLink).toHaveAttribute('download');
    });

    it('hides counter when there is only one image', () => {
      const singleImage = [defaultImages[0]];
      render(<EvidenceLightbox {...defaultProps} images={singleImage} />);
      expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    });

    it('still shows download button for single image', () => {
      const singleImage = [defaultImages[0]];
      render(<EvidenceLightbox {...defaultProps} images={singleImage} />);
      expect(screen.getByLabelText('Download image')).toBeInTheDocument();
    });
  });

  describe('prev/next navigation buttons', () => {
    it('renders prev and next buttons', () => {
      render(<EvidenceLightbox {...defaultProps} />);
      expect(screen.getByLabelText('Previous image')).toBeInTheDocument();
      expect(screen.getByLabelText('Next image')).toBeInTheDocument();
    });

    it('clicking next calls onSelectedIndexChange with index + 1', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={0}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.click(screen.getByLabelText('Next image'));
      expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    });

    it('clicking prev on index 0 wraps to last index', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={0}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.click(screen.getByLabelText('Previous image'));
      expect(onSelectedIndexChange).toHaveBeenCalledWith(4);
    });

    it('clicking next on last index wraps to 0', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={4}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.click(screen.getByLabelText('Next image'));
      expect(onSelectedIndexChange).toHaveBeenCalledWith(0);
    });

    it('hides nav buttons when there is only one image', () => {
      const singleImage = [defaultImages[0]];
      render(<EvidenceLightbox {...defaultProps} images={singleImage} />);
      expect(screen.queryByLabelText('Previous image')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowRight navigates to next image', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={0}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    });

    it('ArrowLeft navigates to previous image', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={2}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    });

    it('ArrowLeft on index 0 wraps to last', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          selectedIndex={0}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(onSelectedIndexChange).toHaveBeenCalledWith(4);
    });

    it('does not fire handler when open is false', () => {
      const onSelectedIndexChange = vi.fn();
      render(
        <EvidenceLightbox
          {...defaultProps}
          open={false}
          onSelectedIndexChange={onSelectedIndexChange}
        />
      );
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onSelectedIndexChange).not.toHaveBeenCalled();
    });

    it('does not fire for non-arrow keys', () => {
      const onSelectedIndexChange = vi.fn();
      render(<EvidenceLightbox {...defaultProps} onSelectedIndexChange={onSelectedIndexChange} />);
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onSelectedIndexChange).not.toHaveBeenCalled();
    });
  });
});
