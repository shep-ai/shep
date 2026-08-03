/**
 * Adopt Agent Session Use Case
 *
 * Turns an existing agent CLI conversation into a tracked shep feature.
 *
 * Business Rules:
 * - The transcript is read through IAgentSessionRepository. This use case never
 *   touches the filesystem, and never asks the agent to go read the file itself
 *   (which is what the previous presentation-layer stopgap did).
 * - Metadata derivation is delegated to SessionAdoptionSummarizer.
 * - The feature is created via CreateFeatureUseCase.createRecord() — NOT
 *   execute(), whose second phase always creates a git worktree, and NOT with
 *   `pending: true`, which lands the feature in Pending rather than
 *   Requirements. createRecord is the only path that yields a Requirements
 *   feature with no branch and no agent run, which is the resolved product
 *   decision: the user reviews what shep derived before any code is written.
 * - The originating session id and agent type are persisted so the feature
 *   stays traceable back to the conversation it came from.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, AgentType, Feature } from '../../../domain/generated/output.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { CreateFeatureUseCase } from '../features/create/create-feature.use-case.js';
import { SessionAdoptionSummarizer } from './session-adoption-summarizer.js';

/** Read the whole transcript — 0 means "no message limit". */
const ALL_MESSAGES = 0;

export interface AdoptAgentSessionInput {
  /** Provider-native session id */
  sessionId: string;
  /** Agent provider that owns the session */
  agentType: AgentType | string;
  /** Repository the adopted feature belongs to */
  repositoryPath: string;
}

export interface AdoptAgentSessionResult {
  feature: Feature;
  /** True when metadata came from deterministic extraction, not the model */
  derivedLocally: boolean;
}

/** Raised when the requested session cannot be read. */
export class AgentSessionNotFoundError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly agentType: string
  ) {
    super(`Agent session "${sessionId}" not found for provider "${agentType}"`);
    this.name = 'AgentSessionNotFoundError';
  }
}

/** Raised when the provider has no session-reading implementation. */
export class AgentSessionProviderUnsupportedError extends Error {
  constructor(public readonly agentType: string) {
    super(`Session adoption is not supported for provider "${agentType}"`);
    this.name = 'AgentSessionProviderUnsupportedError';
  }
}

@injectable()
export class AdoptAgentSessionUseCase {
  constructor(
    @inject('IAgentSessionRepositoryRegistry')
    private readonly registry: IAgentSessionRepositoryRegistry,
    @inject(SessionAdoptionSummarizer)
    private readonly summarizer: SessionAdoptionSummarizer,
    @inject(CreateFeatureUseCase)
    private readonly createFeature: CreateFeatureUseCase,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository
  ) {}

  async execute(input: AdoptAgentSessionInput): Promise<AdoptAgentSessionResult> {
    const session = await this.loadSession(input);
    const summary = await this.summarizer.summarize(session);

    // createRecord only: DB writes, lifecycle Requirements, no worktree, no
    // spawned agent. See the class docblock for why execute() is wrong here.
    const { feature } = await this.createFeature.createRecord({
      userInput: this.buildUserQuery(session, summary.description, summary.remainingWork),
      repositoryPath: input.repositoryPath,
      name: summary.name,
      description: summary.description,
    });

    const withProvenance = await this.recordProvenance(feature, session);

    return { feature: withProvenance, derivedLocally: summary.derivedLocally };
  }

  private async loadSession(input: AdoptAgentSessionInput): Promise<AgentSession> {
    const repository = this.registry.getRepository(input.agentType as AgentType);

    if (!repository.isSupported()) {
      throw new AgentSessionProviderUnsupportedError(String(input.agentType));
    }

    const session = await repository.findById(input.sessionId, { messageLimit: ALL_MESSAGES });
    if (session === null) {
      throw new AgentSessionNotFoundError(input.sessionId, String(input.agentType));
    }

    return session;
  }

  /**
   * Persist the originating session on the feature.
   *
   * Done as a follow-up update because createRecord owns feature construction;
   * threading provenance through its input would widen an already large
   * interface for one caller.
   */
  private async recordProvenance(feature: Feature, session: AgentSession): Promise<Feature> {
    const updated: Feature = {
      ...feature,
      sourceAgentSessionId: session.id,
      sourceAgentType: session.agentType,
      updatedAt: new Date(),
    };

    await this.featureRepo.update(updated);
    return updated;
  }

  /**
   * The preserved "user query" for an adopted feature. Records where the work
   * came from plus the derived summary — never raw transcript content.
   */
  private buildUserQuery(
    session: AgentSession,
    description: string,
    remainingWork: string
  ): string {
    return [
      `Adopted from an existing ${session.agentType} session (${session.messageCount} messages).`,
      '',
      description,
      '',
      `Remaining work: ${remainingWork}`,
    ].join('\n');
  }
}
