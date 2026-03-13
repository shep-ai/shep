import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MergeDiffViewer } from '@/components/common/merge-review/merge-diff-viewer';
import type { MergeReviewFileDiff } from '@/components/common/merge-review/merge-review-config';

// Mock react-syntax-highlighter to avoid heavy dependency in tests
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: string }) => <pre data-testid="syntax-hl">{children}</pre>,
}));

vi.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({
  oneDark: {},
}));

const modifiedFile: MergeReviewFileDiff = {
  path: 'src/components/button.tsx',
  additions: 5,
  deletions: 2,
  status: 'modified',
  hunks: [
    {
      header: '@@ -1,4 +1,7 @@',
      lines: [
        { type: 'context', content: "import React from 'react';", oldNumber: 1, newNumber: 1 },
        { type: 'removed', content: 'export function Button() {', oldNumber: 2 },
        { type: 'added', content: 'export function Button({ variant }: Props) {', newNumber: 2 },
        { type: 'context', content: '  return <button />;', oldNumber: 3, newNumber: 3 },
      ],
    },
  ],
};

const addedFile: MergeReviewFileDiff = {
  path: 'src/lib/utils.ts',
  additions: 10,
  deletions: 0,
  status: 'added',
  hunks: [
    {
      header: '@@ -0,0 +1,3 @@',
      lines: [
        { type: 'added', content: 'export function cn() {}', newNumber: 1 },
        { type: 'added', content: 'export function merge() {}', newNumber: 2 },
      ],
    },
  ],
};

const deletedFile: MergeReviewFileDiff = {
  path: 'src/old-utils.ts',
  additions: 0,
  deletions: 5,
  status: 'deleted',
  hunks: [
    {
      header: '@@ -1,2 +0,0 @@',
      lines: [{ type: 'removed', content: 'export const old = true;', oldNumber: 1 }],
    },
  ],
};

const emptyHunkFile: MergeReviewFileDiff = {
  path: 'src/empty.ts',
  additions: 0,
  deletions: 0,
  status: 'modified',
  hunks: [],
};

describe('MergeDiffViewer', () => {
  describe('rendering', () => {
    it('renders nothing when fileDiffs is empty', () => {
      const { container } = render(<MergeDiffViewer fileDiffs={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders merge-diff-viewer container when files are provided', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile]} />);

      expect(screen.getByTestId('merge-diff-viewer')).toBeInTheDocument();
    });

    it('renders file tree header with file count', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile, addedFile]} />);

      expect(screen.getByText('Files')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('renders file names in the tree', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile, addedFile, deletedFile]} />);

      expect(screen.getByText('button.tsx')).toBeInTheDocument();
      expect(screen.getByText('utils.ts')).toBeInTheDocument();
      expect(screen.getByText('old-utils.ts')).toBeInTheDocument();
    });

    it('renders folder structure from file paths', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile, addedFile]} />);

      // Both files share 'src' folder
      expect(screen.getByText('src')).toBeInTheDocument();
      // components and lib are sub-folders
      expect(screen.getByText('components')).toBeInTheDocument();
      expect(screen.getByText('lib')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile]} className="custom-class" />);

      expect(screen.getByTestId('merge-diff-viewer')).toHaveClass('custom-class');
    });
  });

  describe('file selection', () => {
    it('selects first file by default and shows its diff', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile, addedFile]} />);

      // The first file's diff code should be rendered
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
    });

    it('shows "No diff content available" for file with empty hunks', () => {
      render(<MergeDiffViewer fileDiffs={[emptyHunkFile]} />);

      expect(screen.getByText('No diff content available')).toBeInTheDocument();
    });
  });

  describe('addition/deletion badges', () => {
    it('shows addition count for added files', () => {
      render(<MergeDiffViewer fileDiffs={[addedFile]} />);

      expect(screen.getByText('+10')).toBeInTheDocument();
    });

    it('shows deletion count for deleted files', () => {
      render(<MergeDiffViewer fileDiffs={[deletedFile]} />);

      expect(screen.getByText('-5')).toBeInTheDocument();
    });

    it('shows both addition and deletion counts for modified files', () => {
      render(<MergeDiffViewer fileDiffs={[modifiedFile]} />);

      expect(screen.getByText('+5')).toBeInTheDocument();
      expect(screen.getByText('-2')).toBeInTheDocument();
    });
  });
});
