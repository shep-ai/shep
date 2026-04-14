import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureCards } from '@/components/landing/feature-cards';

describe('FeatureCards', () => {
  it('renders all four feature benefit cards', () => {
    render(<FeatureCards />);
    expect(screen.getByText('Parallel Execution')).toBeInTheDocument();
    expect(screen.getByText('Agent-Agnostic')).toBeInTheDocument();
    expect(screen.getByText('CI Watch Loop')).toBeInTheDocument();
    expect(screen.getByText('Spec-Driven')).toBeInTheDocument();
  });

  it('renders descriptions for each feature card', () => {
    render(<FeatureCards />);
    expect(screen.getByText(/Each feature runs in its own git worktree/)).toBeInTheDocument();
    expect(screen.getByText(/Works with Claude Code, Cursor CLI/)).toBeInTheDocument();
    expect(screen.getByText(/watches CI runs/)).toBeInTheDocument();
    expect(screen.getByText(/Define requirements in structured specs/)).toBeInTheDocument();
  });
});
