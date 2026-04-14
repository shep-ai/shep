import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicLayout from '@/app/(public)/layout';

describe('PublicLayout', () => {
  it('renders children without authentication context', () => {
    render(
      <PublicLayout>
        <div data-testid="child">Page content</div>
      </PublicLayout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('does not include dashboard navigation components', () => {
    render(
      <PublicLayout>
        <div>Content</div>
      </PublicLayout>
    );
    // Should not have sidebar elements from the dashboard
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    // Should have the minimal public navigation
    expect(screen.getByText('Shep')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('Why Shep?')).toBeInTheDocument();
  });

  it('renders footer with MIT license notice', () => {
    render(
      <PublicLayout>
        <div>Content</div>
      </PublicLayout>
    );
    expect(screen.getByText(/MIT Licensed/)).toBeInTheDocument();
  });
});
