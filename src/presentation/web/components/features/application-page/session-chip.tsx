'use client';

import { useCallback } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

import { cn } from '@/lib/utils';
import { chatQueryKey, fetchChatState } from '@/components/features/chat/chat-state-query';

export interface SessionChipProps {
  featureId: string;
  initialChatState?: ChatState;
  /** Agent session ID persisted on the Application entity — stable across restarts. */
  persistedSessionId?: string;
}

export function SessionChip({ featureId, initialChatState, persistedSessionId }: SessionChipProps) {
  const { data: chatState } = useQuery({
    queryKey: chatQueryKey(featureId),
    queryFn: () => fetchChatState(featureId),
    initialData: initialChatState,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const sessionInfo = chatState?.sessionInfo;
  // Prefer the persisted ID from the Application entity (always available),
  // fall back to the live session info (only available while session is active).
  const sessionId = persistedSessionId ?? sessionInfo?.sessionId ?? null;
  const model = sessionInfo?.model ?? null;
  const shortId = sessionId ? sessionId.slice(0, 8) : null;

  const handleCopy = useCallback(async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success('Session ID copied', { description: sessionId });
    } catch {
      toast.error('Failed to copy session id');
    }
  }, [sessionId]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!sessionId}
      className={cn(
        'border-border/60 bg-muted/40 text-muted-foreground inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition-colors',
        sessionId
          ? 'hover:bg-muted hover:text-foreground cursor-pointer'
          : 'cursor-default opacity-60'
      )}
      title={sessionId ? `Click to copy full session id: ${sessionId}` : 'No session yet'}
      aria-label={sessionId ? 'Copy session id' : 'No active session'}
    >
      <Cpu className="h-3 w-3 opacity-60" />
      <span className="font-medium">{model ?? 'agent'}</span>
      <span className="text-muted-foreground/50">·</span>
      <span>{shortId ?? '—'}</span>
    </button>
  );
}
