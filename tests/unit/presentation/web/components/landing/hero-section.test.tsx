import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from '@/components/landing/hero-section';

describe('HeroSection', () => {
  it('renders the pain-first headline from positioning guide', () => {
    render(<HeroSection />);
    expect(
      screen.getByText('Ship features 10x faster with parallel AI agents')
    ).toBeInTheDocument();
  });

  it('renders the pain statement', () => {
    render(<HeroSection />);
    expect(screen.getByText(/One AI agent session is fine/)).toBeInTheDocument();
  });

  it('renders the value proposition', () => {
    render(<HeroSection />);
    expect(screen.getByText(/gives each feature its own isolated world/)).toBeInTheDocument();
  });

  it('renders get started and why shep CTA buttons', () => {
    render(<HeroSection />);
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('Why Shep?')).toBeInTheDocument();
  });

  it('renders the install command', () => {
    render(<HeroSection />);
    expect(screen.getByText('npx @shepai/cli')).toBeInTheDocument();
  });
});
