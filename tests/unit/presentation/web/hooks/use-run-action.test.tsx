import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRunAction } from '@/hooks/use-run-action';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('useRunAction', () => {
  beforeEach(() => refresh.mockClear());

  it('refreshes after a success and resolves true', async () => {
    const { result } = renderHook(() => useRunAction({ fallbackError: 'Failed' }));
    let ok = false;
    await act(async () => {
      ok = await result.current.run(async () => ({ ok: true }));
    });
    expect(ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('shows the error of a failure, or the fallback for a throw', async () => {
    const { result } = renderHook(() => useRunAction({ fallbackError: 'Failed' }));
    await act(async () => {
      await result.current.run(async () => ({ ok: false, error: 'No space "x".' }));
    });
    expect(result.current.error).toBe('No space "x".');
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('network down')));
    });
    expect(result.current.error).toBe('network down');
    await act(async () => {
      await result.current.run(async () => ({ ok: false }));
    });
    expect(result.current.error).toBe('Failed');
  });

  it('can refresh after a failure and starts with an initial error', async () => {
    const { result } = renderHook(() =>
      useRunAction({ fallbackError: 'Failed', refreshOnFailure: true, initialError: 'load failed' })
    );
    expect(result.current.error).toBe('load failed');
    await act(async () => {
      await result.current.run(async () => ({ ok: false, error: 'rate limited' }));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
