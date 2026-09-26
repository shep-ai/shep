import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddFeatureButton } from '@/components/features/application-page/add-feature-button';
import { ShellVariantProvider } from '@/hooks/shell-variant-context';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { buildCreateUrl } from '@/lib/url-params';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

describe('AddFeatureButton', () => {
  beforeEach(() => mockPush.mockClear());

  it('opens a spec-driven feature scoped to the app', () => {
    render(<AddFeatureButton applicationId="app-42" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add feature' }));

    expect(mockPush).toHaveBeenCalledWith(
      buildCreateUrl({ applicationId: 'app-42', mode: BuildMode.Spec })
    );
  });

  it('is hidden in the apps-only shell, which cannot open Control Center', () => {
    render(
      <ShellVariantProvider variant="apps-only">
        <AddFeatureButton applicationId="app-42" />
      </ShellVariantProvider>
    );

    expect(screen.queryByRole('button', { name: 'Add feature' })).not.toBeInTheDocument();
  });
});
