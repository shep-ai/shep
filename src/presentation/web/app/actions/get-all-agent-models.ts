'use server';

import { resolve } from '@/lib/server-container';
import { getModelMeta } from '@/lib/model-metadata';
import {
  getAgentDescriptor,
  isAgentOffered,
  listAgentDescriptors,
} from '@shepai/core/domain/shared/agent-catalog';
import { getFeatureFlags } from '@/lib/feature-flags';
import type {
  IAgentExecutorFactory,
  AgentModelListing,
} from '@shepai/core/application/ports/output/agents/agent-executor-factory.interface';
import type { LoadSettingsUseCase } from '@shepai/core/application/use-cases/settings/load-settings.use-case';
import type { AgentType, AgentConfig } from '@shepai/core/domain/generated/output';

export interface ModelInfo {
  id: string;
  displayName: string;
  description: string;
  contextLength?: number;
  isFree?: boolean;
  vendor?: string;
}

export interface AgentModelGroup {
  agentType: string;
  label: string;
  models: ModelInfo[];
}

/**
 * Labels and picker order come from the domain catalog. Both tables used to be
 * hand-written here and had drifted: `cline` and `ollama` fell through to their
 * raw enum value as a label, and `kimi-code` was absent entirely.
 */
const AGENT_LABELS: Record<string, string> = Object.fromEntries(
  listAgentDescriptors().map((descriptor) => [descriptor.type as string, descriptor.label])
);

/** Sort weight — higher = further down. Demo always last. */
const AGENT_ORDER: Record<string, number> = Object.fromEntries(
  listAgentDescriptors().map((descriptor) => [descriptor.type as string, descriptor.order])
);

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const v of values) {
    if (v && v.length > 0) return v;
  }
  return '';
}

function toModelInfo(listing: AgentModelListing): ModelInfo {
  const meta = getModelMeta(listing.id);
  return {
    id: listing.id,
    displayName: firstNonEmpty(listing.displayName, meta.displayName, listing.id),
    description: firstNonEmpty(meta.description, listing.description),
    contextLength: listing.contextLength,
    isFree: listing.isFree,
    vendor: listing.vendor,
  };
}

export async function getAllAgentModels(): Promise<AgentModelGroup[]> {
  try {
    const factory = resolve<IAgentExecutorFactory>('IAgentExecutorFactory');

    // Load the currently-configured agent so we can pass its token to
    // catalogs that require auth (Together AI). Failures are non-fatal.
    let activeAgent: AgentConfig | undefined;
    try {
      const loadSettings = resolve<LoadSettingsUseCase>('LoadSettingsUseCase');
      const settings = await loadSettings.execute();
      activeAgent = settings.agent;
    } catch {
      activeAgent = undefined;
    }

    const flags = getFeatureFlags();
    const agents = factory.getSupportedAgents().filter((agentType) => {
      const descriptor = getAgentDescriptor(agentType as string);
      return !descriptor || isAgentOffered(descriptor, flags);
    });
    const groups = await Promise.all(
      agents.map(async (agentType) => {
        const authConfig =
          activeAgent && (agentType as string) === (activeAgent.type as string)
            ? activeAgent
            : undefined;
        const listings = await factory.listAvailableModels(agentType as AgentType, authConfig);
        return {
          agentType: agentType as string,
          label: AGENT_LABELS[agentType as string] ?? (agentType as string),
          models: listings.map(toModelInfo),
        };
      })
    );

    return groups
      .map((g) => {
        // Dev agent gets fun demo models
        if (g.agentType === 'dev' && g.models.length === 0) {
          return {
            ...g,
            models: [
              { id: 'gpt-8', ...getModelMeta('gpt-8') },
              { id: 'opus-7', ...getModelMeta('opus-7') },
            ],
          };
        }
        return g;
      })
      .filter((g) => g.models.length > 0)
      .sort((a, b) => (AGENT_ORDER[a.agentType] ?? 50) - (AGENT_ORDER[b.agentType] ?? 50));
  } catch {
    return [];
  }
}
