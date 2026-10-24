/**
 * Send Feature Chat Message Use Case (spec 147)
 *
 * Sends the user's message to a feature's agent chat through the same
 * interactive session use case as the web Chat tab, in the feature's
 * directory. The first message boots the agent; it runs in the calling
 * process. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import type { FeatureChatResult } from './feature-chat.types.js';
import { interactiveAgentDisabledReason } from './feature-chat-availability.js';
import { resolveFeatureDirectory } from './feature-directory.js';
import { findFeatureByIdOrPrefix } from './find-feature.js';

export interface SendFeatureChatMessageInput {
  /** Feature id or id prefix. */
  featureId: string;
  content: string;
}

@injectable()
export class SendFeatureChatMessageUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IWorktreePathProvider')
    private readonly worktreePaths: IWorktreePathProvider,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    @inject('ISettingsProvider')
    private readonly settings: ISettingsProvider,
    @inject(SendInteractiveMessageUseCase)
    private readonly send: SendInteractiveMessageUseCase
  ) {}

  async execute(input: SendFeatureChatMessageInput): Promise<FeatureChatResult> {
    const content = input.content.trim();
    if (!content) return { ok: false, message: 'Type a message first.' };
    try {
      const disabled = interactiveAgentDisabledReason(this.settings);
      if (disabled) return { ok: false, message: disabled };
      const feature = await findFeatureByIdOrPrefix(this.featureRepo, input.featureId);
      if (!feature) return { ok: false, message: `Feature not found: ${input.featureId}` };
      await this.send.execute({
        featureId: feature.id,
        content,
        worktreePath: resolveFeatureDirectory(feature, this.worktreePaths, this.fileSystem),
      });
      return { ok: true, message: 'Sent' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
