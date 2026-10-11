/**
 * Chat message relay (spec 137).
 *
 * The per-scope chat stream hears about new messages from in-process session
 * subscribers. A block posted from another process — an agent's
 * `shep chat block` call, or an MCP server — is written straight to the
 * database, so the stream also asks for rows newer than the last one it saw.
 * The client de-duplicates messages by id, so a row that arrives both ways is
 * harmless. `/api/agent-events` relays cross-process state the same way.
 */

/** How often an open chat checks for rows written by other processes. */
export const CHAT_RELAY_INTERVAL_MS = 1500;

interface RelayedMessage {
  id: string;
  createdAt: Date | string;
}

export interface ChatMessageRelayOptions<M extends RelayedMessage> {
  /** Rows of the conversation created strictly after `since`, oldest first. */
  listSince: (since: Date) => Promise<M[]>;
  emit: (message: M) => void;
}

/** Starts relaying; returns the function that stops it. */
export function startChatMessageRelay<M extends RelayedMessage>({
  listSince,
  emit,
}: ChatMessageRelayOptions<M>): () => void {
  let since = new Date();
  let reading = false;

  const timer = setInterval(() => {
    if (reading) return;
    reading = true;
    listSince(since)
      .then((rows) => {
        for (const row of rows) {
          emit(row);
          const createdAt = new Date(row.createdAt);
          if (createdAt > since) since = createdAt;
        }
      })
      .catch(() => {
        // A busy database is retried on the next tick.
      })
      .finally(() => {
        reading = false;
      });
  }, CHAT_RELAY_INTERVAL_MS);

  return () => clearInterval(timer);
}
