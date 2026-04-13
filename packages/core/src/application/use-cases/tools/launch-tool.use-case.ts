/**
 * LaunchToolUseCase
 *
 * Launches a tool in a target directory by delegating to IIdeLauncherService.
 * Validates tool existence and openDirectory capability before launching.
 * Returns a typed discriminated union result.
 */

import { injectable, inject } from 'tsyringe';
import { platform } from 'node:os';
import type { IIdeLauncherService } from '../../ports/output/services/ide-launcher-service.interface.js';
import type { IToolMetadataProvider } from '../../ports/output/services/tool-metadata-provider.interface.js';

export interface LaunchToolInput {
  toolId: string;
  directoryPath: string;
  /** When true, CLI agents open in a new terminal window instead of inheriting stdio. */
  headless?: boolean;
}

export type LaunchToolResult =
  | { ok: true; editorName: string; path: string }
  | { ok: false; code: 'tool_not_found' | 'not_launchable' | 'launch_failed'; message: string };

function resolvePlatformString(
  value: string | Record<string, string> | undefined,
  currentPlatform: string
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return value[currentPlatform];
}

@injectable()
export class LaunchToolUseCase {
  constructor(
    @inject('IIdeLauncherService')
    private readonly ideLauncherService: IIdeLauncherService,
    @inject('IToolMetadataProvider')
    private readonly toolMetadata: IToolMetadataProvider
  ) {}

  async execute({ toolId, directoryPath, headless }: LaunchToolInput): Promise<LaunchToolResult> {
    const metadata = this.toolMetadata.getToolById(toolId);
    if (!metadata) {
      return { ok: false, code: 'tool_not_found', message: `Tool '${toolId}' not found` };
    }

    const openDirectory = resolvePlatformString(metadata.openDirectory, platform());
    if (!openDirectory) {
      return {
        ok: false,
        code: 'not_launchable',
        message: `Tool '${toolId}' has no openDirectory command for this platform`,
      };
    }

    const result = await this.ideLauncherService.launch(toolId, directoryPath, { headless });
    if (!result.ok) {
      return { ok: false, code: 'launch_failed', message: result.message };
    }

    return { ok: true, editorName: result.editorName, path: directoryPath };
  }
}
