'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Trash2, Cpu } from 'lucide-react';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { cn } from '@/lib/utils';
import { Thread } from '@/components/assistant-ui/thread';
import { useAttachments } from '@/hooks/use-attachments';
import { composeUserInput } from '@/app/actions/compose-user-input';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { useChatRuntime } from './useChatRuntime';
import { ChatComposer } from './ChatComposer';
import { InteractionBubble } from './InteractionBubble';

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
}

const IS_DEV = process.env.NODE_ENV === 'development';

export function ChatTab({
  featureId,
  worktreePath,
  initialAgent,
  initialModel,
  initialChatState,
  hideHeader,
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
  } = useChatRuntime(featureId, worktreePath, {
    contentTransform,
    onMessageSent: att.clearAttachments,
    model: overrideModel,
    agentType: overrideAgent,
    debugMode,
    initialChatState,
  });

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

  const composer = (
    <ChatComposer
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
      <div className="flex min-h-0 flex-1 flex-col">
        {isChatLoading ? (
          <ChatSkeleton />
        ) : (
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread
              composer={composer}
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
  idleTimeoutMinutes: number;
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
