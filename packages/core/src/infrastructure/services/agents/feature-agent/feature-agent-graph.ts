import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';
import { createAnalyzeNode } from './nodes/analyze.node.js';
import { createRequirementsNode } from './nodes/requirements.node.js';
import { createResearchNode } from './nodes/research.node.js';
import { createPlanNode } from './nodes/plan.node.js';
import { createImplementNode } from './nodes/implement.node.js';
import { createMergeNode, type MergeNodeDeps } from './nodes/merge/merge.node.js';
import { createValidateNode } from './nodes/validate.node.js';
import { createRepairNode } from './nodes/repair.node.js';
import { validateSpecAnalyze, validateSpecRequirements } from './nodes/schemas/spec.schema.js';
import { validateResearch } from './nodes/schemas/research.schema.js';
import { validatePlan, validateTasks } from './nodes/schemas/plan.schema.js';
import {
  readSpecFile,
  safeYamlLoad,
  createNodeLogger,
  getCompletedPhases,
  clearCompletedPhase,
} from './nodes/node-helpers.js';

// Re-export state types for consumers
export { FeatureAgentAnnotation, type FeatureAgentState } from './state.js';

/**
 * Dependencies needed to build the feature agent graph.
 * Injected by the worker so the graph factory stays testable.
 */
export interface FeatureAgentGraphDeps {
  executor: IAgentExecutor;
  mergeNodeDeps?: Omit<MergeNodeDeps, 'executor'>;
}

/**
 * Factory that creates a conditional edge function for re-execution routing.
 *
 * After an interruptible node resumes, it returns early with _needsReexecution
 * set to true (rejection) or false (approval). This edge routes back to the
 * same node on rejection for a fresh invocation, avoiding the stale interrupt
 * replay bug caused by dual interrupt() calls.
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
 * Factory that creates a conditional edge function for validation routing.
 *
 * Routes to successNode on pass, repairNode on fail, throws after maxRetries.
 *
 * When retries are exhausted, clears the producer node's completedPhases entry
 * before throwing. This ensures that on resume, the producer node re-executes
 * the full agent instead of skipping (because `executeNode` checks
 * completedPhases). Without this, a phase that produced empty/unfilled output
 * would be permanently stuck: the repair node can only fix formatting, not
 * generate content from scratch, and the producer would skip on every retry.
 */
function routeValidation(
  successNode: string,
  repairNode: string,
  producerNode?: string,
  maxRetries = 3
): (state: FeatureAgentState) => string {
  const log = createNodeLogger('routeValidation');

  return (state: FeatureAgentState): string => {
    if (state.lastValidationErrors.length === 0) return successNode;
    if (state.validationRetries >= maxRetries) {
      // Clear the producer's completed phase so that on resume the producer
      // node re-executes the full agent instead of skipping.
      if (producerNode) {
        log.info(`Clearing completed phase '${producerNode}' so retry re-runs the agent`);
        clearCompletedPhase(state.specDir, producerNode, log);
      }
      throw new Error(
        `Validation failed after ${maxRetries} repair attempts for '${state.lastValidationTarget}': ${state.lastValidationErrors.join('; ')}`
      );
    }
    return repairNode;
  };
}

/**
 * Creates a combined plan+tasks validator node.
 *
 * Validates plan.yaml first, then tasks.yaml with cross-referencing
 * of phaseIds from the plan. Combines all errors.
 */
function createPlanTasksValidator(): (
  state: FeatureAgentState
) => Promise<Partial<FeatureAgentState>> {
  const log = createNodeLogger('validate:plan+tasks');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();

    // Skip validation when the successor phase (implement) is already completed.
    // This proves validation already passed and the pipeline progressed beyond it.
    // Same logic as createValidateNode's successorPhase guard.
    if (getCompletedPhases(state.specDir).includes('implement')) {
      log.info("Successor phase 'implement' already completed, skipping validation");
      return {
        lastValidationTarget: 'plan.yaml+tasks.yaml',
        lastValidationErrors: [],
        validationRetries: 0,
        messages: ["[validate:plan+tasks] SKIP (successor 'implement' already completed)"],
      };
    }

    log.info('Validating plan.yaml and tasks.yaml');
    const allErrors: string[] = [];

    // Validate plan.yaml
    const planContent = readSpecFile(state.specDir, 'plan.yaml');
    if (!planContent) {
      allErrors.push("File 'plan.yaml' not found or empty");
    } else {
      try {
        const planData = safeYamlLoad(planContent);
        const planResult = validatePlan(planData);
        allErrors.push(...planResult.errors);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`YAML parse error in plan.yaml: ${msg}`);
      }
    }

    // Validate tasks.yaml with cross-reference
    const tasksContent = readSpecFile(state.specDir, 'tasks.yaml');
    if (!tasksContent) {
      allErrors.push("File 'tasks.yaml' not found or empty");
    } else {
      try {
        const tasksData = safeYamlLoad(tasksContent);

        // Extract phaseIds from plan for cross-validation
        let phaseIds: string[] = [];
        if (planContent) {
          try {
            const planData = safeYamlLoad(planContent) as Record<string, unknown>;
            const phases = Array.isArray(planData?.phases) ? planData.phases : [];
            phaseIds = phases
              .filter((p: unknown) => typeof (p as Record<string, unknown>)?.id === 'string')
              .map((p: unknown) => (p as Record<string, unknown>).id as string);
          } catch {
            // Plan parse already reported above
          }
        }

        const tasksResult = validateTasks(tasksData, phaseIds);
        allErrors.push(...tasksResult.errors);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`YAML parse error in tasks.yaml: ${msg}`);
      }
    }

    if (allErrors.length === 0) {
      log.info('Validation passed');
      return {
        lastValidationTarget: 'plan.yaml+tasks.yaml',
        lastValidationErrors: [],
        validationRetries: 0,
        messages: ['[validate:plan+tasks] PASS'],
      };
    }

    log.error(`Validation failed: ${allErrors.join('; ')}`);
    return {
      lastValidationTarget: 'plan.yaml+tasks.yaml',
      lastValidationErrors: allErrors,
      validationRetries: state.validationRetries + 1,
      messages: [`[validate:plan+tasks] FAIL: ${allErrors.length} error(s)`],
    };
  };
}

