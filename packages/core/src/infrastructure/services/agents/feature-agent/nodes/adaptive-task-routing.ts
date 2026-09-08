/**
 * Adaptive task routing for the implement node.
 *
 * Answers two questions the implement node would otherwise have to answer
 * inline, and keeps both testable without a graph, an executor, or a filesystem:
 *
 *   1. Which model should THIS task run on?
 *   2. How do a phase's tasks collapse into executor calls?
 *
 * The second question exists because a sequential phase is one executor call
 * today, and its tasks may depend on each other. Grouping by complexity would
 * reorder dependent work, so we group only *consecutive* runs of tasks that
 * resolved to the same model: `[High, High, Low, Low, High]` becomes three
 * calls in the declared order, never two.
 */

import { TaskComplexity } from '@/domain/generated/output.js';
import type { AdaptiveModelConfig } from '@/domain/generated/output.js';
import {
  classifyTaskComplexity,
  isAdaptiveModelSelectionEnabled,
  resolveModelForComplexity,
  tierOverridesFrom,
  type ClassifiableTask,
} from '@/domain/shared/model-tier.js';
import { getModelsForAgent } from '../../common/agent-model-catalog.js';

/** A task the router can classify — a structural subset of `PhaseTask`. */
export type RoutableTask = ClassifiableTask & { id: string; title: string };

/** What the router decided for one task. */
export interface TaskRouting {
  complexity: TaskComplexity;
  /** Undefined when routing is disabled — the caller keeps the pinned model. */
  model?: string;
}

/** A run of consecutive tasks that share one executor call. */
export interface TaskBatch<T> {
  /** Undefined when routing is disabled — the caller keeps the pinned model. */
  model?: string;
  /** Highest complexity in the batch, used for logging and phase-timing labels. */
  complexity: TaskComplexity;
  tasks: T[];
}

export interface AdaptiveRouting {
  /** False when the feature is off, unconfigured, or there is no pinned model. */
  readonly enabled: boolean;
  /** The pinned model acting as the ceiling, when there is one. */
  readonly baseModel?: string;
  resolve(task: RoutableTask): TaskRouting;
}

export interface BuildAdaptiveRoutingInput {
  /** `executor.agentType` — decides which catalog bounds the candidates. */
  agentType: string;
  /** The model pinned for this run (`state.model`). */
  baseModel: string | undefined;
  /** `settings.models.adaptive`. */
  adaptive: AdaptiveModelConfig | undefined;
}

const TIER_RANK: Readonly<Record<TaskComplexity, number>> = {
  [TaskComplexity.Low]: 0,
  [TaskComplexity.Medium]: 1,
  [TaskComplexity.High]: 2,
};

/**
 * Build the routing decision function for one implement run.
 *
 * Routing is disabled — and therefore a pure no-op — unless the user turned the
 * mode on AND the run has a pinned model. Without a pin there is no ceiling to
 * degrade from, and silently inventing one would override whatever default the
 * executor resolves for itself.
 */
export function buildAdaptiveRouting(input: BuildAdaptiveRoutingInput): AdaptiveRouting {
  const { agentType, baseModel, adaptive } = input;
  const enabled = isAdaptiveModelSelectionEnabled({ adaptive }) && Boolean(baseModel?.trim());

  if (!enabled || !baseModel) {
    return {
      enabled: false,
      resolve: (task) => ({ complexity: classifyTaskComplexity(task) }),
    };
  }

  const availableModels = getModelsForAgent(agentType);
  const overrides = tierOverridesFrom(adaptive);

  return {
    enabled: true,
    baseModel,
    resolve(task) {
      const complexity = classifyTaskComplexity(task);
      return {
        complexity,
        model: resolveModelForComplexity({ baseModel, complexity, availableModels, overrides }),
      };
    },
  };
}

/**
 * The model identifier to attribute a phase's timing record to.
 *
 * A phase is usually homogeneous and reports one id. When adaptive routing
 * splits it across tiers, every id it used is reported so the Activity tab
 * cannot credit Haiku work to the pinned Opus. With routing off this is simply
 * the pinned model.
 */
export function resolvePhaseModelId(
  tasks: readonly RoutableTask[],
  routing: AdaptiveRouting,
  pinnedModel: string | undefined
): string | undefined {
  if (!routing.enabled) return pinnedModel;

  const models = new Set<string>();
  for (const task of tasks) {
    const { model } = routing.resolve(task);
    if (model) models.add(model);
  }
  if (models.size === 0) return pinnedModel;
  return [...models].join(', ');
}

/**
 * Summarize how a whole task list will be routed, e.g.
 * `"3× High → claude-opus-5, 11× Low → claude-haiku-4-5"`.
 *
 * Logged once before implementation starts so the run's log answers "why did
 * this cost what it cost" without replaying every per-task line.
 */
export function summarizeRouting(tasks: readonly RoutableTask[], routing: AdaptiveRouting): string {
  const distribution = new Map<string, number>();
  for (const task of tasks) {
    const { complexity, model } = routing.resolve(task);
    const key = `${complexity} → ${model}`;
    distribution.set(key, (distribution.get(key) ?? 0) + 1);
  }
  return [...distribution.entries()].map(([key, count]) => `${count}× ${key}`).join(', ');
}

/**
 * Split a phase's tasks into the executor calls that will run them.
 *
 * With routing disabled this returns exactly one batch containing every task
 * and no model override — byte-identical to the pre-adaptive behaviour.
 */
export function planTaskBatches<T extends RoutableTask>(
  tasks: readonly T[],
  routing: AdaptiveRouting
): TaskBatch<T>[] {
  if (tasks.length === 0) return [];

  if (!routing.enabled) {
    const complexity = tasks
      .map((task) => routing.resolve(task).complexity)
      .reduce((a, b) => (TIER_RANK[a] >= TIER_RANK[b] ? a : b));
    return [{ complexity, tasks: [...tasks] }];
  }

  const batches: TaskBatch<T>[] = [];
  for (const task of tasks) {
    const { complexity, model } = routing.resolve(task);
    const current = batches[batches.length - 1];

    if (current && current.model === model) {
      current.tasks.push(task);
      if (TIER_RANK[complexity] > TIER_RANK[current.complexity]) current.complexity = complexity;
      continue;
    }

    batches.push({ ...(model !== undefined && { model }), complexity, tasks: [task] });
  }

  return batches;
}
