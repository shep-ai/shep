/**
 * Builds decision providers from configuration (spec 119).
 *
 * The structured-LLM provider needs the harness model backend, which is
 * resolved lazily so a configuration that never routes to it never builds a
 * model client.
 */
import {
  DecisionProviderKind,
  type DecisionProviderConfig,
} from '../../../../domain/generated/output.js';
import {
  DecisionProviderError,
  type IDecisionProvider,
  type IDecisionProviderFactory,
  type IHarnessModelProvider,
} from '../../../../application/ports/output/harness/index.js';
import { DeterministicDecisionProvider } from './deterministic-decision-provider.js';
import { OpenAiCompatibleDecisionProvider } from './openai-compatible-decision-provider.js';
import { RerankerDecisionProvider } from './reranker-decision-provider.js';
import { JevDecisionProvider } from './jev-decision-provider.js';
import { StructuredLlmDecisionProvider } from './structured-llm-decision-provider.js';

export class DecisionProviderFactory implements IDecisionProviderFactory {
  private readonly heuristic = new DeterministicDecisionProvider();

  constructor(private readonly modelProvider?: () => IHarnessModelProvider) {}

  deterministic(): IDecisionProvider {
    return this.heuristic;
  }

  create(config: DecisionProviderConfig): IDecisionProvider {
    switch (config.kind) {
      case DecisionProviderKind.Deterministic:
        return this.heuristic;
      case DecisionProviderKind.OpenAiCompatible:
        return new OpenAiCompatibleDecisionProvider(config);
      case DecisionProviderKind.Reranker:
        return new RerankerDecisionProvider(config);
      case DecisionProviderKind.Jev:
        return new JevDecisionProvider(config);
      case DecisionProviderKind.StructuredLlm: {
        if (!this.modelProvider) {
          throw new DecisionProviderError(config.id, 'no harness model backend available');
        }
        return new StructuredLlmDecisionProvider(config, this.modelProvider());
      }
    }
  }
}
