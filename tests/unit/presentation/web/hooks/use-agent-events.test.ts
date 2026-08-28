import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NotificationSeverity, NotificationEventType } from '@/domain/generated/output.js';
import type { NotificationEvent } from '@/domain/generated/output.js';

// --- Mock Service Worker API ---

type MessageHandler = (event: MessageEvent) => void;

let swMessageHandlers: MessageHandler[] = [];
let swPostMessage: ReturnType<typeof vi.fn>;
let mockRegistration: {
  active: {
    state: string;
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  } | null;
  installing: null;
  waiting: null;
};

function setupServiceWorkerMock() {
  swMessageHandlers = [];
  swPostMessage = vi.fn();
  mockRegistration = {
    active: {
      state: 'activated',
      postMessage: swPostMessage,
      addEventListener: vi.fn(),
    },
    installing: null,
    waiting: null,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: vi.fn().mockResolvedValue(mockRegistration),
      addEventListener: vi.fn((_event: string, handler: MessageHandler) => {
        swMessageHandlers.push(handler);
      }),
      removeEventListener: vi.fn((_event: string, handler: MessageHandler) => {
        swMessageHandlers = swMessageHandlers.filter((h) => h !== handler);
      }),
    },
    writable: true,
    configurable: true,
  });
}

/** Simulate the Service Worker sending a message to the page */
function simulateSWMessage(data: unknown) {
  const event = { data } as MessageEvent;
  swMessageHandlers.forEach((h) => h(event));
}

// --- Mock EventSource (for fallback tests) ---

type EventSourceListener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, EventSourceListener[]>();

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: EventSourceListener) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  removeEventListener(event: string, handler: EventSourceListener) {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((h) => h !== handler)
    );
  }

  close = vi.fn();

  simulateOpen() {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.();
  }

  simulateError() {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.();
  }

  simulateEvent(eventName: string, data: string) {
    const handlers = this.listeners.get(eventName) ?? [];
    const messageEvent = { data } as MessageEvent;
    handlers.forEach((h) => h(messageEvent));
  }
}

const originalEventSource = globalThis.EventSource;

function createSampleEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    eventType: NotificationEventType.AgentCompleted,
    agentRunId: 'run-123',
    featureId: 'feat-456',
    featureName: 'Test Feature',
    message: 'Agent completed successfully',
    severity: NotificationSeverity.Success,
    timestamp: '2026-02-17T10:00:00Z',
    ...overrides,
  };
}

/** Mirrors BASE_BACKOFF_MS in use-agent-events.ts — the delay before a dropped
 *  stream is replaced. The watchdog closes the stream immediately; the new
 *  EventSource only appears one backoff interval later. */
const BASE_BACKOFF_MS = 1000;

