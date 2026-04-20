/**
 * Surgical SSE-append handler for the Smart Deploy activity drawer.
 *
 * The drawer used to refresh the whole merged log on ANY notification
 * event — a full fetch × 4 operation scopes per event. This test pins
 * down the new behaviour: one hydration fetch on open, then in-place
 * appends whenever an `OperationLogAppended` notification arrives for
 * this drawer's `applicationId`. Dedup is by `entry.id`.
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import {
  ApplicationStatus,
  NotificationEventType,
  NotificationSeverity,
  OperationLogKind,
  OperationLogLevel,
} from '@shepai/core/domain/generated/output';
import type { NotificationEvent, OperationLogEntry } from '@shepai/core/domain/generated/output';
import { AgentEventsContext } from '@/hooks/agent-events-provider';
import type { UseAgentEventsResult } from '@/hooks/use-agent-events';
import { SmartDeployLogsDrawer } from '@/components/features/application-page/smart-deploy-logs-drawer';

const APP_ID = 'app-1';

function makeEntry(
  overrides: Partial<OperationLogEntry> & { id: string; createdAt: string }
): OperationLogEntry {
  const { id, createdAt, ...rest } = overrides;
  return {
    id,
    operationKind: OperationLogKind.ApplicationSetup,
    operationId: APP_ID,
    level: OperationLogLevel.Info,
    message: `entry ${id}`,
    createdAt,
    updatedAt: createdAt,
    ...rest,
  };
}

function makeAppendEvent(entry: OperationLogEntry): NotificationEvent {
  return {
    eventType: NotificationEventType.OperationLogAppended,
    agentRunId: 'run-1',
    featureId: 'feat-1',
    featureName: 'test',
    message: 'append',
    severity: NotificationSeverity.Info,
    timestamp: entry.createdAt,
    operationLogAppend: { entry },
  };
}

interface HarnessRef {
  dispatch(event: NotificationEvent | null): void;
  setOpen(open: boolean): void;
}

function Harness({
  handleRef,
  initialOpen = true,
}: {
  handleRef: { current: HarnessRef | null };
  initialOpen?: boolean;
}) {
  const [lastEvent, setLastEvent] = useState<NotificationEvent | null>(null);
  const [open, setOpen] = useState(initialOpen);
  handleRef.current = {
    dispatch: setLastEvent,
    setOpen,
  };
  const value: UseAgentEventsResult = {
    events: lastEvent ? [lastEvent] : [],
    lastEvent,
    connectionStatus: 'connected',
  };
  return React.createElement(
    AgentEventsContext.Provider,
    { value },
    React.createElement(SmartDeployLogsDrawer, {
      open,
      onOpenChange: setOpen,
      applicationId: APP_ID,
      isRunning: true,
    })
  );
}

const hydrationEntries: Record<string, OperationLogEntry[]> = {};

function resetHydration(): void {
  for (const key of Object.keys(hydrationEntries)) {
    delete hydrationEntries[key];
  }
  hydrationEntries[OperationLogKind.ApplicationSetup] = [
    makeEntry({ id: 'e1', createdAt: '2026-04-20T10:00:00.000Z' }),
    makeEntry({ id: 'e2', createdAt: '2026-04-20T10:00:01.000Z' }),
  ];
  hydrationEntries[OperationLogKind.GitRemoteCreate] = [];
  hydrationEntries[OperationLogKind.CloudDeploy] = [];
  hydrationEntries[OperationLogKind.RepoSync] = [];
}

describe('SmartDeployLogsDrawer surgical append handler', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetHydration();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      for (const kind of Object.keys(hydrationEntries)) {
        if (url.includes(`/api/operations/${kind}/`)) {
          return new Response(JSON.stringify({ entries: hydrationEntries[kind] }), {
            status: 200,
          });
        }
      }
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function waitForHydration(screen: ReturnType<typeof render>) {
    await waitFor(() => {
      expect(screen.getByText(/2 entries/i)).toBeTruthy();
    });
  }

  it('appends a new OperationLogAppended entry in chronological position', async () => {
    const handleRef: { current: HarnessRef | null } = { current: null };
    const screen = render(React.createElement(Harness, { handleRef }));
    await waitForHydration(screen);

    fetchSpy.mockClear();

    const newEntry = makeEntry({
      id: 'e3',
      createdAt: '2026-04-20T10:00:02.000Z',
      message: 'brand new line',
    });

    act(() => {
      handleRef.current?.dispatch(makeAppendEvent(newEntry));
    });

    await waitFor(() => {
      expect(screen.getByText(/3 entries/i)).toBeTruthy();
    });
    expect(screen.getByText('brand new line')).toBeTruthy();
    // No refetch was triggered — append was surgical.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dedupes when the same entry event arrives twice', async () => {
    const handleRef: { current: HarnessRef | null } = { current: null };
    const screen = render(React.createElement(Harness, { handleRef }));
    await waitForHydration(screen);

    const entry = makeEntry({
      id: 'e3',
      createdAt: '2026-04-20T10:00:02.000Z',
      message: 'once',
    });

    act(() => {
      handleRef.current?.dispatch(makeAppendEvent(entry));
    });
    await waitFor(() => {
      expect(screen.getByText(/3 entries/i)).toBeTruthy();
    });
    // Dispatch a second time with a fresh reference — useEffect deps
    // change (new object identity) but dedup should still hold.
    act(() => {
      handleRef.current?.dispatch(null);
    });
    act(() => {
      handleRef.current?.dispatch(makeAppendEvent(entry));
    });

    // Still only 3 entries.
    expect(screen.getByText(/3 entries/i)).toBeTruthy();
  });

  it('ignores events for a different applicationId', async () => {
    const handleRef: { current: HarnessRef | null } = { current: null };
    const screen = render(React.createElement(Harness, { handleRef }));
    await waitForHydration(screen);

    const foreign = makeEntry({
      id: 'e-other',
      createdAt: '2026-04-20T10:00:02.000Z',
    });
    foreign.operationId = 'app-2';

    act(() => {
      handleRef.current?.dispatch(makeAppendEvent(foreign));
    });

    // Count unchanged.
    expect(screen.getByText(/2 entries/i)).toBeTruthy();
  });

  it('ignores non-OperationLogAppended events', async () => {
    const handleRef: { current: HarnessRef | null } = { current: null };
    const screen = render(React.createElement(Harness, { handleRef }));
    await waitForHydration(screen);

    fetchSpy.mockClear();

    act(() => {
      handleRef.current?.dispatch({
        eventType: NotificationEventType.ApplicationUpdated,
        agentRunId: 'run-1',
        featureId: 'feat-1',
        featureName: 'test',
        message: 'unrelated',
        severity: NotificationSeverity.Info,
        timestamp: '2026-04-20T10:00:02.000Z',
        applicationUpdate: {
          applicationId: APP_ID,
          setupComplete: true,
          status: ApplicationStatus.Idle,
        },
      });
    });

    // Count unchanged, no refetch.
    expect(screen.getByText(/2 entries/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores events when the drawer is closed', () => {
    const handleRef: { current: HarnessRef | null } = { current: null };
    render(React.createElement(Harness, { handleRef, initialOpen: false }));

    // Nothing to hydrate yet — drawer closed. Fetch should NOT have been
    // called, and dispatching an append event should be a no-op.
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      handleRef.current?.dispatch(
        makeAppendEvent(makeEntry({ id: 'e3', createdAt: '2026-04-20T10:00:02.000Z' }))
      );
    });

    // Still no hydration fetch because drawer never opened.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
