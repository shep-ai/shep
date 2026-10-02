/**
 * Behavioural tests for the chat runtime's two failure paths that used to
 * strand the user (and the agent):
 *
 *  1. Answering an agent question (`respondToInteraction`) cleared the card
 *     BEFORE the POST and only `console.error`d a failure — the card was gone,
 *     the user believed they had answered, and the agent stayed blocked.
 *  2. A failed send rolled the optimistic bubble back silently, after the
 *     composer had already been cleared — the message vanished as if never
 *     typed.
 *  3. The composer's stop button only cleared local streaming state; the
 *     agent kept running. It must hit the real stop endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import { useChatRuntime, type InteractionData } from '@/components/features/chat/useChatRuntime';

const FEATURE_ID = 'feature-1';

// ── SSE mock that lets a test push server events into the hook ──────────────

type SseListener = (event: MessageEvent) => void;
let sseListeners: Map<string, Set<SseListener>>;

class CapturingEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {}
  addEventListener(type: string, cb: SseListener) {
    const set = sseListeners.get(type) ?? new Set<SseListener>();
    set.add(cb);
    sseListeners.set(type, set);
  }
  removeEventListener(type: string, cb: SseListener) {
    sseListeners.get(type)?.delete(cb);
  }
}

function emitSse(type: string, payload: unknown) {
  act(() => {
    for (const cb of sseListeners.get(type) ?? []) {
      cb({ data: JSON.stringify(payload) } as MessageEvent);
    }
  });
}

// ── fetch mock ──────────────────────────────────────────────────────────────

interface RouteResult {
  ok: boolean;
  status: number;
  body?: unknown;
}

let routes: {
  respond: RouteResult;
  send: RouteResult;
  stop: RouteResult;
};
let fetchCalls: { url: string; method: string; body?: string }[];
let sendRejects: boolean;
let respondRejects: boolean;

function makeResponse(result: RouteResult) {
  return {
    ok: result.ok,
    status: result.status,
    json: async () => result.body ?? {},
    text: async () => JSON.stringify(result.body ?? {}),
  } as Response;
}

const interaction: InteractionData = {
  toolCallId: 'tool-call-1',
  questions: [
    {
      question: 'Which database should I use?',
      header: 'Database',
      options: [
        { label: 'Postgres', description: 'Relational' },
        { label: 'SQLite', description: 'Embedded' },
      ],
      multiSelect: false,
    },
  ],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function renderChatRuntime() {
  return renderHook(
    () =>
      useChatRuntime(FEATURE_ID, '/tmp/worktree', {
        initialChatState: {
          messages: [],
          sessionStatus: 'ready',
          streamingText: null,
          sessionInfo: null,
        } as never,
      }),
    { wrapper }
  );
}

beforeEach(() => {
  sseListeners = new Map();
  fetchCalls = [];
  sendRejects = false;
  respondRejects = false;
  routes = {
    respond: { ok: true, status: 200 },
    send: { ok: true, status: 200, body: { message: { id: 'm1' } } },
    stop: { ok: true, status: 200 },
  };
  vi.mocked(toast.error).mockClear();

  globalThis.EventSource = CapturingEventSource as unknown as typeof EventSource;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    fetchCalls.push({ url, method, body: init?.body as string | undefined });

    if (url.endsWith('/respond')) {
      if (respondRejects) throw new TypeError('Failed to fetch');
      return makeResponse(routes.respond);
    }
    if (url.endsWith('/stop')) return makeResponse(routes.stop);
    if (url.endsWith('/messages') && method === 'POST') {
      if (sendRejects) throw new TypeError('Failed to fetch');
      return makeResponse(routes.send);
    }
    return makeResponse({
      ok: true,
      status: 200,
      body: { messages: [], sessionStatus: 'ready', streamingText: null, sessionInfo: null },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useChatRuntime — respondToInteraction (agent question)', () => {
  it('clears the pending interaction once the POST succeeds', async () => {
    const { result } = renderChatRuntime();
    emitSse('interaction', { interaction });
    expect(result.current.pendingInteraction).toEqual(interaction);

    await act(async () => {
      await result.current.respondToInteraction({ Database: 'Postgres' });
    });

    expect(result.current.pendingInteraction).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(fetchCalls.some((c) => c.url.endsWith('/respond') && c.method === 'POST')).toBe(true);
  });

  it('restores the question card and toasts when the POST is rejected by the server', async () => {
    routes.respond = { ok: false, status: 500 };
    const { result } = renderChatRuntime();
    emitSse('interaction', { interaction });

    await act(async () => {
      await result.current.respondToInteraction({ Database: 'Postgres' });
    });

    // The agent is still blocked — the user MUST be able to answer again.
    expect(result.current.pendingInteraction).toEqual(interaction);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('restores the question card and toasts when the network throws', async () => {
    respondRejects = true;
    const { result } = renderChatRuntime();
    emitSse('interaction', { interaction });

    await act(async () => {
      await result.current.respondToInteraction({ Database: 'SQLite' });
    });

    expect(result.current.pendingInteraction).toEqual(interaction);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('offers a retry affordance that re-sends the same answers', async () => {
    routes.respond = { ok: false, status: 503 };
    const { result } = renderChatRuntime();
    emitSse('interaction', { interaction });

    await act(async () => {
      await result.current.respondToInteraction({ Database: 'Postgres' });
    });

    const options = vi.mocked(toast.error).mock.calls[0][1] as
      | { action?: { label: string; onClick: () => void } }
      | undefined;
    expect(options?.action?.label).toBeTruthy();

    routes.respond = { ok: true, status: 200 };
    const before = fetchCalls.filter((c) => c.url.endsWith('/respond')).length;
    await act(async () => {
      options!.action!.onClick();
      await Promise.resolve();
    });

    await waitFor(() => {
      const after = fetchCalls.filter((c) => c.url.endsWith('/respond'));
      expect(after.length).toBe(before + 1);
      expect(after[after.length - 1].body).toContain('Postgres');
    });
    await waitFor(() => expect(result.current.pendingInteraction).toBeNull());
  });
});

describe('useChatRuntime — failed send', () => {
  it('toasts and rolls the optimistic bubble back when the send fails', async () => {
    routes.send = { ok: false, status: 500 };
    const { result } = renderChatRuntime();

    act(() => {
      result.current.runtime.thread.append('deploy the app');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.rawMessages).toHaveLength(0));
  });

  it('gives the text back through a retry affordance that resends it', async () => {
    routes.send = { ok: false, status: 500 };
    const { result } = renderChatRuntime();

    act(() => {
      result.current.runtime.thread.append('deploy the app');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

    const options = vi.mocked(toast.error).mock.calls[0][1] as
      | { action?: { label: string; onClick: () => void } }
      | undefined;
    expect(options?.action?.label).toBeTruthy();

    routes.send = { ok: true, status: 200, body: { message: { id: 'm1' } } };
    const before = fetchCalls.filter(
      (c) => c.url.endsWith('/messages') && c.method === 'POST'
    ).length;

    act(() => {
      options!.action!.onClick();
    });

    await waitFor(() => {
      const after = fetchCalls.filter((c) => c.url.endsWith('/messages') && c.method === 'POST');
      expect(after.length).toBe(before + 1);
      expect(after[after.length - 1].body).toContain('deploy the app');
    });
  });

  // Resending cannot succeed while the agent has no interactive mode, so the
  // toast explains why (in the server's words) and points at Settings instead
  // of offering a retry.
  it('explains an agent without chat support and offers Settings instead of a retry', async () => {
    const serverMessage =
      'Gemini CLI does not support chat sessions yet. Choose an agent that does in Settings, then send your message again.';
    routes.send = {
      ok: false,
      status: 422,
      body: { error: serverMessage, code: 'INTERACTIVE_AGENT_UNSUPPORTED' },
    };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    try {
      const { result } = renderChatRuntime();

      act(() => {
        result.current.runtime.thread.append('build it');
      });
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

      const [title, options] = vi.mocked(toast.error).mock.calls[0] as [
        string,
        { description?: string; action?: { label: string; onClick: () => void } },
      ];
      expect(title).toBe('Chat unavailable for this agent');
      expect(options.description).toBe(serverMessage);
      expect(options.action?.label).toBe('Open Settings');

      options.action!.onClick();
      expect(assign).toHaveBeenCalledWith('/settings');
      await waitFor(() => expect(result.current.rawMessages).toHaveLength(0));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the retry affordance for other rejected sends', async () => {
    routes.send = {
      ok: false,
      status: 429,
      body: { error: 'Cannot start a new session', code: 'CONCURRENT_SESSION_LIMIT' },
    };
    const { result } = renderChatRuntime();

    act(() => {
      result.current.runtime.thread.append('deploy the app');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

    const options = vi.mocked(toast.error).mock.calls[0][1] as {
      action?: { label: string };
    };
    expect(options.action?.label).toBe('Retry');
  });

  it('does not toast when the send succeeds', async () => {
    const { result } = renderChatRuntime();

    act(() => {
      result.current.runtime.thread.append('all good');
    });

    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.endsWith('/messages') && c.method === 'POST')).toBe(true)
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('useChatRuntime — session fails to start', () => {
  // A boot failure (agent not logged in, CLI missing, …) never produces a
  // turn, so the reason carried with the error status is the only thing that
  // can tell the user what went wrong.
  it('shows the reason when the session reports an error', async () => {
    renderChatRuntime();
    await waitFor(() => expect(sseListeners.get('session_status')?.size).toBeGreaterThan(0));

    emitSse('session_status', {
      sessionStatus: 'error',
      sessionError: 'cursor-agent is not logged in. Run `cursor-agent login`, then try again.',
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Chat session failed to start', {
        description: 'cursor-agent is not logged in. Run `cursor-agent login`, then try again.',
      })
    );
  });

  it('does not toast for an error status without a reason', async () => {
    renderChatRuntime();
    await waitFor(() => expect(sseListeners.get('session_status')?.size).toBeGreaterThan(0));

    emitSse('session_status', { sessionStatus: 'error' });

    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('useChatRuntime — stopping the agent', () => {
  it('cancelling a run hits the real stop endpoint, not just local state', async () => {
    const { result } = renderChatRuntime();

    await act(async () => {
      await result.current.stopAgent();
    });

    expect(
      fetchCalls.some((c) => c.url.endsWith(`/chat/${FEATURE_ID}/stop`) && c.method === 'POST')
    ).toBe(true);
  });

  it('the assistant-ui cancel path calls the stop endpoint', async () => {
    const { result } = renderChatRuntime();

    // Put the thread into a running state so `cancelRun` is allowed.
    emitSse('delta', { delta: 'thinking…' });

    await act(async () => {
      result.current.runtime.thread.cancelRun();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        fetchCalls.some((c) => c.url.endsWith(`/chat/${FEATURE_ID}/stop`) && c.method === 'POST')
      ).toBe(true)
    );
  });

  it('toasts when the stop request fails and does not throw at the caller', async () => {
    routes.stop = { ok: false, status: 500 };
    const { result } = renderChatRuntime();

    await act(async () => {
      await result.current.stopAgent();
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('reports the in-flight stop state', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/stop')) {
        await gate;
      }
      return (baseFetch as typeof fetch)(input, init);
    }) as unknown as typeof fetch;

    const { result } = renderChatRuntime();
    expect(result.current.isStopping).toBe(false);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.stopAgent();
    });
    await waitFor(() => expect(result.current.isStopping).toBe(true));

    await act(async () => {
      release?.();
      await pending!;
    });
    await waitFor(() => expect(result.current.isStopping).toBe(false));
  });
});
