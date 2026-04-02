/**
 * Exploration Agent Graph Factory
 *
 * Creates a LangGraph StateGraph for exploration/prototyping mode with
 * the topology:
 *   START → prototype-generate → (interrupt for feedback)
 *     → apply-feedback → prototype-generate (loop)
 *     → END (on promote or discard)
 *
 * The graph uses the same FeatureAgentAnnotation state shape as the
 * full and fast graphs, enabling checkpointing, resume, and identical
 * worker lifecycle handling.
 *
 * Unlike the full SDLC graph which uses executeNode() with approval gates,
 * the exploration graph uses custom node functions with shared utilities
 * (retryExecute, createNodeLogger). The feedback loop is driven by
 * LangGraph interrupt/resume — the same mechanism used for approval gates.
 */

import { StateGraph, START, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';
import { createPrototypeGenerateNode } from './nodes/prototype-generate.node.js';
import { createApplyFeedbackNode } from './nodes/apply-feedback.node.js';

// Re-export for consumers
export { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';

/**
 * Dependencies needed to build the exploration agent graph.
 * Intentionally minimal — exploration mode does not use merge nodes.
 */
export interface ExplorationAgentGraphDeps {
  executor: IAgentExecutor;
}

/**
 * Routing function that determines the next node after prototype-generate
 * resumes from interrupt.
 *
 * The resume payload (set via Command({update})) controls the flow:
 * - _approvalAction === 'rejected' → apply-feedback (iterate with feedback)
 * - _approvalAction === 'approved' or any other → END (promote or discard)
 *
 * The 'rejected' action maps to the iterate flow because the existing
 * worker resume logic already sets _approvalAction='rejected' and
 * _rejectionFeedback=<text> for rejection payloads. For exploration,
 * "rejected" means "iterate with feedback" rather than "rejected for merge".
 */
export function routeAfterPrototypeGenerate(state: FeatureAgentState): string {
  // If the user provided feedback (rejection = iterate in exploration context)
  if (state._approvalAction === 'rejected') {
    return 'apply-feedback';
  }
  // Otherwise: approved = promote/discard = exit the loop
  return '__end__';
}

/**
 * Factory function that creates and compiles the exploration-mode agent graph.
 *
 * The graph defines a feedback loop:
 *   START → prototype-generate → (interrupt) → route:
 *     - iterate: → apply-feedback → prototype-generate (loop)
 *     - promote/discard: → END
 *
 * @param depsOrExecutor - Graph dependencies or a legacy executor
 * @param checkpointer - Optional checkpoint saver for state persistence
 * @returns A compiled LangGraph ready to be invoked
 */
export function createExplorationAgentGraph(
  depsOrExecutor: ExplorationAgentGraphDeps | IAgentExecutor,
  checkpointer?: BaseCheckpointSaver
) {
  // Support legacy signature: createExplorationAgentGraph(executor, checkpointer)
  const deps: ExplorationAgentGraphDeps =
    'execute' in depsOrExecutor ? { executor: depsOrExecutor } : depsOrExecutor;
  const { executor } = deps;

  const graph = new StateGraph(FeatureAgentAnnotation)
    .addNode('prototype-generate', createPrototypeGenerateNode(executor))
    .addNode('apply-feedback', createApplyFeedbackNode());

  // START → prototype-generate
  graph.addEdge(START, 'prototype-generate');

  // prototype-generate → conditional routing (after resume from interrupt)
  graph.addConditionalEdges('prototype-generate', routeAfterPrototypeGenerate);

  // apply-feedback → prototype-generate (loop back)
  graph.addEdge('apply-feedback', 'prototype-generate');

  return graph.compile({ checkpointer });
}
