import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tree } from '@/components/ui/file-tree';
import type { TreeViewElement } from '@/components/ui/file-tree';

const flatElements: TreeViewElement[] = [
  { id: 'readme', name: 'README.md', type: 'file' },
  { id: 'index', name: 'index.ts', type: 'file' },
];

const nestedElements: TreeViewElement[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      { id: 'src/app.tsx', name: 'app.tsx', type: 'file' },
      {
        id: 'src/lib',
        name: 'lib',
        type: 'folder',
        children: [{ id: 'src/lib/utils.ts', name: 'utils.ts', type: 'file' }],
      },
    ],
  },
  { id: 'package.json', name: 'package.json', type: 'file' },
];

describe('Tree', () => {
  describe('rendering', () => {
    it('renders flat file list', () => {
      render(<Tree elements={flatElements} />);

      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });

    it('renders nested folders and files', () => {
      render(<Tree elements={nestedElements} />);

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('app.tsx')).toBeInTheDocument();
      expect(screen.getByText('lib')).toBeInTheDocument();
      expect(screen.getByText('utils.ts')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    it('expands all folders by default', () => {
      render(<Tree elements={nestedElements} />);

      // Nested file should be visible since folders expand by default
      expect(screen.getByText('utils.ts')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onSelectChange when a file is clicked', () => {
      const onSelectChange = vi.fn();
      render(<Tree elements={flatElements} onSelectChange={onSelectChange} />);

      fireEvent.click(screen.getByText('README.md'));

      expect(onSelectChange).toHaveBeenCalledWith('readme');
    });

    it('highlights the initially selected item', () => {
      render(<Tree elements={flatElements} initialSelectedId="index" />);

      const button = screen.getByText('index.ts').closest('button');
      expect(button).toHaveClass('bg-accent');
    });

    it('updates selection when different file is clicked', () => {
      const onSelectChange = vi.fn();
      render(
        <Tree elements={flatElements} initialSelectedId="readme" onSelectChange={onSelectChange} />
      );

      fireEvent.click(screen.getByText('index.ts'));

      expect(onSelectChange).toHaveBeenCalledWith('index');
    });
  });

  describe('custom icon and badge', () => {
    it('renders custom badge content', () => {
      const elements: TreeViewElement[] = [
        {
          id: 'file1',
          name: 'file1.ts',
          type: 'file',
          badge: <span data-testid="custom-badge">+5 -2</span>,
        },
      ];
      render(<Tree elements={elements} />);

      expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
      expect(screen.getByText('+5 -2')).toBeInTheDocument();
    });

    it('renders custom icon', () => {
      const elements: TreeViewElement[] = [
        {
          id: 'file1',
          name: 'file1.ts',
          type: 'file',
          icon: <span data-testid="custom-icon">IC</span>,
        },
      ];
      render(<Tree elements={elements} />);

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
  });

  describe('indicator', () => {
    it('renders without indicator lines when indicator is false', () => {
      const { container } = render(<Tree elements={nestedElements} indicator={false} />);

      // No indicator spans (bg-muted absolute) should be present
      const indicators = container.querySelectorAll('span.bg-muted.absolute');
      expect(indicators.length).toBe(0);
    });
  });
});
