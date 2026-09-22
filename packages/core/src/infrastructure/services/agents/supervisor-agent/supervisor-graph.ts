/**
 * Supervisor LangGraph workflow.
 *
 * Implements {@link ISupervisorAgent} as a graph with the nodes
 *
 *   ingest-event → evaluate → emit-decision
 *
 * Each node is a small pure function over the graph state; the graph is
 * compiled with an optional checkpointer so the same workflow can be
 * resumed across worker restarts (matches feature-agent worker shape).
 *
 * The evaluate node calls the supplied {@link IAgentExecutor} (resolved
 * by the worker through {@link IAgentExecutorProvider} — never imports a
 * provider SDK directly) with the prompt produced by
 * {@link buildEvaluatorPrompt}. The call is wrapped in a hard
 * {@link SUPERVISOR_EVALUATOR_SOFT_TIMEOUT_MS} timeout: on timeout the
 * graph short-circuits to a deterministic
 * {@link SUPERVISOR_TIMEOUT_DECISION} so the human path proceeds
 * (FR-22 fail-safe).
 *
 * Persistence + activity-log mirroring are NOT done here — the use case
 * layer owns those side effects.
 */

import { Annotation, StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';

import type { IAgentExecutor } from '../../../../application/ports/output/agents/agent-executor.interface.js';
import type { IAgentPromptResolver } from '../../../../application/ports/output/agents/agent-prompt-resolver.interface.js';
import type {
  ISupervisorAgent,
  SupervisorDecisionResult,
  SupervisorEvaluateInput,
} from '../../../../application/ports/output/agents/supervisor-agent.interface.js';
import { SUPERVISOR_EVALUATOR_SOFT_TIMEOUT_MS } from '../../../../application/ports/output/agents/supervisor-agent.interface.js';
import { type SupervisorPolicy } from '../../../../domain/generated/output.js';
import {
  buildEvaluatorPrompt,
  resolveEvaluatorModelId,
  SUPERVISOR_EVALUATOR_PROMPT_VERSION,
  SUPERVISOR_EVALUATOR_SYSTEM_HEADER,
  SUPERVISOR_TIMEOUT_DECISION,
} from './evaluator-prompt.js';
import { parseEvaluatorResponse } from './verdict-parser.js';
import { isAgentTimeoutError } from '../common/executors/process-stream.js';

/** Stable slot key for the supervisor evaluator system header. */
const EVALUATOR_PROMPT_SLOT = {
  agentType: 'supervisor-agent',
  promptId: 'evaluator.system',
} as const;

/** Internal graph state. */
const SupervisorGraphAnnotation = Annotation.Root({
  input: Annotation<SupervisorEvaluateInput>(),
  prompt: Annotation<string | undefined>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => undefined,
  }),
  decision: Annotation<SupervisorDecisionResult | undefined>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => undefined,
  }),
});
type SupervisorGraphState = typeof SupervisorGraphAnnotation.State;

export interface SupervisorGraphDeps {
  executor: IAgentExecutor;
  /**
   * Optional prompt resolver — when present, the evaluator system header is
   * resolved through it so user-saved overrides of the
   * `supervisor-agent/evaluator.system` slot take effect (FR-36). When
   * absent (e.g. in unit tests), the bundled
   * {@link SUPERVISOR_EVALUATOR_SYSTEM_HEADER} is used.
   */
  promptResolver?: IAgentPromptResolver;
  /** Override the soft timeout for the evaluator call (used by tests). */
  evaluatorTimeoutMs?: number;
  /** Fallback model id when the policy doesn't pin one. */
  defaultModelId?: string;
}

const DEFAULT_FALLBACK_MODEL_ID = 'unknown-model';

/**
 * Race a Promise against a timeout. Resolves with the original Promise's
 * value on success, rejects with a {@link SupervisorEvaluatorTimeoutError}
 * after `timeoutMs`.
 */
class SupervisorEvaluatorTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Supervisor evaluator exceeded ${timeoutMs}ms`);
    this.name = 'SupervisorEvaluatorTimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SupervisorEvaluatorTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ingestEventNode(
  deps: SupervisorGraphDeps
): (state: SupervisorGraphState) => Promise<Partial<SupervisorGraphState>> {
  return async (state) => {
    const header = deps.promptResolver
      ? await deps.promptResolver.resolve(
          EVALUATOR_PROMPT_SLOT.agentType,
          EVALUATOR_PROMPT_SLOT.promptId,
          SUPERVISOR_EVALUATOR_SYSTEM_HEADER
        )
      : SUPERVISOR_EVALUATOR_SYSTEM_HEADER;
    const prompt = buildEvaluatorPrompt(state.input.event, state.input.policy, header);
    return { prompt };
  };
}

function evaluateNode(
  deps: SupervisorGraphDeps
): (state: SupervisorGraphState) => Promise<Partial<SupervisorGraphState>> {
  const timeoutMs = deps.evaluatorTimeoutMs ?? SUPERVISOR_EVALUATOR_SOFT_TIMEOUT_MS;
  const fallbackModel = deps.defaultModelId ?? DEFAULT_FALLBACK_MODEL_ID;

  return async (state) => {
    if (!state.prompt) {
      throw new Error('SupervisorGraph: evaluate node ran without a prompt');
    }
    const policy = state.input.policy;
    const modelId = resolveEvaluatorModelId(policy, fallbackModel);

    try {
      const response = await withTimeout(
        // The race only stops WAITING; passing the budget down makes the
        // executor kill the evaluator process instead of orphaning it.
        deps.executor.execute(state.prompt, {
          model: policy.modelId,
          silent: true,
          timeout: timeoutMs,
        }),
        timeoutMs
      );
      const parsed = parseEvaluatorResponse(response.result);
      const decision: SupervisorDecisionResult = {
        verdict: parsed.verdict,
        rationale: parsed.rationale,
        modelId,
        promptVersion: SUPERVISOR_EVALUATOR_PROMPT_VERSION,
      };
      return { decision };
    } catch (err) {
      // Whichever timer fires first — the race's or the executor's own — it is
      // the same timeout and takes the same fail-safe path.
      if (err instanceof SupervisorEvaluatorTimeoutError || isAgentTimeoutError(err)) {
        const decision: SupervisorDecisionResult = {
          verdict: SUPERVISOR_TIMEOUT_DECISION.verdict,
          rationale: SUPERVISOR_TIMEOUT_DECISION.rationale,
          modelId,
          promptVersion: SUPERVISOR_EVALUATOR_PROMPT_VERSION,
        };
        return { decision };
      }
      throw err;
    }
  };
}

function emitDecisionNode(): (state: SupervisorGraphState) => Partial<SupervisorGraphState> {
  return (state) => {
    if (!state.decision) {
      throw new Error('SupervisorGraph: emit-decision ran without a decision');
    }
    return {};
  };
}

/**
 * Compile the supervisor graph. The compiled graph satisfies
 * {@link ISupervisorAgent} via {@link createSupervisorAgent} below.
 */
export function createSupervisorGraph(
  deps: SupervisorGraphDeps,
  checkpointer?: BaseCheckpointSaver
) {
  const graph = new StateGraph(SupervisorGraphAnnotation)
    .addNode('ingest-event', ingestEventNode(deps))
    .addNode('evaluate', evaluateNode(deps))
    .addNode('emit-decision', emitDecisionNode())
    .addEdge(START, 'ingest-event')
    .addEdge('ingest-event', 'evaluate')
    .addEdge('evaluate', 'emit-decision')
    .addEdge('emit-decision', END);

  return graph.compile({ checkpointer });
}

/**
 * Build an {@link ISupervisorAgent} backed by the compiled supervisor
 * graph. The use-case layer depends on this port; the worker process
 * resolves the executor and invokes this factory.
 */
export function createSupervisorAgent(
  deps: SupervisorGraphDeps,
  checkpointer?: BaseCheckpointSaver
): ISupervisorAgent {
  const compiled = createSupervisorGraph(deps, checkpointer);

  return {
    async evaluate(input: SupervisorEvaluateInput): Promise<SupervisorDecisionResult> {
      const finalState = await compiled.invoke(
        { input },
        { configurable: { thread_id: `supervisor:${input.policy.id}:${input.event.kind}` } }
      );
      const decision = (finalState as SupervisorGraphState).decision;
      if (!decision) {
        const fallbackPolicy: SupervisorPolicy = input.policy;
        return {
          verdict: SUPERVISOR_TIMEOUT_DECISION.verdict,
          rationale: 'evaluator did not return a decision',
          modelId: resolveEvaluatorModelId(
            fallbackPolicy,
            deps.defaultModelId ?? DEFAULT_FALLBACK_MODEL_ID
          ),
          promptVersion: SUPERVISOR_EVALUATOR_PROMPT_VERSION,
        };
      }
      return decision;
    },
  };
}

export { SupervisorEvaluatorTimeoutError };
