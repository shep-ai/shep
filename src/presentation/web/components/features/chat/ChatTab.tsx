'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Trash2, Cpu, User } from 'lucide-react';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { cn } from '@/lib/utils';
import { Thread } from '@/components/assistant-ui/thread';
import { useAttachments } from '@/hooks/use-attachments';
import { composeUserInput } from '@/app/actions/compose-user-input';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { useChatRuntime } from './useChatRuntime';
import { ChatComposer } from './ChatComposer';
import { InteractionBubble } from './InteractionBubble';
import { StepTracker } from './StepTracker';
import type { PlaceholderStep } from './workflow-placeholder';
import type { EnhancedStepState } from './useChatRuntime';

export interface ChatTabProps {
  featureId: string;
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
}

const IS_DEV = process.env.NODE_ENV === 'development';

export function ChatTab({
  featureId,
  worktreePath,
  initialAgent,
  initialModel,
  initialChatState,
  hideHeader,
  onAllStepsComplete,
  workflowPlaceholder,
  onResumeWorkflow,
}: ChatTabProps) {
  const [overrideAgent, setOverrideAgent] = useState<string | undefined>(initialAgent);
  const [overrideModel, setOverrideModel] = useState<string | undefined>(initialModel);
  const [debugMode, setDebugMode] = useState(false);
  const att = useAttachments();

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
    initialRequestMessage,
  } = useChatRuntime(featureId, worktreePath, {
    contentTransform,
    onMessageSent: att.clearAttachments,
    model: overrideModel,
    agentType: overrideAgent,
    debugMode,
    initialChatState,
  });

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

  // Compute the tracker's step list: real workflow rows when the
  // orchestrator has written them, otherwise synthesised pending
  // cards from `workflowPlaceholder` so the user sees the full
  // progress skeleton from the first paint. Real rows replace the
  // placeholder atomically the moment the first `workflow_step`
  // SSE chunk lands.
  const trackerSteps: EnhancedStepState[] = stepProgress.hasPlan
    ? stepProgress.steps
    : (workflowPlaceholder ?? []).map((p) => ({
        definition: {
          id: `placeholder-${p.stepKey}`,
          stepKey: p.stepKey,
          title: p.title,
          description: p.description,
        },
        status: 'pending' as const,
        metadata: null,
        toolMessages: [],
      }));
  const showTracker = trackerSteps.length > 0;
  const workflowInFlight = stepProgress.hasPlan === true && stepProgress.allDone !== true;

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
          initialAgentType={overrideAgent ?? 'claude-code'}
          initialModel={overrideModel ?? 'claude-sonnet-4-6'}
          mode="override"
          onAgentModelChange={(agent, model) => {
            setOverrideAgent(agent);
            setOverrideModel(model);
          }}
          className="w-55"
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
              beforeMessages={
                showTracker ? (
                  <>
                    {initialRequestMessage ? (
                      <InitialRequestBubble text={initialRequestMessage.content} />
                    ) : null}
                    <StepTracker
                      steps={trackerSteps}
                      collapsedSummary={
                        stepProgress.hasPlan === true && stepProgress.allDone === true
                      }
                      activeStepId={stepProgress.activeStepId}
                      liveStatus={stepProgress.liveStatus}
                      onRetry={onResumeWorkflow}
                    />
                  </>
                ) : undefined
              }
              afterMessages={
                pendingInteraction ? (
                  <InteractionBubble
                    interaction={pendingInteraction}
                    onSubmit={respondToInteraction}
                  />
                ) : undefined
              }
            />
          </AssistantRuntimeProvider>
        )}
      </div>
    </div>
  );
}

// ── Initial request bubble ──────────────────────────────────────────────────
//
// A lightweight user-message lookalike that the host pane renders
// above the step tracker. We don't go through the full assistant-ui
// `UserMessage` component because this bubble lives OUTSIDE the
// Thread's message iteration — it's a purely presentational anchor
// for the original ask that kicked off the workflow. Visuals match
// the real user bubble in `thread.tsx` so the swap is invisible.
function InitialRequestBubble({ text }: { text: string }) {
  return (
    <div className="group animate-in fade-in-0 slide-in-from-top-1 flex w-full items-start gap-2.5 px-4 py-0.5 duration-300 ease-out">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
        <User className="h-3.5 w-3.5 text-violet-500" />
      </div>
      <div className="flex max-w-[85%] min-w-0 flex-col gap-0.5">
        <div className="text-foreground mt-px overflow-hidden rounded-2xl rounded-tl-sm border border-violet-500/15 bg-violet-500/8 px-4 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-sm backdrop-blur-md">
          {text}
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
