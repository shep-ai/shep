import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  AgentActivityState,
  NotificationEventType,
  NotificationSeverity,
  type NotificationEvent,
} from '@shepai/core/domain/generated/output';
import { AgentEventsContext } from '@/hooks/agent-events-provider';
import type { UseAgentEventsResult } from '@/hooks/use-agent-events';
import { AGENT_EVENT_REFRESH_DEBOUNCE_MS } from '@/hooks/use-agent-event-refresh';
import { AGENT_ACTIVITY_POLL_MS, useAgentActivity } from '@/hooks/use-agent-activity';

function snapshot(overall: AgentActivityState) {
  return {
    generatedAt: '2026-10-28T10:00:00.000Z',
    activities: [],
    counts: { working: 0, blocked: 0, waiting: 0, done: 0, failed: 0 },
    overall,
    notFound: false,
  };
}

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function event(): NotificationEvent {
  return {
    eventType: NotificationEventType.AgentStarted,
    agentRunId: 'run-1',
    featureId: 'feat-1',
    featureName: 'Feature',
    message: 'started',
    severity: NotificationSeverity.Info,
    timestamp: '2026-10-28T10:00:00Z',
  };
}

function contextWith(events: NotificationEvent[]): UseAgentEventsResult {
  return {
    events,
    lastEvent: events.at(-1) ?? null,
    agentMessages: [],
    lastAgentMessage: null,
    agentQuestions: [],
    lastAgentQuestion: null,
    supervisorDecisions: [],
    lastSupervisorDecision: null,
    connectionStatus: 'connected',
  };
}

describe('useAgentActivity', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the snapshot for the query', async () => {
    fetchMock.mockImplementation(() => respond(snapshot(AgentActivityState.Working)));
    const { result } = renderHook(() =>
      useAgentActivity({ featureId: 'feat-1', includeSettled: true })
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/agent-activity?featureId=feat-1&includeSettled=1'
    );
    expect(result.current.snapshot?.overall).toBe(AgentActivityState.Working);
    expect(result.current.error).toBeNull();
  });

  it('reports a missing feature', async () => {
    fetchMock.mockImplementation(() =>
      respond({ ...snapshot(AgentActivityState.Done), notFound: true }, 404)
    );
    const { result } = renderHook(() => useAgentActivity({ featureId: 'nope' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('keeps the last snapshot when a later read fails', async () => {
    fetchMock.mockImplementationOnce(() => respond(snapshot(AgentActivityState.Blocked)));
    const { result } = renderHook(() => useAgentActivity());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    fetchMock.mockImplementationOnce(() => respond({ error: 'database is locked' }, 500));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.snapshot?.overall).toBe(AgentActivityState.Blocked);
    expect(result.current.error).toBe('database is locked');
  });

  it('re-reads on a poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(() => respond(snapshot(AgentActivityState.Working)));
    renderHook(() => useAgentActivity());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-reads when the agent event stream reports something', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(() => respond(snapshot(AgentActivityState.Working)));
    let value = contextWith([]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentEventsContext.Provider value={value}>{children}</AgentEventsContext.Provider>
    );
    const { rerender } = renderHook(() => useAgentActivity(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    value = contextWith([event()]);
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_EVENT_REFRESH_DEBOUNCE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
