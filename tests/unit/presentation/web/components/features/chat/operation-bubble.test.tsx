/**
 * useOperationRuns polling (spec 116).
 *
 * ChatTab mounts the hook three times (publish, deploy, sync). Each polled
 * its log endpoint every 1.5–2.5 s forever — even for an application whose
 * last operation finished months ago. Polling must run only while the last
 * run is in progress; new activity arrives as an `OperationLogAppended`
 * notification on the agent-events stream, which triggers a refetch.
 */

import React, { type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  NotificationEventType,
  NotificationSeverity,
  OperationLogKind,
  OperationLogLevel,
  type NotificationEvent,
} from '@shepai/core/domain/generated/output';
import { AgentEventsContext } from '@/hooks/agent-events-provider';
import type { UseAgentEventsResult } from '@/hooks/use-agent-events';
import {
  OperationBubble,
  useOperationRuns,
  OPERATION_IN_PROGRESS_POLL_MS,
} from '@/components/features/chat/operation-bubble';

const APP_ID = 'app-1';
const NOW = new Date('2026-09-22T12:00:00.000Z').getTime();
/** Mirrors the in-progress window in operation-bubble.tsx. */
const IN_PROGRESS_WINDOW_MS = 10_000;
/** Longer than any poll interval the hook ever used. */
const QUIET_PERIOD_MS = 60_000;

function entry(message: string, ageMs: number, kind = OperationLogKind.CloudDeploy) {
  return {
    id: `${message}-${ageMs}`,
    operationKind: kind,
    operationId: APP_ID,
    level: OperationLogLevel.Info,
    message,
    createdAt: new Date(Date.now() - ageMs).toISOString(),
  };
}

let responses: { entries: ReturnType<typeof entry>[] }[];
const fetchMock = vi.fn(async () => {
  const body = responses.length > 1 ? responses.shift()! : responses[0];
  return { ok: true, json: async () => body } as Response;
});

function eventsContext(lastEvent: NotificationEvent | null): UseAgentEventsResult {
  return {
    events: [],
    lastEvent,
    agentMessages: [],
    lastAgentMessage: null,
    agentQuestions: [],
    lastAgentQuestion: null,
    supervisorDecisions: [],
    lastSupervisorDecision: null,
    connectionStatus: 'connected',
  };
}

function appendedEvent(kind: OperationLogKind): NotificationEvent {
  const logEntry = entry('Starting deploy to cloudflare', 0, kind);
  return {
    eventType: NotificationEventType.OperationLogAppended,
    agentRunId: APP_ID,
    featureId: APP_ID,
    featureName: kind,
    message: logEntry.message,
    severity: NotificationSeverity.Info,
    timestamp: logEntry.createdAt,
    operationLogAppend: {
      entry: { ...logEntry, createdAt: new Date(logEntry.createdAt), updatedAt: new Date() },
    },
  } as NotificationEvent;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let lastEvent: NotificationEvent | null = null;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AgentEventsContext.Provider value={eventsContext(lastEvent)}>
        {children}
      </AgentEventsContext.Provider>
    </QueryClientProvider>
  );
  return {
    Wrapper,
    setEvent(event: NotificationEvent) {
      lastEvent = event;
    },
    client,
  };
}

const flush = () => act(async () => vi.advanceTimersByTimeAsync(0));

describe('useOperationRuns polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not poll an application with no operations', async () => {
    responses = [{ entries: [] }];
    const { Wrapper } = setup();
    renderHook(() => useOperationRuns(APP_ID, 'deploy'), { wrapper: Wrapper });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(QUIET_PERIOD_MS));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll once the last run has finished', async () => {
    responses = [{ entries: [entry('Starting deploy to x', 3_600_000), entry('Done', 3_590_000)] }];
    const { Wrapper } = setup();
    renderHook(() => useOperationRuns(APP_ID, 'deploy'), { wrapper: Wrapper });
    await flush();

    await act(async () => vi.advanceTimersByTimeAsync(QUIET_PERIOD_MS));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls while the last run is in progress, then stops', async () => {
    responses = [{ entries: [entry('Starting deploy to x', 1_000)] }];
    const { Wrapper } = setup();
    renderHook(() => useOperationRuns(APP_ID, 'deploy'), { wrapper: Wrapper });
    await flush();

    await act(async () => vi.advanceTimersByTimeAsync(OPERATION_IN_PROGRESS_POLL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // No new entries: the run leaves the in-progress window and polling ends.
    await act(async () => vi.advanceTimersByTimeAsync(IN_PROGRESS_WINDOW_MS));
    const settled = fetchMock.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(QUIET_PERIOD_MS));
    expect(fetchMock).toHaveBeenCalledTimes(settled);
  });

  it('refetches when the stream reports a new entry for this app and kind', async () => {
    responses = [{ entries: [] }];
    const harness = setup();
    const { rerender } = renderHook(() => useOperationRuns(APP_ID, 'deploy'), {
      wrapper: harness.Wrapper,
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    harness.setEvent(appendedEvent(OperationLogKind.CloudDeploy));
    rerender();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores stream entries for another operation kind', async () => {
    responses = [{ entries: [] }];
    const harness = setup();
    const { rerender } = renderHook(() => useOperationRuns(APP_ID, 'deploy'), {
      wrapper: harness.Wrapper,
    });
    await flush();

    harness.setEvent(appendedEvent(OperationLogKind.GitRemoteCreate));
    rerender();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the finished title once a quiet run leaves the in-progress window', async () => {
    responses = [{ entries: [entry('Starting deploy to x', 1_000)] }];
    const { Wrapper } = setup();
    render(<OperationBubble applicationId={APP_ID} kind="deploy" />, { wrapper: Wrapper });
    await flush();
    expect(screen.getByText('Deploying to cloud…')).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(IN_PROGRESS_WINDOW_MS * 2));

    expect(screen.getByText('Deployed to cloud')).toBeTruthy();
  });
});
