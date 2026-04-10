'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ThreadMessageLike, AppendMessage } from '@assistant-ui/react';
import { useExternalStoreRuntime } from '@assistant-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InteractiveMessage, WorkflowStep } from '@shepai/core/domain/generated/output';
import { InteractiveMessageRole } from '@shepai/core/domain/generated/output';

/** Shape matching UserInteractionData from the agent executor interface. */
export interface InteractionData {
  toolCallId: string;
  questions: {
    question: string;
    header: string;
    options: { label: string; description: string; preview?: string }[];
    multiSelect: boolean;
  }[];
}

/** Chat state returned by the backend — matches ChatState from service interface */
interface ChatState {
  messages: InteractiveMessage[];
  sessionStatus: string | null;
  streamingText: string | null;
  sessionInfo: SessionInfo | null;
  turnStatus?: string;
  pendingInteraction?: InteractionData | null;
  workflow?: WorkflowView | null;
}

/** Workflow view shape — mirrors the core port. */
export interface WorkflowView {
  workflowId: string;
  steps: WorkflowStep[];
  currentStepId: string | null;
}

/** Step view consumed by `StepTracker`. */
export interface EnhancedStepState {
  definition: {
    id: string;
    stepKey: string;
    title: string;
    description: string;
  };
  status: 'pending' | 'running' | 'done' | 'failed' | 'interrupted';
  metadata: Record<string, unknown> | null;
  toolMessages: InteractiveMessage[];
}

/** Enhanced progress consumed by `StepTracker` + `ChatTab`. */
export interface EnhancedStepProgress {
  hasPlan: boolean;
  steps: EnhancedStepState[];
  activeStepId: string | null;
  allDone: boolean;
  /**
   * Short live-status string ("Thinking…", "Reading file X", a chunk
   * of the agent's streaming reply) that the running step card shows
   * inline next to its spinner. NEVER rendered as a flat bubble — the
   * step tracker is the only allowed surface for in-progress activity
   * while a workflow is active.
   */
  liveStatus: string | null;
}

