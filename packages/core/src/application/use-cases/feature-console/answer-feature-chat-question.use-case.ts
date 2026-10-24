/**
 * Answer Feature Chat Question Use Case (spec 147)
 *
 * Answers the question a feature's chat agent asked (AskUserQuestion), keyed
 * by question text as every surface does. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { RespondToInteractionUseCase } from '../interactive/respond-to-interaction.use-case.js';
import type { FeatureChatResult } from './feature-chat.types.js';
import { findFeatureByIdOrPrefix } from './find-feature.js';

export interface AnswerFeatureChatQuestionInput {
  /** Feature id or id prefix. */
  featureId: string;
  /** Answers keyed by question text. */
  answers: Record<string, string>;
}

@injectable()
export class AnswerFeatureChatQuestionUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(RespondToInteractionUseCase)
    private readonly respond: RespondToInteractionUseCase
  ) {}

  async execute(input: AnswerFeatureChatQuestionInput): Promise<FeatureChatResult> {
    try {
      const feature = await findFeatureByIdOrPrefix(this.featureRepo, input.featureId);
      if (!feature) return { ok: false, message: `Feature not found: ${input.featureId}` };
      await this.respond.execute({ featureId: feature.id, answers: input.answers });
      return { ok: true, message: 'Answered' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
