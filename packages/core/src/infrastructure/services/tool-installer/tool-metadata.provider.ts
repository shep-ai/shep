/**
 * ToolMetadataProvider
 *
 * Infrastructure adapter implementing IToolMetadataProvider.
 *
 * Delegates to the module-level TOOL_METADATA constant populated by
 * loadToolMetadata() in tool-metadata.ts so behaviour is byte-identical
 * to the previous direct-import usage. The raw TOOL_METADATA export is
 * intentionally kept around for other infrastructure/presentation callers
 * that have not yet migrated.
 */

import { injectable } from 'tsyringe';
import type {
  IToolMetadataProvider,
  ToolMetadata,
} from '../../../application/ports/output/services/tool-metadata-provider.interface.js';
import { TOOL_METADATA } from './tool-metadata.js';

@injectable()
export class ToolMetadataProvider implements IToolMetadataProvider {
  getToolById(toolId: string): ToolMetadata | undefined {
    return TOOL_METADATA[toolId];
  }

  getAllEntries(): [string, ToolMetadata][] {
    return Object.entries(TOOL_METADATA);
  }
}
