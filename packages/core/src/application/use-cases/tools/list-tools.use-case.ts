/**
 * ListToolsUseCase
 *
 * Returns all tools from the JSON source of truth, each enriched with
 * live ToolInstallationStatus via IToolInstallerService.checkAvailability().
 * Platform-specific fields (openDirectory, installCommand) are pre-resolved
 * so the DTO is fully serialisable with no union types.
 */

import { injectable, inject } from 'tsyringe';
import { platform } from 'node:os';
import type { ToolInstallationStatus } from '../../../domain/generated/output.js';
import type { IToolInstallerService } from '../../ports/output/services/index.js';
import type { IToolMetadataProvider } from '../../ports/output/services/tool-metadata-provider.interface.js';

export interface ToolItem {
  id: string;
  name: string;
  summary: string;
  description: string;
  tags: ('ide' | 'cli-agent' | 'vcs' | 'terminal' | 'memory' | 'cluster')[];
  iconUrl: string | undefined;
  autoInstall: boolean;
  required: boolean;
  openDirectory: string | undefined;
  documentationUrl: string;
  installCommand: string | undefined;
  status: ToolInstallationStatus;
  author: string | undefined;
  website: string | undefined;
  platforms: ('linux' | 'darwin' | 'win32')[] | undefined;
}

export type ListToolsResult = ToolItem[];

function resolvePlatformString(
  value: string | Record<string, string> | undefined,
  currentPlatform: string
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return value[currentPlatform];
}

@injectable()
export class ListToolsUseCase {
  constructor(
    @inject('IToolInstallerService')
    private readonly toolInstallerService: IToolInstallerService,
    @inject('IToolMetadataProvider')
    private readonly toolMetadata: IToolMetadataProvider
  ) {}

  async execute(): Promise<ListToolsResult> {
    const entries = this.toolMetadata.getAllEntries();
    const currentPlatform = platform();

    const results = await Promise.all(
      entries.map(async ([id, metadata]): Promise<ToolItem> => {
        let status: ToolInstallationStatus;
        try {
          status = await this.toolInstallerService.checkAvailability(id);
        } catch {
          status = { status: 'error', toolName: id, errorMessage: 'Availability check failed' };
        }

        return {
          id,
          name: metadata.name,
          summary: metadata.summary,
          description: metadata.description,
          tags: metadata.tags,
          iconUrl: metadata.iconUrl,
          autoInstall: metadata.autoInstall ?? true,
          required: metadata.required ?? false,
          openDirectory: resolvePlatformString(metadata.openDirectory, currentPlatform),
          documentationUrl: metadata.documentationUrl,
          installCommand: metadata.commands[currentPlatform],
          status,
          author: metadata.author,
          website: metadata.website,
          platforms: metadata.platforms,
        };
      })
    );

    return results;
  }
}
