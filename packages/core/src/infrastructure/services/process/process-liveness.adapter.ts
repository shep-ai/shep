/**
 * ProcessLivenessAdapter
 *
 * Concrete adapter for `IProcessLivenessProbe` that delegates to the existing
 * `isProcessAlive` function (which uses `process.kill(pid, 0)` — cross-platform).
 */

import { injectable } from 'tsyringe';

import type { IProcessLivenessProbe } from '../../../application/ports/output/services/process-liveness.interface.js';
import { isProcessAlive } from './is-process-alive.js';

@injectable()
export class ProcessLivenessAdapter implements IProcessLivenessProbe {
  isProcessAlive(pid: number): boolean {
    return isProcessAlive(pid);
  }
}
