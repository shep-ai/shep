/**
 * AspmInventoryTree — pre-render states (Tabulator rendering of the
 * populated tree is exercised by Storybook; here we cover the
 * first-class empty / error states that bypass the table entirely).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AspmInventoryTree } from '@/components/features/aspm/aspm-inventory-tree/aspm-inventory-tree';

describe('AspmInventoryTree', () => {
  it('renders an error state with the supplied message', () => {
    render(<AspmInventoryTree rows={[]} error="DB unavailable" />);
    expect(screen.getByTestId('aspm-inventory-tree-error')).toHaveTextContent('DB unavailable');
  });

  it('renders the empty state when there are no rows', () => {
    render(<AspmInventoryTree rows={[]} />);
    expect(screen.getByTestId('aspm-inventory-tree-empty')).toBeInTheDocument();
    expect(screen.getByText(/no applications inventoried yet/i)).toBeInTheDocument();
  });
});
