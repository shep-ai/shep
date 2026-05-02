import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { useRouter } from 'next/navigation';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { useFabActions } from '@/components/features/control-center/use-fab-actions';
import { buildCreateUrl } from '@/lib/url-params';

type Router = ReturnType<typeof useRouter>;

interface BuildParamsOverrides {
  router?: Router;
  selectedApplicationId?: string;
  selectedApplicationName?: string;
}

function makeRouter(): Router {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  } as unknown as Router;
}

function buildParams(overrides: BuildParamsOverrides = {}) {
  const router = overrides.router ?? makeRouter();
  return {
    router,
    clickSound: { play: vi.fn() },
    guardedNavigate: (fn: () => void) => fn(),
    handlePickFolder: vi.fn(),
    onNewProject: vi.fn(),
    onNewApplication: vi.fn(),
    ...(overrides.selectedApplicationId !== undefined && {
      selectedApplicationId: overrides.selectedApplicationId,
    }),
    ...(overrides.selectedApplicationName !== undefined && {
      selectedApplicationName: overrides.selectedApplicationName,
    }),
  };
}

describe('useFabActions', () => {
  it('does not include the SDD app-scoped action when selectedApplicationId is undefined', () => {
    const { result } = renderHook(() => useFabActions(buildParams()));

    const ids = result.current.map((a) => a.id);
    expect(ids).not.toContain('new-sdd-feature-for-app');
  });

  it('preserves the unconditional "new-feature" item regardless of app selection', () => {
    const { result: noApp } = renderHook(() => useFabActions(buildParams()));
    const { result: withApp } = renderHook(() =>
      useFabActions(
        buildParams({ selectedApplicationId: 'app-1', selectedApplicationName: 'Dashboard' })
      )
    );

    expect(noApp.current.map((a) => a.id)).toContain('new-feature');
    expect(withApp.current.map((a) => a.id)).toContain('new-feature');
  });

  it('appends a "New SDD feature for <app>" action when selectedApplicationId is set', () => {
    const { result } = renderHook(() =>
      useFabActions(
        buildParams({
          selectedApplicationId: 'app-1',
          selectedApplicationName: 'Dashboard',
        })
      )
    );

    const action = result.current.find((a) => a.id === 'new-sdd-feature-for-app');
    expect(action).toBeDefined();
    expect(action?.label).toContain('Dashboard');
  });

  it('clicking the SDD app-scoped action pushes to /create with applicationId + spec mode', () => {
    const router = makeRouter();
    const { result } = renderHook(() =>
      useFabActions(
        buildParams({
          router,
          selectedApplicationId: 'app-42',
          selectedApplicationName: 'Dashboard',
        })
      )
    );

    const action = result.current.find((a) => a.id === 'new-sdd-feature-for-app');
    expect(action).toBeDefined();
    action!.onClick();

    expect(router.push).toHaveBeenCalledWith(
      buildCreateUrl({ applicationId: 'app-42', mode: BuildMode.Spec })
    );
  });
});
