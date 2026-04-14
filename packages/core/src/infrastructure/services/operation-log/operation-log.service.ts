/**
 * OperationLogService
 *
 * Default implementation of IOperationLogService. Delegates persistence to
 * IOperationLogRepository and provides convenience methods for each level.
 *
 * Failure-isolation rule: log writes must NEVER raise out of a use case in a
 * way that masks the original operation error. If the repository throws (DB
 * locked, disk full, etc.) we swallow and warn via ILogger so the user still
 * gets the meaningful "deploy failed" outcome — losing a log line is much
 * better than turning a failed deploy into a 500 with a stack trace from the
 * logger.
 */

import { inject, injectable } from 'tsyringe';

import type { IOperationLogService } from '../../../application/ports/output/services/operation-log-service.interface.js';
import type { IOperationLogRepository } from '../../../application/ports/output/repositories/operation-log.repository.interface.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import {
  OperationLogLevel,
  type OperationLogEntry,
  type OperationLogKind,
} from '../../../domain/generated/output.js';

@injectable()
export class OperationLogService implements IOperationLogService {
  constructor(
    @inject('IOperationLogRepository')
    private readonly repo: IOperationLogRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  debug(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry> {
    return this.appendSafe(kind, id, OperationLogLevel.Debug, message, detail);
  }

  info(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry> {
    return this.appendSafe(kind, id, OperationLogLevel.Info, message, detail);
  }

  warn(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry> {
    return this.appendSafe(kind, id, OperationLogLevel.Warn, message, detail);
  }

  error(
    kind: OperationLogKind,
    id: string,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry> {
    return this.appendSafe(kind, id, OperationLogLevel.Error, message, detail);
  }

  list(kind: OperationLogKind, id: string): Promise<readonly OperationLogEntry[]> {
    return this.repo.listByScope(kind, id);
  }

  private async appendSafe(
    kind: OperationLogKind,
    id: string,
    level: OperationLogLevel,
    message: string,
    detail?: string
  ): Promise<OperationLogEntry> {
    try {
      return await this.repo.append({
        operationKind: kind,
        operationId: id,
        level,
        message,
        detail,
      });
    } catch (err) {
      // Don't surface — losing one log line beats turning a deploy into a 500.
      this.logger.warn('failed to append operation log entry', {
        kind,
        id,
        level,
        err: err instanceof Error ? err.message : String(err),
      });
      // Return a synthetic entry so callers don't get null. Created/updated
      // are stamped with `now` so the UI still gets a sensible ordering even
      // if the DB write was lost.
      const now = new Date();
      return {
        id: `unpersisted-${now.getTime()}`,
        operationKind: kind,
        operationId: id,
        level,
        message,
        detail,
        createdAt: now,
        updatedAt: now,
      };
    }
  }
}
