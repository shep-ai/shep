/**
 * Feedback themes (spec 127): GetFeedbackThemesUseCase groups a space's
 * unlinked signals into themes; PromoteThemeUseCase turns one into a proposed
 * opportunity with every signal of the theme linked.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunitySource,
  type Opportunity,
  type Space,
} from '../../../domain/generated/output.js';
import { groupIntoThemes, type FeedbackTheme } from '../../../domain/shared/feedback-themes.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { ISignalRepository } from '../../ports/output/repositories/opportunity-repository.interface.js';
import { ManageOpportunitiesUseCase } from '../opportunities/manage-opportunities.use-case.js';
import { ManageSignalsUseCase } from '../opportunities/manage-signals.use-case.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';

export interface PromoteThemeInput {
  space?: string;
  /** The theme key: the id of its oldest signal. */
  theme: string;
  /** Defaults to the theme label. */
  title?: string;
  reviewHours: number;
  confidence?: number;
}

function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

@injectable()
export class GetFeedbackThemesUseCase {
  constructor(
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  /** `space` is a space id or slug; the default space when omitted. */
  async execute(
    space?: string
  ): Promise<OpportunityResult<{ space: Space; themes: FeedbackTheme[] }>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const loose = await this.signals.list({ spaceId: scope.space.id, unlinked: true });
    return { ok: true, space: scope.space, themes: groupIntoThemes(loose) };
  }
}

@injectable()
export class PromoteThemeUseCase {
  constructor(
    @inject(GetFeedbackThemesUseCase) private readonly themes: GetFeedbackThemesUseCase,
    @inject(ManageOpportunitiesUseCase) private readonly opportunities: ManageOpportunitiesUseCase,
    @inject(ManageSignalsUseCase) private readonly signals: ManageSignalsUseCase
  ) {}

  async execute(
    input: PromoteThemeInput
  ): Promise<OpportunityResult<{ opportunity: Opportunity; linked: number }>> {
    const found = await this.themes.execute(input.space);
    if (!found.ok) return found;
    const theme = found.themes.find((candidate) => candidate.key === input.theme.trim());
    if (!theme) return failure(`No theme "${input.theme}" in ${found.space.name}.`);

    const created = await this.opportunities.create({
      space: found.space.id,
      title: input.title?.trim() ? input.title : sentence(theme.label),
      reviewHours: input.reviewHours,
      source: OpportunitySource.Theme,
      ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    });
    if (!created.ok) return created;
    for (const signal of theme.signals) {
      const linked = await this.signals.link(signal.id, created.opportunity.id);
      if (!linked.ok) return linked;
    }
    return { ok: true, opportunity: created.opportunity, linked: theme.signals.length };
  }
}
