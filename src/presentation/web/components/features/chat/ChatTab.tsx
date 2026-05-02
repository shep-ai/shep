'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Trash2, Cpu, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { cn } from '@/lib/utils';
import { Thread } from '@/components/assistant-ui/thread';
import { useAttachments } from '@/hooks/use-attachments';
import { composeUserInput } from '@/app/actions/compose-user-input';
import { getDefaultAgentAndModel } from '@/app/actions/get-default-agent-and-model';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { useChatRuntime } from './useChatRuntime';
import { ChatComposer } from './ChatComposer';
import { InteractionBubble } from './InteractionBubble';
import { StepTracker } from './StepTracker';
import { SingleTurnCard, useTurnGroupsView, type TurnGroupView } from './turn-group-list';
import { OperationRunCard, useOperationRuns, type OperationRun } from './operation-bubble';
import type { PlaceholderStep } from './workflow-placeholder';
import { SCAFFOLD_STEP_KEY } from './workflow-placeholder';
import type { EnhancedStepState } from './useChatRuntime';

export interface ChatTabProps {
  featureId: string;
  /**
   * When rendered inside an application page, passing the application
   * id lights up two application-scoped extras in the thread:
   *   1. Server-derived "user turn groups" — completed user turns
   *      collapse into named cards above the live messages so the
   *      thread stays compact.
   *   2. Publish / Deploy operation bubbles — chronological static
   *      info cards sourced from `operation_log_entries` and
   *      rendered after the live messages.
   * Omitting this prop keeps the old behaviour for non-application
   * chats (repo, global, etc.).
   */
  applicationId?: string;
  worktreePath?: string;
  /** Seed the agent override (e.g. from an Application's agentType) */
  initialAgent?: string;
  /** Seed the model override (e.g. from an Application's modelOverride) */
  initialModel?: string;
  /**
   * Optional SSR-loaded chat state — seeds the query cache so messages
   * already persisted server-side render on first paint without a fetch.
   */
  initialChatState?: ChatState;
  /**
   * When true, skip rendering the internal session-info/clear toolbar.
   * The hosting page is expected to surface this info elsewhere (e.g.
   * the ApplicationPage top bar). Lets left/right panes start flush
   * with the top bar — no mismatched inner toolbar heights.
   */
  hideHeader?: boolean;
  /**
   * Fires exactly once, the first time every step in the agent's
   * declared SHEP plan reaches `done` status. The host page uses
   * this to auto-run the dev-server preview once the workflow has
   * fully finished scaffolding the app.
   */
  onAllStepsComplete?: () => void;
  /**
   * When provided, the chat renders a STEP TRACKER-ONLY view:
   * the flat message thread is suppressed entirely and the
   * tracker sits in its place, showing these placeholder cards
   * until real `workflow_steps` rows arrive from the backend.
   *
   * ApplicationPage passes the 9 application-creation step titles
   * here so the user sees the full progress skeleton the instant
   * they land, instead of an empty area that pops in a beat
   * later.
   */
  workflowPlaceholder?: PlaceholderStep[];
  /** Called when the user clicks Continue on an interrupted workflow step. */
  onResumeWorkflow?: () => void;
  /**
   * When provided, injects a synthetic "Scaffolding" step card at the
   * top of the tracker so the user sees in-progress feedback during
   * the `BunShadcnScaffolder` phase (project-tree + `bun install`),
   * which happens BEFORE the agent turn and therefore has no real
   * `workflow_steps` row. See `workflow-placeholder.ts` for the
   * broader context.
   */
  scaffoldingState?: ScaffoldingState;
  /**
   * When truthy, renders a prominent error recovery banner above the
   * turn card + step tracker. Used to surface `effectiveStatus`
   * failures that would otherwise leave the user staring at a chat
   * with a red status pill and no explanation. The `onRetry` prop
   * wires a "Try again" button — typically `onResumeWorkflow`.
   */
  applicationError?: ApplicationErrorState | null;
}