describe('useAgentEvents', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let useAgentEvents: typeof import('../../../../../src/presentation/web/hooks/use-agent-events.js').useAgentEvents;

  beforeEach(async () => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
    setupServiceWorkerMock();

    const mod = await import('../../../../../src/presentation/web/hooks/use-agent-events.js');
    useAgentEvents = mod.useAgentEvents;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as any).EventSource = originalEventSource;
  });

  describe('Service Worker mode', () => {
    it('registers the service worker on mount', async () => {
      renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/agent-events-sw.js', {
        scope: '/',
      });
    });

    it('sends subscribe message to active worker', async () => {
      renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(swPostMessage).toHaveBeenCalledWith({ type: 'subscribe', runId: undefined });
    });

    it('sends subscribe with runId when provided', async () => {
      renderHook(() => useAgentEvents({ runId: 'run-abc' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(swPostMessage).toHaveBeenCalledWith({ type: 'subscribe', runId: 'run-abc' });
    });

    it('connectionStatus starts as disconnected then transitions to connecting', async () => {
      const { result } = renderHook(() => useAgentEvents());

      expect(result.current.connectionStatus).toBe('disconnected');

      // Flush the SW registration promise + React state updates
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('updates connectionStatus when SW sends status message', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        simulateSWMessage({ type: 'status', status: 'connected' });
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('receives notification events from SW', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const event = createSampleEvent();
      act(() => {
        simulateSWMessage({ type: 'notification', data: event });
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0]).toEqual(event);
      expect(result.current.lastEvent).toEqual(event);
    });

    it('accumulates multiple events from SW', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const event1 = createSampleEvent({ eventType: NotificationEventType.AgentStarted });
      const event2 = createSampleEvent({ eventType: NotificationEventType.AgentCompleted });

      act(() => {
        simulateSWMessage({ type: 'notification', data: event1 });
        simulateSWMessage({ type: 'notification', data: event2 });
      });

      expect(result.current.events).toHaveLength(2);
      expect(result.current.lastEvent).toEqual(event2);
    });

    it('sends unsubscribe and removes listener on unmount', async () => {
      const { unmount } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      unmount();

      expect(swPostMessage).toHaveBeenCalledWith({ type: 'unsubscribe' });
      expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalled();
    });

    it('receives agent_message events from SW with narrowed kind', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const data = {
        kind: 'agent_message' as const,
        messageId: 'msg-1',
        appId: 'app-1',
        featureId: 'feat-1',
        fromActor: 'agent:run-1',
        toTarget: 'broadcast',
        toKind: 'broadcast',
        messageKind: 'status',
        payload: '{"phase":"started"}',
        createdAt: '2026-04-28T10:00:00Z',
      };
      act(() => {
        simulateSWMessage({ type: 'agent_message', data });
      });

      expect(result.current.agentMessages).toHaveLength(1);
      expect(result.current.lastAgentMessage?.kind).toBe('agent_message');
      expect(result.current.lastAgentMessage?.messageId).toBe('msg-1');
    });

    it('receives agent_question events from SW with narrowed kind', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const data = {
        kind: 'agent_question' as const,
        questionId: 'q-1',
        appId: 'app-1',
        agentRunId: 'run-1',
        questionKind: 'blocking',
        answerer: 'user',
        status: 'pending',
        prompt: 'Approve?',
        transition: 'new' as const,
        createdAt: '2026-04-28T10:00:00Z',
      };
      act(() => {
        simulateSWMessage({ type: 'agent_question', data });
      });

      expect(result.current.agentQuestions).toHaveLength(1);
      expect(result.current.lastAgentQuestion?.kind).toBe('agent_question');
      expect(result.current.lastAgentQuestion?.questionId).toBe('q-1');
    });

    it('receives supervisor_decision events from SW with narrowed kind', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const data = {
        kind: 'supervisor_decision' as const,
        decisionId: 'dec-1',
        appId: 'app-1',
        supervisorRunId: 'sup-1',
        sourceEventKind: 'gate',
        sourceEventId: 'run-1',
        verdict: 'advise',
        rationale: 'looks good',
        modelId: 'claude-sonnet',
        promptVersion: 'v1',
        createdAt: '2026-04-28T10:00:00Z',
      };
      act(() => {
        simulateSWMessage({ type: 'supervisor_decision', data });
      });

      expect(result.current.supervisorDecisions).toHaveLength(1);
      expect(result.current.lastSupervisorDecision?.kind).toBe('supervisor_decision');
      expect(result.current.lastSupervisorDecision?.verdict).toBe('advise');
    });

    it('ignores messages with invalid shape', async () => {
      const { result } = renderHook(() => useAgentEvents());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        simulateSWMessage(null);
        simulateSWMessage('garbage');
        simulateSWMessage({ type: 'unknown' });
      });

      expect(result.current.events).toHaveLength(0);
      expect(result.current.lastEvent).toBeNull();
    });
  });

  describe('EventSource fallback', () => {
    beforeEach(() => {
      // Remove serviceWorker to trigger fallback
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('falls back to direct EventSource when SW not available', () => {
      renderHook(() => useAgentEvents());

      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe('/api/agent-events');
    });

    it('receives events via direct EventSource', () => {
      const { result } = renderHook(() => useAgentEvents());
      const event = createSampleEvent();

      act(() => {
        MockEventSource.instances[0].simulateOpen();
        MockEventSource.instances[0].simulateEvent('notification', JSON.stringify(event));
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.lastEvent).toEqual(event);
    });

    it('EventSource is closed on unmount', () => {
      const { unmount } = renderHook(() => useAgentEvents());
      const es = MockEventSource.instances[0];

      unmount();

      expect(es.close).toHaveBeenCalled();
    });

    it('reconnects with exponential backoff on error', async () => {
      renderHook(() => useAgentEvents());

      act(() => {
        MockEventSource.instances[0].simulateError();
      });
      expect(MockEventSource.instances).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockEventSource.instances).toHaveLength(2);

      act(() => {
        MockEventSource.instances[1].simulateError();
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(MockEventSource.instances).toHaveLength(3);
    });

    it('reconnects when no heartbeat received within timeout', async () => {
      const { result } = renderHook(() => useAgentEvents());
      const es1 = MockEventSource.instances[0];

      act(() => {
        es1.simulateOpen();
      });
      expect(result.current.connectionStatus).toBe('connected');

      // Advance time by 60 seconds (heartbeat timeout)
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      // The watchdog closes the dead stream immediately...
      expect(es1.close).toHaveBeenCalled();
      expect(result.current.connectionStatus).toBe('disconnected');

      // ...but the replacement is scheduled through the normal backoff delay.
      act(() => {
        vi.advanceTimersByTime(BASE_BACKOFF_MS);
      });
      expect(MockEventSource.instances).toHaveLength(2);
    });

    it('resets heartbeat timeout when event received', async () => {
      const { result } = renderHook(() => useAgentEvents());
      const es1 = MockEventSource.instances[0];
      const event = createSampleEvent();

      act(() => {
        es1.simulateOpen();
      });

      // Receive an event at 30 seconds
      act(() => {
        vi.advanceTimersByTime(30_000);
        es1.simulateEvent('notification', JSON.stringify(event));
      });

      // The event must actually land — that delivery is what resets the watchdog.
      expect(result.current.events).toHaveLength(1);

      // Advance to 90 seconds total (60 from the event at 30)
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      // Verify ES was closed (no more events for 60s after the event at 30s)
      expect(es1.close).toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(BASE_BACKOFF_MS);
      });
      expect(MockEventSource.instances).toHaveLength(2);
    });

    it('resets heartbeat timeout on every event type', async () => {
      const { result } = renderHook(() => useAgentEvents());
      const es1 = MockEventSource.instances[0];

      act(() => {
        es1.simulateOpen();
      });

      // Send agent_message at 20s
      act(() => {
        vi.advanceTimersByTime(20_000);
        es1.simulateEvent(
          'agent_message',
          JSON.stringify({
            kind: 'agent_message',
            messageId: 'msg-1',
            featureId: 'feat-1',
          })
        );
      });

      // Send agent_question at 50s (30s after previous event)
      act(() => {
        vi.advanceTimersByTime(30_000);
        es1.simulateEvent(
          'agent_question',
          JSON.stringify({
            kind: 'agent_question',
            questionId: 'q-1',
            featureId: 'feat-1',
          })
        );
      });

      // Just under 60s since the last event (t=109_999) — still connected.
      act(() => {
        vi.advanceTimersByTime(59_999);
      });
      expect(result.current.connectionStatus).toBe('connected');

      // Crossing the 60s deadline fires the watchdog, then backoff reconnects.
      act(() => {
        vi.advanceTimersByTime(1 + BASE_BACKOFF_MS);
      });
      expect(es1.close).toHaveBeenCalled();
      expect(MockEventSource.instances).toHaveLength(2);
    });
  });
});
