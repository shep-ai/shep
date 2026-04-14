import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustSignals } from '@/components/landing/trust-signals';

describe('TrustSignals', () => {
  it('renders all four trust signal badges', () => {
    render(<TrustSignals />);
    expect(screen.getByText('MIT Licensed')).toBeInTheDocument();
    expect(screen.getByText('100% Local')).toBeInTheDocument();
    expect(screen.getByText('Agent-Agnostic')).toBeInTheDocument();
    expect(screen.getByText('185+ Releases')).toBeInTheDocument();
  });

  it('renders descriptions for each trust signal', () => {
    render(<TrustSignals />);
    expect(screen.getByText(/Fork it, sell it/)).toBeInTheDocument();
    expect(screen.getByText(/All data in ~\/\.shep\//)).toBeInTheDocument();
    expect(screen.getByText(/Claude Code, Cursor CLI, or Gemini CLI/)).toBeInTheDocument();
    expect(screen.getByText(/Actively maintained/)).toBeInTheDocument();
  });
});