/**
 * Frontend-synthesised state for the "Scaffolding" card. The card is
 * purely presentational — the scaffolder does not write a
 * `workflow_steps` row, so the caller derives this from the
 * Application entity and passes it in.
 */
export interface ScaffoldingState {
  /** Lifecycle of the scaffold phase. */
  status: 'running' | 'done' | 'failed';
  /** Milliseconds since epoch when scaffolding started. */
  startedAt: number;
  /** Milliseconds since epoch when scaffolding reached a terminal state. */
  finishedAt?: number;
  /** Optional short error message to render inside the card body. */
  error?: string;
}

export interface ApplicationErrorState {
  /** Short, human-readable kind: "Setup failed", "Interrupted", etc. */
  kind: string;
  /** Longer explanation shown below the headline. */
  message: string;
  /** True if the backend can re-run the failed pipeline. */
  retryable: boolean;
}

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Pure predicate: is the workflow ACTIVELY producing output right now?
 *
 * The composer is locked iff this returns true. We deliberately do NOT
 * key on "the plan is incomplete" (`hasPlan && !allDone`) — that
 * misclassifies a workflow with stale `pending` steps from a crashed
 * orchestrator (e.g. dev:web restarted mid-run, leaving the last few
 * steps stuck on `pending` forever) as in-flight, which leaves the chat
 * input permanently disabled even though no agent is doing anything.
 *
 * `running` is the only step status that proves work is actively
 * happening this instant. Pending / done / interrupted / failed all
 * mean "no agent is producing output right now → user may type."
 *
 * Exported for unit testing.
 */
export function isWorkflowInFlight(stepProgress: {
  hasPlan: boolean;
  steps: readonly { status: string }[];
}): boolean {
  return stepProgress.hasPlan && stepProgress.steps.some((s) => s.status === 'running');
}

