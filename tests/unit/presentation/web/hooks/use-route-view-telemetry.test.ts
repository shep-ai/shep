import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockPathname = vi.fn((): string | null => '/');
const mockParams = vi.fn((): Record<string, string | string[]> => ({}));
const mockRecord = vi.fn(async () => undefined);

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useParams: () => mockParams(),
}));
vi.mock('@/app/actions/telemetry', () => ({
  recordWebAreaView: (...args: unknown[]) => mockRecord(...(args as [])),
}));

const { useRouteViewTelemetry } = await import(
  '../../../../../src/presentation/web/hooks/use-route-view-telemetry.js'
);

describe('useRouteViewTelemetry', () => {
  beforeEach(() => {
    mockRecord.mockClear();
    mockParams.mockReturnValue({});
  });

  it('records the area and route template, never the raw path', () => {
    mockPathname.mockReturnValue('/feature/feat-42');
    mockParams.mockReturnValue({ featureId: 'feat-42' });
    renderHook(() => useRouteViewTelemetry());

    expect(mockRecord).toHaveBeenCalledWith('/feature', '/feature/[featureId]');
    expect(JSON.stringify(mockRecord.mock.calls)).not.toContain('feat-42');
  });

  it('records once per route, not on every re-render', () => {
    mockPathname.mockReturnValue('/aspm');
    const { rerender } = renderHook(() => useRouteViewTelemetry());
    rerender();
    expect(mockRecord).toHaveBeenCalledTimes(1);

    mockPathname.mockReturnValue('/settings');
    rerender();
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a pathname', () => {
    mockPathname.mockReturnValue(null);
    renderHook(() => useRouteViewTelemetry());
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
