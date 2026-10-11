/**
 * List Chat Conversations Use Case (spec 137)
 *
 * Every conversation the chat-first page lists, in display order: the
 * Shep-wide chat, then one per repository, live feature and application. Each
 * carries its scope key (the key its messages are stored under) and the
 * directory its agent works in, so any surface can open it with no further
 * lookups.
 */

import { injectable, inject } from 'tsyringe';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import { ChatScopeKind, type SdlcLifecycle } from '../../../domain/generated/output.js';
import { GLOBAL_CHAT_SCOPE, chatScopeForRepository } from '../../../domain/shared/chat-scope.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';

/** The Shep-wide conversation is named after the product. */
const GLOBAL_CONVERSATION_TITLE = 'Shep';

export interface ChatConversation {
  scope: string;
  kind: ChatScopeKind;
  title: string;
  /** Secondary line: the repository a feature belongs to. */
  subtitle?: string;
  /** Directory the conversation's agent works in; unset for the Shep-wide chat. */
  worktreePath?: string;
  /** Feature conversations only. */
  featureId?: string;
  lifecycle?: SdlcLifecycle;
}

@injectable()
export class ListChatConversationsUseCase {
  constructor(
    @inject('IRepositoryRepository') private readonly repositories: IRepositoryRepository,
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject('IWorktreePathProvider') private readonly worktrees: IWorktreePathProvider
  ) {}

  async execute(): Promise<ChatConversation[]> {
    const [repositories, features, applications] = await Promise.all([
      this.repositories.list(),
      // The default filters leave out archived and deleted features.
      this.features.list(),
      this.applications.list(),
    ]);
    const repositoryNames = new Map(repositories.map((r) => [r.path, r.name]));

    return [
      { scope: GLOBAL_CHAT_SCOPE, kind: ChatScopeKind.Global, title: GLOBAL_CONVERSATION_TITLE },
      ...repositories.map((repository) => ({
        scope: chatScopeForRepository(repository.id),
        kind: ChatScopeKind.Repository,
        title: repository.name,
        worktreePath: repository.path,
      })),
      ...features.map((feature) => {
        const repositoryName = repositoryNames.get(feature.repositoryPath);
        return {
          scope: feature.id,
          kind: ChatScopeKind.Feature,
          title: feature.name,
          ...(repositoryName ? { subtitle: repositoryName } : {}),
          worktreePath:
            feature.worktreePath ??
            this.worktrees.getWorktreePath(feature.repositoryPath, feature.branch),
          featureId: feature.id,
          lifecycle: feature.lifecycle,
        };
      }),
      ...applications.map((application) => ({
        scope: featureIdForApplication(application.id),
        kind: ChatScopeKind.Application,
        title: application.name,
        worktreePath: application.repositoryPath,
      })),
    ];
  }
}
