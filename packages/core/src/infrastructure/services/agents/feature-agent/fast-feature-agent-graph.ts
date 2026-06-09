/**
 * Fast Feature Agent Graph Factory
 *
 * Creates a LangGraph StateGraph with nodes: fast-implement (+ evidence sub-agent) → merge.
 * This is the fast-mode alternative to createFeatureAgentGraph() which has
 * 15+ nodes. The merge node and its CI watch/fix loop are reused via
 * composition from the full graph's createMergeNode(). Evidence collection
 * runs as a sub-agent call within fast-implement, not as a separate node.
 *
 * Uses the same FeatureAgentAnnotation state shape as the full graph,
 * enabling checkpointing, resume, and identical worker lifecycle handling.
 */

import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';
import { createFastImplementNode } from './nodes/fast-implement.node.js';
import { createMergeNode, type MergeNodeDeps } from './nodes/merge/merge.node.js';
import {
  createExtractMemoryNode,
  type ExtractMemoryNodeDeps,
} from './nodes/extract-memory.node.js';
import type { MemorySelector } from './nodes/node-helpers.js';

// Re-export for consumers
export { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';

/**
 * Dependencies needed to build the fast feature agent graph.
 * Same shape as FeatureAgentGraphDeps for consistency.
 */
export interface FastFeatureAgentGraphDeps {
  executor: IAgentExecutor;
  mergeNodeDeps?: Omit<MergeNodeDeps, 'executor'>;
  /**
   * When provided (and merge is wired), enables the post-merge extract_memory
   * node that distils durable project knowledge after a successful merge.
   */
  extractMemoryDeps?: Omit<ExtractMemoryNodeDeps, 'executor'>;
  /** Selects the relevant project-memory subset per phase/task. */
  selectProjectMemory?: MemorySelector;
}

/**
 * Conditional edge: route back to fast-implement on merge rejection,
 * otherwise proceed to END.
 *
 * Mirrors the routeReexecution() pattern from feature-agent-graph.ts.
 */
function routeReexecution(
  selfNode: string,
  nextNode: string
): (state: FeatureAgentState) => string {
  return (state: FeatureAgentState): string => {
    if (state._needsReexecution) return selfNode;
    return nextNode;
  };
}

/**
 * Factory function that creates and compiles the fast-mode feature agent graph.
 *
 * The graph defines a minimal workflow:
 *   START → fast-implement (+ evidence sub-agent) → merge → conditional(reexecute or END)
 *
 * Evidence collection runs as a sub-agent call within fast-implement, not as
 * a separate graph node. When merge is rejected, routeReexecution routes back
 * to fast-implement for a fresh implementation pass.
 *
 * @param depsOrExecutor - Graph dependencies or a legacy executor
 * @param checkpointer - Optional checkpoint saver for state persistence
 * @returns A compiled LangGraph ready to be invoked
 */
export function createFastFeatureAgentGraph(
  depsOrExecutor: FastFeatureAgentGraphDeps | IAgentExecutor,
  checkpointer?: BaseCheckpointSaver
) {
  // Support legacy signature: createFastFeatureAgentGraph(executor, checkpointer)
  const deps: FastFeatureAgentGraphDeps =
    'execute' in depsOrExecutor ? { executor: depsOrExecutor } : depsOrExecutor;
  const { executor, selectProjectMemory } = deps;

  const graph = new StateGraph(FeatureAgentAnnotation).addNode(
    'fast-implement',
    createFastImplementNode(executor, selectProjectMemory)
  );

  graph.addEdge(START, 'fast-implement');

  // Wire merge node when deps are provided
  if (deps.mergeNodeDeps) {
    const mergeNodeDeps: MergeNodeDeps = {
      executor,
      ...deps.mergeNodeDeps,
    };
    // Post-merge extraction: merge → extract_memory → END (self-guards on merged)
    if (deps.extractMemoryDeps) {
      graph
        .addNode('merge', createMergeNode(mergeNodeDeps))
        .addNode('extract_memory', createExtractMemoryNode({ executor, ...deps.extractMemoryDeps }))
        .addEdge('fast-implement', 'merge')
        .addConditionalEdges('merge', routeReexecution('fast-implement', 'extract_memory'))
        .addEdge('extract_memory', END);
    } else {
      graph
        .addNode('merge', createMergeNode(mergeNodeDeps))
        .addEdge('fast-implement', 'merge')
        .addConditionalEdges('merge', routeReexecution('fast-implement', END));
    }
  } else {
    graph.addEdge('fast-implement', END);
  }

  return graph.compile({ checkpointer });
}
