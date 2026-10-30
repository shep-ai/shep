import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import type { FeatureFlagsState } from '@/lib/feature-flags';
import { RepositoryLearningLink } from '@/components/features/learning/repository-learning-link';

const renderWith = (selfLearning: boolean) =>
  render(
    <FeatureFlagsProvider flags={{ selfLearning } as FeatureFlagsState}>
      <TooltipProvider>
        <RepositoryLearningLink repositoryPath="/Users/dev/shop" />
      </TooltipProvider>
    </FeatureFlagsProvider>
  );

describe('RepositoryLearningLink', () => {
  it('links the repository to its Learning page while self-learning is on', () => {
    renderWith(true);
    expect(screen.getByTestId('repository-learning-link').getAttribute('href')).toBe(
      '/learning?repo=%2FUsers%2Fdev%2Fshop'
    );
  });

  it('renders nothing while self-learning is off', () => {
    renderWith(false);
    expect(screen.queryByTestId('repository-learning-link')).toBeNull();
  });
});
