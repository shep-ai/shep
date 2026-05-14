import { inject, injectable } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IAgentExecutorFactory } from '../../ports/output/agents/agent-executor-factory.interface.js';
import {
  AgentRunStatus,
  SdlcLifecycle,
  type AgentRun,
  type AgentType,
  type Feature,
} from '../../../domain/generated/output.js';

const ELIGIBLE_RESUME_STATUSES = new Set<AgentRunStatus>([
  AgentRunStatus.waitingApproval,
  AgentRunStatus.failed,
  AgentRunStatus.interrupted,
]);

const INELIGIBLE_LIFECYCLES = new Set<SdlcLifecycle>([
  SdlcLifecycle.Archived,
  SdlcLifecycle.AwaitingUpstream,
  SdlcLifecycle.Blocked,
  SdlcLifecycle.Deleting,
  SdlcLifecycle.Maintain,
]);

export interface UpdateFeaturePinnedConfigInput {
  featureId: string;
  agentType: string;
  modelId?: string | null;
}

export interface UpdateFeaturePinnedConfigResult {
  featureId: string;
  agentRunId: string;
  agentType: AgentType;
  modelId: string;
  updatedAt: Date;
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function normalizeRequiredModelId(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('modelId is required');
  }
  return trimmed;
}

function canUpdatePinnedConfig(feature: Feature, run: AgentRun): boolean {
  if (feature.lifecycle === SdlcLifecycle.Pending) {
    return run.status === AgentRunStatus.pending;
  }

  if (INELIGIBLE_LIFECYCLES.has(feature.lifecycle)) {
    return false;
  }

  return ELIGIBLE_RESUME_STATUSES.has(run.status);
}

@injectable()
export class UpdateFeaturePinnedConfigUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepository: IFeatureRepository,
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject('IAgentExecutorFactory')
    private readonly agentExecutorFactory: IAgentExecutorFactory
  ) {}

  async execute(input: UpdateFeaturePinnedConfigInput): Promise<UpdateFeaturePinnedConfigResult> {
    const featureId = normalizeRequiredString(input.featureId, 'featureId');
    const agentType = normalizeRequiredString(input.agentType, 'agentType') as AgentType;
    const modelId = normalizeRequiredModelId(input.modelId);

    const feature = await this.featureRepository.findById(featureId);
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    if (!feature.agentRunId) {
      throw new Error(`Feature "${feature.name}" has no current agent run`);
    }

    const run = await this.agentRunRepository.findById(feature.agentRunId);
    if (!run) {
      throw new Error(`Current agent run not found for feature "${feature.name}"`);
    }

    if (!canUpdatePinnedConfig(feature, run)) {
      throw new Error(
        `Feature "${feature.name}" cannot change pinned agent/model while lifecycle is "${feature.lifecycle}" and run status is "${run.status}"`
      );
    }

    const supportedAgents = this.agentExecutorFactory.getSupportedAgents();
    if (!supportedAgents.includes(agentType)) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    const availableModels = await this.agentExecutorFactory.listAvailableModels(agentType);
    if (!availableModels.some((m) => m.id === modelId)) {
      throw new Error(`Unsupported model "${modelId}" for agent "${agentType}"`);
    }

    const updatedAt = new Date();
    await this.agentRunRepository.updatePinnedConfig(run.id, {
      agentType,
      modelId,
      updatedAt,
    });

    return {
      featureId: feature.id,
      agentRunId: run.id,
      agentType,
      modelId,
      updatedAt,
    };
  }
}
