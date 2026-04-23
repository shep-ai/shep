import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockReplace = vi.fn();
const mockPathname = vi.fn((): string | null => '/applications');

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => mockPathname(),
}));

const { useAppsOnlyRouteGuard } = await import(
  '../../../../../src/presentation/web/hooks/use-apps-only-route-guard.js'
);

describe('useAppsOnlyRouteGuard', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPathname.mockReset();
    mockPathname.mockReturnValue('/applications');
  });

  describe('variant=full (no-op)', () => {
    it('does not redirect when on /applications', () => {
      mockPathname.mockReturnValue('/applications');
      renderHook(() => useAppsOnlyRouteGuard('full'));
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when on /features (normally disallowed)', () => {
      mockPathname.mockReturnValue('/features');
      renderHook(() => useAppsOnlyRouteGuard('full'));
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when on /settings', () => {
      mockPathname.mockReturnValue('/settings');
      renderHook(() => useAppsOnlyRouteGuard('full'));
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('variant=apps-only (allowed paths)', () => {
    it('does not redirect when on /applications', () => {
      mockPathname.mockReturnValue('/applications');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when on /application/foo-123 (detail page)', () => {
      mockPathname.mockReturnValue('/application/foo-123');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when pathname has trailing slash /application/', () => {
      mockPathname.mockReturnValue('/application/');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('variant=apps-only (disallowed paths)', () => {
    it('redirects from /features to /applications', () => {
      mockPathname.mockReturnValue('/features');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });

    it('redirects from /projects to /applications', () => {
      mockPathname.mockReturnValue('/projects');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });

    it('redirects from /settings to /applications', () => {
      mockPathname.mockReturnValue('/settings');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });

    it('redirects from /tools to /applications', () => {
      mockPathname.mockReturnValue('/tools');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });

    it('redirects from /skills to /applications', () => {
      mockPathname.mockReturnValue('/skills');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });

    it('redirects from / (root) to /applications', () => {
      mockPathname.mockReturnValue('/');
      renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledWith('/applications');
    });
  });

  describe('rerender behavior', () => {
    it('calls replace again when pathname changes to another disallowed path', () => {
      mockPathname.mockReturnValue('/features');
      const { rerender } = renderHook(() => useAppsOnlyRouteGuard('apps-only'));
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenLastCalledWith('/applications');

      mockPathname.mockReturnValue('/settings');
      rerender();
      expect(mockReplace).toHaveBeenCalledTimes(2);
      expect(mockReplace).toHaveBeenLastCalledWith('/applications');
    });
  });
});
