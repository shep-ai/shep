import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  NotificationEventType,
  NotificationSeverity,
  ApplicationStatus,
} from '@shepai/core/domain/generated/output';
import type { Application, NotificationEvent } from '@shepai/core/domain/generated/output';
import { AgentEventsContext } from '@/hooks/agent-events-provider';
import type { UseAgentEventsResult } from '@/hooks/use-agent-events';
import { ApplicationPageLoader } from '@/components/features/application-page/application-page-loader';

// The loader renders an inner <ApplicationPage> which depends on a lot of
// context we don't need for this test — stub it out so we can focus on the
// SSE → cache-patch handler in isolation.
vi.mock('@/components/features/application-page/application-page', () => ({
  ApplicationPage: () => React.createElement('div', { 'data-testid': 'application-page-stub' }),
}));

// DeploymentStatusProvider pulls in SSE / fetch code that's irrelevant here.
vi.mock('@/hooks/deployment-status-provider', () => ({
  DeploymentStatusProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// next/navigation's notFound() throws — keep it inert so a stray call in
// error paths doesn't explode the whole test file.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

const APP_ID = 'app-123';

const baseApp: Application = {
  id: APP_ID,
  name: 'Todo',
  slug: 'todo',
  description: 'Todo app',
  repositoryPath: '/tmp/todo',
  additionalPaths: [],
  status: ApplicationStatus.Idle,
  setupComplete: false,
  bedrockEnabled: false,
  createdAt: new Date('2026-01-01').toISOString(),
  updatedAt: new Date('2026-01-01').toISOString(),
};

interface AppData {
  application: Application;
  initialChatState?: unknown;
  deployment?: { state: string; url: string | null };
}

function seededClient(seed: AppData | null): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  if (seed !== null) {
    client.setQueryData(['application', APP_ID], seed);
  }
  return client;
}

function makeEvent(overrides: Partial<NotificationEvent>): NotificationEvent {
  return {
    eventType: NotificationEventType.AgentStarted,
    agentRunId: 'run-1',
    featureId: 'feat-1',
    featureName: 'Test',
    message: 'hi',
    severity: NotificationSeverity.Info,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface HarnessRef {
  dispatch(event: NotificationEvent | null): void;
}

function Harness({
  client,
  handleRef,
}: {
  client: QueryClient;
  handleRef: { current: HarnessRef | null };
}) {
  const [lastEvent, setLastEvent] = useState<NotificationEvent | null>(null);
  handleRef.current = {
    dispatch: setLastEvent,
  };
  const value: UseAgentEventsResult = {
    events: lastEvent ? [lastEvent] : [],
    lastEvent,
    agentMessages: [],
    lastAgentMessage: null,
    agentQuestions: [],
    lastAgentQuestion: null,
    supervisorDecisions: [],
    lastSupervisorDecision: null,
    connectionStatus: 'connected',
  };
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(
      AgentEventsContext.Provider,
      { value },
      React.createElement(ApplicationPageLoader, { applicationId: APP_ID })
    )
  );
}

describe('ApplicationPageLoader surgical SSE patch handler', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('fetch should not be called'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges ApplicationUpdated payload into the cached AppData in-place', () => {
    const client = seededClient({ application: baseApp });
    const handleRef: { current: HarnessRef | null } = { current: null };
    render(React.createElement(Harness, { client, handleRef }));

    act(() => {
      handleRef.current?.dispatch(
        makeEvent({
          eventType: NotificationEventType.ApplicationUpdated,
          applicationUpdate: {
            applicationId: APP_ID,
            setupComplete: true,
            status: ApplicationStatus.Idle,
          },
        })
      );
    });

    const patched = client.getQueryData(['application', APP_ID]) as AppData | undefined;
    expect(patched).toBeDefined();
    expect(patched!.application.setupComplete).toBe(true);
    expect(patched!.application.status).toBe(ApplicationStatus.Idle);
    expect(patched!.application.id).toBe(APP_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores updates for a different applicationId', () => {
    const client = seededClient({ application: baseApp });
    const handleRef: { current: HarnessRef | null } = { current: null };
    render(React.createElement(Harness, { client, handleRef }));

    act(() => {
      handleRef.current?.dispatch(
        makeEvent({
          eventType: NotificationEventType.ApplicationUpdated,
          applicationUpdate: {
            applicationId: 'some-other-app',
            setupComplete: true,
            status: ApplicationStatus.Active,
          },
        })
      );
    });

    const cached = client.getQueryData(['application', APP_ID]) as AppData;
    expect(cached.application.setupComplete).toBe(false);
    expect(cached.application.status).toBe(ApplicationStatus.Idle);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores non-ApplicationUpdated events', () => {
    const client = seededClient({ application: baseApp });
    const handleRef: { current: HarnessRef | null } = { current: null };
    render(React.createElement(Harness, { client, handleRef }));

    act(() => {
      handleRef.current?.dispatch(
        makeEvent({
          eventType: NotificationEventType.AgentStarted,
        })
      );
    });

    const cached = client.getQueryData(['application', APP_ID]) as AppData;
    expect(cached.application).toEqual(baseApp);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the cache is missing (no throw, cache stays empty)', () => {
    const client = seededClient(null);
    const handleRef: { current: HarnessRef | null } = { current: null };
    render(React.createElement(Harness, { client, handleRef }));

    // Seed absent — fetch will be triggered by the `useQuery` hook. Swap
    // the mock to return a rejected promise so we exercise the missing-cache
    // branch of the patch handler without ever filling the cache.
    act(() => {
      handleRef.current?.dispatch(
        makeEvent({
          eventType: NotificationEventType.ApplicationUpdated,
          applicationUpdate: {
            applicationId: APP_ID,
            setupComplete: true,
            status: ApplicationStatus.Idle,
          },
        })
      );
    });

    // With no seeded cache the useQuery query will have started — the key
    // thing is that the handler must NOT have thrown and must NOT have
    // populated the cache itself.
    const cached = client.getQueryData(['application', APP_ID]);
    expect(cached).toBeUndefined();
  });
});
