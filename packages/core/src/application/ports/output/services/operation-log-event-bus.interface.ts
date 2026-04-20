import type { OperationLogEntry } from '../../../../domain/generated/output.js';

/**
 * OperationLog Event Bus (port)
 *
 * In-process pub/sub for newly-appended operation_log_entries. The SSE
 * route (StreamAgentEventsUseCase in spec 090) subscribes and re-emits
 * each publish as a notification so the web client can render log
 * lines in real time without polling.
 *
 * DB is source of truth — publishers MUST publish only after a
 * successful INSERT. Subscribers MUST NOT assume they see every event
 * (SW restart / reconnect may drop a window); the client should
 * rehydrate from the DB on first open.
 */
export interface OperationLogEvent {
  entry: OperationLogEntry;
}

export type OperationLogEventListener = (event: OperationLogEvent) => void;

export interface IOperationLogEventBus {
  publish(event: OperationLogEvent): void;
  subscribe(listener: OperationLogEventListener): () => void;
}
