/**
 * Stream Deployment Logs Use Case — unit tests (RED first).
 *
 * The CLI needs the same log stream the web SSE route consumes, WITHOUT
 * consuming the route itself (FR-23: a CLI that fetched `app/api/
 * deployment-logs` would make the web daemon a hard dependency of the CLI).
 * This use case is that seam: accumulated history plus a live subscription,
 * filtered to one target inside core so no presentation layer re-derives it.
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogEntry } from '@/application/ports/output/services/deployment-service.interface.js';
import { StreamDeploymentLogsUseCase } from '@/application/use-cases/deployments/stream-deployment-logs.use-case.js';

const TARGET_ID = 'app-1';

function makeEntry(line: string, targetId = TARGET_ID): LogEntry {
  return { targetId, stream: 'stdout', line, timestamp: 1 };
}

function makeDeploymentService(history: LogEntry[] | null) {
  const handlers = new Set<(entry: LogEntry) => void>();
  return {
    getLogs: vi.fn().mockReturnValue(history),
    on: vi.fn((_event: 'log', handler: (entry: LogEntry) => void) => {
      handlers.add(handler);
    }),
    off: vi.fn((_event: 'log', handler: (entry: LogEntry) => void) => {
      handlers.delete(handler);
    }),
    emit: (entry: LogEntry) => {
      for (const handler of handlers) handler(entry);
    },
    handlers,
  };
}

function makeUseCase(deploymentService: ReturnType<typeof makeDeploymentService>) {
  return new StreamDeploymentLogsUseCase(
    deploymentService as unknown as ConstructorParameters<typeof StreamDeploymentLogsUseCase>[0]
  );
}

describe('StreamDeploymentLogsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the accumulated history for a tracked target', () => {
    const service = makeDeploymentService([makeEntry('booting')]);
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID });

    expect(stream.tracked).toBe(true);
    expect(stream.history.map((entry) => entry.line)).toEqual(['booting']);
    stream.close();
  });

  it('reports an untracked target instead of throwing', () => {
    const service = makeDeploymentService(null);
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID });

    expect(stream.tracked).toBe(false);
    expect(stream.history).toEqual([]);
    stream.close();
  });

  it('does not subscribe when no line handler is supplied', () => {
    const service = makeDeploymentService([]);
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID });

    expect(service.on).not.toHaveBeenCalled();
    stream.close();
  });

  it('delivers live lines for the target to the handler', () => {
    const service = makeDeploymentService([]);
    const onLine = vi.fn();
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID, onLine });

    service.emit(makeEntry('ready'));

    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine.mock.calls[0][0].line).toBe('ready');
    stream.close();
  });

  it('filters out lines belonging to other targets', () => {
    const service = makeDeploymentService([]);
    const onLine = vi.fn();
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID, onLine });

    service.emit(makeEntry('someone else', 'other-target'));

    expect(onLine).not.toHaveBeenCalled();
    stream.close();
  });

  it('detaches the subscription on close, idempotently', () => {
    const service = makeDeploymentService([]);
    const onLine = vi.fn();
    const stream = makeUseCase(service).execute({ targetId: TARGET_ID, onLine });

    stream.close();
    stream.close();

    expect(service.off).toHaveBeenCalledTimes(1);
    expect(service.handlers.size).toBe(0);
    service.emit(makeEntry('after close'));
    expect(onLine).not.toHaveBeenCalled();
  });

  it('rejects a blank target id', () => {
    const service = makeDeploymentService([]);
    expect(() => makeUseCase(service).execute({ targetId: '  ' })).toThrow(/targetId/);
  });
});
