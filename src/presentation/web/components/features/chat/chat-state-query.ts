/**
 * Shared TanStack Query key + fetcher for the per-feature chat state.
 *
 * Both `useChatRuntime` (inside ChatTab) and the application page's
 * top bar subscribe to the SAME cached entry so a single SSE stream
 * updates every consumer at once. Keep the key and fetcher here so
 * there's exactly one source of truth.
 */

import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

export function chatQueryKey(featureId: string) {
  return ['chat-messages', featureId] as const;
}

export async function fetchChatState(featureId: string): Promise<ChatState> {
  const res = await fetch(`/api/interactive/chat/${featureId}/messages`);
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[ChatState] fetch failed: ${res.status}`, await res.text().catch(() => ''));
    throw new Error(`Failed to fetch chat state: ${res.status}`);
  }
  return res.json() as Promise<ChatState>;
}