export function ChatTab({
  featureId,
  applicationId,
  worktreePath,
  initialAgent,
  initialModel,
  initialChatState,
  hideHeader,
  onAllStepsComplete,
  workflowPlaceholder,
  onResumeWorkflow,
  scaffoldingState,
  applicationError,
}: ChatTabProps) {
  // Override resolution layers (highest precedence first):
  //   1. `initialAgent` / `initialModel` — pinned by the host (e.g.
  //      `application.agentType` / `application.modelOverride` from the
  //      Application page).
  //   2. User's global settings — fetched once on mount via the
  //      `getDefaultAgentAndModel` server action so we never lie in the
  //      picker. Hardcoded defaults like `'claude-code'` are BANNED
  //      here; settings is the SINGLE source of truth.
  const [overrideAgent, setOverrideAgent] = useState<string | undefined>(initialAgent);
  const [overrideModel, setOverrideModel] = useState<string | undefined>(initialModel);
  useEffect(() => {
    if (overrideAgent && overrideModel) return;
    void getDefaultAgentAndModel().then((d) => {
      setOverrideAgent((prev) => prev ?? d.agentType);
      setOverrideModel((prev) => prev ?? d.model);
    });
    // Run once on mount — host overrides flow through the explicit
    // `initialAgent`/`initialModel` props above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [debugMode, setDebugMode] = useState(false);
  const att = useAttachments();

  // Turn-group overlay is enabled for application-scoped chats.
  // Groups are computed CLIENT-SIDE from `rawMessages` (see the
  // `useTurnGroupsView` call below) so the view is always
  // optimistic against the chat-state cache — no stale-query race
  // window where the flat thread would briefly leak raw bubbles.
  const turnGroupsEnabled = Boolean(applicationId);

  const contentTransform = useCallback(
    (content: string) =>
      composeUserInput(
        content,
        att.completedAttachments.map((a) => ({ path: a.path, name: a.name, notes: a.notes }))
      ),
    [att.completedAttachments]
  );

  const {
    runtime,
    status,
    clearChat,
    sessionInfo,
    isChatLoading,
    pendingInteraction,
    respondToInteraction,
    stepProgress,
    rawMessages,
    streamingState,
  } = useChatRuntime(featureId, worktreePath, {
    contentTransform,
    onMessageSent: att.clearAttachments,
    model: overrideModel,
    agentType: overrideAgent,
    debugMode,
    initialChatState,
    // Legacy pinInitialRequest flag is only relevant for the
    // non-grouping path (repo/global chats with a workflow
    // placeholder). When turn groups are on we take the full
    // overlay path via `hideAllMessages` instead.
    pinInitialRequest: (workflowPlaceholder?.length ?? 0) > 0,
    // Full overlay path: hide ALL persisted bubbles from the flat
    // thread and let the grouping layer own the entire visible
    // conversation. The streaming indicator is pinned inside the
    // in-progress turn card so we also suppress its flat version.
    hideAllMessages: turnGroupsEnabled,
    suppressStreamingIndicator: turnGroupsEnabled,
  });

  // Client-side turn grouping — re-runs synchronously on every
  // `rawMessages` change, so a new user bubble or assistant reply
  // is reflected in the overlay in the same render tick.
  //
  // Three gating rules:
  //   1. Only mark the latest turn as in-progress while the agent
  //      is actually running — otherwise a finished conversation
  //      would leave a permanent "Working on your request…" card.
  //   2. Hide the entire overlay while the initial setup workflow
  //      is still running. The StepTracker owns the narrative
  //      during setup; showing an extra "Working on your request…"
  //      card for the first user message duplicates the user's ask
  //      and clutters the pane.
  //   3. Once the setup workflow exists (hasPlan), the FIRST user
  //      turn is by definition the setup-triggering ask — it is
  //      already represented inside the StepTracker card. Drop it
  //      from the overlay so the "Working on: …" card only appears
  //      for genuine post-setup iterations (second user message
  //      onwards).
  // Setup is the initial workflow that creates the application: the
  // synthetic scaffolding card (`scaffoldingState.status === 'running'`)
  // PLUS the agent plan that follows it. Turn-group cards stay hidden
  // for the whole window so the StepTracker owns the narrative end to
  // end — user iterations only start appearing AFTER the setup plan
  // has completed.
  const setupInProgress = Boolean(
    scaffoldingState?.status === 'running' || (stepProgress.hasPlan && !stepProgress.allDone)
  );
  const rawTurnGroupsView = useTurnGroupsView(rawMessages, status.isRunning && !setupInProgress);
  const turnGroupsView = (() => {
    if (setupInProgress) {
      return { groups: [], currentTurn: null, hiddenMessageIds: [] };
    }
    // Non-application chats (no scaffolder, no plan) keep the raw
    // turn overlay untouched — there's no "setup ask" to hide.
    if (!scaffoldingState && !stepProgress.hasPlan) {
      return rawTurnGroupsView;
    }
    // Flatten all turns (completed + current) in chronological
    // order, drop the first (setup ask), then re-split so the
    // latest still owns `currentTurn` if it was in-progress.
    const all = [...rawTurnGroupsView.groups];
    if (rawTurnGroupsView.currentTurn) all.push(rawTurnGroupsView.currentTurn);
    const iterations = all.slice(1);
    const hadCurrent = rawTurnGroupsView.currentTurn !== null;
    const currentTurn =
      hadCurrent && iterations.length > 0 ? iterations[iterations.length - 1]! : null;
    const groups = currentTurn ? iterations.slice(0, -1) : iterations;
    return {
      groups,
      currentTurn,
      hiddenMessageIds: rawTurnGroupsView.hiddenMessageIds,
    };
  })();

  // Layer 2 sibling feeds: publish + deploy + save-&-push operation
  // runs, fetched once at the ChatTab level so we can interleave them
  // chronologically with user-turn cards. Each run carries `startedAt`
  // for the merge. "Save" writes to the RepoSync kind (distinct from
  // the GitRemoteCreate "Publish" kind) so we MUST subscribe to it —
  // otherwise a save+redeploy cycle would only surface the deploy
  // bubble and the preceding save would silently disappear.
  const publishRuns = useOperationRuns(applicationId, 'publish');
  const deployRuns = useOperationRuns(applicationId, 'deploy');
  const syncRuns = useOperationRuns(applicationId, 'sync');

  // Single chronological merged timeline — user turns + publish +
  // deploy, sorted by `startedAt`. Re-sorting on every render is
  // cheap (N ~ low dozens) and guarantees the in-progress "Working
  // on…" card stays at its chronological slot. When the agent
  // finishes, the same turn id flips `status` from `in-progress` to
  // `completed` inside `turnGroupsView`, and since we key the React
  // element by the turn id, the card updates in place — no unmount,
  // no position change.
  interface TimelineItem {
    kind: 'turn' | 'operation';
    id: string;
    startedAt: number;
    turn?: TurnGroupView;
    run?: OperationRun;
  }
  const timelineItems: TimelineItem[] = (() => {
    const items: TimelineItem[] = [];
    for (const g of turnGroupsView.groups) {
      items.push({ kind: 'turn', id: g.id, startedAt: g.startedAt, turn: g });
    }
    if (turnGroupsView.currentTurn) {
      const g = turnGroupsView.currentTurn;
      items.push({ kind: 'turn', id: g.id, startedAt: g.startedAt, turn: g });
    }
    for (const r of publishRuns) {
      items.push({ kind: 'operation', id: `pub-${r.id}`, startedAt: r.startedAt, run: r });
    }
    for (const r of deployRuns) {
      items.push({ kind: 'operation', id: `dep-${r.id}`, startedAt: r.startedAt, run: r });
    }
    for (const r of syncRuns) {
      items.push({ kind: 'operation', id: `syn-${r.id}`, startedAt: r.startedAt, run: r });
    }
    items.sort((a, b) => a.startedAt - b.startedAt);
    return items;
  })();

  // Fire the all-steps-complete callback exactly once per mount.
  // Using a ref (not a dependency) prevents re-firing if the parent
  // passes a new callback identity on every render.
  const allDoneFiredRef = useRef(false);
  const onAllStepsCompleteRef = useRef(onAllStepsComplete);
  onAllStepsCompleteRef.current = onAllStepsComplete;
  useEffect(() => {
    if (stepProgress.allDone && !allDoneFiredRef.current) {
      allDoneFiredRef.current = true;
      onAllStepsCompleteRef.current?.();
    }
  }, [stepProgress.allDone]);

  const handleForceStopStep = useCallback(async (stepId: string) => {
    // Skip placeholder rows — they have no persisted step in the DB,
    // so there's nothing to force-stop until the real row arrives.
    if (stepId.startsWith('placeholder-')) return;
    try {
      const res = await fetch(`/api/workflow-steps/${encodeURIComponent(stepId)}/force-stop`, {
        method: 'POST',
      });
      if (!res.ok && res.status !== 409) {
        // eslint-disable-next-line no-console
        console.warn('[force-stop-step] request failed', res.status);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[force-stop-step] request error', err);
    }
  }, []);

  const handlePickFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/dialog/pick-files');
      if (!res.ok) return;
      const data = (await res.json()) as { paths?: string[] };
      if (!data.paths?.length) return;
      for (const filePath of data.paths) {
        const uploadRes = await fetch('/api/attachments/upload-from-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, sessionId: `chat-${featureId}` }),
        });
        if (!uploadRes.ok) continue;
        const uploaded = (await uploadRes.json()) as {
          id: string;
          name: string;
          size: number;
          mimeType: string;
          path: string;
        };
        att.addAttachment(uploaded);
      }
    } catch {
      // Native picker not available — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- att.addAttachment is a stable callback from useAttachments
  }, [featureId, att.addAttachment]);

  // Compute the tracker's step list:
  //   1. Real workflow rows when the orchestrator has written them,
  //      otherwise synthesised pending cards from `workflowPlaceholder`
  //      so the user sees the full progress skeleton from the first
  //      paint. Real rows replace the placeholder atomically the
  //      moment the first `workflow_step` SSE chunk lands.
  //   2. If `scaffoldingState` is provided, ALWAYS prepend a synthetic
  //      "Scaffolding" card at the top. It is the only card visible
  //      during the `BunShadcnScaffolder` phase (project-tree +
  //      `bun install`), which happens BEFORE the agent turn and
  //      therefore has no real `workflow_steps` row. Once real rows
  //      arrive, the scaffold card is flipped to `done` and kept at
  //      index 0 so the full history stays visible.
  const baseSteps: EnhancedStepState[] = stepProgress.hasPlan
    ? stepProgress.steps
    : (workflowPlaceholder ?? [])
        .filter((p) => p.stepKey !== SCAFFOLD_STEP_KEY)
        .map((p) => ({
          definition: {
            id: `placeholder-${p.stepKey}`,
            stepKey: p.stepKey,
            title: p.title,
            description: p.description,
          },
          status: 'pending' as const,
          metadata: null,
          toolMessages: [],
          startedAt: null,
          finishedAt: null,
        }));

  // Capture a stable `finishedAt` for the scaffold card the first
  // time we observe real workflow rows appear (`hasPlan` flips to
  // true). Without this, `Date.now()` would be re-sampled every
  // render and the card's displayed duration would keep jittering.
  const scaffoldFinishedAtRef = useRef<number | null>(null);
  if (stepProgress.hasPlan && scaffoldFinishedAtRef.current == null) {
    scaffoldFinishedAtRef.current = Date.now();
  }

  const scaffoldCard: EnhancedStepState | null = scaffoldingState
    ? {
        definition: {
          id: `placeholder-${SCAFFOLD_STEP_KEY}`,
          stepKey: SCAFFOLD_STEP_KEY,
          title: 'Preparing your project',
          description: 'Scaffolding the project tree and installing dependencies',
        },
        // Once real workflow rows exist the scaffolder is guaranteed
        // to have finished (the orchestrator runs scaffold → workflow
        // sequentially), so we force `done` regardless of what the
        // caller passes — this keeps the UI consistent even if a
        // page refresh races the Application row's setupComplete flag.
        status: stepProgress.hasPlan ? 'done' : scaffoldingState.status,
        metadata: scaffoldingState.error ? { error: scaffoldingState.error } : null,
        toolMessages: [],
        startedAt: scaffoldingState.startedAt,
        finishedAt:
          scaffoldingState.finishedAt ??
          (stepProgress.hasPlan ? scaffoldFinishedAtRef.current : null),
      }
    : null;

  const trackerSteps: EnhancedStepState[] = scaffoldCard ? [scaffoldCard, ...baseSteps] : baseSteps;
  const showTracker = trackerSteps.length > 0;
  const workflowInFlight = isWorkflowInFlight(stepProgress);

  const composer = (
    <ChatComposer
      disabled={workflowInFlight}
      attachments={att.attachments}
      isDragOver={att.isDragOver}
      uploadError={att.uploadError}
      onDragEnter={att.handleDragEnter}
      onDragLeave={att.handleDragLeave}
      onDragOver={att.handleDragOver}
      onDrop={att.handleDrop}
      onPaste={att.handlePaste}
      onRemoveAttachment={att.removeAttachment}
      onNotesChange={att.updateNotes}
      onPickFiles={handlePickFiles}
      agentPicker={
        <AgentModelPicker
          initialAgentType={overrideAgent ?? ''}
          initialModel={overrideModel ?? ''}
          mode="override"
          onAgentModelChange={(agent, model) => {
            setOverrideAgent(agent);
            setOverrideModel(model);
          }}
          className="w-55"
          popoverSide="top"
        />
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header bar — session info + stop/clear.
       *  Hidden when the hosting page wants a flush layout (e.g.
       *  ApplicationPage surfaces session info in its own top bar). */}
      {hideHeader ? null : (
        <ChatHeader
          sessionInfo={sessionInfo}
          isAgentActive={status.isRunning}
          onClear={clearChat}
          debugMode={debugMode}
          onDebugToggle={IS_DEV ? setDebugMode : undefined}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col dark:bg-neutral-900/40">
        {isChatLoading ? (
          <ChatSkeleton />
        ) : (
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread
              composer={composer}
              hideEmpty={showTracker}
              hideMessages={turnGroupsEnabled}
              beforeMessages={
                <>
                  {/* Single chronological column. Top to bottom:
                        1. Error recovery banner (when broken)
                        2. Setup workflow (StepTracker)
                        3. Merged timeline of user turns +
                           publish / deploy runs, sorted by
                           `startedAt`. The in-progress "Working
                           on…" card lives at its chronological
                           slot — when the agent finishes, the
                           same item flips to `completed` status
                           and the card updates in place (same
                           React key, no remount).
                        4. Pending interaction (awaiting user input)
                     All rendered in `beforeMessages` because the flat
                     thread below is dead — `hideAllMessages` zeroes
                     the persisted bubble list when turn groups are on,
                     so the overlay owns the entire visible surface. */}
                  {applicationError ? (
                    <ErrorRecoveryBanner state={applicationError} onRetry={onResumeWorkflow} />
                  ) : null}
                  {showTracker ? (
                    <StepTracker
                      steps={trackerSteps}
                      collapsedSummary={
                        stepProgress.hasPlan === true && stepProgress.allDone === true
                      }
                      activeStepId={stepProgress.activeStepId}
                      liveStatus={stepProgress.liveStatus}
                      onRetry={onResumeWorkflow}
                      onForceStop={handleForceStopStep}
                    />
                  ) : null}
                  {turnGroupsEnabled
                    ? timelineItems.map((item, idx) => {
                        if (item.kind === 'turn' && item.turn) {
                          return (
                            <SingleTurnCard
                              key={item.id}
                              group={item.turn}
                              allMessages={rawMessages}
                              streaming={
                                item.turn.status === 'in-progress' ? streamingState : undefined
                              }
                            />
                          );
                        }
                        if (item.kind === 'operation' && item.run && applicationId) {
                          return (
                            <OperationRunCard
                              key={item.id}
                              applicationId={applicationId}
                              kind={item.run.kind}
                              entries={item.run.entries}
                              runIndex={idx}
                            />
                          );
                        }
                        return null;
                      })
                    : null}
                </>
              }
              afterMessages={
                turnGroupsEnabled ? (
                  pendingInteraction ? (
                    <InteractionBubble
                      interaction={pendingInteraction}
                      onSubmit={respondToInteraction}
                    />
                  ) : null
                ) : pendingInteraction ? (
                  <InteractionBubble
                    interaction={pendingInteraction}
                    onSubmit={respondToInteraction}
                  />
                ) : null
              }
            />
          </AssistantRuntimeProvider>
        )}
      </div>
    </div>
  );
}

// ── Error recovery banner ───────────────────────────────────────────────────
//
// Rendered at the very top of the chat pane when the application is
// in a broken state (setup failed, interrupted, etc.). Replaces
// silent failure where the only signal was a red "ERROR" pill in the
// top bar. Gives the user a clear headline, an explanation, and — if
// the backend says the operation is retryable — a prominent
// "Try again" button wired to `onResumeWorkflow`.
function ErrorRecoveryBanner({
  state,
  onRetry,
}: {
  state: ApplicationErrorState;
  onRetry?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = useCallback(() => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      onRetry();
    } finally {
      // `onRetry` is fire-and-forget (POSTs the resume endpoint).
      // Clear the local spinner after a short window so the button
      // doesn't stay locked if the parent forgot to refresh state.
      setTimeout(() => setRetrying(false), 4000);
    }
  }, [onRetry, retrying]);

  return (
    <div
      className={cn(
        // `shrink-0` — direct child of the Thread viewport flex
        // column, so it must not be squashed when siblings expand.
        'animate-in fade-in-0 slide-in-from-top-1 mx-3 my-3 shrink-0 overflow-hidden rounded-lg border shadow-sm duration-200 ease-out',
        'border-red-500/40 bg-red-500/5 dark:bg-red-500/10'
      )}
      role="alert"
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-red-700 dark:text-red-300">
            {state.kind}
          </div>
          <div className="text-foreground/80 mt-0.5 text-[12px] leading-relaxed">
            {state.message}
          </div>
          {state.retryable && onRetry ? (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md bg-red-500 px-3 text-[11px] font-semibold text-white transition-opacity',
                  retrying ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'
                )}
              >
                <RefreshCw className={cn('h-3 w-3', retrying && 'animate-spin')} />
                {retrying ? 'Retrying…' : 'Try again'}
              </button>
              <span className="text-muted-foreground text-[10px]">
                Re-runs the last failed step
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4 pt-6">
      {/* Assistant message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="bg-muted h-6 w-6 animate-pulse rounded-full" />
        <div className="flex flex-col gap-1.5">
          <div className="bg-muted h-4 w-48 animate-pulse rounded-lg" />
          <div className="bg-muted h-4 w-72 animate-pulse rounded-lg" />
          <div className="bg-muted h-4 w-36 animate-pulse rounded-lg" />
        </div>
      </div>
      {/* User message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="bg-muted h-6 w-6 animate-pulse rounded-full" />
        <div className="bg-muted h-4 w-32 animate-pulse rounded-lg" />
      </div>
      {/* Assistant message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="bg-muted h-6 w-6 animate-pulse rounded-full" />
        <div className="flex flex-col gap-1.5">
          <div className="bg-muted h-4 w-56 animate-pulse rounded-lg" />
          <div className="bg-muted h-4 w-64 animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Session info types ──────────────────────────────────────────────────────

interface SessionInfo {
  pid: number | null;
  sessionId: string | null;
  model: string | null;
  startedAt: string;
  lastActivityAt: string;
}

// ── Chat header — compact session info + actions ─────────────────────────────

function ChatHeader({
  sessionInfo,
  isAgentActive,
  onClear,
  debugMode,
  onDebugToggle,
}: {
  sessionInfo: SessionInfo | null;
  isAgentActive: boolean;
  onClear: () => Promise<void>;
  debugMode: boolean;
  onDebugToggle?: (enabled: boolean) => void;
}) {
  const { t } = useTranslation('web');
  return (
    <div className="flex h-8 shrink-0 items-center border-b px-3">
      {/* Left — session info + activity */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sessionInfo ? (
          <>
            {isAgentActive ? (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            ) : (
              <Cpu className="text-muted-foreground/40 h-3 w-3 shrink-0" />
            )}
            <span className="text-muted-foreground font-mono text-[10px]">
              {sessionInfo.model ?? 'agent'}
              {sessionInfo.sessionId ? ` · ${sessionInfo.sessionId.slice(0, 8)}` : ''}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/40 text-[11px]">{t('chat.noSession')}</span>
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1 ps-2">
        {onDebugToggle ? (
          <label className="text-muted-foreground/60 flex cursor-pointer items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => onDebugToggle(e.target.checked)}
              className="h-3 w-3 cursor-pointer rounded"
            />
            Debug
          </label>
        ) : null}
        <ToolbarButton
          onClick={() => {
            void onClear();
          }}
          title={t('chat.clearChatHistory')}
        >
          <Trash2 className="h-2.5 w-2.5" />
          <span>{t('chat.clear')}</span>
        </ToolbarButton>
      </div>
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  title,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
        variant === 'danger'
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
}
