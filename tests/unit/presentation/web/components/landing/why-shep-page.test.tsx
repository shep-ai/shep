import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WhyShepPage from '@/app/(public)/why-shep/page';

describe('WhyShepPage', () => {
  it('renders the page title', () => {
    render(<WhyShepPage />);
    expect(screen.getByText('Why Shep?')).toBeInTheDocument();
  });

  it('renders feature cards', () => {
    render(<WhyShepPage />);
    expect(screen.getByText('Parallel Execution')).toBeInTheDocument();
    expect(screen.getByText('CI Watch Loop')).toBeInTheDocument();
  });

  it('renders comparison section', () => {
    render(<WhyShepPage />);
    expect(screen.getByText('Shep vs Manual Agent Management')).toBeInTheDocument();
    expect(screen.getAllByText('Without Shep')).toHaveLength(4);
    expect(screen.getAllByText('With Shep')).toHaveLength(4);
  });

  it('renders the get started CTA', () => {
    render(<WhyShepPage />);
    // One in the page itself
    expect(screen.getByRole('link', { name: /Get Started/ })).toBeInTheDocument();
  });
});
