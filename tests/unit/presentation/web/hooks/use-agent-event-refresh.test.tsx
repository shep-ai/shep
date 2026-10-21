import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  NotificationEventType,
  NotificationSeverity,
  type NotificationEvent,
} from '@shepai/core/domain/generated/output';
import { AgentEventsContext } from '@/hooks/agent-events-provider';
import type { UseAgentEventsResult } from '@/hooks/use-agent-events';
import {
  AGENT_EVENT_REFRESH_DEBOUNCE_MS,
  useAgentEventRefresh,
} from '@/hooks/use-agent-event-refresh';

const RELEVANT = new Set<NotificationEventType>([
  NotificationEventType.AgentCompleted,
  NotificationEventType.PrMerged,
]);

/** A fresh object per call — the SSE hook parses each frame, so identity moves. */
function event(eventType: NotificationEventType): NotificationEvent {
  return {
    eventType,
    agentRunId: 'run-1',
    featureId: 'feat-1',
    featureName: 'Feature',
    message: 'message',
    severity: NotificationSeverity.Info,
    timestamp: '2026-10-21T10:00:00Z',
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

function setup(initialEvents: NotificationEvent[] | null) {
  const onRefresh = vi.fn();
  let value: UseAgentEventsResult | null = initialEvents ? contextWith(initialEvents) : null;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AgentEventsContext.Provider value={value}>{children}</AgentEventsContext.Provider>
  );
  const hook = renderHook(() => useAgentEventRefresh({ eventTypes: RELEVANT, onRefresh }), {
    wrapper,
  });
  return {
    onRefresh,
    hook,
    deliver(events: NotificationEvent[]) {
      value = contextWith(events);
      hook.rerender();
    },
  };
}

describe('useAgentEventRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes once, after the debounce, for a burst of relevant events', () => {
    const { onRefresh, deliver } = setup([]);
    const first = event(NotificationEventType.AgentCompleted);
    const second = event(NotificationEventType.PrMerged);

    deliver([first]);
    deliver([first, second]);
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS - 1);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores events that do not change what the page shows', () => {
    const { onRefresh, deliver } = setup([]);

    deliver([event(NotificationEventType.OperationLogAppended)]);
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not replay events the provider held before the page mounted', () => {
    const backlog = [event(NotificationEventType.AgentCompleted)];
    const { onRefresh, hook } = setup(backlog);

    hook.rerender();
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes for a relevant event that arrives after the backlog', () => {
    const old = event(NotificationEventType.AgentCompleted);
    const { onRefresh, deliver } = setup([old]);

    deliver([old, event(NotificationEventType.PrMerged)]);
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('sees a relevant event even when a later irrelevant one is the newest', () => {
    // Two frames can land in one render; `lastEvent` alone would hide the first.
    const { onRefresh, deliver } = setup([]);

    deliver([
      event(NotificationEventType.AgentCompleted),
      event(NotificationEventType.OperationLogAppended),
    ]);
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps working after the bounded event list prunes its oldest entries', () => {
    const seen = event(NotificationEventType.OperationLogAppended);
    const { onRefresh, deliver } = setup([event(NotificationEventType.AgentCompleted), seen]);

    // Pruned: same length as before, so a count-based cursor would see nothing new.
    deliver([seen, event(NotificationEventType.PrMerged)]);
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending refresh on unmount', () => {
    const { onRefresh, deliver, hook } = setup([]);

    deliver([event(NotificationEventType.AgentCompleted)]);
    hook.unmount();
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing without an events provider', () => {
    const { onRefresh, hook } = setup(null);

    hook.rerender();
    vi.advanceTimersByTime(AGENT_EVENT_REFRESH_DEBOUNCE_MS * 2);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
