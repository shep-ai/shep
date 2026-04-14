import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { OperationLogService } from '@/infrastructure/services/operation-log/operation-log.service.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type {
  AppendOperationLogEntryInput,
  IOperationLogRepository,
} from '@/application/ports/output/repositories/operation-log.repository.interface.js';
import {
  OperationLogKind,
  OperationLogLevel,
  type OperationLogEntry,
} from '@/domain/generated/output.js';

class FakeRepo implements IOperationLogRepository {
  readonly appended: AppendOperationLogEntryInput[] = [];
  private fail = false;
  failNext() {
    this.fail = true;
  }
  async append(input: AppendOperationLogEntryInput): Promise<OperationLogEntry> {
    if (this.fail) {
      this.fail = false;
      throw new Error('db locked');
    }
    this.appended.push(input);
    const now = new Date();
    return {
      id: `id-${this.appended.length}`,
      operationKind: input.operationKind,
      operationId: input.operationId,
      level: input.level,
      message: input.message,
      detail: input.detail,
      createdAt: now,
      updatedAt: now,
    };
  }
  async listByScope(): Promise<readonly OperationLogEntry[]> {
    return this.appended.map((input, idx) => ({
      id: `id-${idx + 1}`,
      operationKind: input.operationKind,
      operationId: input.operationId,
      level: input.level,
      message: input.message,
      detail: input.detail,
      createdAt: new Date(idx),
      updatedAt: new Date(idx),
    }));
  }
  async pruneBefore(): Promise<number> {
    return 0;
  }
}

class CapturingLogger implements ILogger {
  readonly warnings: { msg: string; meta?: unknown }[] = [];
  debug(): void {
    /* no-op */
  }
  info(): void {
    /* no-op */
  }
  warn(msg: string, meta?: unknown): void {
    this.warnings.push({ msg, meta });
  }
  error(): void {
    /* no-op */
  }
}

describe('OperationLogService', () => {
  const KIND = OperationLogKind.CloudDeploy;
  const ID = 'app-1';

  it('routes debug/info/warn/error to the repository with the correct level', async () => {
    const repo = new FakeRepo();
    const logger = new CapturingLogger();
    const svc = new OperationLogService(repo, logger);

    await svc.debug(KIND, ID, 'dbg');
    await svc.info(KIND, ID, 'inf');
    await svc.warn(KIND, ID, 'wrn');
    await svc.error(KIND, ID, 'err', 'stack here');

    expect(repo.appended).toHaveLength(4);
    expect(repo.appended[0].level).toBe(OperationLogLevel.Debug);
    expect(repo.appended[1].level).toBe(OperationLogLevel.Info);
    expect(repo.appended[2].level).toBe(OperationLogLevel.Warn);
    expect(repo.appended[3].level).toBe(OperationLogLevel.Error);
    expect(repo.appended[3].detail).toBe('stack here');
  });

  it('swallows repository errors and returns a synthetic entry so callers never abort on a log hiccup', async () => {
    const repo = new FakeRepo();
    const logger = new CapturingLogger();
    const svc = new OperationLogService(repo, logger);

    repo.failNext();
    const result = await svc.info(KIND, ID, 'should not throw');

    expect(result.message).toBe('should not throw');
    expect(result.id).toMatch(/^unpersisted-/);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0].msg).toContain('failed to append operation log entry');
  });

  it('list() delegates to repository.listByScope', async () => {
    const repo = new FakeRepo();
    const logger = new CapturingLogger();
    const svc = new OperationLogService(repo, logger);

    await svc.info(KIND, ID, 'first');
    await svc.warn(KIND, ID, 'second');

    const entries = await svc.list(KIND, ID);
    expect(entries.map((e) => e.message)).toEqual(['first', 'second']);
  });
});
