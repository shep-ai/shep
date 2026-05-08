/**
 * SQLiteAgentMessageBus — durable cross-process adapter for {@link IAgentMessageBus}.
 *
 * Wraps {@link IAgentMessageRepository} for persistence and runs a single
 * shared poll loop that periodically reads undelivered messages from the
 * shared SQLite database. Each subscription receives messages whose scope
 * matches its filter; messages are marked delivered_at after the first
 * read so the partial undelivered index stays small (research decision 2).
 *
 * Cross-process delivery is "free" by virtue of every Shep process opening
 * the same `~/.shep/<repo-hash>/shep.db` file in WAL mode — see CLAUDE.md
 * + research.yaml.
 */

import { inject, injectable } from 'tsyringe';
import type {
  AgentMessageBusFilter,
  AgentMessageHandler,
  AgentMessageUnsubscribe,
  IAgentMessageBus,
} from '@/application/ports/output/agents/agent-message-bus.interface.js';
import type { IAgentMessageRepository } from '@/application/ports/output/repositories/agent-message-repository.interface.js';
import { PeerAddressingForbiddenError } from '@/domain/errors/peer-addressing-forbidden.error.js';
import type { AgentMessage } from '@/domain/generated/output.js';

/** Default poll cadence — matches StreamAgentEventsUseCase (2s). */
const DEFAULT_POLL_INTERVAL_MS = 2_000;

/** Per-subscription state. */
interface Subscription {
  filter: AgentMessageBusFilter;
  handler: AgentMessageHandler;
  /** High-water mark — only deliver messages with `created_at >` this id's createdAt. */
  lastSeenAt: number;
  /** Messages already delivered to this subscription (avoid double-fire on retry). */
  delivered: Set<string>;
}

function toMillis(value: AgentMessage['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

function matchesAgentRun(filter: AgentMessageBusFilter, message: AgentMessage): boolean {
  if (filter.agentRunId === undefined) return true;
  return (
    message.fromAgentRunId === filter.agentRunId ||
    (message.toKind === 'agent' && message.toTarget === filter.agentRunId)
  );
}

@injectable()
export class SQLiteAgentMessageBus implements IAgentMessageBus {
  private readonly subscriptions = new Set<Subscription>();
  private pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    @inject('IAgentMessageRepository')
    private readonly repository: IAgentMessageRepository
  ) {}

  /** Test-only override; production code relies on {@link DEFAULT_POLL_INTERVAL_MS}. */
  setPollIntervalMs(ms: number): void {
    this.pollIntervalMs = ms;
    if (this.timer !== null) {
      this.stopPolling();
      this.ensurePolling();
    }
  }

  async publish(message: AgentMessage): Promise<void> {
    if (message.toKind === 'peer') {
      throw new PeerAddressingForbiddenError(message.toKind);
    }
    await this.repository.create(message);
  }

  subscribe(filter: AgentMessageBusFilter, handler: AgentMessageHandler): AgentMessageUnsubscribe {
    const sub: Subscription = {
      filter,
      handler,
      lastSeenAt: filter.since ? filter.since.getTime() : 0,
      delivered: new Set(),
    };
    this.subscriptions.add(sub);
    this.ensurePolling();
    return () => {
      this.subscriptions.delete(sub);
      if (this.subscriptions.size === 0) {
        this.stopPolling();
      }
    };
  }

  async listFor(filter: AgentMessageBusFilter, limit?: number): Promise<AgentMessage[]> {
    const rows = await this.repository.listByScope(filter.appId, filter.featureId, {
      since: filter.since,
      limit,
    });
    return filter.agentRunId === undefined ? rows : rows.filter((m) => matchesAgentRun(filter, m));
  }

  /**
   * Stop the poll loop. Idempotent. Tests should call this in afterEach to
   * avoid leaking the interval; production code can rely on process exit.
   */
  shutdown(): void {
    this.subscriptions.clear();
    this.stopPolling();
  }

  private ensurePolling(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      // Snapshot subscriptions to allow reentrant unsubscribe inside handlers.
      const subs = Array.from(this.subscriptions);
      for (const sub of subs) {
        const rows = await this.repository.listByScope(sub.filter.appId, sub.filter.featureId, {
          since: new Date(sub.lastSeenAt),
        });

        for (const row of rows) {
          if (sub.delivered.has(row.id)) continue;
          if (!matchesAgentRun(sub.filter, row)) continue;

          sub.delivered.add(row.id);
          const createdMs = toMillis(row.createdAt);
          if (createdMs > sub.lastSeenAt) sub.lastSeenAt = createdMs;

          try {
            await sub.handler(row);
          } catch {
            // Handler errors must not break the poll loop or other subscribers.
          }

          // Mark delivered_at so the partial undelivered index stays flat.
          if (!row.deliveredAt) {
            try {
              await this.repository.markDelivered(row.appId ?? '', row.id, new Date());
            } catch {
              // Best-effort — ignore races where another reader marked it first.
            }
          }
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
