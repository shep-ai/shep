/**
 * ListOperationLogEntriesUseCase
 *
 * Returns the full ordered log history for one long-running operation
 * scoped by (kind, id). This is the single read-side entry point — UI
 * routes call this use case rather than touching the repository directly,
 * keeping the dependency rule intact (presentation → application → ports).
 */

import { inject, injectable } from 'tsyringe';

import type { IOperationLogService } from '../../ports/output/services/operation-log-service.interface.js';
import type { OperationLogEntry, OperationLogKind } from '../../../domain/generated/output.js';

export interface ListOperationLogEntriesInput {
  kind: OperationLogKind;
  id: string;
}

@injectable()
export class ListOperationLogEntriesUseCase {
  constructor(
    @inject('IOperationLogService')
    private readonly logService: IOperationLogService
  ) {}

  async execute(input: ListOperationLogEntriesInput): Promise<readonly OperationLogEntry[]> {
    return this.logService.list(input.kind, input.id);
  }
}
