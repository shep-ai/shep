/**
 * LangGraphSupervisorAgent — production adapter for {@link ISupervisorAgent}.
 *
 * Wraps {@link createSupervisorAgent} and resolves the underlying
 * {@link IAgentExecutor} lazily through {@link IAgentExecutorProvider}, so a
 * change to the user's default agent (settings) is honored on the next
 * evaluation without a process restart.
 *
 * Side-effect free: persistence, audit-log mirroring, and policy lookup are
 * all owned by {@link EvaluateSupervisorDecisionUseCase}. This adapter is
 * just the LLM-facing surface behind the port.
 */

import { injectable, inject } from 'tsyringe';

import type {
  ISupervisorAgent,
  SupervisorDecisionResult,
  SupervisorEvaluateInput,
} from '../../../../application/ports/output/agents/supervisor-agent.interface.js';
import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentPromptResolver } from '../../../../application/ports/output/agents/agent-prompt-resolver.interface.js';
import { createSupervisorAgent } from './supervisor-graph.js';

@injectable()
export class LangGraphSupervisorAgent implements ISupervisorAgent {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly executorProvider: IAgentExecutorProvider,
    @inject('IAgentPromptResolver')
    private readonly promptResolver: IAgentPromptResolver
  ) {}

  async evaluate(input: SupervisorEvaluateInput): Promise<SupervisorDecisionResult> {
    const executor = await this.executorProvider.getExecutor();
    const inner = createSupervisorAgent({
      executor,
      promptResolver: this.promptResolver,
    });
    return inner.evaluate(input);
  }
}
