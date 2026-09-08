/**
 * Get Adaptive Model Plan Use Case
 *
 * Answers "if adaptive model selection runs right now, which model executes a
 * High / Medium / Low task?" — the question every settings surface needs to
 * show the user before they turn the mode on.
 *
 * The answer depends on three things that live in different places (the
 * configured agent, the pinned model, and the per-tier overrides), so deriving
 * it belongs here rather than in each of the CLI, TUI and web layers.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentType, Settings } from '../../../domain/generated/output.js';
import type { AdaptiveTierPlan } from '../../../domain/shared/model-tier.js';
import {
  isAdaptiveModelSelectionEnabled,
  tierOverridesFrom,
} from '../../../domain/shared/model-tier.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IAgentExecutorFactory } from '../../ports/output/agents/agent-executor-factory.interface.js';

/**
 * Everything a settings surface needs to render the adaptive-mode section,
 * ready to display — no post-processing required by the caller.
 */
export interface AdaptiveModelPlan {
  /** Whether adaptive routing is currently on. */
  enabled: boolean;
  /** The agent that will execute tasks. */
  agentType: AgentType;
  /** The pinned model, which acts as the ceiling for every tier. */
  baseModel: string;
  /** The model each complexity tier resolves to right now. */
  tiers: AdaptiveTierPlan;
  /** Explicit per-tier overrides the user has set, if any. */
  overrides: { high?: string; medium?: string; low?: string };
  /** Models the configured agent supports — the choices for an override. */
  supportedModels: string[];
  /**
   * True when the pinned model is not in the tier catalog, so every tier
   * collapses onto it and enabling the mode would change nothing. Surfaces
   * lend this to an explanatory hint rather than a silent no-op.
   */
  degradesToSingleModel: boolean;
}

@injectable()
export class GetAdaptiveModelPlanUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('IAgentExecutorFactory')
    private readonly executorFactory: IAgentExecutorFactory
  ) {}

  /**
   * Resolve the adaptive model plan for the current settings.
   *
   * @param overrideModel - Optional pinned model to preview instead of the
   *   configured default (e.g. a per-feature pin the caller is about to use).
   * @throws Error when settings have never been initialized.
   */
  async execute(overrideModel?: string): Promise<AdaptiveModelPlan> {
    const settings: Settings | null = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    const agentType = settings.agent.type;
    const previewed = overrideModel?.trim();
    const baseModel = previewed && previewed.length > 0 ? previewed : settings.models.default;
    const adaptive = settings.models.adaptive;
    const overrides = tierOverridesFrom(adaptive) ?? {};

    const tiers = this.executorFactory.resolveAdaptiveModelPlan(agentType, baseModel, overrides);

    return {
      enabled: isAdaptiveModelSelectionEnabled(settings.models),
      agentType,
      baseModel,
      tiers,
      overrides,
      supportedModels: this.executorFactory.getSupportedModels(agentType),
      degradesToSingleModel:
        tiers.high === tiers.medium && tiers.medium === tiers.low && tiers.low === baseModel,
    };
  }
}
