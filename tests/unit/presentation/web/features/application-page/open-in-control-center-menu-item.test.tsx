import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpenInControlCenterMenuItem } from '@/components/features/application-page/open-in-control-center-menu-item';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { buildCreateUrl } from '@/lib/url-params';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

// Render the DropdownMenuItem outside of a Radix DropdownMenu context — the
// onSelect handler still fires on click, which is all this test cares about.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    ...props
  }: {
    children: React.ReactNode;
    onSelect?: (event: Event) => void;
    [key: string]: unknown;
  }) => (
    <button type="button" onClick={() => onSelect?.(new Event('select'))} {...props}>
      {children}
    </button>
  ),
}));

describe('OpenInControlCenterMenuItem', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('navigates to /create with the application id and spec mode', () => {
    render(<OpenInControlCenterMenuItem applicationId="app-42" />);

    fireEvent.click(screen.getByTestId('open-in-control-center-sdd-menu-item'));

    expect(mockPush).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith(
      buildCreateUrl({ applicationId: 'app-42', mode: BuildMode.Spec })
    );
  });

  it('uses the canonical /create URL via the url-params constants', () => {
    render(<OpenInControlCenterMenuItem applicationId="app-7" />);

    fireEvent.click(screen.getByTestId('open-in-control-center-sdd-menu-item'));

    const pushedUrl = mockPush.mock.calls[0][0] as string;
    expect(pushedUrl).toContain('/create');
    expect(pushedUrl).toContain('applicationId=app-7');
    expect(pushedUrl).toContain('mode=spec');
  });

  it('exposes an aria-label for keyboard / screen-reader users', () => {
    render(<OpenInControlCenterMenuItem applicationId="app-1" />);

    const item = screen.getByTestId('open-in-control-center-sdd-menu-item');
    expect(item).toHaveAttribute('aria-label');
    expect(item.getAttribute('aria-label')).toBeTruthy();
  });
});
