/**
 * Shep Instance Service
 *
 * Infrastructure implementation of IShepInstanceService.
 * Detects whether a target path is the same directory as the running
 * Shep instance by canonicalizing both paths with realpathSync and
 * comparing them after normalizing separators to forward slashes.
 *
 * The running instance path is read from `SHEP_INSTANCE_PATH` (or the
 * legacy `NEXT_PUBLIC_SHEP_INSTANCE_PATH`) and falls back to `process.cwd()`.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { injectable } from 'tsyringe';
import type { IShepInstanceService } from '../../application/ports/output/services/shep-instance-service.interface.js';

@injectable()
export class ShepInstanceService implements IShepInstanceService {
  isSameInstance(targetPath: string): boolean {
    const instancePath =
      process.env.SHEP_INSTANCE_PATH ?? process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH ?? process.cwd();

    try {
      const normalizedTarget = realpathSync(resolve(targetPath)).replace(/\\/g, '/');
      const normalizedInstance = realpathSync(resolve(instancePath)).replace(/\\/g, '/');
      return normalizedTarget === normalizedInstance;
    } catch {
      // Path does not exist or is not accessible — assume "not same instance"
      // so the caller can surface a more specific "path does not exist" error.
      return false;
    }
  }
}
