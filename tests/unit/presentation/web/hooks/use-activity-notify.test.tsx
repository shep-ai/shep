import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ActivityWaitOutcome, AgentActivityState } from '@shepai/core/domain/generated/output';
import { useActivityNotify } from '@/hooks/use-activity-notify';

const ACTIVITY = { featureId: 'feat-1', name: 'Login page', state: AgentActivityState.Blocked };

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('useActivityNotify', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('waits, asks again after a timeout, and notifies once on a match', async () => {
    fetchMock
      .mockImplementationOnce(() => respond({ outcome: ActivityWaitOutcome.TimedOut }))
      .mockImplementationOnce(() =>
        respond({ outcome: ActivityWaitOutcome.Matched, activity: ACTIVITY })
      );
    const onMatch = vi.fn();
    const { result } = renderHook(() => useActivityNotify({ featureId: 'feat-1', onMatch }));

    act(() => result.current.start());
    expect(result.current.watching).toBe(true);
    await waitFor(() => expect(onMatch).toHaveBeenCalledTimes(1));

    expect(onMatch).toHaveBeenCalledWith(ACTIVITY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent-activity/wait?featureId=feat-1');
    expect(result.current.watching).toBe(false);
  });

  it('stops with an error when the feature is gone', async () => {
    fetchMock.mockImplementation(() => respond({ outcome: ActivityWaitOutcome.NotFound }, 404));
    const onMatch = vi.fn();
    const { result } = renderHook(() => useActivityNotify({ featureId: 'gone', onMatch }));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.watching).toBe(false));

    expect(result.current.error).toBe(ActivityWaitOutcome.NotFound);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('aborts the wait on stop and on unmount', async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      );
    });
    const { result, unmount } = renderHook(() =>
      useActivityNotify({ featureId: 'feat-1', onMatch: vi.fn() })
    );

    act(() => result.current.start());
    await waitFor(() => expect(signals).toHaveLength(1));
    act(() => result.current.stop());
    expect(signals[0].aborted).toBe(true);
    expect(result.current.watching).toBe(false);
    expect(result.current.error).toBeNull();

    act(() => result.current.start());
    await waitFor(() => expect(signals).toHaveLength(2));
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