function mapStatus(s: string): EnhancedStepState['status'] {
  switch (s) {
    case 'pending':
    case 'running':
    case 'done':
    case 'failed':
    case 'interrupted':
      return s;
    default:
      return 'pending';
  }
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

interface SessionInfo {
  pid: number | null;
  sessionId: string | null;
  model: string | null;
  startedAt: string;
  lastActivityAt: string;
  totalCostUsd: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
}

// ── API helpers ─────────────────────────────────────────────────────────────

// Shared query key + fetcher live in chat-state-query so the top bar
// can subscribe to the SAME cached entry as this hook. Single source
// of truth, one SSE stream updates every consumer.
import { chatQueryKey, fetchChatState } from './chat-state-query';

async function postMessage(
  featureId: string,
  content: string,
  worktreePath: string,
  model?: string,
  agentType?: string
): Promise<InteractiveMessage> {
  const res = await fetch(`/api/interactive/chat/${featureId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, worktreePath, model, agentType }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  const data = (await res.json()) as { message: InteractiveMessage };
  return data.message;
}

// ── Convert domain message to assistant-ui format ───────────────────────────

function toThreadMessage(msg: InteractiveMessage): ThreadMessageLike {
  return {
    id: msg.id,
    role: msg.role === InteractiveMessageRole.user ? 'user' : 'assistant',
    content: [{ type: 'text', text: msg.content }],
    createdAt: msg.createdAt ? new Date(msg.createdAt as unknown as string) : undefined,
  };
}

// ── Status info for the typing indicator ────────────────────────────────────

export interface ChatStatus {
  /** Whether the agent is actively working (booting, thinking, streaming). */
  isRunning: boolean;
  /** Human-readable status text (e.g. "Agent is waking up...", "Using tool: Read"). */
  statusText: string | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface ChatRuntimeOptions {
  /** Transform message content before sending (e.g. append attachment refs). */
  contentTransform?: (content: string) => string;
  /** Called after a message is successfully sent (e.g. clear attachments). */
  onMessageSent?: () => void;
  /** Override model for new sessions (e.g. 'claude-sonnet-4-6'). */
  model?: string;
  /** Override agent type for new sessions (e.g. 'claude-code'). */
  agentType?: string;
  /** When true, inject debug bubbles showing SSE events, session info, etc. */
  debugMode?: boolean;
  /**
   * Optional SSR-loaded chat state used as the TanStack Query `initialData`.
   * When provided the hook renders immediately with those messages and the
   * background refetch only confirms / updates them.
   */
  initialChatState?: ChatState;
}

/** A debug event captured from SSE for display in debug mode. */
export interface DebugEvent {
  id: string;
  timestamp: Date;
  label: string;
  detail?: string;
}

/**
 * `featureId` is a polymorphic scope key: a feature UUID, "repo-<id>", or "global".
 * All API calls and SSE subscriptions are scoped to this key.
 */
export function useChatRuntime(
  featureId: string,
  worktreePath?: string,
  options?: ChatRuntimeOptions
) {
  const queryClient = useQueryClient();

  // Keep a ref to the latest model/agent so the mutation closure always
  // reads the current value without depending on stale captures.
  const modelRef = useRef(options?.model);
  const agentTypeRef = useRef(options?.agentType);
  modelRef.current = options?.model;
  agentTypeRef.current = options?.agentType;

  // ── Debug events (dev mode only) ────────────────────────────────────────
  const debugModeRef = useRef(options?.debugMode ?? false);
  debugModeRef.current = options?.debugMode ?? false;
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  const pushDebug = useCallback((label: string, detail?: string) => {
    if (!debugModeRef.current) return;
    setDebugEvents((prev) => [
      ...prev,
      { id: `dbg-${Date.now()}-${Math.random()}`, timestamp: new Date(), label, detail },
    ]);
  }, []);

  // ── TanStack Query: initial fetch only ─────────────────────────────────
  //
  // NO periodic polling. The chat state is event-driven:
  //   - Initial state comes from `initialData` (SSR) or the one-shot
  //     queryFn call on mount.
  //   - All subsequent updates are pushed via the SSE stream effect
  //     below, which mutates the cache directly (message / session_status
  //     / turn_status events).
  //   - On SSE reconnect, the `open` listener invalidates this query
  //     once, forcing a fresh fetch to catch any missed events.
  //
  // This replaces the old 3s `refetchInterval` — no more bandwidth
  // burning and no more stale-UI windows. Robustness comes from
  // reconnect-fetch + idempotent cache merges by message id.
  const { data: chatState, isLoading: isChatLoading } = useQuery({
    queryKey: chatQueryKey(featureId),
    queryFn: () => fetchChatState(featureId),
    initialData: options?.initialChatState,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Auto-mark as read when chat tab is open and turn status is 'unread'
  useEffect(() => {
    if (chatState?.turnStatus === 'unread') {
      void fetch(`/api/interactive/chat/${featureId}/mark-read`, { method: 'POST' });
    }
  }, [chatState?.turnStatus, featureId]);

  const messages = useMemo(() => chatState?.messages ?? [], [chatState?.messages]);
  const sessionStatus = chatState?.sessionStatus ?? null;

  // Track session status changes for debug
  const prevSessionStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionStatus && sessionStatus !== prevSessionStatusRef.current) {
      const info = chatState?.sessionInfo;
      const detail = info
        ? `model=${info.model ?? '?'}, sid=${info.sessionId?.slice(0, 8) ?? '?'}`
        : undefined;
      pushDebug(`session_${sessionStatus}`, detail);
    }
    prevSessionStatusRef.current = sessionStatus;
  }, [sessionStatus, chatState?.sessionInfo, pushDebug]);
  const backendStreamingText = chatState?.streamingText ?? null;

  // Cache last known sessionInfo so PID stays visible after process exits
  const lastSessionInfoRef = useRef<ChatState['sessionInfo']>(null);
  if (chatState?.sessionInfo) {
    lastSessionInfoRef.current = chatState.sessionInfo;
  }
  const sessionInfo = chatState?.sessionInfo ?? lastSessionInfoRef.current;

  // ── SSE: real-time streaming deltas ─────────────────────────────────────

  const [streamingText, setStreamingText] = useState('');
  const [statusLog, setStatusLog] = useState<string | null>(null);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Interaction state (AskUserQuestion) ─────────────────────────────
  const [pendingInteraction, setPendingInteraction] = useState<InteractionData | null>(null);

  // Sync pending interaction from backend polling (fallback for missed SSE)
  useEffect(() => {
    const backendInteraction = chatState?.pendingInteraction ?? null;
    if (backendInteraction) {
      setPendingInteraction(backendInteraction);
    } else if (!backendInteraction && pendingInteraction) {
      // Backend cleared it (e.g. agent continued) — clear local state
      setPendingInteraction(null);
    }
  }, [chatState?.pendingInteraction, pendingInteraction]);

  // Delayed awaiting — only show Thinking bubble after 600ms to avoid flash
  const startAwaiting = useCallback(() => {
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    awaitingTimerRef.current = setTimeout(() => setAwaitingResponse(true), 600);
  }, []);
  const cancelAwaiting = useCallback(() => {
    if (awaitingTimerRef.current) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
    setAwaitingResponse(false);
  }, []);

  // Clear awaitingResponse when backend delivers a new assistant message
  const lastMsgRole = messages.length > 0 ? messages[messages.length - 1].role : null;
  useEffect(() => {
    if (lastMsgRole === InteractiveMessageRole.assistant) {
      cancelAwaiting();
    }
  }, [lastMsgRole, messages.length, cancelAwaiting]);

  useEffect(() => {
    const es = new EventSource(`/api/interactive/chat/${featureId}/stream`);
    eventSourceRef.current = es;

    /**
     * Idempotent cache mutation helpers — called from SSE handlers.
     * These must never throw on missing state because the cache may be
     * mid-hydration when the first event lands. All updates are
     * position/id-based so duplicate events across reconnects are
     * harmless.
     */
    const mergeMessage = (msg: InteractiveMessage) => {
      queryClient.setQueryData<ChatState>(chatQueryKey(featureId), (old) => {
        const base = old ?? {
          messages: [],
          sessionStatus: null,
          streamingText: null,
          sessionInfo: null,
        };
        // Skip if we already have this message (dedupe by id). Also drop
        // any optimistic entry with the same content — the server copy
        // replaces it.
        const existing = base.messages.find((m) => m.id === msg.id);
        if (existing) return base;
        const withoutOptimistic = base.messages.filter(
          (m) =>
            !(m.id.startsWith('optimistic-') && m.role === msg.role && m.content === msg.content)
        );
        return { ...base, messages: [...withoutOptimistic, msg] };
      });
    };

    const mergeSessionStatus = (status: string) => {
      queryClient.setQueryData<ChatState>(chatQueryKey(featureId), (old) => {
        if (!old) return old;
        return { ...old, sessionStatus: status };
      });
    };

    const mergeTurnStatus = (turnStatus: string) => {
      queryClient.setQueryData<ChatState>(chatQueryKey(featureId), (old) => {
        if (!old) return old;
        return { ...old, turnStatus };
      });
    };

    es.addEventListener('delta', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { delta: string };
        if (data.delta) {
          cancelAwaiting();
          setStreamingText((prev) => prev + data.delta);
          setStatusLog(null);
        }
      } catch {
        // Ignore
      }
    });

    es.addEventListener('activity', (event: MessageEvent) => {
      cancelAwaiting();
      try {
        const data = JSON.parse(event.data as string) as {
          activity?: { kind: string; label: string; detail?: string };
        };
        if (data.activity) {
          pushDebug(`[${data.activity.kind}] ${data.activity.label}`, data.activity.detail);
        }
      } catch {
        // Ignore
      }
      // The matching `message` event (emitted by the service alongside
      // the activity when a tool message is persisted) handles the
      // cache update — no refetch needed here.
    });

    es.addEventListener('log', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { log: string };
        if (data.log) {
          cancelAwaiting();
          setStatusLog(data.log);
          pushDebug('log', data.log);
        }
      } catch {
        // Ignore
      }
    });

    es.addEventListener('interaction', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { interaction: InteractionData };
        if (data.interaction) {
          cancelAwaiting();
          setPendingInteraction(data.interaction);
        }
      } catch {
        // Ignore
      }
    });

    es.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { message: InteractiveMessage };
        if (data.message) {
          mergeMessage(data.message);
          // When an assistant message arrives, the "Thinking…" bubble
          // should fall away.
          if (data.message.role === InteractiveMessageRole.assistant) {
            cancelAwaiting();
          }
        }
      } catch {
        // Ignore
      }
    });

    es.addEventListener('session_status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { sessionStatus: string };
        if (data.sessionStatus) mergeSessionStatus(data.sessionStatus);
      } catch {
        // Ignore
      }
    });

    es.addEventListener('turn_status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { turnStatus: string };
        if (data.turnStatus) mergeTurnStatus(data.turnStatus);
      } catch {
        // Ignore
      }
    });

    es.addEventListener('workflow_step', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { step: WorkflowStep };
        if (!data.step) return;
        queryClient.setQueryData<ChatState>(chatQueryKey(featureId), (old) => {
          if (!old) return old;
          const existing = old.workflow;
          const idx = existing?.steps.findIndex((s) => s.id === data.step.id) ?? -1;
          let nextSteps: WorkflowStep[];
          if (!existing || idx === -1) {
            // New step row — append and re-sort by stepIndex.
            nextSteps = [...(existing?.steps ?? []), data.step].sort(
              (a, b) => a.stepIndex - b.stepIndex
            );
          } else {
            nextSteps = existing.steps.slice();
            nextSteps[idx] = data.step;
          }
          const running = nextSteps.find((s) => s.status === 'running');
          return {
            ...old,
            workflow: {
              workflowId: data.step.workflowId,
              steps: nextSteps,
              currentStepId: running?.id ?? null,
            },
          };
        });
      } catch {
        // Ignore
      }
    });

    es.addEventListener('done', () => {
      setStatusLog(null);
      cancelAwaiting();
      pushDebug('turn_done');
      // Agent turn completed — clear any lingering interaction state
      setPendingInteraction(null);
      // Streaming text is superseded by the persisted assistant `message`
      // event that fires alongside `done`. Clear our local buffer.
      setStreamingText('');
    });

    // Robustness: after any successful (re)connect, refetch the chat
    // state ONCE to catch any events that may have been missed while
    // the connection was down. The browser's EventSource auto-reconnects
    // on drops; this handler fires on every successful open including
    // post-error re-opens.
    es.addEventListener('open', () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(featureId) });
    });

    es.onerror = () => {
      // Browser auto-reconnects. The `open` listener above will refetch
      // state on recovery. Nothing to do here.
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [featureId, queryClient, cancelAwaiting, pushDebug]);

  // ── Mutation: send user message ─────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      postMessage(featureId, content, worktreePath ?? '', modelRef.current, agentTypeRef.current),
    onMutate: async (content: string) => {
      pushDebug(
        'send_message',
        `model=${modelRef.current ?? 'default'}, agent=${agentTypeRef.current ?? 'default'}, len=${content.length}`
      );
      startAwaiting();
      // Cancel in-flight refetches so our optimistic update isn't overwritten
      await queryClient.cancelQueries({ queryKey: chatQueryKey(featureId) });

      const previous = queryClient.getQueryData<ChatState>(chatQueryKey(featureId));

      // Optimistically add user message. CRITICAL: spread `old` first
      // and only override `messages` (and clear `streamingText`). The
      // earlier version rebuilt the object field-by-field and silently
      // dropped `workflow` + `turnStatus`, which made `hasPlan` flip
      // to false for one render, briefly expanding the workflow step
      // tracker (it lost its `collapsedSummary` flag when allDone
      // turned undefined) before the next refetch reinstated it. The
      // user saw a flicker of the full step list every time they typed
      // a follow-up message after the workflow finished.
      queryClient.setQueryData<ChatState>(chatQueryKey(featureId), (old) => ({
        ...(old ?? { sessionStatus: 'booting', sessionInfo: null }),
        messages: [
          ...(old?.messages ?? []),
          {
            id: `optimistic-${Date.now()}`,
            featureId,
            role: InteractiveMessageRole.user,
            content,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        streamingText: null,
      }));

      return { previous };
    },
    onError: (_err, _content, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(chatQueryKey(featureId), context.previous);
      }
    },
    onSettled: () => {
      // Refetch to reconcile optimistic data with server
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(featureId) });
    },
  });

  // ── Derive running state ────────────────────────────────────────────────
  // Note: sendMutation.isPending is excluded — the 600ms awaitingResponse
  // timer provides a smooth transition without flicker.
  //
  // `turnStatus === 'processing'` is critical for surfaces that post the
  // first user message server-side (e.g. Application chat, where
  // createApplication sends the kickoff via SendInteractiveMessageUseCase
  // before the user ever lands on the page). In those flows the client
  // never calls sendMutation, so `awaitingResponse` is never set and
  // `sessionStatus` might already be 'ready' by the time the UI hydrates,
  // leaving a dead zone with no indicator while the agent is actively
  // working. Reading turnStatus from the backend closes that gap.
  const backendTurnStatus = chatState?.turnStatus;
  const isRunning =
    awaitingResponse ||
    !!streamingText ||
    !!statusLog ||
    sessionStatus === 'booting' ||
    backendTurnStatus === 'processing';

  // ── Build thread messages for assistant-ui ─────────────────────────────
  const activeStreamText = streamingText ?? backendStreamingText ?? '';

  // ── Step-tracker state — driven ENTIRELY by server-side workflow
  //    rows. No text parsing. On a refresh, `chatState.workflow` is
  //    re-read from SQLite by the backend so status is always the
  //    truth. Messages are grouped by `stepId` (also server-written).
  const stepProgress: EnhancedStepProgress = useMemo(() => {
    const workflow = chatState?.workflow ?? null;
    if (!workflow || workflow.steps.length === 0) {
      return {
        hasPlan: false,
        steps: [],
        activeStepId: null,
        allDone: false,
        liveStatus: null,
      };
    }
    // Group messages by their persisted stepId. Only assistant messages
    // are surfaced in the tracker — the orchestrator persists each step's
    // prompt as a `user`-role row with the step's id (RunWorkflowUseCase
    // step 2+) and that row is an internal orchestration detail, not
    // something the user typed or the agent produced. Including it would
    // inflate every step's badge count by 1 and dump the raw prompt into
    // the expanded body.
    const byStep = new Map<string, InteractiveMessage[]>();
    for (const m of messages) {
      const sid = m.stepId;
      if (!sid) continue;
      if (m.role !== InteractiveMessageRole.assistant) continue;
      const list = byStep.get(sid) ?? [];
      list.push(m);
      byStep.set(sid, list);
    }
    const steps: EnhancedStepState[] = workflow.steps.map((s) => ({
      definition: {
        id: s.id,
        stepKey: s.stepKey,
        title: s.title,
        description: s.description,
      },
      status: mapStatus(s.status),
      metadata: parseMetadata(s.metadata),
      toolMessages: byStep.get(s.id) ?? [],
    }));
    const allDone = steps.length > 0 && steps.every((s) => s.status === 'done');
    // Live status string for the running step card. Order of fallback
    // mirrors the old flat-thread streaming bubble: tool / status log
    // first (most informative — "Reading file X"), then a short prefix
    // of the streaming reply text, then the generic "Thinking…" while
    // we wait for the first chunk. Truncated to one line so it fits
    // inline next to the spinner.
    const trimmedStream = backendStreamingText?.trim() ?? '';
    const trimmedLocal = streamingText?.trim() ?? '';
    const streamPreview = (trimmedLocal || trimmedStream).split('\n')[0]?.slice(0, 80) ?? '';
    let liveStatus: string | null = null;
    if (allDone) {
      liveStatus = null;
    } else if (statusLog) {
      liveStatus = statusLog;
    } else if (streamPreview) {
      liveStatus = streamPreview;
    } else if (
      backendTurnStatus === 'processing' ||
      awaitingResponse ||
      sessionStatus === 'booting'
    ) {
      liveStatus = sessionStatus === 'booting' ? 'Waking up…' : 'Thinking…';
    }
    return {
      hasPlan: true,
      steps,
      activeStepId: workflow.currentStepId,
      allDone,
      liveStatus,
    };
  }, [
    chatState?.workflow,
    messages,
    statusLog,
    streamingText,
    backendStreamingText,
    backendTurnStatus,
    awaitingResponse,
    sessionStatus,
  ]);

  // ── Initial request — the VERY first stepless user message.
  //    The application-creation flow persists it via the
  //    orchestrator's first `sendMessage.execute` BEFORE
  //    `setActiveStep` is called, so it has no `stepId`. We pull
  //    it out of the flat thread and hand it to the host page, so
  //    the layout can render it ABOVE the step tracker — matching
  //    the mental model "user asked X, Shep built it, then we
  //    kept chatting".
  const initialRequestMessage = useMemo<InteractiveMessage | null>(() => {
    if (!stepProgress.hasPlan) return null;
    const first = messages.find((m) => m.role === InteractiveMessageRole.user && !m.stepId);
    return first ?? null;
  }, [stepProgress.hasPlan, messages]);

  const threadMessages: ThreadMessageLike[] = useMemo(() => {
    const hasPlan = stepProgress.hasPlan;

    // When a workflow is active and STILL RUNNING: hide stepless
    // assistant messages from the flat thread. These exist because of
    // a small race window in the orchestrator — the agent can start
    // streaming and persist a chunk before `setActiveStep` is called,
    // leaving an assistant row with no stepId that would otherwise
    // render as a stray bubble below the tracker. While the workflow
    // is running, the running step's own card is the only legal
    // surface for in-progress agent output.
    //
    // Once the workflow is DONE (`allDone`), the orchestrator has
    // called its final `clearActiveStep`. From this point on, every
    // new assistant message is a legitimate follow-up reply to a
    // user-typed prompt, and MUST be visible in the flat thread —
    // otherwise the chat appears to ignore the user. The previous
    // version of this filter dropped them too and that's what looked
    // like "agent is ignoring me" after the build completed.
    //
    // The user's very first message (`initialRequestMessage`) is
    // always filtered out — the host page pins it above the tracker
    // via `<InitialRequestBubble>` so leaving it in the flat thread
    // would duplicate it.
    const workflowRunning = hasPlan && !stepProgress.allDone;
    const sourceMessages = hasPlan
      ? messages.filter((m) => {
          if (m.id === initialRequestMessage?.id) return false;
          if (m.stepId) return false; // step-tagged messages live inside their card
          if (workflowRunning && m.role === InteractiveMessageRole.assistant) {
            // Race-window leftover — see comment above.
            return false;
          }
          return true;
        })
      : messages;

    const chatMessages: ThreadMessageLike[] = sourceMessages.map(toThreadMessage);

    // Merge debug bubbles into the timeline by timestamp
    let result: ThreadMessageLike[];
    if (options?.debugMode && debugEvents.length > 0) {
      const debugMessages: ThreadMessageLike[] = debugEvents.map((evt) => ({
        id: evt.id,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: evt.detail ? `🔧 **${evt.label}** — ${evt.detail}` : `🔧 **${evt.label}**`,
          },
        ],
        createdAt: evt.timestamp,
      }));
      // Merge both arrays (both already sorted by time) into one sorted list
      result = [];
      let ci = 0;
      let di = 0;
      while (ci < chatMessages.length && di < debugMessages.length) {
        const chatTime = chatMessages[ci].createdAt
          ? new Date(chatMessages[ci].createdAt as unknown as string).getTime()
          : 0;
        const dbgTime = debugMessages[di].createdAt
          ? new Date(debugMessages[di].createdAt as unknown as string).getTime()
          : 0;
        if (chatTime <= dbgTime) {
          result.push(chatMessages[ci++]);
        } else {
          result.push(debugMessages[di++]);
        }
      }
      while (ci < chatMessages.length) result.push(chatMessages[ci++]);
      while (di < debugMessages.length) result.push(debugMessages[di++]);
    } else {
      result = chatMessages;
    }

    // When the step-tracker is active we hide ALL assistant
    // placeholders (streaming text, status log, thinking). The
    // tracker itself conveys progress; stacking bubbles on top of it
    // is noise.
    if (hasPlan) {
      return result;
    }

    // Streaming text as the last message — may include a live activity suffix.
    if (activeStreamText.trim()) {
      const parts: { type: 'text'; text: string }[] = [{ type: 'text', text: activeStreamText }];
      // Append live activity indicator when agent is doing tool work
      if (statusLog) {
        parts.push({ type: 'text', text: `*⏳ ${statusLog}*` });
      }
      result.push({ id: 'streaming', role: 'assistant', content: parts });
    } else if (statusLog) {
      // No streaming text yet but agent is actively working (tool calls, etc.)
      result.push({
        id: 'streaming',
        role: 'assistant',
        content: [{ type: 'text', text: `*⏳ ${statusLog}*` }],
      });
    } else if (awaitingResponse || sessionStatus === 'booting') {
      // Note: sendMutation.isPending is NOT included here — the 600ms
      // delay via startAwaiting() prevents flash on fast responses.
      result.push({
        id: 'streaming',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: sessionStatus === 'booting' ? '*Agent is waking up...*' : '*Thinking...*',
          },
        ],
      });
    }

    return result;
  }, [
    messages,
    initialRequestMessage?.id,
    activeStreamText,
    awaitingResponse,
    sessionStatus,
    statusLog,
    options?.debugMode,
    debugEvents,
    stepProgress.hasPlan,
    stepProgress.allDone,
  ]);

  // ── Status info for typing indicator ──────────────────────────────────
  const status: ChatStatus = useMemo(() => {
    if (!isRunning) return { isRunning: false, statusText: null };
    return { isRunning: true, statusText: statusLog };
  }, [isRunning, statusLog]);

  // ── onNew: called by assistant-ui when user submits ─────────────────────
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((c) => c.type === 'text');
      if (textPart?.type !== 'text' || !textPart.text.trim()) return;
      const content = options?.contentTransform
        ? options.contentTransform(textPart.text)
        : textPart.text;
      sendMutation.mutate(content, {
        onSuccess: () => options?.onMessageSent?.(),
      });
    },
    [sendMutation, options]
  );

  // ── Clear chat ─────────────────────────────────────────────────────────
  const clearChat = useCallback(async () => {
    const res = await fetch(`/api/interactive/chat/${featureId}/messages`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear chat: ${res.status}`);
    setStreamingText('');
    setDebugEvents([]);
    setStatusLog(null);
    cancelAwaiting();
    setPendingInteraction(null);
    void queryClient.invalidateQueries({ queryKey: chatQueryKey(featureId) });
  }, [featureId, queryClient, cancelAwaiting]);

  // ── Stop agent ────────────────────────────────────────────────────────
  const stopAgent = useCallback(async () => {
    const res = await fetch(`/api/interactive/chat/${featureId}/stop`, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to stop agent: ${res.status}`);
    setStreamingText('');

    setStatusLog(null);
    cancelAwaiting();
    void queryClient.invalidateQueries({ queryKey: chatQueryKey(featureId) });
  }, [featureId, queryClient, cancelAwaiting]);

  // ── Respond to interaction (AskUserQuestion) ───────────────────────────
  const respondToInteraction = useCallback(
    async (answers: Record<string, string>) => {
      // Clear the bubble and status log immediately — answers are persisted as
      // a user message by the backend, shown in conversation history on refetch.
      setPendingInteraction(null);
      setStatusLog(null);

      try {
        const res = await fetch(`/api/interactive/chat/${featureId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error(`[respondToInteraction] failed: ${res.status}`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[respondToInteraction] error:', err);
      }

      // Refetch to show the persisted user message with answers
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(featureId) });
    },
    [featureId, queryClient]
  );

  // ── Build assistant-ui runtime ──────────────────────────────────────────
  // While a workflow is RUNNING, assistant-ui's `isRunning=true` would
  // auto-inject an empty assistant placeholder bubble at the bottom of
  // the thread (its built-in "thinking" indicator). The step tracker
  // already conveys progress via the running step's spinner + live
  // status, so that placeholder would just float as a hollow bubble.
  // Force `isRunning=false` for the duration of the workflow so
  // assistant-ui keeps its hands off the viewport.
  //
  // Once the workflow is DONE, hand control back to assistant-ui so
  // its thinking indicator works normally for follow-up replies the
  // user types into the composer after the build is finished.
  const workflowInFlight = stepProgress.hasPlan && !stepProgress.allDone;
  const runtimeIsRunning = workflowInFlight ? false : isRunning;
  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage: useCallback((msg: ThreadMessageLike): ThreadMessageLike => msg, []),
    isRunning: runtimeIsRunning,
    onNew,
    onCancel: useCallback(async () => {
      setStreamingText('');

      setStatusLog(null);
      cancelAwaiting();
    }, [cancelAwaiting]),
  });

  return {
    runtime,
    status,
    clearChat,
    stopAgent,
    sessionInfo,
    isChatLoading,
    pendingInteraction,
    respondToInteraction,
    stepProgress,
    initialRequestMessage,
  };
}
