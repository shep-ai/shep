/**
 * In-memory operation log event bus.
 *
 * Single-process pub/sub backed by node:events. The SQLite operation-log
 * repository publishes here after a successful INSERT; the SSE route
 * (StreamAgentEventsUseCase) subscribes and re-emits as notifications.
 *
 * A throwing subscriber is logged and swallowed so it never prevents
 * delivery to the other subscribers — publish() is best-effort fanout.
 */

import { EventEmitter } from 'node:events';
import { injectable } from 'tsyringe';

import type {
  IOperationLogEventBus,
  OperationLogEvent,
  OperationLogEventListener,
} from '../../../application/ports/output/services/operation-log-event-bus.interface.js';

const EVENT_NAME = 'operation-log-appended';

@injectable()
export class InMemoryOperationLogEventBus implements IOperationLogEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Prevent MaxListenersExceededWarning when many SSE clients subscribe.
    this.emitter.setMaxListeners(0);
  }

  publish(event: OperationLogEvent): void {
    this.emitter.emit(EVENT_NAME, event);
  }

  subscribe(listener: OperationLogEventListener): () => void {
    const safeListener: OperationLogEventListener = (event) => {
      try {
        listener(event);
      } catch (error) {
        // Low-level bus — no logger injected here. A misbehaving
        // subscriber must not poison the fanout; log to stderr and move
        // on. The SSE stream and every other subscriber keep working.
        // eslint-disable-next-line no-console
        console.error('[OperationLogBus] subscriber threw — continuing fanout', error);
      }
    };
    this.emitter.on(EVENT_NAME, safeListener);
    return () => this.emitter.off(EVENT_NAME, safeListener);
  }
}
