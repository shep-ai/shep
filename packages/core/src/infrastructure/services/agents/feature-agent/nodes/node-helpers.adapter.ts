/**
 * NodeHelpersAdapter
 *
 * Infrastructure adapter that implements {@link INodeHelpers} by delegating
 * to the existing standalone helper functions in `node-helpers.ts`. This
 * lets application-layer use cases depend on the port instead of importing
 * infrastructure directly.
 */

import { injectable } from 'tsyringe';
import type { INodeHelpers } from '@/application/ports/output/services/node-helpers.interface.js';
import { writeSpecFileAtomic, safeYamlDump } from './node-helpers.js';

@injectable()
export class NodeHelpersAdapter implements INodeHelpers {
  writeSpecFileAtomic(specDir: string, filename: string, content: string): void {
    writeSpecFileAtomic(specDir, filename, content);
  }

  safeYamlDump(data: unknown): string {
    return safeYamlDump(data);
  }
}