/**
 * Factory function that creates and compiles the feature-agent LangGraph.
 *
 * The graph defines a linear SDLC workflow with validation gates:
 *   analyze → validate → requirements → validate → research → validate → plan → validate → implement (+ evidence sub-agent) → merge
 *
 * Each YAML-producing node is followed by a validate/repair loop that ensures
 * the output YAML conforms to its schema before proceeding.
 *
 * @param depsOrExecutor - Graph dependencies or a legacy executor
 * @param checkpointer - Optional checkpoint saver for state persistence
 * @returns A compiled LangGraph ready to be invoked
 */
export function createFeatureAgentGraph(
  depsOrExecutor: FeatureAgentGraphDeps | IAgentExecutor,
  checkpointer?: BaseCheckpointSaver
) {
  // Support legacy signature: createFeatureAgentGraph(executor, checkpointer)
  const deps: FeatureAgentGraphDeps =
    'execute' in depsOrExecutor ? { executor: depsOrExecutor } : depsOrExecutor;
  const { executor } = deps;

  const graph = new StateGraph(FeatureAgentAnnotation)
    // --- Producer nodes ---
    .addNode('analyze', createAnalyzeNode(executor))
    .addNode('requirements', createRequirementsNode(executor))
    .addNode('research', createResearchNode(executor))
    .addNode('plan', createPlanNode(executor))
    .addNode('implement', createImplementNode(executor))

    // --- Validate nodes ---
    // Each validate node receives its SUCCESSOR phase name (the phase that runs
    // after validation passes). On resume, validation is skipped only when the
    // successor is already completed — proving this validation already passed.
    // Using the successor (not the producer) avoids skipping validation when the
    // producer ran successfully but validation itself failed.
    .addNode(
      'validate_spec_analyze',
      createValidateNode('spec.yaml', validateSpecAnalyze, 'requirements')
    )
    .addNode(
      'validate_spec_requirements',
      createValidateNode('spec.yaml', validateSpecRequirements, 'research')
    )
    .addNode('validate_research', createValidateNode('research.yaml', validateResearch, 'plan'))
    .addNode('validate_plan_tasks', createPlanTasksValidator())

    // --- Repair nodes ---
    .addNode('repair_spec_analyze', createRepairNode('spec.yaml', executor))
    .addNode('repair_spec_requirements', createRepairNode('spec.yaml', executor))
    .addNode('repair_research', createRepairNode('research.yaml', executor))
    .addNode('repair_plan_tasks', createRepairNode(['plan.yaml', 'tasks.yaml'], executor))

    // --- Edges: linear flow with validation gates ---
    .addEdge(START, 'analyze')
    .addEdge('analyze', 'validate_spec_analyze')
    .addConditionalEdges(
      'validate_spec_analyze',
      routeValidation('requirements', 'repair_spec_analyze', 'analyze')
    )
    .addEdge('repair_spec_analyze', 'validate_spec_analyze')

    .addConditionalEdges(
      'requirements',
      routeReexecution('requirements', 'validate_spec_requirements')
    )
    .addConditionalEdges(
      'validate_spec_requirements',
      routeValidation('research', 'repair_spec_requirements', 'requirements')
    )
    .addEdge('repair_spec_requirements', 'validate_spec_requirements')

    .addEdge('research', 'validate_research')
    .addConditionalEdges(
      'validate_research',
      routeValidation('plan', 'repair_research', 'research')
    )
    .addEdge('repair_research', 'validate_research')

    .addConditionalEdges('plan', routeReexecution('plan', 'validate_plan_tasks'))
    .addConditionalEdges(
      'validate_plan_tasks',
      routeValidation('implement', 'repair_plan_tasks', 'plan')
    )
    .addEdge('repair_plan_tasks', 'validate_plan_tasks');

  // --- Merge node: wired when deps are provided ---
  if (deps.mergeNodeDeps) {
    const mergeNodeDeps: MergeNodeDeps = {
      executor,
      ...deps.mergeNodeDeps,
    };
    graph
      .addNode('merge', createMergeNode(mergeNodeDeps))
      .addEdge('implement', 'merge')
      .addConditionalEdges('merge', routeReexecution('merge', END));
  } else {
    graph.addEdge('implement', END);
  }

  return graph.compile({ checkpointer });
}
