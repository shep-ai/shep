/**
 * Session Persistence
 *
 * Every DB mutation that must also notify SSE subscribers flows through
 * this collaborator. Owns the monotonic message clock — the one piece
 * of process-wide state that guarantees `createdAt` strictly increases
 * across consecutive persists, even when `Date.now()` returns the same
 * millisecond for two rapid writes.
 *
 * ## Why the monotonic clock matters
 *
 * `Date.now()` has millisecond precision. The Claude SDK routinely
 * fires `tool_use` + `tool_result` (and their paired `persistToolEvent`
 * calls) inside the same millisecond, which leaves the DB with two
 * rows whose `created_at` are identical. `ORDER BY created_at ASC` then
 * returns them in insert-race order and breaks the tool -> Output
 * pairing in `StepTracker.classifyMessages` on the frontend. By pinning
 * each subsequent timestamp to `max(Date.now(), lastTs + 1)` we get a
 * strictly-increasing sequence under burst writes.
 *
 * Because the counter is process-wide (NOT per-session), this class
 * MUST be registered as a singleton in the DI container so one
 * instance guards every write.
 */

import * as crypto from 'node:crypto';

import type { IInteractiveMessageRepository } from '../../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type {
  InteractiveMessage,
  InteractiveSessionStatus,
} from '../../../../domain/generated/output.js';
import { InteractiveMessageRole } from '../../../../domain/generated/output.js';
import type { SessionRegistry, SessionState } from './session-registry.js';
import type { StreamEventDispatcher } from './stream-event-dispatcher.js';

export class SessionPersistence {
  /**
   * Process-wide monotonic counter. See file header for the invariant.
   * Kept private so only `nextMessageDate` can mutate it.
   */
  private lastMessageTs = 0;

  constructor(
    private readonly messageRepo: IInteractiveMessageRepository,
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly registry: SessionRegistry,
    private readonly dispatcher: StreamEventDispatcher
  ) {}

  /**
   * Produce the next monotonic timestamp for a persisted interactive
   * message. Guarantees a strictly-increasing sequence even when two
   * calls happen in the same millisecond.
   */
  private nextMessageDate(): Date {
    const wallclock = Date.now();
    const next = wallclock > this.lastMessageTs ? wallclock : this.lastMessageTs + 1;
    this.lastMessageTs = next;
    return new Date(next);
  }

  /**
   * Persist a message AND notify subscribers. Use everywhere instead of
   * calling `messageRepo.create` directly. The current active workflow
   * step for the feature (if any) is stamped onto the row so every
   * message is grouped under the right step card in the UI.
   */
  async persistMessage(message: InteractiveMessage): Promise<void> {
    const activeStepId = this.registry.getActiveStep(message.featureId);
    const tagged: InteractiveMessage =
      message.stepId || !activeStepId ? message : { ...message, stepId: activeStepId };
    await this.messageRepo.create(tagged);
    this.dispatcher.notifyByFeatureId(tagged.featureId, {
      delta: '',
      done: false,
      message: tagged,
    });
  }

  /**
   * Persist whatever text has accumulated in `state.currentAssistantBuffer`
   * as its own assistant message, then clear the buffer. Called right
   * before each tool event so the DB history interleaves agent prose
   * with tool calls. No-op if the buffer is empty or whitespace-only.
   */
  async flushAssistantBuffer(state: SessionState): Promise<void> {
    const buffered = state.currentAssistantBuffer.trim();
    if (!buffered) return;
    state.currentAssistantBuffer = '';
    const now = this.nextMessageDate();
    const msg: InteractiveMessage = {
      id: crypto.randomUUID(),
      featureId: state.featureId,
      sessionId: state.sessionId,
      role: InteractiveMessageRole.assistant,
      content: buffered,
      createdAt: now,
      updatedAt: now,
    };
    await this.persistMessage(msg);
  }

  /**
   * Persist a tool/system event as its own assistant message in the DB.
   * Flushes any pending assistant prose first so the chat thread
   * interleaves narration with tool calls instead of collapsing all of
   * a step's narration into one trailing blob.
   *
   * Non-critical: errors are swallowed so a transient DB hiccup on a
   * tool event never fails an in-flight turn.
   */
  async persistToolEvent(state: SessionState, label: string, detail?: string): Promise<void> {
    try {
      await this.flushAssistantBuffer(state);
      const content = detail ? `**${label}** \`${detail}\`` : `**${label}**`;
      const now = this.nextMessageDate();
      const msg: InteractiveMessage = {
        id: crypto.randomUUID(),
        featureId: state.featureId,
        sessionId: state.sessionId,
        role: InteractiveMessageRole.assistant,
        content,
        createdAt: now,
        updatedAt: now,
      };
      await this.persistMessage(msg);
    } catch {
      // Non-critical — don't fail the turn for a tool event
    }
  }

  /**
   * Update session status AND notify subscribers. Passes `endedAt` to
   * the repo only when supplied so call-arity matches the legacy
   * two-argument shape (keeps existing test expectations happy).
   */
  async updateSessionStatusAndNotify(
    sessionId: string,
    featureId: string,
    status: InteractiveSessionStatus,
    endedAt?: Date
  ): Promise<void> {
    if (endedAt === undefined) {
      await this.sessionRepo.updateStatus(sessionId, status);
    } else {
      await this.sessionRepo.updateStatus(sessionId, status, endedAt);
    }
    this.dispatcher.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      sessionStatus: status,
    });
  }

  /** Update turn status AND notify subscribers. */
  async updateTurnStatusAndNotify(
    sessionId: string,
    featureId: string,
    turnStatus: string
  ): Promise<void> {
    await this.sessionRepo.updateTurnStatus(sessionId, turnStatus);
    this.dispatcher.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      turnStatus,
    });
  }

  /**
   * Mark a feature scope as read (turn status → idle).
   * Uses the active in-memory session when available; falls back to the
   * most recent DB session for already-stopped scopes.
   */
  async markRead(featureId: string): Promise<void> {
    const state = this.registry.findActiveStateForFeature(featureId);
    if (state) {
      void this.updateTurnStatusAndNotify(state.sessionId, state.featureId, 'idle');
      return;
    }
    const latest = await this.sessionRepo.findByFeatureId(featureId);
    if (latest) {
      void this.updateTurnStatusAndNotify(latest.id, featureId, 'idle');
    }
  }
}
