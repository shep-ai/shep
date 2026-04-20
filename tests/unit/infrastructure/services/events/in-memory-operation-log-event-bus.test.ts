import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryOperationLogEventBus } from '@/infrastructure/services/events/in-memory-operation-log-event-bus.js';
import type { OperationLogEvent } from '@/application/ports/output/services/operation-log-event-bus.interface.js';
import {
  OperationLogKind,
  OperationLogLevel,
  type OperationLogEntry,
} from '@/domain/generated/output.js';

function entry(overrides: Partial<OperationLogEntry> = {}): OperationLogEntry {
  const now = new Date();
  return {
    id: 'entry-1',
    operationKind: OperationLogKind.CloudDeploy,
    operationId: 'app-1',
    level: OperationLogLevel.Info,
    message: 'hello',
    detail: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function event(overrides: Partial<OperationLogEntry> = {}): OperationLogEvent {
  return { entry: entry(overrides) };
}

describe('InMemoryOperationLogEventBus', () => {
  it('delivers a published event to a subscriber with the correct entry', () => {
    const bus = new InMemoryOperationLogEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);

    const e = event({ message: 'first' });
    bus.publish(e);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(e);
    expect(listener.mock.calls[0][0].entry.message).toBe('first');
  });

  it('fans out each published event to every subscriber', () => {
    const bus = new InMemoryOperationLogEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.subscribe(c);

    const e1 = event({ id: 'e1' });
    const e2 = event({ id: 'e2' });
    bus.publish(e1);
    bus.publish(e2);

    for (const listener of [a, b, c]) {
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, e1);
      expect(listener).toHaveBeenNthCalledWith(2, e2);
    }
  });

  it('unsubscribing stops delivery and a second unsubscribe is a no-op', () => {
    const bus = new InMemoryOperationLogEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.publish(event({ id: 'e1' }));
    unsubscribe();
    bus.publish(event({ id: 'e2' }));
    // Second unsubscribe must not throw.
    expect(() => unsubscribe()).not.toThrow();
    bus.publish(event({ id: 'e3' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].entry.id).toBe('e1');
  });

  it('continues delivering to other subscribers when one subscriber throws', () => {
    const bus = new InMemoryOperationLogEventBus();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* silence expected error log during the throwing-subscriber test */
    });

    const good1 = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good2 = vi.fn();

    bus.subscribe(good1);
    bus.subscribe(bad);
    bus.subscribe(good2);

    const e = event();
    expect(() => bus.publish(e)).not.toThrow();

    expect(good1).toHaveBeenCalledWith(e);
    expect(good2).toHaveBeenCalledWith(e);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('publish() never throws even when the only subscriber throws', () => {
    const bus = new InMemoryOperationLogEventBus();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* silence expected error log during the throwing-subscriber test */
    });

    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    bus.subscribe(bad);

    expect(() => bus.publish(event())).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
