/**
 * IScanRunRepository (Phase 11). Append-only history of every scan
 * execution, with read access for the SSE stream + the "Last scanned"
 * dashboard tile.
 */

import type { ScanRun } from '../../../../domain/generated/output';

export interface IScanRunRepository {
  save(run: ScanRun): Promise<void>;
  findById(id: string): Promise<ScanRun | null>;
  listLatestForApplication(applicationId: string, limit: number): Promise<ScanRun[]>;
  findLatestForApplication(applicationId: string): Promise<ScanRun | null>;
}
