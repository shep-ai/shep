/**
 * Messaging Chat Relay
 *
 * Bridges messaging app chat ↔ Shep interactive agent sessions.
 * When a user enters "chat mode" via /chat <feature_id>, their messages
 * are relayed to the agent and agent responses are batched and sent back
 * through the tunnel.
 *
 * Output batching: agent streaming output is buffered and flushed every
 * N milliseconds (default 3s) to avoid flooding messaging platforms.
 * Only one active relay per user at a time.
 */

import type { MessagingNotification } from '../../../domain/generated/output.js';
import type { IMessageSender } from '../../../application/ports/output/services/message-sender.interface.js';
import { sanitizeForMessaging } from './content-sanitizer.js';

const DEFAULT_BUFFER_INTERVAL_MS = 3_000;

interface ActiveRelay {
  featureId: string;
  chatId: string;
  platform: string;
  worktreePath: string;
  unsubscribe?: () => void;
}

/**
 * Manages the bidirectional chat relay between messaging apps
 * and Shep interactive agent sessions.
 */
export class MessagingChatRelay {
  private activeRelay: ActiveRelay | null = null;
  private buffer = '';
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sender: IMessageSender,
    private readonly bufferIntervalMs: number = DEFAULT_BUFFER_INTERVAL_MS
  ) {}

  /** Start a chat relay for a specific feature */
  startRelay(
    featureId: string,
    chatId: string,
    platform: string,
    worktreePath = '',
    unsubscribe?: () => void
  ): string {
    // Tear down any previous relay (including its subscription).
    if (this.activeRelay) {
      this.flushBuffer();
      this.activeRelay.unsubscribe?.();
    }

    this.activeRelay = { featureId, chatId, platform, worktreePath, unsubscribe };
    return `Chat relay started for feature #${featureId}. Send messages here to talk to the agent. /end to stop.`;
  }

  /** Get the worktree path of the active relay, if any. */
  getActiveWorktreePath(): string | null {
    return this.activeRelay?.worktreePath ?? null;
  }

  /** End the active chat relay */
  endRelay(): string {
    if (!this.activeRelay) {
      return 'No active chat relay.';
    }

    this.flushBuffer();
    const fid = this.activeRelay.featureId;
    this.activeRelay.unsubscribe?.();
    this.activeRelay = null;
    return `Chat relay ended for feature #${fid}.`;
  }

  /** Check if there is an active relay */
  hasActiveRelay(): boolean {
    return this.activeRelay !== null;
  }

  /** Get the active relay's feature ID */
  getActiveFeatureId(): string | null {
    return this.activeRelay?.featureId ?? null;
  }

  /**
   * Buffer an agent response chunk and schedule a flush.
   * Called when the agent produces output during a chat relay.
   */
  bufferAgentOutput(delta: string): void {
    if (!this.activeRelay) return;

    this.buffer += delta;

    if (!this.bufferTimer) {
      this.bufferTimer = setTimeout(() => {
        this.flushBuffer();
      }, this.bufferIntervalMs);
      this.bufferTimer.unref();
    }
  }

  /** Flush any buffered output immediately (e.g., on stream completion) */
  flushBuffer(): void {
    if (this.buffer && this.activeRelay) {
      const notification: MessagingNotification = {
        event: 'chat.response',
        featureId: this.activeRelay.featureId,
        title: '',
        message: sanitizeForMessaging(this.buffer),
      };
      void this.sender.send(notification);
      this.buffer = '';
    }

    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
  }

  /** Stop the relay and clean up all resources */
  stop(): void {
    this.flushBuffer();
    this.activeRelay?.unsubscribe?.();
    this.activeRelay = null;
  }
}
